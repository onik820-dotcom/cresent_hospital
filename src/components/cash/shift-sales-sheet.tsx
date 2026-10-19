'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { formatBDT, formatDate, formatNumber } from '@/lib/format';
import { EmptyState, GlassCard } from '@/components/ui/glass';
import { getShiftSheet, type ShiftSheetRow } from '@/lib/data/shift-sheet';

/** Every closed shift's litres turned into taka, printable as a sheet. */
export function ShiftSalesSheet({ from, to, embedded }: { from?: string; to?: string; embedded?: boolean } = {}) {
  const { lang } = useLang();
  const [all, setRows] = useState<ShiftSheetRow[] | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    getShiftSheet().then(setRows);
  }, [refreshKey]);
  const rows = all
    ? all.filter((r) => (!from || r.shiftDate >= from) && (!to || r.shiftDate <= to))
    : null;

  const bn = lang === 'bn';
  const title = bn ? 'শিফট বিক্রির হিসাব (লিটার থেকে টাকা)' : 'Shift sales sheet (litres to taka)';
  const L = (n: number) => formatNumber(n, { lang, decimals: 3 });
  const tot = (k: keyof ShiftSheetRow) => (rows ?? []).reduce((s, r) => s + (r[k] as number), 0);

  const body = (
        <div className="print-sheet overflow-x-auto">
          <header className="print-only mb-3 text-center">
            <p className="text-sm font-semibold">J.H.M. Filling Station</p>
            <p className="text-xs" lang={lang}>{title}</p>
            {from && to ? <p className="tabular text-xs">{formatDate(from, lang)} — {formatDate(to, lang)}</p> : null}
          </header>

          {!rows ? null : rows.length === 0 ? (
            <EmptyState title={bn ? 'এখনও কোনো শিফট বন্ধ হয়নি' : 'No closed shifts yet'} />
          ) : (
            <table className="tabular w-full text-xs" lang={lang}>
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1.5 pr-2">{bn ? 'তারিখ' : 'Date'}</th>
                  <th className="pr-2">{bn ? 'শিফট নং' : 'Shift no.'}</th>
                  <th className="pr-2 text-right">{bn ? 'বিক্রি লিটার' : 'Litres sold'}</th>
                  <th className="pr-2 text-right">{bn ? 'দর/লিটার' : 'Rate/L'}</th>
                  <th className="pr-2 text-right">{bn ? 'বিক্রি (টাকা)' : 'Sales (৳)'}</th>
                  <th className="pr-2 text-right">{bn ? 'নগদ' : 'Cash'}</th>
                  <th className="pr-2 text-right">{bn ? 'বাকি' : 'Due'}</th>
                  <th>{bn ? 'ম্যানেজার' : 'Manager'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.shiftId} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="py-1.5 pr-2">{formatDate(r.shiftDate, lang)}</td>
                    <td className="pr-2">
                      #{r.shiftNo} · {r.shiftType === 'night' ? (bn ? 'রাত' : 'Night') : bn ? 'দিন' : 'Day'}
                    </td>
                    <td className="pr-2 text-right">{L(r.netLitres)}</td>
                    <td className="pr-2 text-right">{formatBDT(r.rate, lang)}</td>
                    <td className="pr-2 text-right font-semibold">{formatBDT(r.amount, lang)}</td>
                    <td className="pr-2 text-right">{formatBDT(r.cash, lang)}</td>
                    <td className="pr-2 text-right">{formatBDT(r.credit, lang)}</td>
                    <td>{r.manager}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold" style={{ borderColor: 'var(--hairline)' }}>
                  <td className="py-1.5 pr-2" colSpan={2}>{bn ? 'মোট' : 'Total'}</td>
                  <td className="pr-2 text-right">{L(tot('netLitres'))}</td>
                  <td />
                  <td className="pr-2 text-right">{formatBDT(tot('amount'), lang)}</td>
                  <td className="pr-2 text-right">{formatBDT(tot('cash'), lang)}</td>
                  <td className="pr-2 text-right">{formatBDT(tot('credit'), lang)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
  );

  if (embedded) return body;

  return (
    <section className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {title}
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="tap-target ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-foreground, white)' }}
          lang={lang}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          {bn ? 'প্রিন্ট' : 'Print'}
        </button>
      </div>
      <GlassCard lift={false}>{body}</GlassCard>
    </section>
  );
}
