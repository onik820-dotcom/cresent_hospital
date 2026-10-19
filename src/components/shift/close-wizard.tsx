'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Link } from '@tanstack/react-router';
import { useRouter } from '@/lib/compat';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Lock,
  Plus,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
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
import { stockLight, useThresholds, useThresholdsState, type Thresholds, type TrafficLight } from '@/lib/data/thresholds';

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
  /** The manager has tapped Confirm on the (pre-filled) test-fire quantity. */
  testConfirmed?: boolean;
}

/**
 * Eleven short steps used to stand between a manager and the end of the shift.
 * They are now six, each a group of the old steps that are done in one place
 * with one instrument: every old field is still here, only the grouping changed.
 *
 *   1 Physical readings   meter readings + test fire + tank dips
 *   2 Prices & deliveries rate + what the tankers brought in
 *   3 Sales               credit sales + lubricants
 *   4 Cash out            expenses + due collection + cash check
 *   5 Final check         the reconciliation, with a reason for any variance
 *   6 Sign off
 */
const STEP_KEYS = [
  ['Physical readings', 'মিটার ও ডিপ'],
  ['Prices & deliveries', 'দর ও রিফিল'],
  ['Sales', 'বিক্রি'],
  ['Cash out', 'নগদ বের'],
  ['Final check', 'শেষ যাচাই'],
  ['Sign off', 'স্বাক্ষর'],
] as const;

/** The first step that needs the database's worked-out figures. */
const FINAL_STEP = 4;
const MODE_KEY = 'jhm.close.mode';

function draftKey(shiftId: string) {
  return `jhm.close.${shiftId}`;
}

export interface ClosedInfo {
  shiftId: string;
  signerName: string;
}

