'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatDate, formatLitres } from '@/lib/format';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { getSessionProfile } from '@/lib/session';
import { listClosedShifts, reopenShift, type ClosedShiftRow } from '@/components/shift-close-actions';
import { useRefreshKey } from '@/lib/refresh';

/** Recently closed shifts; the owner/admin can open one again to correct it. */
export function ClosedShiftsList() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const navigate = useNavigate();
  const refreshKey = useRefreshKey();
  const [rows, setRows] = useState<ClosedShiftRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClosedShifts().then(setRows);
    getSessionProfile().then((p) => setIsAdmin(p?.role === 'admin'));
  }, [refreshKey]);

  async function edit(row: ClosedShiftRow) {
    const reason = window.prompt(bn ? 'কেন এই শিফট সংশোধন করছেন?' : 'Why are you editing this shift?');
    if (!reason || reason.trim().length < 3) return;
    setBusy(row.id);
    setError(null);
    const res = await reopenShift(row.id, reason);
    setBusy(null);
    if (!res.ok) return setError(res.error ?? 'Could not open the shift');
    navigate({ to: '/shift/close', search: { edit: row.id } });
  }

  if (rows.length === 0) return null;

  return (
    <GlassCard lift={false} className="space-y-3">
      <h2 className="text-base font-semibold" lang={lang}>{bn ? 'বন্ধ হওয়া শিফট' : 'Closed shifts'}</h2>
      {isAdmin ? (
        <Muted lang={lang}>
          {bn
            ? 'সংশোধন করলে পরের সব শিফটের স্টক ও সব রিপোর্ট নতুন করে হিসাব হবে।'
            : 'Editing a shift recalculates the stock of every later shift and all reports.'}
        </Muted>
      ) : null}
      {error ? <p className="text-sm state-bad">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-3">{bn ? 'তারিখ' : 'Date'}</th>
              <th className="py-2 pr-3">{bn ? 'শিফট' : 'Shift'}</th>
              <th className="py-2 pr-3 text-right">{bn ? 'বিক্রি (লি.)' : 'Sold (L)'}</th>
              <th className="py-2 pr-3 text-right">{bn ? 'বিক্রি (৳)' : 'Sales'}</th>
              <th className="py-2 pr-3 text-right">{bn ? 'গণনা করা নগদ' : 'Cash counted'}</th>
              {isAdmin ? <th className="py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 pr-3">{formatDate(r.shiftDate, lang)}</td>
                <td className="py-2 pr-3">{r.shiftType === 'day' ? (bn ? 'দিন' : 'Day') : bn ? 'রাত' : 'Night'}</td>
                <td className="py-2 pr-3 text-right">{r.netLitres != null ? formatLitres(r.netLitres, lang) : '—'}</td>
                <td className="py-2 pr-3 text-right">{r.salesAmount != null ? formatBDT(r.salesAmount, lang) : '—'}</td>
                <td className="py-2 pr-3 text-right">{r.countedCash != null ? formatBDT(r.countedCash, lang) : '—'}</td>
                {isAdmin ? (
                  <td className="py-2 text-right">
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => edit(r)}>
                      <Pencil className="h-4 w-4" aria-hidden /> {bn ? 'সংশোধন' : 'Edit'}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
