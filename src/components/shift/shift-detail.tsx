'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { signalRefresh, useRefreshKey } from '@/lib/refresh';
import { useLang } from '@/lib/i18n/provider';
import { useRole } from '@/lib/use-can-edit';
import { canEditRecords } from '@/lib/roles';
import { formatBDT, formatDate, formatDateTime, formatLitres, formatPercent } from '@/lib/format';
import { stockLight, useThresholds } from '@/lib/data/thresholds';
import { TABLE_LABEL, getShiftAudit, type AuditEntry } from '@/lib/data/audit';
import { Button } from '@/components/jhm/button';
import { Chip, Muted } from '@/components/ui/glass';
import { FormWindow } from '@/components/ui/form-window';
import { AdminDelete, type DeletableTable } from '@/components/admin-delete';
import { AdminEdit, type EditableTable } from '@/components/admin-edit';

type Tab = 'summary' | 'records' | 'audit';

interface ShiftRow {
  shift_date: string;
  shift_type: 'day' | 'night';
  status: string;
  starts_at: string;
  ends_at: string;
  rate_per_litre: string | number | null;
  closed_at: string | null;
}

interface Summary {
  litres_sold: number | null;
  cash_sales: number | null;
  credit_sales: number | null;
  lubricant_sales: number | null;
  tank_book_closing: number | null;
  tank_physical_closing: number | null;
  stock_variance_litres: number | null;
  stock_variance_pct: number | null;
  tanks_flagged: number;
  cash_expected: number | null;
  cash_counted: number | null;
  cash_variance: number | null;
  calculated_at: string;
  recalculated_by: string | null;
}

interface RecordLine {
  table: DeletableTable;
  id: string;
  label: string;
  detail: string;
  amount: string | null;
  at: string;
  /** Present only for lines the admin may correct in place. */
  editable?: EditableTable;
}

/**
 * One closed shift on one screen: what was saved (read from shift_summary), the
 * records behind it, and — for the admin — the audit trail and a recalculate
 * button. Managers see the first two; the audit log is the admin's and the MD's.
 */
