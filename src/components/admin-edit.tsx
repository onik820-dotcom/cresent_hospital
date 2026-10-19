'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { signalRefresh } from '@/lib/refresh';
import { useLang } from '@/lib/i18n/provider';
import { useCanEdit } from '@/lib/use-can-edit';
import { formatBDT, formatDate } from '@/lib/format';
import { Button } from '@/components/jhm/button';
import { FormWindow } from '@/components/ui/form-window';
import { Muted } from '@/components/ui/glass';

/** The saved records an admin may correct in place. See admin_edit_record(). */
export type EditableTable = 'expenses' | 'bank_transactions' | 'credit_sales';

type FieldKind = 'money' | 'text' | 'paid_by' | 'category';

interface FieldSpec {
  key: string;
  kind: FieldKind;
  en: string;
  bn: string;
}

const FIELDS: Record<EditableTable, FieldSpec[]> = {
  expenses: [
    { key: 'amount', kind: 'money', en: 'Amount (৳)', bn: 'টাকা (৳)' },
    { key: 'category_id', kind: 'category', en: 'Category', bn: 'খাত' },
    { key: 'paid_by', kind: 'paid_by', en: 'Paid by', bn: 'পরিশোধ' },
    { key: 'description', kind: 'text', en: 'Description', bn: 'বিবরণ' },
  ],
  bank_transactions: [
    { key: 'amount', kind: 'money', en: 'Amount (৳)', bn: 'টাকা (৳)' },
    { key: 'bank_name', kind: 'text', en: 'Bank', bn: 'ব্যাংক' },
    { key: 'account_no', kind: 'text', en: 'Account no.', bn: 'হিসাব নম্বর' },
    { key: 'reference', kind: 'text', en: 'Reference', bn: 'রেফারেন্স' },
  ],
  credit_sales: [
    { key: 'vehicle_no', kind: 'text', en: 'Vehicle', bn: 'গাড়ি নম্বর' },
    { key: 'challan_no', kind: 'text', en: 'Challan', bn: 'চালান নম্বর' },
  ],
};

const KIND_LABEL: Record<EditableTable, { en: string; bn: string }> = {
  expenses: { en: 'Expense', bn: 'খরচ' },
  bank_transactions: { en: 'Bank', bn: 'ব্যাংক' },
  credit_sales: { en: 'Credit sale', bn: 'বাকি বিক্রি' },
};

const INPUT = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;
const PAID_BY = ['cash', 'bank', 'bkash', 'nagad'];

type Row = Record<string, unknown>;
interface ShiftInfo {
  shift_date: string;
  shift_type: 'day' | 'night';
  status: string;
}

/**
 * A pencil on a saved record, shown to the admin only.
 *
 * Clicking it asks first — "you are editing a … from …, this recalculates the
 * shift" — and only then opens the fields. Saving goes through
 * admin_edit_record(), which records the reason, applies the change and works
 * the shift out again in one transaction, so the books are never left half
 * corrected. Anything that cannot be changed safely in place says so, and says
 * what to do instead.
 */
export function AdminEdit({ table, id, onDone }: { table: EditableTable; id: string; onDone?: () => void }) {
  const canEdit = useCanEdit();
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [open, setOpen] = useState(false);
  if (!canEdit || !id) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={bn ? 'সংশোধন' : 'Edit'}
        title={bn ? 'সংশোধন' : 'Edit'}
        className="no-print inline-flex rounded-md p-1 align-middle"
        style={{ color: 'var(--text-muted)' }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? <EditWindow table={table} id={id} onClose={() => setOpen(false)} onDone={onDone} /> : null}
    </>
  );
}