export function CloseWizard({
  context,
  initialStep = 0,
  onClosed,
}: {
  context: CloseContext;
  initialStep?: number;
  /**
   * Called once the shift is signed off. The page above the wizard shows the
   * confirmation, because the wizard itself is replaced the moment the shift
   * stops being open.
   */
  onClosed: (info: ClosedInfo) => void;
}) {
  const { t, lang } = useLang();
  const bn = lang === 'bn';
  const router = useRouter();
  const shift = context.shift!;
  const { value: thresholds, loaded: thresholdsLoaded } = useThresholdsState();

  const [step, setStep] = useState(() => Math.min(Math.max(initialStep, 0), STEP_KEYS.length - 1));
  /** One scrollable page instead of six steps, for managers who know the form. */
  const [quick, setQuick] = useState(false);
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setQuick(window.localStorage.getItem(MODE_KEY) === 'quick');
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

  function chooseMode(next: boolean) {
    setQuick(next);
    try {
      window.localStorage.setItem(MODE_KEY, next ? 'quick' : 'steps');
    } catch {
      /* ignore */
    }
  }

  // The test quantity rarely changes, so it arrives filled in — from the last
  // five shifts when they all agree, else from the admin's default — and the
  // manager only confirms it. Never done to a draft that has been touched, and
  // never for an admin's edit of a closed shift, whose test litres are not on file.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !thresholdsLoaded || shift.status === 'reopened') return;
    prefilled.current = true;
    setDraft((d) => {
      if (d.testConfirmed !== undefined) return d;
      const untouched = context.nozzles.every((n) => {
        const v = (d.readings[n.nozzleId]?.test ?? '').trim();
        return v === '' || Number(v) === 0;
      });
      const suggestion = context.testFireSuggestion ?? String(thresholds.testFireLitresDefault);
      if (!untouched || !(Number(suggestion) > 0)) return d;
      return {
        ...d,
        testConfirmed: false,
        readings: Object.fromEntries(
          context.nozzles.map((n) => [n.nozzleId, { closing: d.readings[n.nozzleId]?.closing ?? '', test: suggestion }]),
        ),
      };
    });
  }, [thresholdsLoaded, thresholds.testFireLitresDefault, context.nozzles, context.testFireSuggestion, shift.status]);

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
    if (!quick && step === FINAL_STEP) runPreview();
  }, [quick, step, runPreview]);

  // ---- the live check -------------------------------------------------------
  // Asked of the database itself, so what the manager sees while typing is what
  // the sign-off will use. Nothing is saved: only a complete entry is sent, and
  // typed opening figures stay on the device until the close.
  const live = useLiveFigures(context, draft, setDraft, summary);
  const [preview, setPreview] = useState<CloseSummary | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const bumpPreview = useCallback(() => setPreviewTick((n) => n + 1), []);

  const readyForPreview =
    context.nozzles.length > 0 &&
    context.nozzles.every(
      (n) => (draft.readings[n.nozzleId]?.closing ?? '').trim() !== '' && (n.openingSource || (draft.openings?.[n.nozzleId] ?? '').trim() === ''),
    ) &&
    context.tanks.every((tk) => (draft.dips[tk.id] ?? '').trim() !== '' && (tk.bookOpeningSource || (draft.openDips?.[tk.id] ?? '').trim() === '')) &&
    Number(num(draft.rate)) > 0;

  useEffect(() => {
    if (!readyForPreview) {
      setPreview(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      const result = await previewClose(shift.id, payload);
      if (alive) setPreview(result.ok && result.summary ? result.summary : null);
    }, 700);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [readyForPreview, payload, shift.id, previewTick]);

  // Whoever is signed in is the person signing off, and the same name is
  // stored against the shift and printed on the daily sheet's signature line.
  const [signer, setSigner] = useState<{ name: string; nameBn: string | null } | null>(null);
  useEffect(() => {
    getSessionProfile().then((p) =>
      setSigner(p ? { name: p.fullName, nameBn: p.fullNameBn } : null),
    );
  }, []);
  const signerName = signer ? (lang === 'bn' && signer.nameBn ? signer.nameBn : signer.name) : '';

  // The reconciliation shown at the end: the sign-off's own run in step mode,
  // the live one on a single page.
  const shown = quick ? preview : summary;

  // Which reasons the database will insist on before it accepts a sign-off.
  const flaggedTanks = shown?.tanks.filter((tk) => tk.variance_flagged) ?? [];
  const needsCashReason = shown?.cash.requires_reason ?? false;
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
        try {
          window.localStorage.removeItem(draftKey(shift.id));
        } catch {
          /* ignore */
        }
        onClosed({ shiftId: shift.id, signerName });
        router.refresh();
      } else {
        setError(result.error ?? 'The shift could not be closed');
      }
    });
  }

  const testUnconfirmed = draft.testConfirmed === false;
  const onCollected = quick ? bumpPreview : runPreview;
  const lightOf = (tankId: string) => {
    const tk = preview?.tanks.find((x) => x.tank_id === tankId);
    return tk ? { tank: tk, light: stockLight(tk.variance_pct, tk.variance_flagged, thresholds, tk.variance_litres) } : null;
  };

  const groupBody = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="space-y-5">
            <MeterStep context={context} draft={draft} setDraft={setDraft} />
            <hr style={{ borderColor: 'var(--hairline)' }} />
            <TestStep context={context} draft={draft} setDraft={setDraft} />
            <hr style={{ borderColor: 'var(--hairline)' }} />
            <DipStep context={context} draft={draft} setDraft={setDraft} lightOf={lightOf} previewReady={readyForPreview} />
          </div>
        );
      case 1:
        return (
          <div className="space-y-5">
            <RateStep context={context} draft={draft} setDraft={setDraft} />
            <hr style={{ borderColor: 'var(--hairline)' }} />
            <RefillInfo context={context} />
          </div>
        );
      case 2:
        return (
          <div className="space-y-5">
            <CreditStep context={context} draft={draft} setDraft={setDraft} />
            <hr style={{ borderColor: 'var(--hairline)' }} />
            <LubStep context={context} draft={draft} setDraft={setDraft} />
          </div>
        );
      default:
        return (
          <div className="space-y-5">
            <ExpectedDrawerLine live={live} />
            <ExpenseStep context={context} draft={draft} setDraft={setDraft} />
            <hr style={{ borderColor: 'var(--hairline)' }} />
            <DueStep summary={summary} shiftId={shift.id} customers={context.customers} onCollected={onCollected} />
            <hr style={{ borderColor: 'var(--hairline)' }} />
            <CashStep
              draft={draft}
              setDraft={setDraft}
              live={live}
              summary={quick ? preview : summary}
              onCollected={onCollected}
              tolerance={thresholds.cashVarianceTolerance}
            />
          </div>
        );
    }
  };

  const signerBox = signerName ? (
    <div className="mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
        {bn ? 'যিনি বন্ধ করছেন' : 'Closed by'}
      </p>
      <p className="text-sm font-semibold tracking-tight">{signerName}</p>
      <Muted lang={lang}>
        {bn
          ? 'এই নামই শিফটের সঙ্গে থাকবে এবং দৈনিক বিবরণীর স্বাক্ষরের ঘরে ছাপা হবে।'
          : 'This name is stored against the shift and printed on the daily sheet’s signature line.'}
      </Muted>
    </div>
  ) : null;

  const unconfirmedNote = testUnconfirmed ? (
    <p className="state-watch flex items-start gap-1.5 text-xs" lang={lang}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {bn
        ? 'টেস্ট ফায়ারের পরিমাণ আগের ডিফল্ট থেকে বসানো হয়েছে, নিশ্চিত করা হয়নি। প্রথম ধাপে গিয়ে নিশ্চিত করুন বা বদলান।'
        : 'The test-fire litres were pre-filled and have not been confirmed. Go back to step 1 to confirm or change them.'}
    </p>
  ) : null;

  const signButton = (
    <Button size="lg" className="ml-auto" disabled={pending || !shown || missingReasons} onClick={sign} lang={lang}>
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
      {bn ? 'স্বাক্ষর ও বন্ধ' : 'Sign off and close'}
    </Button>
  );

  const reasonsNote = missingReasons ? (
    <Muted className="state-breach text-center" lang={lang}>
      {bn
        ? 'গরমিলের কারণ না লেখা পর্যন্ত স্বাক্ষর করা যাবে না।'
        : 'Sign-off stays locked until every variance has a written reason.'}
    </Muted>
  ) : null;

  return (
    <div className="space-y-4 pb-20 xl:pb-0">
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

        {/* Same draft, same tables — only the layout differs. */}
        <div className="ml-auto flex items-center gap-3">
          <div className="inline-flex rounded-xl p-0.5" style={{ background: 'var(--hairline)' }} role="group" aria-label={bn ? 'এন্ট্রির ধরন' : 'Entry mode'}>
            {([false, true] as const).map((isQuick) => (
              <button
                key={String(isQuick)}
                type="button"
                onClick={() => chooseMode(isQuick)}
                aria-pressed={quick === isQuick}
                lang={lang}
                className="tap-target rounded-[10px] px-3 py-1.5 text-xs font-medium"
                style={quick === isQuick ? { background: 'var(--color-accent)', color: 'white' } : { color: 'var(--text-muted)' }}
              >
                {isQuick ? (bn ? 'দ্রুত এন্ট্রি' : 'Quick entry') : bn ? 'ধাপে ধাপে' : 'Step-by-step'}
              </button>
            ))}
          </div>
          {!quick ? (
            <div className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
              {formatNumber(step + 1, { lang })} / {formatNumber(STEP_KEYS.length, { lang })}
            </div>
          ) : null}
        </div>
      </GlassCard>

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-5">
        <div className="min-w-0 space-y-4">
          {quick ? (
            <>
              {[0, 1, 2, 3].map((index) => (
                <GlassCard key={index} lift={false} className="space-y-4">
                  <h2 className="text-base font-semibold tracking-tight" lang={lang}>
                    {formatNumber(index + 1, { lang })}. {bn ? STEP_KEYS[index]![1] : STEP_KEYS[index]![0]}
                  </h2>
                  {groupBody(index)}
                </GlassCard>
              ))}

              <GlassCard lift={false} className="space-y-4">
                <h2 className="text-base font-semibold tracking-tight" lang={lang}>
                  {formatNumber(5, { lang })}. {bn ? STEP_KEYS[4][1] : STEP_KEYS[4][0]} · {bn ? STEP_KEYS[5][1] : STEP_KEYS[5][0]}
                </h2>
                {shown ? (
                  <>
                    {signerBox}
                    <SummaryStep summary={shown} pending={false} draft={draft} setDraft={setDraft} signing signerName={signerName} />
                  </>
                ) : (
                  <Muted lang={lang}>
                    {bn
                      ? 'প্রতিটি মিটার ও ট্যাংকের ডিপ এবং দর দিলে এখানে মোট হিসাব আসবে।'
                      : 'Enter every meter reading, every tank dip and the rate, and the totals appear here.'}
                  </Muted>
                )}
                {unconfirmedNote}
                {error ? (
                  <p className="state-breach text-sm" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex items-center">{signButton}</div>
                {reasonsNote}
              </GlassCard>
            </>
          ) : (
            <>
              {/* Every step is directly selectable, so a figure spotted late can be
                  corrected without stepping back through the whole close. */}
              <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Steps">
                {STEP_KEYS.map(([en, bnLabel], index) => (
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
                    {formatNumber(index + 1, { lang })}. {bn ? bnLabel : en}
                  </button>
                ))}
              </nav>

              <GlassCard lift={false} className="space-y-4">
                {step < FINAL_STEP ? groupBody(step) : null}

                {/* The name that goes on the shift and on the printed daily sheet.
                    Shown whether or not the reconciliation has come back yet. */}
                {step === STEP_KEYS.length - 1 ? signerBox : null}

                {step >= FINAL_STEP ? (
                  <SummaryStep
                    summary={summary}
                    pending={pending}
                    draft={draft}
                    setDraft={setDraft}
                    signing={step === STEP_KEYS.length - 1}
                    signerName={signerName}
                  />
                ) : null}

                {step >= FINAL_STEP ? unconfirmedNote : null}

                {error ? (
                  <p className="state-breach text-sm" role="alert">
                    {error}
                  </p>
                ) : null}
              </GlassCard>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="lg" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)} lang={lang}>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  {bn ? 'পিছনে' : 'Back'}
                </Button>

                {step < STEP_KEYS.length - 1 ? (
                  <Button size="lg" className="ml-auto" disabled={pending} onClick={() => setStep((s) => s + 1)} lang={lang}>
                    {bn ? 'পরবর্তী' : 'Next'}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  signButton
                )}
              </div>

              {step === STEP_KEYS.length - 1 ? reasonsNote : null}
            </>
          )}
        </div>

        {/* Right-hand panel on a wide screen; a bar along the bottom elsewhere. */}
        <aside className="hidden xl:sticky xl:top-24 xl:block">
          <GlassCard lift={false}>
            <LivePanel live={live} preview={preview} thresholds={thresholds} ready={readyForPreview} />
          </GlassCard>
        </aside>
      </div>

      <LiveBar live={live} preview={preview} thresholds={thresholds} ready={readyForPreview} />
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
  const bn = lang === 'bn';
  const unconfirmed = draft.testConfirmed === false;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'টেস্ট / পরিমাপে ব্যবহৃত লিটার' : 'Litres pumped into the test measure'}
        </h2>
        {unconfirmed ? (
          <>
            <Chip tone="watch" lang={lang}>
              {bn ? 'আগের মতো বসানো হয়েছে' : 'Pre-filled'}
            </Chip>
            <Button size="sm" className="ml-auto" lang={lang} onClick={() => setDraft((d) => ({ ...d, testConfirmed: true }))}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {bn ? 'নিশ্চিত করুন' : 'Confirm'}
            </Button>
          </>
        ) : draft.testConfirmed ? (
          <Chip tone="ok" lang={lang}>
            ✓ {bn ? 'নিশ্চিত' : 'Confirmed'}
          </Chip>
        ) : null}
      </div>
      <Muted lang={lang}>
        {bn
          ? 'এই তেল মেশিন থেকে বেরিয়ে আবার ট্যাংকে ফেরত যায় — তাই বিক্রি থেকে বাদ, মজুদে যোগ।'
          : 'This fuel leaves the dispenser and goes back into the tank, so it is excluded from sales and stays in stock.'}
        {unconfirmed
          ? bn
            ? ' শেষ কয়েক শিফটের মতো পরিমাণ বসানো আছে — ঠিক থাকলে নিশ্চিত করুন, নইলে বদলান।'
            : ' The quantity is filled in as in recent shifts — confirm it if it is right, or change it.'
          : ''}
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
                // Typing a figure is itself the confirmation.
                setDraft((d) => ({
                  ...d,
                  testConfirmed: d.testConfirmed === undefined ? undefined : true,
                  readings: { ...d.readings, [n.nozzleId]: { ...entry, test: v } },
                }))
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