export function ShiftDetail({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const role = useRole();
  const isAdmin = canEditRecords(role);
  const canAudit = role === 'admin' || role === 'md';
  const [tab, setTab] = useState<Tab>('summary');
  const refreshKey = useRefreshKey();

  const tabs: Array<[Tab, string, string]> = [
    ['summary', 'Summary', 'সারসংক্ষেপ'],
    ['records', 'Records', 'রেকর্ড'],
    ...(canAudit ? ([['audit', 'Audit trail', 'অডিট ট্রেইল']] as Array<[Tab, string, string]>) : []),
  ];

  return (
    <FormWindow title={bn ? 'শিফটের বিবরণ' : 'Shift detail'} onClose={onClose} wide>
      <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist">
        {tabs.map(([key, en, bnLabel]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            lang={lang}
            className="tap-target shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={tab === key ? { background: 'var(--color-accent)', color: 'white' } : { color: 'var(--text-muted)' }}
          >
            {bn ? bnLabel : en}
          </button>
        ))}
      </div>

      {tab === 'summary' ? <SummaryTab shiftId={shiftId} isAdmin={isAdmin} refreshKey={refreshKey} /> : null}
      {tab === 'records' ? <RecordsTab shiftId={shiftId} refreshKey={refreshKey} /> : null}
      {tab === 'audit' && canAudit ? <AuditTab shiftId={shiftId} refreshKey={refreshKey} /> : null}
    </FormWindow>
  );
}

// ---------------------------------------------------------------------------

function SummaryTab({ shiftId, isAdmin, refreshKey }: { shiftId: string; isAdmin: boolean; refreshKey: number }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const thresholds = useThresholds();
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: s }, { data: sum }] = await Promise.all([
        supabase.from('shifts').select('shift_date, shift_type, status, starts_at, ends_at, rate_per_litre, closed_at').eq('id', shiftId).maybeSingle(),
        supabase.from('shift_summary').select('*').eq('shift_id', shiftId).maybeSingle(),
      ]);
      if (!alive) return;
      setShift((s ?? null) as unknown as ShiftRow | null);
      setSummary((sum ?? null) as unknown as Summary | null);
    })();
    return () => {
      alive = false;
    };
  }, [shiftId, refreshKey]);

  async function recalculate() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('recalculate_shift', { p_shift_id: shiftId });
    setBusy(false);
    setConfirming(false);
    if (error) return setMessage({ ok: false, text: error.message });
    const r = data as { changed?: boolean; before?: Summary | null; after?: Summary | null } | null;
    if (!r?.changed) {
      setMessage({ ok: true, text: bn ? 'কোনো পরিবর্তন নেই — হিসাব সংরক্ষিত রেকর্ডের সঙ্গে মিলে আছে।' : 'No change — the figures already match the saved records.' });
    } else {
      const was = Number(r.before?.cash_expected ?? 0);
      const now = Number(r.after?.cash_expected ?? 0);
      setMessage({
        ok: true,
        text: bn
          ? `নতুন করে হিসাব হয়েছে। ড্রয়ারে থাকার কথা: ${formatBDT(was, lang)} → ${formatBDT(now, lang)}`
          : `Recalculated. Expected cash: ${formatBDT(was, lang)} → ${formatBDT(now, lang)}`,
      });
    }
    signalRefresh();
  }

  if (summary === undefined || !shift) return <div className="skeleton h-40 w-full" />;
  if (!summary) {
    return (
      <Muted lang={lang}>
        {bn ? 'এই শিফটের কোনো সংরক্ষিত সারসংক্ষেপ নেই — শিফটটি এখনো বন্ধ হয়নি।' : 'There is no saved summary for this shift — it has not been closed yet.'}
      </Muted>
    );
  }

  const cashOk = Math.abs(Number(summary.cash_variance ?? 0)) <= thresholds.cashVarianceTolerance;
  const light = stockLight(summary.stock_variance_pct, summary.tanks_flagged > 0, thresholds, summary.stock_variance_litres);
  const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>{label}</p>
      <div className="tabular mt-0.5 text-sm font-semibold tracking-tight">{children}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold" lang={lang}>
        {formatDate(shift.shift_date, lang)} · {shift.shift_type === 'night' ? (bn ? 'রাতের শিফট' : 'Night shift') : bn ? 'দিনের শিফট' : 'Day shift'}
        <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>{shift.status}</span>
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={bn ? 'বিক্রিত লিটার' : 'Litres sold'}>{formatLitres(String(summary.litres_sold ?? 0), lang)}</Stat>
        <Stat label={bn ? 'নগদ বিক্রি' : 'Cash sales'}>{formatBDT(String(summary.cash_sales ?? 0), lang)}</Stat>
        <Stat label={bn ? 'বাকি বিক্রি' : 'Credit sales'}>{formatBDT(String(summary.credit_sales ?? 0), lang)}</Stat>
        <Stat label={bn ? 'লুব্রিকেন্ট' : 'Lubricants'}>{formatBDT(String(summary.lubricant_sales ?? 0), lang)}</Stat>
        <Stat label={bn ? 'ড্রয়ারে থাকার কথা' : 'Expected cash'}>{formatBDT(String(summary.cash_expected ?? 0), lang)}</Stat>
        <Stat label={bn ? 'গোনা নগদ' : 'Counted cash'}>{formatBDT(String(summary.cash_counted ?? 0), lang)}</Stat>
        <Stat label={bn ? 'নগদের গরমিল' : 'Cash variance'}>
          <Chip tone={cashOk ? 'ok' : 'breach'}>{formatBDT(String(summary.cash_variance ?? 0), lang, true)}</Chip>
        </Stat>
        <Stat label={bn ? 'স্টক গরমিল' : 'Stock variance'}>
          <Chip tone={light === 'green' ? 'ok' : light === 'yellow' ? 'watch' : 'breach'}>
            {summary.stock_variance_litres === null ? '—' : formatLitres(String(summary.stock_variance_litres), lang, true)}
            {summary.stock_variance_pct === null ? '' : ` · ${formatPercent(String(summary.stock_variance_pct), lang)}`}
          </Chip>
        </Stat>
      </div>

      <Muted className="tabular" lang={lang}>
        {bn ? 'হিসাব করা হয়েছে' : 'Worked out'} {formatDateTime(summary.calculated_at, lang)}
      </Muted>

      {isAdmin ? (
        <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
          <p className="text-xs font-semibold" lang={lang}>{bn ? 'অ্যাডমিন: নতুন করে হিসাব' : 'Admin: recalculate'}</p>
          <Muted lang={lang}>
            {bn
              ? 'সংরক্ষিত খরচ, বাকি, আদায় ও ডিপ থেকে এই শিফটের নগদ ও স্টক আবার হিসাব হবে; পরের শিফটের স্টকও মিলিয়ে নেওয়া হবে। গোনা নগদ, মিটার ও টেস্ট বদলায় না।'
              : 'Re-reads the saved expenses, credit sales, dues and dips, rewrites this shift’s cash and stock figures, and carries any change into later shifts’ stock. Counted cash, meter readings and test litres are never changed.'}
          </Muted>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs" lang={lang}>{bn ? 'নিশ্চিত?' : 'Sure?'}</span>
              <Button size="sm" onClick={recalculate} disabled={busy} lang={lang}>
                {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                {bn ? 'হ্যাঁ, নতুন করে হিসাব করুন' : 'Yes, recalculate'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy} lang={lang}>{bn ? 'না' : 'Cancel'}</Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)} lang={lang}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {bn ? 'অ্যাডমিন: নতুন করে হিসাব' : 'Admin: Recalculate'}
            </Button>
          )}
          {message ? (
            <p className={`text-sm ${message.ok ? 'state-ok' : 'state-breach'}`} role="status">{message.text}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RecordsTab({ shiftId, refreshKey }: { shiftId: string; refreshKey: number }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [lines, setLines] = useState<RecordLine[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = (table: string, select: string) => supabase.from(table as never).select(select).eq('shift_id', shiftId).is('deleted_at', null).limit(200);
      const [exp, cs, pay, lub, bank] = await Promise.all([
        q('expenses', 'id, spent_at, amount, description, paid_by, expense_categories(name, name_bn)'),
        q('credit_sales', 'id, sold_at, amount, vehicle_no, customers(name, name_bn)'),
        q('payments', 'id, received_at, amount, method, customers(name, name_bn)'),
        q('lub_transactions', 'id, txn_at, amount, txn_type, lub_skus(name, name_bn)'),
        q('bank_transactions', 'id, created_at, amount, type, bank_name, reference, source_id'),
      ]);
      const out: RecordLine[] = [];
      const rows = <T,>(r: { data: unknown }) => (r.data ?? []) as T[];
      for (const e of rows<{ id: string; spent_at: string; amount: string; description: string | null; paid_by: string; expense_categories: { name: string; name_bn: string | null } | null }>(exp)) {
        out.push({ table: 'expenses', id: e.id, label: bn ? 'খরচ' : 'Expense', detail: `${(bn && e.expense_categories?.name_bn) || e.expense_categories?.name || ''}${e.description ? ` — ${e.description}` : ''} · ${e.paid_by}`, amount: String(e.amount), at: e.spent_at, editable: 'expenses' });
      }
      for (const c of rows<{ id: string; sold_at: string; amount: string; vehicle_no: string | null; customers: { name: string; name_bn: string | null } | null }>(cs)) {
        out.push({ table: 'credit_sales', id: c.id, label: bn ? 'বাকি বিক্রি' : 'Credit sale', detail: `${(bn && c.customers?.name_bn) || c.customers?.name || ''}${c.vehicle_no ? ` · ${c.vehicle_no}` : ''}`, amount: String(c.amount), at: c.sold_at, editable: 'credit_sales' });
      }
      for (const p of rows<{ id: string; received_at: string; amount: string; method: string; customers: { name: string; name_bn: string | null } | null }>(pay)) {
        out.push({ table: 'payments', id: p.id, label: bn ? 'বাকি আদায়' : 'Due collection', detail: `${(bn && p.customers?.name_bn) || p.customers?.name || ''} · ${p.method}`, amount: String(p.amount), at: p.received_at });
      }
      for (const l of rows<{ id: string; txn_at: string; amount: string | null; txn_type: string; lub_skus: { name: string; name_bn: string | null } | null }>(lub)) {
        out.push({ table: 'lub_transactions', id: l.id, label: bn ? 'লুব্রিকেন্ট' : 'Lubricant', detail: `${(bn && l.lub_skus?.name_bn) || l.lub_skus?.name || ''} · ${l.txn_type}`, amount: l.amount === null ? null : String(l.amount), at: l.txn_at });
      }
      for (const b of rows<{ id: string; created_at: string; amount: string; type: string; bank_name: string; reference: string | null; source_id: string | null }>(bank)) {
        out.push({ table: 'bank_transactions', id: b.id, label: bn ? 'ব্যাংক' : 'Bank', detail: `${b.bank_name} · ${b.type}${b.reference ? ` — ${b.reference}` : ''}`, amount: String(b.amount), at: b.created_at, editable: b.source_id ? undefined : 'bank_transactions' });
      }
      out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
      if (alive) setLines(out);
    })();
    return () => {
      alive = false;
    };
  }, [shiftId, bn, refreshKey]);

  if (lines === null) return <div className="skeleton h-32 w-full" />;
  if (lines.length === 0) return <Muted lang={lang}>{bn ? 'এই শিফটে কোনো রেকর্ড নেই।' : 'No records were saved against this shift.'}</Muted>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.table}-${l.id}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
              <td className="tabular whitespace-nowrap px-2 py-2 text-xs" style={{ color: 'var(--text-faint)' }}>{formatDateTime(l.at, lang, 'HH:mm')}</td>
              <td className="px-2 py-2 text-xs font-medium" lang={lang}>{l.label}</td>
              <td className="px-2 py-2" lang={lang}>{l.detail}</td>
              <td className="tabular px-2 py-2 text-right font-medium">{l.amount === null ? '' : formatBDT(l.amount, lang)}</td>
              <td className="w-16 whitespace-nowrap px-1">
                {l.editable ? <AdminEdit table={l.editable} id={l.id} /> : null}
                <AdminDelete table={l.table} id={l.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AuditTab({ shiftId, refreshKey }: { shiftId: string; refreshKey: number }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDerived, setShowDerived] = useState(false);

  useEffect(() => {
    let alive = true;
    getShiftAudit(shiftId)
      .then((e) => alive && setEntries(e))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [shiftId, refreshKey]);

  if (error) return <p className="state-breach text-sm" role="alert">{error}</p>;
  if (entries === null) return <div className="skeleton h-32 w-full" />;

  const visible = entries.filter((e) => showDerived || !e.derived);
  const kindLabel = { added: bn ? 'যোগ' : 'Added', edited: bn ? 'সংশোধন' : 'Edited', deleted: bn ? 'মোছা' : 'Deleted', removed: bn ? 'সরানো' : 'Removed' };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs" lang={lang}>
        <input type="checkbox" checked={showDerived} onChange={(e) => setShowDerived(e.target.checked)} className="h-4 w-4" />
        {bn ? 'হিসাবের স্বয়ংক্রিয় পরিবর্তনও দেখান (স্টক, বিক্রি, নগদ)' : 'Also show recalculation details (stock, sales, cash figures)'}
      </label>
      {visible.length === 0 ? (
        <Muted lang={lang}>{bn ? 'এই শিফটের কোনো এন্ট্রি নেই।' : 'Nothing has been recorded for this shift.'}</Muted>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
          {visible.map((e) => {
            const label = TABLE_LABEL[e.table];
            return (
              <li key={e.id} className="space-y-1 py-2 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2" lang={lang}>
                  <span className="tabular text-xs" style={{ color: 'var(--text-faint)' }}>{formatDateTime(e.at, lang)}</span>
                  <strong>{e.actorName}</strong>
                  {e.actorRole ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({e.actorRole})</span> : null}
                  <Chip tone={e.kind === 'edited' ? 'watch' : e.kind === 'added' ? 'ok' : 'breach'}>{kindLabel[e.kind]}</Chip>
                  <span>{label ? (bn ? label.bn : label.en) : e.table}</span>
                </p>
                {e.kind === 'added' ? (
                  <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                    {e.changes
                      .map((c) =>
                        c.field === 'amount' ? formatBDT(String(c.after), lang)
                        : c.field === 'reading' ? `${bn ? 'রিডিং' : 'Reading'} ${c.after}`
                        : c.field === 'dip_mm' ? `${c.after} mm`
                        : null,
                      )
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : e.kind === 'edited' ? (
                  <ul className="space-y-0.5 text-xs">
                    {e.changes.map((c) => (
                      <li key={c.field} className="tabular">
                        <span style={{ color: 'var(--text-muted)' }}>{c.field}</span>:{' '}
                        <span className="line-through" style={{ color: 'var(--text-faint)' }}>{c.before ?? '—'}</span> → <strong>{c.after ?? '—'}</strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {e.reason ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
                    {bn ? 'কারণ' : 'Reason'}: {e.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
