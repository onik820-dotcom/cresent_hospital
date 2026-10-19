'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/lib/compat';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Lock, Plus, Trash2, XCircle } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatDate, formatLitres, formatNumber, formatPercent } from '@/lib/format';
import { litresSold } from '@/lib/calc/meter';
import { CalcError } from '@/lib/calc/decimal';
import { Button } from '@/components/jhm/button';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { createClient } from '@/lib/data/client';
import { recordPayment } from '@/components/dues-actions';
import { recordExpense } from '@/components/expenses-actions';
import { signalRefresh, useRefreshKey } from '@/lib/refresh';
import {
  adminRecloseShift,
  previewClose,
  recordOpeningDips,
  recordOpeningReadings,
  submitClose,
  type ClosePayload,
  type CloseSummary,
} from '@/components/shift-close-actions';
import type { CloseContext } from '@/lib/data/shift-close';
import { getSessionProfile } from '@/lib/session';
import { AdminDelete } from '@/components/admin-delete';

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Draft {
  rate: string;
  readings: Record<string, { closing: string; test: string }>;
  /** Typed only for nozzles the books have no opening reading for. */
  openings: Record<string, string>;
  /** Typed only for tanks the books have no opening stock for. */
  openDips: Record<string, string>;
  dips: Record<string, string>;
  creditSales: Array<{ customerId: string; litres: string; rate: string; amount: string; vehicleNo: string; challanNo: string }>;
  lubSales: Array<{
    skuId: string;
    qty: string;
    rate: string;
    amount: string;
    /** 'cash' keeps the money in the drawer; 'credit' puts it on a party's account. */
    settlement?: 'cash' | 'credit';
    customerId?: string;
  }>;
  expenses: Array<{ categoryId: string; amount: string; description: string; paidBy: string }>;
  cash: { openingCash: string; bankDeposits: string; countedCash: string };
  varianceReasons: Record<string, string>;
  cashVarianceReason: string;
}

const STEP_KEYS = [
  ['Meter readings', 'মিটার রিডিং'],
  ['Test / assessment', 'টেস্ট / পরিমাপ'],
  ['Tank dips', 'ট্যাংক ডিপ'],
  ['Rate', 'দর'],
  ['Credit sales', 'বাকি বিক্রি'],
  ['Lubricants', 'লুব্রিকেন্ট'],
  ['Expenses', 'খরচ'],
  ['Due collection', 'বাকি আদায়'],
  ['Cash check', 'নগদ হিসাব'],
  ['Reconciliation', 'মিলকরণ'],
  ['Sign off', 'স্বাক্ষর'],
] as const;

function draftKey(shiftId: string) {
  return `jhm.close.${shiftId}`;
}