function EditWindow({ table, id, onClose, onDone }: { table: EditableTable; id: string; onClose: () => void; onDone?: () => void }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [step, setStep] = useState<'confirm' | 'form'>('confirm');
  const [row, setRow] = useState<Row | null>(null);
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; name_bn: string | null }>>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      const r = (data ?? null) as Row | null;
      if (!alive) return;
      setRow(r);
      if (r) {
        setValues(
          Object.fromEntries(FIELDS[table].map((f) => [f.key, r[f.key] === null || r[f.key] === undefined ? '' : String(r[f.key])])),
        );
        if (r.shift_id) {
          const { data: s } = await supabase.from('shifts').select('shift_date, shift_type, status').eq('id', String(r.shift_id)).maybeSingle();
          if (alive) setShift((s ?? null) as ShiftInfo | null);
        }
      }
      if (table === 'expenses') {
        const { data: c } = await supabase.from('expense_categories').select('id, name, name_bn').order('sort_order');
        if (alive) setCategories((c ?? []) as typeof categories);
      }
    })();
    return () => {
      alive = false;
    };
  }, [table, id]);

  const kind = KIND_LABEL[table];
  const when = row
    ? formatDate(String((row.spent_at ?? row.txn_date ?? row.sold_at ?? row.created_at) as string).slice(0, 10), lang)
    : '';
  const shiftText = shift
    ? `${formatDate(shift.shift_date, lang)} · ${shift.shift_type === 'night' ? (bn ? 'রাতের শিফট' : 'night shift') : bn ? 'দিনের শিফট' : 'day shift'}`
    : null;
  const recalculates = shift?.status === 'closed';

  // A bank line copied from a payment or expense is changed on its source.
  const mirrored = table === 'bank_transactions' && row?.source_id;
  const pettyExpense = table === 'expenses' && row?.paid_by === 'petty';
  const fields = FIELDS[table].filter((f) => !(pettyExpense && f.key === 'paid_by'));

  function changes() {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const before = row?.[f.key] === null || row?.[f.key] === undefined ? '' : String(row?.[f.key]);
      if ((values[f.key] ?? '') !== before) out[f.key] = (values[f.key] ?? '').trim();
    }
    return out;
  }

  async function save() {
    const changed = changes();
    if (Object.keys(changed).length === 0) return setError(bn ? 'কিছু বদলানো হয়নি' : 'Nothing has been changed');
    if (reason.trim().length < 3) return setError(bn ? 'কেন বদলাচ্ছেন তা লিখুন' : 'Say why this is being changed');
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_edit_record', {
      p_table: table,
      p_id: id,
      p_changes: changed,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    const result = data as { recalculated?: boolean } | null;
    setDone(
      result?.recalculated
        ? bn
          ? 'সংরক্ষিত — শিফটের নগদ ও স্টক নতুন করে হিসাব হয়েছে।'
          : 'Saved — the shift’s cash and stock have been recalculated.'
        : bn
          ? 'সংরক্ষিত।'
          : 'Saved.',
    );
    signalRefresh();
    onDone?.();
  }

  return (
    <FormWindow title={`${bn ? kind.bn : kind.en} — ${bn ? 'সংশোধন' : 'edit'}`} onClose={onClose}>
      {row === null ? (
        <div className="skeleton h-24 w-full" />
      ) : done ? (
        <div className="space-y-4">
          <p className="state-ok text-sm" role="status" lang={lang}>{done}</p>
          <div className="flex justify-end">
            <Button onClick={onClose} lang={lang}>{bn ? 'বন্ধ' : 'Close'}</Button>
          </div>
        </div>
      ) : mirrored ? (
        <div className="space-y-3">
          <p className="text-sm" lang={lang}>
            {bn
              ? 'এই ব্যাংক লাইনটি অন্য একটি রেকর্ড থেকে এসেছে। সেই রেকর্ডটি (খরচ বা বাকি আদায়) সংশোধন করুন।'
              : 'This bank line mirrors another record (an expense or a due collection). Edit that record instead.'}
          </p>
          <div className="flex justify-end"><Button onClick={onClose} lang={lang}>{bn ? 'বন্ধ' : 'Close'}</Button></div>
        </div>
      ) : step === 'confirm' ? (
        <div className="space-y-4">
          <p className="text-sm" lang={lang}>
            {bn
              ? `আপনি ${shiftText ? `${shiftText}-এর` : `${when} তারিখের`} একটি ${kind.bn} রেকর্ড সংশোধন করছেন।`
              : `You are editing a ${kind.en.toLowerCase()} record from ${shiftText ?? when}.`}{' '}
            {recalculates
              ? bn
                ? 'সংরক্ষণ করলে সেই শিফটের নগদ হিসাব ও স্টক নতুন করে হিসাব হবে। চালিয়ে যাবেন?'
                : 'Saving will trigger a recalculation of that shift’s cash and stock. Continue?'
              : bn
                ? 'চালিয়ে যাবেন?'
                : 'Continue?'}
          </p>
          {typeof row.amount === 'number' || typeof row.amount === 'string' ? (
            <Muted className="tabular" lang={lang}>
              {bn ? 'বর্তমান টাকা' : 'Current amount'}: {formatBDT(String(row.amount), lang)}
            </Muted>
          ) : null}
          {table === 'credit_sales' ? (
            <Muted lang={lang}>
              {bn
                ? 'বাকির টাকা বদলাতে হলে বিক্রিটি মুছে নতুন করে লিখুন — পার্টির খাতা সেই টাকা থেকেই তৈরি হয়েছে।'
                : 'Only the vehicle and challan can be changed. To change the amount, delete the sale and enter it again — the party’s ledger was posted from it.'}
            </Muted>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} lang={lang}>{bn ? 'বাতিল' : 'Cancel'}</Button>
            <Button onClick={() => setStep('form')} lang={lang}>{bn ? 'চালিয়ে যান' : 'Continue'}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className={`block space-y-1 ${f.key === 'description' || f.key === 'reference' ? 'sm:col-span-2' : ''}`}>
                <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                  {bn ? f.bn : f.en}
                </span>
                {f.kind === 'category' ? (
                  <select value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={INPUT} style={BORDER}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{bn && c.name_bn ? c.name_bn : c.name}</option>
                    ))}
                  </select>
                ) : f.kind === 'paid_by' ? (
                  <select value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={INPUT} style={BORDER}>
                    {PAID_BY.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={values[f.key] ?? ''}
                    inputMode={f.kind === 'money' ? 'decimal' : 'text'}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className={INPUT}
                    style={BORDER}
                  />
                )}
              </label>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
              {bn ? 'কেন বদলাচ্ছেন? (অডিট লগে থাকবে)' : 'Why is this being changed? (kept in the audit trail)'}
            </span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} style={BORDER} />
          </label>
          {error ? <p className="state-breach text-sm" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy} lang={lang}>{bn ? 'বাতিল' : 'Cancel'}</Button>
            <Button onClick={save} disabled={busy} lang={lang}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {recalculates ? (bn ? 'সংরক্ষণ ও নতুন হিসাব' : 'Save & Recalculate') : bn ? 'সংরক্ষণ' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </FormWindow>
  );
}
