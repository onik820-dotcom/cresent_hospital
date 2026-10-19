'use client';

import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { Button } from '@/components/jhm/button';
import { supabase } from '@/integrations/supabase/client';
import { signalRefresh } from '@/lib/refresh';

/**
 * Sends oil out of a tank back into "Purchased oil" (the truck stock). The
 * tank's dip before and after are measured with the rod; the litres come from
 * the tank's calibration chart, server-side.
 */
export function ReturnToPurchased({ tankId, code, lastDipMm }: { tankId: string; code: string; lastDipMm: string | null }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState(lastDipMm ?? '');
  const [after, setAfter] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    const b = Number(before), a = Number(after);
    if (!Number.isFinite(b) || !Number.isFinite(a) || after === '' || a < 0 || a >= b) {
      setMsg(bn ? 'পরের ডিপ আগের ডিপের চেয়ে কম হতে হবে' : 'Dip after must be lower than dip before');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('record_tank_return', { p_tank: tankId, p_before: b, p_after: a, p_note: note });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    const litres = (data as { litres?: number } | null)?.litres;
    setMsg(`${bn ? 'ফেরত গেছে' : 'Returned'} ${litres ?? ''} L`);
    setOpen(false); setAfter(''); setNote('');
    signalRefresh();
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setBefore(lastDipMm ?? ''); setOpen(true); }}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          {bn ? 'কেনা তেলে ফেরত' : 'Return to purchased oil'}
        </Button>
        {msg ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{msg}</span> : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-xs font-medium">{bn ? `ট্যাঙ্ক ${code} থেকে কেনা তেলে ফেরত` : `Return oil from ${code} to purchased oil`}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          {bn ? 'আগের ডিপ (মিমি)' : 'Dip before (mm)'}
          <input className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm" style={{ borderColor: 'var(--hairline)' }} inputMode="decimal" value={before} onChange={(e) => setBefore(e.target.value)} />
        </label>
        <label className="text-xs">
          {bn ? 'পরের ডিপ (মিমি)' : 'Dip after (mm)'}
          <input className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm" style={{ borderColor: 'var(--hairline)' }} inputMode="decimal" value={after} onChange={(e) => setAfter(e.target.value)} />
        </label>
      </div>
      <input className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm" style={{ borderColor: 'var(--hairline)' }} placeholder={bn ? 'নোট (ঐচ্ছিক)' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
      {msg ? <p className="text-xs" style={{ color: 'var(--color-breach)' }}>{msg}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>{busy ? '…' : bn ? 'সংরক্ষণ' : 'Save'}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setMsg(null); }}>{bn ? 'বাতিল' : 'Cancel'}</Button>
      </div>
    </div>
  );
}