export function CloseWizard({ context }: { context: CloseContext }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const shift = context.shift!;

  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [pending, startTransition] = useTransition();

  const [draft, setDraft] = useState<Draft>(() => ({
    rate: shift.ratePerLitre ?? context.lastRate ?? '',
    readings: Object.fromEntries(
      context.nozzles.map((n) => [n.nozzleId, { closing: n.submittedClosing ?? '', test: '0' }]),
    ),
    openings: {},
    openDips: {},
    dips: Object.fromEntries(context.tanks.map((tk) => [tk.id, context.editDips?.[tk.id] ?? ''])),
    creditSales: [],
    lubSales: [],
    expenses: [],
    cash: { openingCash: context.openingCash, bankDeposits: '0', countedCash: context.editCountedCash ?? '' },
    varianceReasons: {},
    cashVarianceReason: '',
  }));

  // A close takes a while to type. Keep it on the device so a dropped
  // connection or a stray refresh does not cost the whole shift's entry.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey(shift.id));
      if (saved) setDraft((d) => ({ ...d, ...(JSON.parse(saved) as Draft) }));
    } catch {
      // A lost draft is a nuisance, not a failure.
    }
  }, [shift.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey(shift.id), JSON.stringify(draft));
    } catch {
      /* private browsing */
    }
  }, [draft, shift.id]);

  // Typed figures may carry commas ("14,88,740.05") or Bangla digits; the database wants plain numbers.
  const num = (v: string | undefined | null) =>
    (v ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[,\s৳]/g, '');
  const payload: ClosePayload = useMemo(
    () => ({
      rate_per_litre: num(draft.rate) || '0',
      // Blank boxes are left out so a half-filled close can still be worked out.
      readings: context.nozzles.filter((n) => (draft.readings[n.nozzleId]?.closing ?? '').trim() !== '').map((n) => ({
        nozzle_id: n.nozzleId,
        closing: num(draft.readings[n.nozzleId]?.closing),
        test_litres: num(draft.readings[n.nozzleId]?.test) || '0',
      })),
      dips: context.tanks.filter((tk) => (draft.dips[tk.id] ?? '').trim() !== '').map((tk) => ({ tank_id: tk.id, dip_mm: num(draft.dips[tk.id]) })),
      credit_sales: draft.creditSales
        .filter((r) => r.customerId && r.amount)
        .map((r) => ({
          customer_id: r.customerId,
          litres: num(r.litres) || undefined,
          rate: num(r.rate) || undefined,
          amount: num(r.amount),
          vehicle_no: r.vehicleNo || undefined,
          challan_no: r.challanNo || undefined,
        })),
      lubricant_sales: draft.lubSales
        .filter((r) => r.skuId && r.amount)
        .map((r) => ({
          sku_id: r.skuId,
          qty: num(r.qty) || '0',
          rate: num(r.rate) || undefined,
          amount: num(r.amount),
          // A cash sale carries no party; a credit sale must name one.
          customer_id: r.settlement === 'credit' ? r.customerId || undefined : undefined,
        })),
      expenses: draft.expenses
        .filter((r) => r.categoryId && r.amount)
        .map((r) => ({
          category_id: r.categoryId,
          amount: num(r.amount),
          description: r.description || undefined,
          paid_by: r.paidBy || 'cash',
        })),
      cash: {
        // opening_cash is read only when no previous shift has been closed;
        // after that the database chains it and ignores whatever is sent.
        // dues_collected is not sent at all — it is summed from payment rows.
        opening_cash: '0',
        bank_deposits: num(draft.cash.bankDeposits) || '0',
        counted_cash: num(draft.cash.countedCash) || '0',
      },
      variance_reasons: draft.varianceReasons,
      cash_variance_reason: draft.cashVarianceReason,
    }),
    [draft, context.nozzles, context.tanks],
  );

  // Nozzles the books have no opening for: the typed figure has to land as
  // this shift's opening round before the database will work the close out.
  const saveOpenings = useCallback(async () => {
    const entries = context.nozzles
      .filter((n) => !n.openingSource && (draft.openings?.[n.nozzleId] ?? '').trim() !== '')
      .map((n) => ({ nozzle_id: n.nozzleId, reading: draft.openings[n.nozzleId] as string }));
    const dipEntries = context.tanks
      .filter((tk) => !tk.bookOpeningSource && (draft.openDips?.[tk.id] ?? '').trim() !== '')
      .map((tk) => ({ tank_id: tk.id, dip_mm: draft.openDips[tk.id] as string }));
    if (entries.length === 0 && dipEntries.length === 0) return true;

    if (entries.length > 0) {
      const saved = await recordOpeningReadings(shift.id, entries);
      if (!saved.ok) {
        setError(saved.error ?? 'Those opening readings could not be saved');
        return false;
      }
    }
    if (dipEntries.length > 0) {
      const saved = await recordOpeningDips(shift.id, dipEntries);
      if (!saved.ok) {
        setError(saved.error ?? 'Those opening dips could not be saved');
        return false;
      }
    }
    router.refresh();
    return true;
  }, [context.nozzles, context.tanks, draft.openings, draft.openDips, shift.id, router]);

  const runPreview = useCallback(() => {
    setError(null);
    startTransition(async () => {
      if (!(await saveOpenings())) return;
      const result = await previewClose(shift.id, payload);
      if (result.ok && result.summary) setSummary(result.summary);
      else {
        setSummary(null);
        setError(result.error ?? 'The close could not be worked out');
      }
    });
  }, [shift.id, payload, saveOpenings]);

  useEffect(() => {
    if (step === 9) runPreview();
  }, [step, runPreview]);

  // Whoever is signed in is the person signing off, and the same name is
  // stored against the shift and printed on the daily sheet's signature line.
  const [signer, setSigner] = useState<{ name: string; nameBn: string | null } | null>(null);
  useEffect(() => {
    getSessionProfile().then((p) =>
      setSigner(p ? { name: p.fullName, nameBn: p.fullNameBn } : null),
    );
  }, []);
  const signerName = signer ? (lang === 'bn' && signer.nameBn ? signer.nameBn : signer.name) : '';

  // Which reasons the database will insist on before it accepts a sign-off.
  const flaggedTanks = summary?.tanks.filter((tk) => tk.variance_flagged) ?? [];
  const needsCashReason = summary?.cash.requires_reason ?? false;
  const missingReasons =
    flaggedTanks.some((tk) => !(draft.varianceReasons[tk.tank_id] ?? '').trim()) ||
    (needsCashReason && !draft.cashVarianceReason.trim());

  function sign() {
    setError(null);
    startTransition(async () => {
      if (!(await saveOpenings())) return;
      const result =
        shift.status === 'reopened' ? await adminRecloseShift(shift.id, payload) : await submitClose(shift.id, payload);
      if (result.ok) {
        setClosed(true);
        try {
          window.localStorage.removeItem(draftKey(shift.id));
        } catch {
          /* ignore */
        }
        router.refresh();
      } else {
        setError(result.error ?? 'The shift could not be closed');
      }
    });
  }

  if (closed) {
    return (
      <GlassCard lift={false} className="space-y-4 text-center">
        <Lock className="mx-auto h-12 w-12 state-ok" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'শিফট বন্ধ হয়েছে' : 'Shift closed'}
        </h2>
        <Muted lang={lang}>
          {lang === 'bn'
            ? 'বইয়ের সমাপ্তি পরের শিফটের সূচনা হিসেবে চলে গেছে।'
            : 'The book closing has carried forward as the next shift’s opening.'}
        </Muted>
        {signerName ? (
          <Muted lang={lang}>
            {lang === 'bn' ? 'বন্ধ করেছেন' : 'Closed by'}: <strong>{signerName}</strong>
          </Muted>
        ) : null}
        <Button size="lg" onClick={() => router.push('/manager')} lang={lang}>
          {t('nav.dashboard')}
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard lift={false} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <Muted className="tabular">{formatDate(shift.shiftDate, lang)}</Muted>
          <p className="text-base font-semibold tracking-tight" lang={lang}>
            {t(shift.shiftType === 'day' ? 'shift.day' : 'shift.night')}
          </p>
        </div>
        <Chip tone={shift.status === 'reopened' ? 'watch' : 'ok'} lang={lang}>
          {t(shift.status === 'reopened' ? 'shift.reopened' : 'shift.open')}
        </Chip>
        <div className="ml-auto tabular text-sm" style={{ color: 'var(--text-muted)' }}>
          {formatNumber(step + 1, { lang })} / {formatNumber(STEP_KEYS.length, { lang })}
        </div>
      </GlassCard>

      {/* Every step is directly selectable, so a figure spotted late can be
          corrected without stepping back through the whole close. */}
      <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Steps">
        {STEP_KEYS.map(([en, bn], index) => (
          <button
            key={en}
            type="button"
            onClick={() => setStep(index)}
            lang={lang}
            className="tap-target shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap"
            style={
              index === step
                ? { background: 'var(--color-accent)', color: 'white' }
                : { color: 'var(--text-muted)' }
            }
          >
            {formatNumber(index + 1, { lang })}. {lang === 'bn' ? bn : en}
          </button>
        ))}
      </nav>

      <GlassCard lift={false} className="space-y-4">
        {step === 0 ? <MeterStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 1 ? <TestStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 2 ? <DipStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 3 ? <RateStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 4 ? <CreditStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 5 ? <LubStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 6 ? <ExpenseStep context={context} draft={draft} setDraft={setDraft} /> : null}
        {step === 7 ? <DueStep summary={summary} shiftId={shift.id} customers={context.customers} onCollected={runPreview} /> : null}
        {step === 8 ? <CashStep context={context} draft={draft} setDraft={setDraft} summary={summary} onCollected={runPreview} /> : null}
        {/* The name that goes on the shift and on the printed daily sheet.
            Shown whether or not the reconciliation has come back yet. */}
        {step === 10 && signerName ? (
          <div className="mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
              {lang === 'bn' ? 'যিনি বন্ধ করছেন' : 'Closed by'}
            </p>
            <p className="text-sm font-semibold tracking-tight">{signerName}</p>
            <Muted lang={lang}>
              {lang === 'bn'
                ? 'এই নামই শিফটের সঙ্গে থাকবে এবং দৈনিক বিবরণীর স্বাক্ষরের ঘরে ছাপা হবে।'
                : 'This name is stored against the shift and printed on the daily sheet’s signature line.'}
            </Muted>
          </div>
        ) : null}

        {step >= 9 ? (
          <SummaryStep
            summary={summary}
            pending={pending}
            draft={draft}
            setDraft={setDraft}
            signing={step === 10}
            signerName={signerName}
          />
        ) : null}

        {error ? (
          <p className="state-breach text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </GlassCard>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="lg" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)} lang={lang}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {lang === 'bn' ? 'পিছনে' : 'Back'}
        </Button>

        {step < STEP_KEYS.length - 1 ? (
          <Button size="lg" className="ml-auto" disabled={pending} onClick={() => setStep((s) => s + 1)} lang={lang}>
            {lang === 'bn' ? 'পরবর্তী' : 'Next'}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            size="lg"
            className="ml-auto"
            disabled={pending || !summary || missingReasons}
            onClick={sign}
            lang={lang}
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            {lang === 'bn' ? 'স্বাক্ষর ও বন্ধ' : 'Sign off and close'}
          </Button>
        )}
      </div>

      {step === STEP_KEYS.length - 1 && missingReasons ? (
        <Muted className="state-breach text-center" lang={lang}>
          {lang === 'bn'
            ? 'গরমিলের কারণ না লেখা পর্যন্ত স্বাক্ষর করা যাবে না।'
            : 'Sign-off stays locked until every variance has a written reason.'}
        </Muted>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type StepProps = {
  context: CloseContext;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
};

function Field({
  label,
  value,
  onChange,
  hint,
  wide = false,
  text = false,
}: {
  text?: boolean;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'block space-y-1 sm:col-span-2' : 'block space-y-1'}>
      <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <input
        value={value}
        type="text"
        inputMode={text ? 'text' : 'decimal'}
        onChange={(e) => onChange(e.target.value)}
        className="tabular tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--hairline)' }}
      />
      {hint ? <Muted>{hint}</Muted> : null}
    </label>
  );
}

/** Live litres for one nozzle, using the same function the tests cover. */
function nozzleLitres(
  opening: string | null,
  closing: string,
  meterDigits: number,
  maxFlowLpm: string,
  shiftMinutes: number,
) {
  if (!opening || !closing.trim()) return null;
  try {
    return litresSold({
      openingReading: opening,
      closingReading: closing,
      spec: { meterDigits, maxFlowLpm },
      shiftMinutes,
    });
  } catch (e) {
    return e instanceof CalcError ? e : null;
  }
}

function MeterStep({ context, draft, setDraft }: StepProps) {
  const { lang } = useLang();
  const shift = context.shift!;
  const minutes = Math.max(
    1,
    (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 60000,
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {lang === 'bn' ? 'প্রতিটি নজলের সমাপ্তি রিডিং' : 'Closing reading for every nozzle'}
      </h2>

      {context.nozzles.map((n) => {
        const entry = draft.readings[n.nozzleId] ?? { closing: '', test: '0' };
        const opening = n.openingSource ? n.openingReading : (draft.openings?.[n.nozzleId] || null);
        const result = nozzleLitres(opening, entry.closing, n.meterDigits, n.maxFlowLpm, minutes);

        const calcError = result instanceof CalcError ? result : null;
        const sold = result && !(result instanceof CalcError) ? result : null;

        return (
          <div key={n.nozzleId} className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">{n.dispenserCode}</span>
              <Muted>
                {n.tankCode}
                {n.nozzleNo > 1 ? ` · ${n.nozzleNo}` : ''}
              </Muted>
              {n.submittedClosing ? (
                <Chip tone="ok" lang={lang}>
                  {lang === 'bn' ? 'ডিসপেনসার জমা দিয়েছে' : 'Dispenser submitted'}
                </Chip>
              ) : null}
              {sold?.isRollover ? (
                <Chip tone="watch" lang={lang}>
                  {lang === 'bn' ? 'মিটার ঘুরে গেছে — যাচাই করুন' : 'Rollover — confirm'}
                </Chip>
              ) : null}
              {sold?.implausible ? (
                <Chip tone="breach" lang={lang}>
                  {lang === 'bn' ? 'অস্বাভাবিক' : 'Implausible'}
                </Chip>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {n.openingSource ? (
                <div className="space-y-1">
                  <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                    {lang === 'bn' ? 'শুরুর রিডিং' : 'Opening'}
                  </span>
                  <p className="tabular rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--hairline)' }}>
                    {n.openingReading ? formatNumber(n.openingReading, { lang, decimals: 2 }) : '—'}
                  </p>
                  <Muted lang={lang}>
                    {n.openingSource === 'previous_close'
                      ? lang === 'bn'
                        ? 'গত শিফটের সমাপ্তি'
                        : 'Previous shift’s close'
                      : lang === 'bn'
                        ? 'এই শিফটের শুরু'
                        : 'This shift’s opening'}
                  </Muted>
                </div>
              ) : (
                <div className="space-y-1">
                  <Field
                    label={lang === 'bn' ? 'শুরুর রিডিং' : 'Opening'}
                    value={draft.openings?.[n.nozzleId] ?? ''}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, openings: { ...(d.openings ?? {}), [n.nozzleId]: v } }))
                    }
                  />
                  <Muted lang={lang}>
                    {lang === 'bn'
                      ? 'কোনো শুরুর রিডিং নেই — এখানে লিখুন'
                      : 'No opening reading — type it here'}
                  </Muted>
                </div>
              )}


              <Field
                label={lang === 'bn' ? 'সমাপ্তি রিডিং' : 'Closing'}
                value={entry.closing}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, readings: { ...d.readings, [n.nozzleId]: { ...entry, closing: v } } }))
                }
              />

              <div className="space-y-1">
                <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                  {lang === 'bn' ? 'বিক্রি' : 'Sold'}
                </span>
                <p className="tabular px-1 py-2 text-lg font-semibold">
                  {sold ? formatLitres(sold.litresSold.toFixed(3), lang) : '—'}
                </p>
                {sold?.implausible ? (
                  <Muted className="state-breach">{sold.implausible.reason}</Muted>
                ) : calcError ? (
                  <Muted className="state-breach">{calcError.message}</Muted>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestStep({ context, draft, setDraft }: StepProps) {
  const { lang } = useLang();
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {lang === 'bn' ? 'টেস্ট / পরিমাপে ব্যবহৃত লিটার' : 'Litres pumped into the test measure'}
      </h2>
      <Muted lang={lang}>
        {lang === 'bn'
          ? 'এই তেল মেশিন থেকে বেরিয়ে আবার ট্যাংকে ফেরত যায় — তাই বিক্রি থেকে বাদ, মজুদে যোগ।'
          : 'This fuel leaves the dispenser and goes back into the tank, so it is excluded from sales and stays in stock.'}
      </Muted>

      <div className="grid gap-3 sm:grid-cols-2">
        {context.nozzles.map((n) => {
          const entry = draft.readings[n.nozzleId] ?? { closing: '', test: '0' };
          return (
            <Field
              key={n.nozzleId}
              label={`${n.dispenserCode}${n.nozzleNo > 1 ? ` · ${n.nozzleNo}` : ''}`}
              value={entry.test}
              onChange={(v) =>
                setDraft((d) => ({ ...d, readings: { ...d.readings, [n.nozzleId]: { ...entry, test: v } } }))
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** Litres through the tank's certified chart, back to a rod reading in mm. */
async function litresToDip(tankId: string, litres: number): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('litres_to_dip', {
    p_tank_id: tankId,
    p_litres: litres,
  });
  if (error || data === null || data === undefined) return null;
  return String(Math.round(Number(data)));
}

/** A rod reading in mm, through the tank's certified chart, to litres. */
async function dipToLitresRpc(tankId: string, mm: number): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('dip_to_litres', {
    p_tank_id: tankId,
    p_dip_mm: mm,
  } as never);
  if (error || data === null || data === undefined) return null;
  return String(data);
}

/** A dip typed in mm; the litres from the calibration chart are shown under it. */
function MmDipField({
  tankId,
  label,
  finalDipMm,
  onMm,
  value = '',
}: {
  tankId: string;
  label: string;
  finalDipMm: number;
  onMm: (mm: string) => void;
  value?: string;
}) {
  const { lang } = useLang();
  const [mm, setMm] = useState(value);
  const [litres, setLitres] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  // Restore the saved entry (kept until the shift is closed).
  useEffect(() => {
    if (value && value !== mm) {
      setMm(value);
      const n = Number(value);
      if (Number.isFinite(n) && n >= 1 && n <= finalDipMm) void dipToLitresRpc(tankId, n).then(setLitres);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tankId, finalDipMm]);

  return (
    <div className="space-y-1">
      <Field
        label={label}
        value={mm}
        onChange={(v) => {
          setMm(v);
          const n = Number(v);
          if (!v.trim() || !Number.isFinite(n) || n < 1 || n > finalDipMm) {
            setLitres(null);
            setBad(!!v.trim());
            onMm('');
            return;
          }
          setBad(false);
          onMm(v.trim());
          void dipToLitresRpc(tankId, n).then(setLitres);
        }}
      />
      {litres ? (
        <Muted className="tabular" lang={lang}>= {formatLitres(litres, lang)}</Muted>
      ) : bad ? (
        <Muted className="tabular" lang={lang}>
          {lang === 'bn' ? `১ – ${finalDipMm} মিমি এর মধ্যে লিখুন` : `Enter 1 – ${finalDipMm} mm`}
        </Muted>
      ) : null}
    </div>
  );
}

function BookOpening({ tankId, litres }: { tankId: string; litres: string | null }) {
  const { lang } = useLang();
  const [mm, setMm] = useState<string | null>(null);
  useEffect(() => {
    const n = Number(litres);
    if (!litres || !Number.isFinite(n) || n <= 0) return;
    void litresToDip(tankId, n).then(setMm);
  }, [tankId, litres]);
  return (
    <div>
      <Muted className="tabular" lang={lang}>
        {lang === 'bn' ? 'শুরুর ডিপ' : 'Opening dip'}: {litres ? formatLitres(litres, lang) : '—'}
      </Muted>
      {mm ? (
        <div className="text-[11px] tabular opacity-60">{formatNumber(mm, { lang })} mm</div>
      ) : null}
    </div>
  );
}

function DipStep({ context, draft, setDraft }: StepProps) {
  const { t, lang } = useLang();
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {lang === 'bn' ? 'সমাপ্তি ডিপ' : 'Closing dip for every tank'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {context.tanks.map((tk) => (
          <div key={tk.id} className="space-y-1 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">
                {t('tank.tank')} {tk.code}
              </span>
              <Muted className="tabular">1 – {formatNumber(tk.finalDipMm, { lang })} mm</Muted>
            </div>
            <MmDipField
              tankId={tk.id}
              finalDipMm={tk.finalDipMm}
              label={lang === 'bn' ? 'ডিপ (মিমি)' : 'Dip (mm)'}
              value={draft.dips[tk.id] ?? ''}
              onMm={(mm) => setDraft((d) => ({ ...d, dips: { ...d.dips, [tk.id]: mm } }))}
            />
            {tk.bookOpeningSource ? (
              <BookOpening tankId={tk.id} litres={tk.bookOpening} />
            ) : (
              <>
                <MmDipField
                  tankId={tk.id}
                  finalDipMm={tk.finalDipMm}
                  label={lang === 'bn' ? 'শুরুর ডিপ (মিমি)' : 'Opening dip (mm)'}
                  value={draft.openDips?.[tk.id] ?? ''}
                  onMm={(mm) => setDraft((d) => ({ ...d, openDips: { ...(d.openDips ?? {}), [tk.id]: mm } }))}
                />
                <Muted lang={lang}>
                  {lang === 'bn'
                    ? 'বইয়ে শুরুর মজুদ নেই — শিফটের শুরুর ডিপ মিমি-তে লিখুন'
                    : 'No opening stock in the books — type the shift’s opening dip in mm'}
                </Muted>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RateStep({ context, draft, setDraft }: StepProps) {
  const { lang } = useLang();
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {lang === 'bn' ? 'এই শিফটের বিক্রয় দর' : 'Selling rate for this shift'}
      </h2>
      <div className="max-w-xs">
        <Field
          label={lang === 'bn' ? 'দর প্রতি লিটার (৳)' : 'Rate per litre (৳)'}
          value={draft.rate}
          onChange={(v) => setDraft((d) => ({ ...d, rate: v }))}
          hint={
            context.lastRate
              ? `${lang === 'bn' ? 'গত শিফট' : 'Last shift'}: ${formatBDT(context.lastRate, lang)}`
              : undefined
          }
        />
      </div>
    </div>
  );
}

function RowList({
  title,
  hint,
  rows,
  onAdd,
  children,
}: {
  title: string;
  hint?: string;
  rows: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { t, lang } = useLang();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {title}
        </h2>
        <Button variant="glass" size="sm" className="ml-auto" onClick={onAdd} lang={lang}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {lang === 'bn' ? 'সারি যোগ' : 'Add row'}
        </Button>
      </div>
      {hint ? <Muted lang={lang}>{hint}</Muted> : null}
      {rows === 0 ? <Muted lang={lang}>{t('common.empty')}</Muted> : children}
    </div>
  );
}

function CreditStep({ context, draft, setDraft }: StepProps) {
  const { lang } = useLang();
  const active = context.customers;

  return (
    <RowList
      title={lang === 'bn' ? 'পার্টিভিত্তিক বাকি বিক্রি' : 'Credit sales, party by party'}
      hint={
        active.length === 0
          ? lang === 'bn'
            ? 'কোনো সক্রিয় পার্টি নেই — অ্যাডমিন প্রথমে পার্টিগুলো চালু করুন।'
            : 'No active credit party yet. An admin needs to name and activate the real parties first.'
          : undefined
      }
      rows={draft.creditSales.length}
      onAdd={() =>
        setDraft((d) => ({
          ...d,
          creditSales: [...d.creditSales, { customerId: '', litres: '', rate: d.rate, amount: '', vehicleNo: '', challanNo: '' }],
        }))
      }
    >
      <div className="space-y-3">
        {draft.creditSales.map((row, index) => (
          <div key={index} className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                  {lang === 'bn' ? 'পার্টি' : 'Party'}
                </span>
                <select
                  value={row.customerId}
                  onChange={(e) =>
                    setDraft((d) => {
                      const next = [...d.creditSales];
                      next[index] = { ...row, customerId: e.target.value };
                      return { ...d, creditSales: next };
                    })
                  }
                  className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  <option value="">—</option>
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label={lang === 'bn' ? 'লিটার' : 'Litres'}
                value={row.litres}
                onChange={(v) =>
                  setDraft((d) => {
                    const next = [...d.creditSales];
                    const amount = v && row.rate ? (Number(v) * Number(row.rate)).toFixed(2) : row.amount;
                    next[index] = { ...row, litres: v, amount };
                    return { ...d, creditSales: next };
                  })
                }
              />
              <Field
                label={lang === 'bn' ? 'দর' : 'Rate'}
                value={row.rate}
                onChange={(v) =>
                  setDraft((d) => {
                    const next = [...d.creditSales];
                    const amount = row.litres && v ? (Number(row.litres) * Number(v)).toFixed(2) : row.amount;
                    next[index] = { ...row, rate: v, amount };
                    return { ...d, creditSales: next };
                  })
                }
              />
              <Field
                label={lang === 'bn' ? 'টাকা' : 'Amount'}
                value={row.amount}
                onChange={(v) =>
                  setDraft((d) => {
                    const next = [...d.creditSales];
                    next[index] = { ...row, amount: v };
                    return { ...d, creditSales: next };
                  })
                }
              />
              <Field
                label={lang === 'bn' ? 'গাড়ি নম্বর' : 'Vehicle'}
                value={row.vehicleNo}
                onChange={(v) =>
                  setDraft((d) => {
                    const next = [...d.creditSales];
                    next[index] = { ...row, vehicleNo: v };
                    return { ...d, creditSales: next };
                  })
                }
              />
              <Field
                label={lang === 'bn' ? 'চালান নম্বর' : 'Challan'}
                value={row.challanNo}
                onChange={(v) =>
                  setDraft((d) => {
                    const next = [...d.creditSales];
                    next[index] = { ...row, challanNo: v };
                    return { ...d, creditSales: next };
                  })
                }
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setDraft((d) => ({ ...d, creditSales: d.creditSales.filter((_, x) => x !== index) }))}
              lang={lang}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {lang === 'bn' ? 'সরান' : 'Remove'}
            </Button>
          </div>
        ))}
      </div>
    </RowList>
  );
}

function LubStep({ context, draft, setDraft }: StepProps) {
  const { lang } = useLang();
  return (
    <RowList
      title={lang === 'bn' ? 'মবিল ও লুব্রিকেন্ট বিক্রি' : 'Lubricant and Mobil sales'}
      rows={draft.lubSales.length}
      onAdd={() =>
        setDraft((d) => ({
          ...d,
          lubSales: [...d.lubSales, { skuId: '', qty: '', rate: '', amount: '', settlement: 'cash', customerId: '' }],
        }))
      }
    >
      <div className="space-y-3">
        {draft.lubSales.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3" style={{ borderColor: 'var(--hairline)' }}>
            <label className="space-y-1">
              <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                {lang === 'bn' ? 'পণ্য' : 'Product'}
              </span>
              <select
                value={row.skuId}
                onChange={(e) => {
                  const sku = context.lubSkus.find((s) => s.id === e.target.value);
                  setDraft((d) => {
                    const next = [...d.lubSales];
                    next[index] = { ...row, skuId: e.target.value, rate: sku?.saleRate ?? row.rate };
                    return { ...d, lubSales: next };
                  });
                }}
                className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <option value="">—</option>
                {context.lubSkus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                {lang === 'bn' ? 'নগদ না বাকি' : 'Cash or due'}
              </span>
              <select
                value={row.settlement ?? 'cash'}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = [...d.lubSales];
                    const settlement = e.target.value as 'cash' | 'credit';
                    next[index] = { ...row, settlement, customerId: settlement === 'cash' ? '' : row.customerId };
                    return { ...d, lubSales: next };
                  })
                }
                className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <option value="cash">{lang === 'bn' ? 'নগদ' : 'Cash'}</option>
                <option value="credit">{lang === 'bn' ? 'বাকি' : 'Due'}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                {lang === 'bn' ? 'পার্টির নাম' : 'Party name'}
              </span>
              <select
                value={row.customerId ?? ''}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = [...d.lubSales];
                    next[index] = { ...row, customerId: e.target.value, settlement: e.target.value ? 'credit' : 'cash' };
                    return { ...d, lubSales: next };
                  })
                }
                className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-40"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <option value=""></option>
                {context.customers
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label={lang === 'bn' ? 'পরিমাণ' : 'Qty'}
              value={row.qty}
              onChange={(v) =>
                setDraft((d) => {
                  const next = [...d.lubSales];
                  const amount = v && row.rate ? (Number(v) * Number(row.rate)).toFixed(2) : row.amount;
                  next[index] = { ...row, qty: v, amount };
                  return { ...d, lubSales: next };
                })
              }
            />
            <Field
              label={lang === 'bn' ? 'দর' : 'Rate'}
              value={row.rate}
              onChange={(v) =>
                setDraft((d) => {
                  const next = [...d.lubSales];
                  const amount = row.qty && v ? (Number(row.qty) * Number(v)).toFixed(2) : row.amount;
                  next[index] = { ...row, rate: v, amount };
                  return { ...d, lubSales: next };
                })
              }
            />
            <Field
              label={lang === 'bn' ? 'টাকা' : 'Amount'}
              value={row.amount}
              onChange={(v) =>
                setDraft((d) => {
                  const next = [...d.lubSales];
                  next[index] = { ...row, amount: v };
                  return { ...d, lubSales: next };
                })
              }
            />
          </div>
        ))}
      </div>
    </RowList>
  );
}

function PettyCashIn({ context }: { context: CloseContext }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const cat = context.expenseCategories.find((c) => c.name === 'Petty Cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!cat) return null;
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await recordExpense({ category_id: cat!.id, amount, description: note, paid_by: 'cash' });
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? 'Error');
    setAmount('');
    setNote('');
    setMsg(bn ? 'পেটি ক্যাশে জমা হয়েছে' : 'Added to petty cash');
    signalRefresh();
  }
  const field = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
  return (
    <div className="mb-4 space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-sm font-semibold" lang={lang}>{bn ? 'পেটি ক্যাশ ইন (ড্রয়ার থেকে)' : 'Petty cash in (from the drawer)'}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={bn ? 'টাকা' : 'Amount (৳)'} className={field} style={{ borderColor: 'var(--hairline)' }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={bn ? 'বিবরণ (ঐচ্ছিক)' : 'Note (optional)'} className={field} style={{ borderColor: 'var(--hairline)' }} />
        <Button onClick={save} disabled={busy || !amount.trim()}>{bn ? 'পেটি ক্যাশে দিন' : 'Add petty cash'}</Button>
      </div>
      {msg ? <Muted lang={lang}>{msg}</Muted> : null}
    </div>
  );
}

function ExpenseStep(props: StepProps) {
  return (
    <>
      <PettyCashIn context={props.context} />
      <ExpenseRows {...props} />
    </>
  );
}

function ExpenseRows({ context, draft, setDraft }: StepProps) {
  const { lang } = useLang();
  return (
    <RowList
      title={lang === 'bn' ? 'শিফটের খরচ' : 'Expenses for this shift'}
      rows={draft.expenses.length}
      onAdd={() =>
        setDraft((d) => ({ ...d, expenses: [...d.expenses, { categoryId: '', amount: '', description: '', paidBy: 'cash' }] }))
      }
    >
      <div className="space-y-3">
        {draft.expenses.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-4" style={{ borderColor: 'var(--hairline)' }}>
            <label className="space-y-1 sm:col-span-2">
              <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                {lang === 'bn' ? 'খাত' : 'Category'}
              </span>
              <select
                value={row.categoryId}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = [...d.expenses];
                    next[index] = { ...row, categoryId: e.target.value };
                    return { ...d, expenses: next };
                  })
                }
                className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <option value="">—</option>
                {context.expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={lang === 'bn' ? 'টাকা' : 'Amount'}
              value={row.amount}
              onChange={(v) =>
                setDraft((d) => {
                  const next = [...d.expenses];
                  next[index] = { ...row, amount: v };
                  return { ...d, expenses: next };
                })
              }
            />
            <label className="space-y-1">
              <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                {lang === 'bn' ? 'পরিশোধ' : 'Paid by'}
              </span>
              <select
                value={row.paidBy}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = [...d.expenses];
                    next[index] = { ...row, paidBy: e.target.value };
                    return { ...d, expenses: next };
                  })
                }
                className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--hairline)' }}
              >
                {['cash', 'bank', 'bkash', 'nagad'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={lang === 'bn' ? 'বিবরণ' : 'Description'}
              value={row.description}
              wide
              text
              onChange={(v) =>
                setDraft((d) => {
                  const next = [...d.expenses];
                  next[index] = { ...row, description: v };
                  return { ...d, expenses: next };
                })
              }
            />
          </div>
        ))}
      </div>
    </RowList>
  );
}

/**
 * Two of these five figures are no longer typed.
 *
 * Opening cash chains from whatever the last shift counted — the drawer is not
 * emptied between shifts, so a manager choosing its opening figure could carry
 * a shortage forward until it disappeared. It is only enterable on the very
 * first close, when there is no previous count to chain from.
 *
 * Dues collected is summed from the payments actually recorded against parties
 * during the shift, and only the ones taken in cash. A typed figure balanced
 * the drawer without any party's ledger moving, and counted a bKash collection
 * as if the notes were in the till.
 */
type ShiftPayment = { id: string; customerId: string; amount: string; method: string };

/** Payments recorded against this shift, read straight from the database. */
function useShiftDues(shiftId: string) {
  const [rows, setRows] = useState<ShiftPayment[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from('payments')
        .select('id, customer_id, amount, method')
        .eq('shift_id', shiftId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (alive)
        setRows(((data ?? []) as Array<{ id: string; customer_id: string; amount: number | string; method: string }>).map((p) => ({
          id: p.id, customerId: p.customer_id, amount: String(p.amount), method: p.method,
        })));
    })();
    return () => { alive = false; };
  }, [shiftId, tick]);
  const cashTotal = rows.filter((r) => r.method === 'cash').reduce((a, r) => a + Number(r.amount), 0);
  return { rows, cashTotal, reload: () => setTick((t) => t + 1) };
}


function DueStep({
  shiftId,
  customers,
  onCollected,
}: {
  summary: CloseSummary | null;
  shiftId: string;
  customers: CloseContext['customers'];
  onCollected: () => void;
}) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const dues = useShiftDues(shiftId);
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balTick, setBalTick] = useState(0);

  useEffect(() => {
    if (!party) { setBalance(null); return; }
    let alive = true;
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.rpc('customer_balance', { p_customer_id: party });
      if (alive) setBalance(data == null ? 0 : Number(data));
    })();
    return () => { alive = false; };
  }, [party, balTick]);

  const typed = toNum(amount);
  const typedOk = typed !== null && !Number.isNaN(typed) && typed > 0;
  const remaining = balance !== null ? balance - (typedOk ? (typed as number) : 0) : null;
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';

  async function collect() {
    setBusy(true);
    setMsg(null);
    const res = await recordPayment({ customer_id: party, amount, method: 'cash', shift_id: shiftId });
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? 'Could not save');
    setAmount('');
    setMsg(bn ? 'আদায় সংরক্ষিত হয়েছে' : 'Collection saved');
    setBalTick((t) => t + 1);
    dues.reload();
    signalRefresh();
    onCollected();
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {bn ? 'বাকি আদায়' : 'Due collection'}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
          <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {bn ? 'বাকি আদায় যোগ করুন (নগদ)' : 'Add a due collected in cash'}
          </span>
          <select
            value={party}
            onChange={(e) => { setParty(e.target.value); setMsg(null); }}
            className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <option value="">{bn ? 'পার্টি বাছুন' : 'Choose party'}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {balance !== null ? (
            <div className="flex justify-between text-xs tabular" lang={lang}>
              <span style={{ color: 'var(--text-muted)' }}>{bn ? 'বর্তমান বাকি' : 'Current due'}</span>
              <span className="font-semibold">{formatBDT(String(balance), lang)}</span>
            </div>
          ) : null}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={bn ? 'টাকা' : 'Amount'}
            className="tap-target tabular w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--hairline)' }}
          />
          {remaining !== null ? (
            <div className="flex justify-between text-xs tabular" lang={lang}>
              <span style={{ color: 'var(--text-muted)' }}>{bn ? 'আদায়ের পর বাকি থাকবে' : 'Due left after this'}</span>
              <span className={`font-semibold ${remaining < 0 ? 'state-breach' : 'state-ok'}`}>
                {formatBDT(String(remaining), lang)}
              </span>
            </div>
          ) : null}
          <Button onClick={collect} disabled={busy || !party || !typedOk}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {bn ? 'আদায় যোগ করুন' : 'Add collection'}
          </Button>
          {msg ? <Muted lang={lang}>{msg}</Muted> : null}
        </div>

        <div className="space-y-2">
          <Derived
            label={bn ? 'এই শিফটে নগদ আদায়' : 'Collected in cash this shift'}
            value={formatBDT(String(dues.cashTotal), lang)}
            hint={bn ? 'নগদ গণনায় যোগ হয়' : 'Added to the cash the drawer should hold'}
          />
          {dues.rows.length > 0 ? (
            <ul className="space-y-1 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--hairline)' }}>
              {dues.rows.map((r) => (
                <li key={r.id} className="flex justify-between tabular">
                  <span>{nameOf(r.customerId)}</span>
                  <span className="flex items-center gap-1">
                    {formatBDT(r.amount, lang)}
                    <AdminDelete table="payments" id={r.id} onDone={dues.reload} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toNum(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  // Figures from the database can arrive as numbers, typed ones as strings.
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-5 w-5 shrink-0 state-ok" aria-label="ok" />
  ) : (
    <XCircle className="h-5 w-5 shrink-0 state-breach" aria-label="wrong" />
  );
}

function CashStep({
  context,
  draft,
  setDraft,
  summary,
  onCollected,
}: {
  context: CloseContext;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  summary: CloseSummary | null;
  onCollected: () => void;
}) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const cash = summary?.cash;
  const chained = cash?.opening_source === 'previous_shift';
  useEffect(() => { onCollected(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shift = context.shift!;
  const minutes = Math.max(1, (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 60000);

  // ---- everything worked out from what has been typed so far --------------
  let litresTotal = 0;
  const missingNozzles: string[] = [];
  for (const n of context.nozzles) {
    const entry = draft.readings[n.nozzleId] ?? { closing: '', test: '0' };
    const opening = n.openingSource ? n.openingReading : draft.openings?.[n.nozzleId] || null;
    const r = nozzleLitres(opening, entry.closing, n.meterDigits, n.maxFlowLpm, minutes);
    if (!r || r instanceof CalcError) {
      missingNozzles.push(`${n.dispenserCode}${n.nozzleNo > 1 ? `·${n.nozzleNo}` : ''}`);
      continue;
    }
    litresTotal += Number(r.litresSold.toString()) - (toNum(entry.test) || 0);
  }
  const rate = toNum(draft.rate);
  const rateOk = rate !== null && !Number.isNaN(rate) && rate > 0;
  const fuelSales = rateOk ? litresTotal * (rate as number) : 0;
  const creditTotal = draft.creditSales.reduce((a, r) => a + (r.customerId ? toNum(r.amount) || 0 : 0), 0);
  const lubCash = draft.lubSales.reduce(
    (a, r) => a + (r.skuId && r.settlement !== 'credit' ? toNum(r.amount) || 0 : 0),
    0,
  );
  const expensesCash = draft.expenses.reduce(
    (a, r) => a + (r.categoryId && (r.paidBy || 'cash') === 'cash' ? toNum(r.amount) || 0 : 0),
    0,
  );
  const liveDues = useShiftDues(shift.id);
  const dues = Math.max(Number(cash?.dues_collected ?? 0), liveDues.cashTotal);
  const openingRaw = '0'; // each shift stands alone; no opening cash
  const opening = toNum(openingRaw);
  const counted = toNum(draft.cash.countedCash);

  // Only cash sent to the bank from the drawer (dashboard "Deposit to bank")
  // comes off the shift's cash. Other bank credits stay on the Bank statement.
  useEffect(() => {
    let live = true;
    import('@/lib/data/bank').then(({ getShiftBankDeposits }) =>
      getShiftBankDeposits(shift.id).then((amt) => {
        if (!live) return;
        setDraft((d) => (d.cash.bankDeposits === amt ? d : { ...d, cash: { ...d.cash, bankDeposits: amt } }));
      }),
    );
    return () => { live = false; };
  }, [setDraft, shift.id]);
  const drawerDeposits = toNum(draft.cash.bankDeposits) || 0;

  // Petty cash in taken from the drawer during this shift.
  const refreshKey = useRefreshKey();
  const [pettyIn, setPettyIn] = useState(0);
  // Cash expenses already saved against this shift from the Expenses page.
  const [savedExpCash, setSavedExpCash] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.resolve(createClient()).then((sb: any) =>
      sb
        .from('expenses')
        .select('amount, paid_by, expense_categories!inner(name, group)')
        .eq('shift_id', shift.id)
        .is('deleted_at', null)
        .then(({ data }: { data: unknown }) => {
          if (!live) return;
          const rows = (data ?? []) as Array<{ amount: number; paid_by: string; expense_categories: { name: string; group: string } }>;
          setPettyIn(rows.filter((r) => r.expense_categories.name === 'Petty Cash' && r.paid_by !== 'petty').reduce((a, r) => a + Number(r.amount), 0));
          setSavedExpCash(rows.filter((r) => r.expense_categories.name !== 'Petty Cash' && r.expense_categories.group !== 'own_use' && r.paid_by === 'cash').reduce((a, r) => a + Number(r.amount), 0));
        }),
    );
    return () => { live = false; };
  }, [shift.id, refreshKey]);

  const openingOk = opening !== null && !Number.isNaN(opening) && opening >= 0;
  const fuelOk = missingNozzles.length === 0 && rateOk;
  const creditOk = creditTotal <= fuelSales + 0.005 || !fuelOk;
  const cashSales = fuelSales - creditTotal + lubCash;
  const expected = (opening || 0) + cashSales + dues - expensesCash - savedExpCash - drawerDeposits - pettyIn;
  const round = (n: number) => Math.round(n * 100) / 100;
  const diff = counted === null || Number.isNaN(counted) ? null : round(counted - expected);
  const countedOk = diff !== null && diff === 0;

  const rows: Array<{ label: string; value: number; sign: '+' | '−' | ''; ok: boolean; note?: string }> = [
    {
      label: bn ? `তেল বিক্রি (${formatNumber(litresTotal, { lang, decimals: 3 })} লি × দর)` : `Fuel sales (${formatNumber(litresTotal, { lang, decimals: 3 })} L × rate)`,
      value: fuelSales,
      sign: '+',
      ok: fuelOk,
      note: fuelOk
        ? undefined
        : !rateOk
          ? bn ? 'দর দেওয়া হয়নি' : 'Rate is missing'
          : bn ? `রিডিং বাকি: ${missingNozzles.join(', ')}` : `Readings missing: ${missingNozzles.join(', ')}`,
    },
    {
      label: bn ? 'বাকি বিক্রি' : 'Credit sales',
      value: creditTotal,
      sign: '−',
      ok: creditOk,
      note: creditOk ? undefined : bn ? 'বাকি বিক্রি মোট বিক্রির চেয়ে বেশি' : 'Credit sales are more than total fuel sales',
    },
    { label: bn ? 'লুব্রিকেন্ট নগদ বিক্রি' : 'Lubricant cash sales', value: lubCash, sign: '+', ok: true },
    { label: bn ? 'বাকি আদায় (নগদ)' : 'Dues collected in cash', value: dues, sign: '+', ok: true },
    { label: bn ? 'নগদ খরচ' : 'Cash expenses', value: expensesCash + savedExpCash, sign: '−', ok: true },
    { label: bn ? 'ড্রয়ার থেকে ব্যাংকে জমা' : 'Deposited to bank from drawer', value: drawerDeposits, sign: '−', ok: true },
    { label: bn ? 'পেটি ক্যাশ ইন' : 'Petty cash in', value: pettyIn, sign: '−', ok: true },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {bn ? 'নগদ হিসাব' : 'Cash check'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label={bn ? 'সমাপনী নগদ (গোনা)' : 'Closing cash (counted)'}
              value={draft.cash.countedCash}
              onChange={(v) => setDraft((d) => ({ ...d, cash: { ...d.cash, countedCash: v } }))}
            />
          </div>
          {diff !== null ? <div className="pb-2.5"><Mark ok={countedOk} /></div> : null}
        </div>
        {false ? (
          <div className="flex items-end gap-2 sm:col-span-2">
            <div className="flex-1">
              <Field
                label={bn ? 'শুরুর নগদ' : 'Opening cash'}
                value={draft.cash.openingCash}
                onChange={(v) => setDraft((d) => ({ ...d, cash: { ...d.cash, openingCash: v } }))}
                hint={bn ? 'প্রথম শিফট — প্রারম্ভিক তহবিল একবারই দিতে হবে' : 'The first shift: the opening float is typed once, then it chains'}
              />
            </div>
            <div className="pb-7"><Mark ok={openingOk} /></div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
        <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {bn ? 'স্বয়ংক্রিয় হিসাব' : 'Worked out automatically'}
        </p>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-sm">
              <Mark ok={r.ok} />
              <div className="min-w-0 flex-1">
                <span lang={lang}>{r.label}</span>
                {r.note ? <span className="state-breach block text-xs" lang={lang}>{r.note}</span> : null}
              </div>
              <span className="tabular shrink-0">
                {r.sign} {formatBDT(round(r.value).toFixed(2), lang)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t pt-2 text-sm font-semibold" style={{ borderColor: 'var(--hairline)' }}>
            <span className="h-5 w-5" />
            <span className="flex-1" lang={lang}>{bn ? 'ড্রয়ারে থাকার কথা' : 'Cash that should be in the drawer'}</span>
            <span className="tabular">{formatBDT(round(expected).toFixed(2), lang)}</span>
          </li>
          <li className="flex items-center gap-2 text-sm font-semibold">
            {diff !== null ? <Mark ok={countedOk} /> : <span className="h-5 w-5" />}
            <span className="flex-1" lang={lang}>{bn ? 'গোনা নগদ' : 'Cash counted'}</span>
            <span className="tabular">{diff !== null ? formatBDT((counted as number).toFixed(2), lang) : '—'}</span>
          </li>
          {diff !== null ? (
            <li className={`text-right text-xs font-medium ${countedOk ? 'state-ok' : 'state-breach'}`} lang={lang}>
              {countedOk
                ? bn ? 'হিসাব মিলেছে' : 'Matches'
                : `${bn ? (diff < 0 ? 'কম' : 'বেশি') : diff < 0 ? 'Short' : 'Over'} ${diff < 0 ? '−' : '+'}${formatBDT(Math.abs(diff).toFixed(2), lang)}`}
            </li>
          ) : null}
        </ul>
      </div>

      {cash && Number(cash.dues_non_cash) > 0 ? (
        <Muted lang={lang}>
          {bn
            ? `আরও ${formatBDT(cash.dues_non_cash, lang)} বিকাশ/ব্যাংকে আদায় হয়েছে — পার্টির বাকি কমেছে, কিন্তু ক্যাশে আসেনি।`
            : `A further ${formatBDT(cash.dues_non_cash, lang)} came in by bKash, bank or cheque. It reduced what those parties owe but never reached the drawer, so it is not counted here.`}
        </Muted>
      ) : null}
    </div>
  );
}

/** A figure the database worked out, shown where a field used to be. */
function Derived({ label, value, hint }: { label: string; value: string; hint: string }) {
  const { lang } = useLang();
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
        {label}
      </span>
      <div
        className="tabular rounded-xl border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}
      >
        {value}
      </div>
      <Muted lang={lang}>{hint}</Muted>
    </div>
  );
}

function SummaryStep({
  summary,
  pending,
  draft,
  setDraft,
  signing,
  signerName,
}: {
  summary: CloseSummary | null;
  pending: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  signing: boolean;
  signerName: string;
}) {
  const { t, lang } = useLang();

  if (pending && !summary) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }
  if (!summary) return null;

  const s = summary.sales;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {signing ? (lang === 'bn' ? 'স্বাক্ষরের আগে শেষবার দেখুন' : 'Last look before you sign') : t('nav.shiftClose')}
      </h2>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={lang === 'bn' ? 'মোট লিটার' : 'Gross litres'} value={formatLitres(s.gross_litres, lang)} />
        <Stat label={lang === 'bn' ? 'টেস্ট (ট্যাংকে ফেরত)' : 'Test (back to tank)'} value={formatLitres(s.test_litres, lang)} />
        <Stat label={lang === 'bn' ? 'নিট লিটার' : 'Net litres'} value={formatLitres(s.net_litres, lang)} />
        <Stat label={lang === 'bn' ? 'ডিজেল বিক্রি' : 'Diesel sales'} value={formatBDT(s.sales_amount, lang)} />
        <Stat label={lang === 'bn' ? 'লুব্রিকেন্ট' : 'Lubricants'} value={formatBDT(s.lubricant_sales, lang)} />
        <Stat label={lang === 'bn' ? 'বাকি বিক্রি' : 'Credit sales'} value={formatBDT(s.credit_sales, lang)} />
        <Stat label={lang === 'bn' ? 'নগদ বিক্রি' : 'Cash sales'} value={formatBDT(s.cash_sales, lang)} />
        <Stat label={lang === 'bn' ? 'মোট বিক্রি' : 'Total sales'} value={formatBDT(s.total_sales, lang)} />
      </div>

      {/* Per tank: the book chain, the rod, and the gap between them. */}
      <div className="space-y-2">
        {summary.tanks.map((tk) => (
          <div
            key={tk.tank_id}
            className="rounded-xl border p-3"
            style={{ borderColor: Number(tk.variance_litres) < 0 ? 'var(--color-breach)' : Number(tk.variance_litres) > 0 ? 'var(--color-ok)' : 'var(--hairline)' }}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">
                {t('tank.tank')} {tk.tank_code}
              </span>
              <Chip tone={Number(tk.variance_litres) < 0 ? 'breach' : 'ok'} className="tabular">
                {Number(tk.variance_litres) < 0 ? '✗ ' : '✓ '}
                {formatLitres(tk.variance_litres, lang, true)} · {formatPercent(tk.variance_pct, lang)}
                {Number(tk.variance_litres) > 0 ? (lang === 'bn' ? ' · বেশি' : ' · Excess') : Number(tk.variance_litres) < 0 ? (lang === 'bn' ? ' · ঘাটতি' : ' · Short') : ''}
              </Chip>
            </div>

            <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
              {formatLitres(tk.book_opening, lang)} {lang === 'bn' ? 'শুরু' : 'opening'} +{' '}
              {formatLitres(tk.refill_litres, lang)} {lang === 'bn' ? 'রিফিল' : 'refill'} −{' '}
              {Number(tk.returned_litres ?? 0) > 0 ? (
                <>
                  {formatLitres(tk.returned_litres ?? '0', lang)} {lang === 'bn' ? 'ক্রয়ে ফেরত' : 'returned'} −{' '}
                </>
              ) : null}
              {formatLitres(tk.sold_from_tank, lang)} {lang === 'bn' ? 'বিক্রি' : 'sold'} ={' '}
              <strong>{formatLitres(tk.book_closing, lang)}</strong> {lang === 'bn' ? 'বইয়ে' : 'on the book'} ·{' '}
              <strong>{formatLitres(tk.physical_closing, lang)}</strong> {lang === 'bn' ? 'রডে' : 'on the rod'}
            </p>

            {tk.variance_flagged ? (
              <label className="mt-2 block space-y-1">
                <span className="state-breach flex items-center gap-1 text-xs font-medium" lang={lang}>
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {lang === 'bn' ? 'কারণ লিখুন — ছাড়া স্বাক্ষর হবে না' : 'Reason required before sign-off'}
                </span>
                <input
                  value={draft.varianceReasons[tk.tank_id] ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      varianceReasons: { ...d.varianceReasons, [tk.tank_id]: e.target.value },
                    }))
                  }
                  className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-breach)' }}
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>

      {/* Cash */}
      <div
        className="rounded-xl border p-3"
        style={{ borderColor: summary.cash.requires_reason ? 'var(--color-breach)' : 'var(--hairline)' }}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tracking-tight" lang={lang}>
            {lang === 'bn' ? 'নগদ মিলকরণ' : 'Cash reconciliation'}
          </span>
          <Chip tone={summary.cash.requires_reason ? 'breach' : 'ok'} className="tabular">
            {formatBDT(summary.cash.cash_variance, lang, true)}
          </Chip>
        </div>
        <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {formatBDT(summary.cash.cash_sales, lang)} +{' '}
          {formatBDT(summary.cash.dues_collected, lang)} − {formatBDT(summary.cash.expenses_cash, lang)}{' '}
          = <strong>{formatBDT(summary.cash.expected_cash, lang)}</strong>{' '}
          {lang === 'bn' ? 'প্রত্যাশিত' : 'expected'} · <strong>{formatBDT(summary.cash.counted_cash, lang)}</strong>{' '}
          {lang === 'bn' ? 'গোনা' : 'counted'}
        </p>

        {summary.cash.requires_reason ? (
          <label className="mt-2 block space-y-1">
            <span className="state-breach flex items-center gap-1 text-xs font-medium" lang={lang}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {lang === 'bn' ? 'কারণ লিখুন' : 'Reason required'}
            </span>
            <input
              value={draft.cashVarianceReason}
              onChange={(e) => setDraft((d) => ({ ...d, cashVarianceReason: e.target.value }))}
              className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-breach)' }}
            />
          </label>
        ) : null}
      </div>

      {summary.readings.some((r) => r.is_rollover || r.implausible) ? (
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 state-watch" aria-hidden />
          <Muted lang={lang}>
            {lang === 'bn'
              ? 'একটি বা একাধিক মিটার ঘুরে গেছে বা অস্বাভাবিক — ফিরে গিয়ে যাচাই করুন।'
              : 'One or more meters rolled over or read implausibly. Go back and check them.'}
          </Muted>
        </div>
      ) : null}

      {signing ? (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden />
          <Muted lang={lang}>
            {lang === 'bn'
              ? 'স্বাক্ষরের পর শিফট বন্ধ হয়ে যাবে। কেবল অ্যাডমিন কারণসহ আবার খুলতে পারবেন।'
              : 'Signing off locks the shift. Only an admin can reopen it, with a reason.'}
          </Muted>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
        {label}
      </p>
      <p className="tabular mt-0.5 text-sm font-semibold tracking-tight">{value}</p>
    </div>
  );
}