type TankLight = { tank: CloseSummary['tanks'][number]; light: TrafficLight } | null;

function DipStep({
  context,
  draft,
  setDraft,
  lightOf,
  previewReady,
}: StepProps & { lightOf: (tankId: string) => TankLight; previewReady: boolean }) {
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
            {/* The rod against the book, as soon as everything it depends on is in. */}
            {(() => {
              const result = lightOf(tk.id);
              if (!result) {
                return previewReady ? null : (
                  <Muted lang={lang}>
                    {lang === 'bn' ? 'সব মিটার ও ডিপ দিলে বইয়ের সঙ্গে মিল দেখা যাবে' : 'Book vs physical shows once every meter and dip is in'}
                  </Muted>
                );
              }
              return (
                <div className="flex flex-wrap items-center gap-2 text-xs" lang={lang}>
                  <span style={{ color: 'var(--text-muted)' }}>{lang === 'bn' ? 'বই বনাম রড' : 'Book vs physical'}</span>
                  <Chip tone={LIGHT_TONE[result.light]} className="tabular">
                    {formatLitres(result.tank.variance_litres, lang, true)} ({formatPercent(result.tank.variance_pct, lang)})
                  </Chip>
                </div>
              );
            })()}
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
  const bn = lang === 'bn';
  // A price that has moved since three days ago is worth a second look before
  // it multiplies every litre of the shift.
  const typed = Number((draft.rate ?? '').replace(/,/g, ''));
  const older = context.rateThreeDaysAgo ? Number(context.rateThreeDaysAgo) : null;
  const changed = older !== null && Number.isFinite(typed) && typed > 0 && Math.abs(typed - older) > 0.004;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {bn ? 'এই শিফটের বিক্রয় দর' : 'Selling rate for this shift'}
      </h2>
      <div className="max-w-xs">
        <Field
          label={bn ? 'দর প্রতি লিটার (৳)' : 'Rate per litre (৳)'}
          value={draft.rate}
          onChange={(v) => setDraft((d) => ({ ...d, rate: v }))}
          hint={
            context.lastRate
              ? `${bn ? 'গত শিফট' : 'Last shift'}: ${formatBDT(context.lastRate, lang)}`
              : undefined
          }
        />
      </div>
      {changed ? (
        <Chip tone="watch" lang={lang}>
          <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden />
          {bn
            ? `তিন দিন আগে দর ছিল ${formatBDT(context.rateThreeDaysAgo!, lang)} — দর বদলেছে, ঠিক আছে কি?`
            : `Three days ago the rate was ${formatBDT(context.rateThreeDaysAgo!, lang)} — the price has changed. Is this right?`}
        </Chip>
      ) : null}
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
  draft,
  setDraft,
  live,
  summary,
  onCollected,
  tolerance,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  live: LiveFigures;
  summary: CloseSummary | null;
  onCollected: () => void;
  tolerance: number;
}) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const cash = summary?.cash;
  useEffect(() => { onCollected(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- everything worked out from what has been typed so far --------------
  // (the arithmetic lives in useLiveFigures, shared with the live panel)
  const { diff, expected, counted } = live;
  const withinLimit = diff !== null && Math.abs(diff) <= tolerance;
  const countedOk = diff !== null && diff === 0;

  const rows: Array<{ label: string; value: number; sign: '+' | '−' | ''; ok: boolean; note?: string }> = [
    {
      label: bn ? `তেল বিক্রি (${formatNumber(live.litresTotal, { lang, decimals: 3 })} লি × দর)` : `Fuel sales (${formatNumber(live.litresTotal, { lang, decimals: 3 })} L × rate)`,
      value: live.fuelSales,
      sign: '+',
      ok: live.fuelOk,
      note: live.fuelOk
        ? undefined
        : !live.rateOk
          ? bn ? 'দর দেওয়া হয়নি' : 'Rate is missing'
          : bn ? `রিডিং বাকি: ${live.missingNozzles.join(', ')}` : `Readings missing: ${live.missingNozzles.join(', ')}`,
    },
    {
      label: bn ? 'বাকি বিক্রি' : 'Credit sales',
      value: live.creditTotal,
      sign: '−',
      ok: live.creditOk,
      note: live.creditOk ? undefined : bn ? 'বাকি বিক্রি মোট বিক্রির চেয়ে বেশি' : 'Credit sales are more than total fuel sales',
    },
    { label: bn ? 'লুব্রিকেন্ট নগদ বিক্রি' : 'Lubricant cash sales', value: live.lubCash, sign: '+', ok: true },
    { label: bn ? 'বাকি আদায় (নগদ)' : 'Dues collected in cash', value: live.dues, sign: '+', ok: true },
    { label: bn ? 'নগদ খরচ' : 'Cash expenses', value: live.expensesCash + live.savedExpCash, sign: '−', ok: true },
    { label: bn ? 'ড্রয়ার থেকে ব্যাংকে জমা' : 'Deposited to bank from drawer', value: live.drawerDeposits, sign: '−', ok: true },
    { label: bn ? 'পেটি ক্যাশ ইন' : 'Petty cash in', value: live.pettyIn, sign: '−', ok: true },
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
              hint={`${bn ? 'ড্রয়ারে থাকার কথা' : 'Expected drawer'}: ${formatBDT(round2(expected).toFixed(2), lang)}`}
            />
          </div>
          {diff !== null ? <div className="pb-7"><Mark ok={withinLimit} /></div> : null}
        </div>
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
                {r.sign} {formatBDT(round2(r.value).toFixed(2), lang)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t pt-2 text-sm font-semibold" style={{ borderColor: 'var(--hairline)' }}>
            <span className="h-5 w-5" />
            <span className="flex-1" lang={lang}>{bn ? 'ড্রয়ারে থাকার কথা' : 'Cash that should be in the drawer'}</span>
            <span className="tabular">{formatBDT(round2(expected).toFixed(2), lang)}</span>
          </li>
          <li className="flex items-center gap-2 text-sm font-semibold">
            {diff !== null ? <Mark ok={withinLimit} /> : <span className="h-5 w-5" />}
            <span className="flex-1" lang={lang}>{bn ? 'গোনা নগদ' : 'Cash counted'}</span>
            <span className="tabular">{diff !== null ? formatBDT((counted as number).toFixed(2), lang) : '—'}</span>
          </li>
          {diff !== null ? (
            <li className={`text-right text-xs font-medium ${withinLimit ? 'state-ok' : 'state-breach'}`} lang={lang}>
              {countedOk
                ? bn ? 'হিসাব মিলেছে' : 'Matches'
                : `${bn ? (diff < 0 ? 'কম' : 'বেশি') : diff < 0 ? 'Short' : 'Over'} ${diff < 0 ? '−' : '+'}${formatBDT(Math.abs(diff).toFixed(2), lang)}${
                    withinLimit ? (bn ? ' · সীমার মধ্যে' : ' · within the allowed limit') : ''
                  }`}
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
  const thresholds = useThresholds();

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
            style={{ borderColor: LIGHT_BORDER[stockLight(tk.variance_pct, tk.variance_flagged, thresholds, tk.variance_litres)] }}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">
                {t('tank.tank')} {tk.tank_code}
              </span>
              <Chip tone={LIGHT_TONE[stockLight(tk.variance_pct, tk.variance_flagged, thresholds, tk.variance_litres)]} className="tabular">
                {{ green: '✓ ', yellow: '! ', red: '✗ ' }[stockLight(tk.variance_pct, tk.variance_flagged, thresholds, tk.variance_litres)]}
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

// ---------------------------------------------------------------------------
// Live figures — worked out from what has been typed so far
// ---------------------------------------------------------------------------

interface LiveFigures {
  nozzles: Array<{ id: string; label: string; litres: number | null; error: string | null }>;
  litresTotal: number;
  missingNozzles: string[];
  rateOk: boolean;
  fuelSales: number;
  fuelOk: boolean;
  creditTotal: number;
  creditOk: boolean;
  lubCash: number;
  dues: number;
  expensesCash: number;
  savedExpCash: number;
  drawerDeposits: number;
  pettyIn: number;
  cashSales: number;
  opening: number;
  expected: number;
  counted: number | null;
  /** counted − expected, null until a count is typed. */
  diff: number | null;
}

/**
 * Everything the cash check and the live panel need, in one place so the two
 * can never disagree. It also keeps three database-backed figures current —
 * cash dues taken, cash sent to the bank, and expenses/petty cash already
 * saved — because the panel is on screen at every step, not only on the cash one.
 */
function useLiveFigures(
  context: CloseContext,
  draft: Draft,
  setDraft: React.Dispatch<React.SetStateAction<Draft>>,
  summary: CloseSummary | null,
): LiveFigures {
  const shift = context.shift!;
  const minutes = Math.max(1, (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 60000);

  let litresTotal = 0;
  const missingNozzles: string[] = [];
  const nozzles: LiveFigures['nozzles'] = [];
  for (const n of context.nozzles) {
    const entry = draft.readings[n.nozzleId] ?? { closing: '', test: '0' };
    const label = `${n.dispenserCode}${n.nozzleNo > 1 ? `·${n.nozzleNo}` : ''}`;
    const opening = n.openingSource ? n.openingReading : draft.openings?.[n.nozzleId] || null;
    const r = nozzleLitres(opening, entry.closing, n.meterDigits, n.maxFlowLpm, minutes);
    if (!r || r instanceof CalcError) {
      missingNozzles.push(label);
      nozzles.push({ id: n.nozzleId, label, litres: null, error: r instanceof CalcError ? r.message : null });
      continue;
    }
    const net = Number(r.litresSold.toString()) - (toNum(entry.test) || 0);
    litresTotal += net;
    nozzles.push({ id: n.nozzleId, label, litres: net, error: null });
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
  const dues = Math.max(Number(summary?.cash.dues_collected ?? 0), liveDues.cashTotal);
  const opening = 0; // each shift stands alone; no opening cash
  const counted = toNum(draft.cash.countedCash);

  // Only cash sent to the bank from the drawer (dashboard "Deposit to bank")
  // comes off the shift's cash. Other bank credits stay on the Bank statement.
  useEffect(() => {
    let alive = true;
    import('@/lib/data/bank').then(({ getShiftBankDeposits }) =>
      getShiftBankDeposits(shift.id).then((amt) => {
        if (!alive) return;
        setDraft((d) => (d.cash.bankDeposits === amt ? d : { ...d, cash: { ...d.cash, bankDeposits: amt } }));
      }),
    );
    return () => {
      alive = false;
    };
  }, [setDraft, shift.id]);
  const drawerDeposits = toNum(draft.cash.bankDeposits) || 0;

  // Petty cash in taken from the drawer during this shift, and cash expenses
  // already saved against it from the Expenses page.
  const refreshKey = useRefreshKey();
  const [pettyIn, setPettyIn] = useState(0);
  const [savedExpCash, setSavedExpCash] = useState(0);
  useEffect(() => {
    let alive = true;
    createClient()
      .from('expenses')
      .select('amount, paid_by, expense_categories!inner(name, group)')
      .eq('shift_id', shift.id)
      .is('deleted_at', null)
      .then(({ data }: { data: unknown }) => {
        if (!alive) return;
        const rows = (data ?? []) as Array<{ amount: number; paid_by: string; expense_categories: { name: string; group: string } }>;
        setPettyIn(rows.filter((r) => r.expense_categories.name === 'Petty Cash' && r.paid_by !== 'petty').reduce((a, r) => a + Number(r.amount), 0));
        setSavedExpCash(rows.filter((r) => r.expense_categories.name !== 'Petty Cash' && r.expense_categories.group !== 'own_use' && r.paid_by === 'cash').reduce((a, r) => a + Number(r.amount), 0));
      });
    return () => {
      alive = false;
    };
  }, [shift.id, refreshKey]);

  const fuelOk = missingNozzles.length === 0 && rateOk;
  const creditOk = creditTotal <= fuelSales + 0.005 || !fuelOk;
  const cashSales = fuelSales - creditTotal + lubCash;
  const expected = opening + cashSales + dues - expensesCash - savedExpCash - drawerDeposits - pettyIn;
  const diff = counted === null || Number.isNaN(counted) ? null : round2(counted - expected);

  return {
    nozzles,
    litresTotal,
    missingNozzles,
    rateOk,
    fuelSales,
    fuelOk,
    creditTotal,
    creditOk,
    lubCash,
    dues,
    expensesCash,
    savedExpCash,
    drawerDeposits,
    pettyIn,
    cashSales,
    opening,
    expected,
    counted: counted === null || Number.isNaN(counted) ? null : counted,
    diff,
  };
}

const LIGHT_TONE: Record<TrafficLight, 'ok' | 'watch' | 'breach'> = { green: 'ok', yellow: 'watch', red: 'breach' };
const LIGHT_BORDER: Record<TrafficLight, string> = {
  green: 'var(--hairline)',
  yellow: 'var(--color-watch)',
  red: 'var(--color-breach)',
};

/** "Expected in the drawer right now", repeated where the money is typed. */
function ExpectedDrawerLine({ live }: { live: LiveFigures }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--hairline)' }}
      role="status"
    >
      <span style={{ color: 'var(--text-muted)' }} lang={lang}>
        {bn ? 'এখন ড্রয়ারে থাকার কথা' : 'Expected in the drawer now'}
      </span>
      <span className="tabular font-semibold">
        {live.fuelOk ? '' : '≈ '}
        {formatBDT(round2(live.expected).toFixed(2), lang)}
      </span>
    </div>
  );
}

/** The figures that move as the manager types: litres, drawer and stock gap. */
function LiveBody({
  live,
  preview,
  thresholds,
  ready,
}: {
  live: LiveFigures;
  preview: CloseSummary | null;
  thresholds: Thresholds;
  ready: boolean;
}) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const within = live.diff !== null && Math.abs(live.diff) <= thresholds.cashVarianceTolerance;

  return (
    <div className="space-y-4">
      <section>
        <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {bn ? 'বিক্রিত লিটার' : 'Litres sold'}
        </p>
        <p className="tabular text-2xl font-semibold tracking-tight">
          {formatLitres(round3(live.litresTotal).toFixed(3), lang)}
        </p>
        <ul className="mt-1 space-y-0.5 text-xs">
          {live.nozzles.map((n) => (
            <li key={n.id} className="flex justify-between tabular" style={{ color: 'var(--text-muted)' }}>
              <span>{n.label}</span>
              <span className={n.error ? 'state-breach' : ''}>{n.litres === null ? '—' : formatLitres(round3(n.litres).toFixed(3), lang)}</span>
            </li>
          ))}
        </ul>
        {live.rateOk ? (
          <p className="tabular mt-1 text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {bn ? 'তেল বিক্রি' : 'Fuel sales'} {formatBDT(round2(live.fuelSales).toFixed(2), lang)}
          </p>
        ) : null}
      </section>

      <section>
        <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {bn ? 'ড্রয়ারে থাকার কথা' : 'Expected cash in drawer'}
        </p>
        <p className="tabular text-xl font-semibold tracking-tight">
          {live.fuelOk ? '' : '≈ '}
          {formatBDT(round2(live.expected).toFixed(2), lang)}
        </p>
        {!live.fuelOk ? (
          <Muted lang={lang}>
            {!live.rateOk
              ? bn ? 'দর দেওয়া হয়নি' : 'Rate is missing'
              : bn ? `রিডিং বাকি: ${live.missingNozzles.join(', ')}` : `Readings missing: ${live.missingNozzles.join(', ')}`}
          </Muted>
        ) : null}
      </section>

      <section>
        <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {bn ? 'নগদের গরমিল' : 'Cash variance'}
        </p>
        {live.diff === null ? (
          <Muted lang={lang}>{bn ? 'গোনা নগদ লিখলে দেখা যাবে' : 'Appears once the counted cash is typed'}</Muted>
        ) : (
          <Chip tone={within ? 'ok' : 'breach'} className="tabular">
            {within ? '✓ ' : '✗ '}
            {live.diff === 0 ? (bn ? 'মিলেছে' : 'Matches') : `${live.diff < 0 ? '−' : '+'}${formatBDT(Math.abs(live.diff).toFixed(2), lang)}`}
            {within && live.diff !== 0
              ? bn ? ' · সীমার মধ্যে' : ' · within limit'
              : ''}
          </Chip>
        )}
      </section>

      <section>
        <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {bn ? 'স্টক গরমিল' : 'Stock variance'}
        </p>
        {preview ? (
          <ul className="space-y-1.5">
            {preview.tanks.map((tk) => {
              const light = stockLight(tk.variance_pct, tk.variance_flagged, thresholds, tk.variance_litres);
              return (
                <li key={tk.tank_id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{tk.tank_code}</span>
                  <Chip tone={LIGHT_TONE[light]} className="tabular">
                    {formatLitres(tk.variance_litres, lang, true)} · {formatPercent(tk.variance_pct, lang)}
                  </Chip>
                </li>
              );
            })}
          </ul>
        ) : (
          <Muted lang={lang}>
            {ready
              ? bn ? 'হিসাব হচ্ছে…' : 'Working it out…'
              : bn ? 'সব মিটার, ডিপ ও দর দিলে দেখা যাবে' : 'Appears once every meter, dip and the rate are entered'}
          </Muted>
        )}
      </section>
    </div>
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function LivePanel(props: { live: LiveFigures; preview: CloseSummary | null; thresholds: Thresholds; ready: boolean }) {
  const { lang } = useLang();
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {lang === 'bn' ? 'এখনকার হিসাব' : 'Live check'}
      </h2>
      <LiveBody {...props} />
    </div>
  );
}

/** The same figures along the bottom of a phone, one tap from the detail. */
function LiveBar(props: { live: LiveFigures; preview: CloseSummary | null; thresholds: Thresholds; ready: boolean }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [open, setOpen] = useState(false);
  const { live, preview, thresholds } = props;
  const worst: TrafficLight | null = preview
    ? preview.tanks.reduce<TrafficLight>((acc, tk) => {
        const l = stockLight(tk.variance_pct, tk.variance_flagged, thresholds, tk.variance_litres);
        return l === 'red' || acc === 'red' ? 'red' : l === 'yellow' || acc === 'yellow' ? 'yellow' : 'green';
      }, 'green')
    : null;
  const within = live.diff !== null && Math.abs(live.diff) <= thresholds.cashVarianceTolerance;

  return (
    <div
      className="no-print fixed inset-x-0 bottom-14 z-30 border-t md:bottom-0 xl:hidden"
      style={{ background: 'var(--surface-solid)', borderColor: 'var(--hairline)' }}
    >
      {open ? (
        <div className="max-h-[60vh] overflow-y-auto px-4 pt-3">
          <LiveBody {...props} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        lang={lang}
        className="tap-target flex w-full items-center gap-3 px-4 py-2 text-left text-xs"
      >
        <span className="tabular font-semibold">{formatLitres(round3(live.litresTotal).toFixed(3), lang)}</span>
        <span className="tabular" style={{ color: 'var(--text-muted)' }}>
          {bn ? 'ড্রয়ার' : 'Drawer'} {live.fuelOk ? '' : '≈ '}
          {formatBDT(round2(live.expected).toFixed(0), lang)}
        </span>
        {live.diff !== null ? (
          <span className={`tabular font-semibold ${within ? 'state-ok' : 'state-breach'}`}>{within ? '✓' : '✗'}</span>
        ) : null}
        {worst ? (
          <span className={`font-semibold ${worst === 'green' ? 'state-ok' : worst === 'yellow' ? 'state-watch' : 'state-breach'}`}>●</span>
        ) : null}
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? '' : 'rotate-180'}`} aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tanker deliveries this shift (read-only: they are recorded on the refill page)
// ---------------------------------------------------------------------------

function RefillInfo({ context }: { context: CloseContext }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const shift = context.shift!;
  const refreshKey = useRefreshKey();
  const [rows, setRows] = useState<Array<{ id: string; tank: string; litres: number }> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = await createClient();
      const select = 'id, received_litres, sold_litres, tanks(code), tanker_deliveries!inner(arrived_at, shift_id, is_opening_stock, deleted_at)';
      const [byShift, byWindow] = await Promise.all([
        supabase.from('tanker_compartments').select(select).is('tanker_deliveries.deleted_at', null).eq('tanker_deliveries.is_opening_stock', false).eq('tanker_deliveries.shift_id', shift.id),
        supabase.from('tanker_compartments').select(select).is('tanker_deliveries.deleted_at', null).eq('tanker_deliveries.is_opening_stock', false).is('tanker_deliveries.shift_id', null).gte('tanker_deliveries.arrived_at', shift.startsAt).lt('tanker_deliveries.arrived_at', shift.endsAt),
      ]);
      const merged = new Map<string, { id: string; tank: string; litres: number }>();
      for (const r of [...((byShift.data ?? []) as unknown[]), ...((byWindow.data ?? []) as unknown[])] as Array<{
        id: string;
        received_litres: number | string | null;
        sold_litres: number | string | null;
        tanks: { code: string } | null;
      }>) {
        merged.set(r.id, { id: r.id, tank: r.tanks?.code ?? '—', litres: Number(r.received_litres ?? 0) + Number(r.sold_litres ?? 0) });
      }
      if (alive) setRows([...merged.values()].filter((r) => r.tank !== 'TRUCK'));
    })();
    return () => {
      alive = false;
    };
  }, [shift.id, shift.startsAt, shift.endsAt, refreshKey]);

  const total = (rows ?? []).reduce((a, r) => a + r.litres, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'এই শিফটে ট্যাংকে রিফিল' : 'Tank refills this shift'}
        </h2>
        <Link
          to="/refill"
          className="ml-auto text-xs font-medium"
          style={{ color: 'var(--color-accent)' }}
          lang={lang}
        >
          {bn ? 'রিফিল যোগ করুন →' : 'Record a delivery →'}
        </Link>
      </div>
      {rows === null ? (
        <div className="skeleton h-8 w-full" />
      ) : rows.length === 0 ? (
        <Muted lang={lang}>
          {bn ? 'এই শিফটে কোনো ট্যাংকার আসেনি। আনলে আগে রিফিল পাতায় লিখুন — এখানকার খসড়া হারাবে না।' : 'No tanker arrived in this shift. If one did, record it on the refill page first — this draft is kept.'}
        </Muted>
      ) : (
        <>
          <ul className="space-y-0.5 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex justify-between tabular">
                <span>{bn ? 'ট্যাংক' : 'Tank'} {r.tank}</span>
                <span>{formatLitres(round3(r.litres).toFixed(3), lang)}</span>
              </li>
            ))}
          </ul>
          <Muted className="tabular" lang={lang}>
            {bn ? 'মোট' : 'Total'} {formatLitres(round3(total).toFixed(3), lang)} · {bn ? 'স্টক হিসাবে স্বয়ংক্রিয় যোগ হয়' : 'added to the stock book automatically'}
          </Muted>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What was saved
// ---------------------------------------------------------------------------

interface SavedSummary {
  litres_sold: number | null;
  cash_sales: number | null;
  credit_sales: number | null;
  lubricant_sales: number | null;
  stock_variance_litres: number | null;
  stock_variance_pct: number | null;
  tanks_flagged: number;
  cash_expected: number | null;
  cash_counted: number | null;
  cash_variance: number | null;
}

/**
 * After sign-off: what the books now say about this shift, read back from the
 * saved summary rather than echoed from the form — so the manager sees what was
 * actually stored.
 */
export function ClosedConfirmation({ shiftId, signerName }: { shiftId: string; signerName: string }) {
  const { t, lang } = useLang();
  const bn = lang === 'bn';
  const router = useRouter();
  const thresholds = useThresholds();
  const [saved, setSaved] = useState<SavedSummary | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from('shift_summary').select('*').eq('shift_id', shiftId).maybeSingle();
      if (alive) setSaved((data as unknown as SavedSummary | null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [shiftId]);

  const light = saved ? stockLight(saved.stock_variance_pct, saved.tanks_flagged > 0, thresholds, saved.stock_variance_litres) : null;
  const cashOk = saved?.cash_variance !== null && saved?.cash_variance !== undefined && Math.abs(Number(saved.cash_variance)) <= thresholds.cashVarianceTolerance;

  return (
    <GlassCard lift={false} className="space-y-4 text-center">
      <Lock className="mx-auto h-12 w-12 state-ok" aria-hidden />
      <h2 className="text-lg font-semibold tracking-tight" lang={lang}>
        {bn ? 'শিফট বন্ধ হয়েছে' : 'Shift closed'}
      </h2>
      <Muted lang={lang}>
        {bn
          ? 'বইয়ের সমাপ্তি পরের শিফটের সূচনা হিসেবে চলে গেছে।'
          : 'The book closing has carried forward as the next shift’s opening.'}
      </Muted>
      {signerName ? (
        <Muted lang={lang}>
          {bn ? 'বন্ধ করেছেন' : 'Closed by'}: <strong>{signerName}</strong>
        </Muted>
      ) : null}

      {saved ? (
        <div className="mx-auto grid max-w-xl gap-2 text-left sm:grid-cols-2" lang={lang}>
          <Stat label={bn ? 'বিক্রিত লিটার' : 'Litres sold'} value={formatLitres(String(saved.litres_sold ?? 0), lang)} />
          <Stat label={bn ? 'নগদ বিক্রি' : 'Cash sales'} value={formatBDT(String(saved.cash_sales ?? 0), lang)} />
          <Stat label={bn ? 'বাকি বিক্রি' : 'Credit sales'} value={formatBDT(String(saved.credit_sales ?? 0), lang)} />
          <Stat label={bn ? 'লুব্রিকেন্ট' : 'Lubricants'} value={formatBDT(String(saved.lubricant_sales ?? 0), lang)} />
          <Stat label={bn ? 'ড্রয়ারে থাকার কথা' : 'Expected cash'} value={formatBDT(String(saved.cash_expected ?? 0), lang)} />
          <Stat label={bn ? 'গোনা নগদ' : 'Counted cash'} value={formatBDT(String(saved.cash_counted ?? 0), lang)} />
          <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{bn ? 'নগদের গরমিল' : 'Cash variance'}</p>
            <Chip tone={cashOk ? 'ok' : 'breach'} className="tabular mt-1">
              {formatBDT(String(saved.cash_variance ?? 0), lang, true)}
            </Chip>
          </div>
          <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{bn ? 'স্টক গরমিল' : 'Stock variance'}</p>
            <Chip tone={light ? LIGHT_TONE[light] : 'neutral'} className="tabular mt-1">
              {saved.stock_variance_litres === null ? '—' : formatLitres(String(saved.stock_variance_litres), lang, true)}
              {saved.stock_variance_pct === null ? '' : ` · ${formatPercent(String(saved.stock_variance_pct), lang)}`}
            </Chip>
          </div>
        </div>
      ) : saved === undefined ? (
        <div className="skeleton mx-auto h-20 w-full max-w-xl" />
      ) : null}

      <Button size="lg" onClick={() => router.push('/manager')} lang={lang}>
        {t('nav.dashboard')}
      </Button>
    </GlassCard>
  );
}
