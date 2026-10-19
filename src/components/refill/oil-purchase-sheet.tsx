'use client';

import { AdminDelete } from '@/components/admin-delete';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { formatBDT, formatDate, formatNumber } from '@/lib/format';
import { EmptyState, GlassCard } from '@/components/ui/glass';
import { createClient } from '@/lib/data/client';

interface Row {
  id: string;
  deliveryId: string;
  date: string;
  truck: string;
  driver: string;
  challan: string;
  litres: number;
  rate: number;
  value: number;
}

async function loadPurchases(): Promise<Row[]> {
  const supabase = await createClient();
  const { data: truck } = await supabase.from('tanks').select('id').eq('code', 'TRUCK').maybeSingle();
  if (!truck) return [];
  const { data } = await supabase
    .from('tanker_compartments')
    .select('id, delivery_id, received_litres, declared_litres, tanker_deliveries!inner(arrived_at, truck_reg, driver_name, challan_no, depot_rate, deleted_at)')
    .eq('tank_id', truck.id);
  return ((data ?? []) as any[])
    .map((c) => {
      const d = Array.isArray(c.tanker_deliveries) ? c.tanker_deliveries[0] : c.tanker_deliveries;
      if (!d || d.deleted_at) return null;
      const litres = Number(c.received_litres) || Number(c.declared_litres) || 0;
      const rate = Number(d.depot_rate) || 0;
      return {
        id: c.id,
        deliveryId: c.delivery_id,
        date: d.arrived_at as string,
        truck: d.truck_reg ?? '—',
        driver: d.driver_name ?? '—',
        challan: d.challan_no ?? '—',
        litres,
        rate,
        value: litres * rate,
      } as Row;
    })
    .filter((r): r is Row => !!r)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Every oil purchase as a printable sheet. */
export function OilPurchaseSheet({ canSeeCost }: { canSeeCost: boolean }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [rows, setRows] = useState<Row[] | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    loadPurchases().then(setRows);
  }, [refreshKey]);

  const title = bn ? 'তেল ক্রয়ের শিট' : 'Oil purchase sheet';
  const L = (n: number) => formatNumber(n, { lang, decimals: 3 });
  const totL = (rows ?? []).reduce((s, r) => s + r.litres, 0);
  const totV = (rows ?? []).reduce((s, r) => s + r.value, 0);

  return (
    <section className="space-y-3">
      <div className="no-print flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>{title}</h2>
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
      <GlassCard lift={false}>
        <div className="print-sheet overflow-x-auto">
          <header className="print-only mb-3 text-center">
            <p className="text-sm font-semibold">J.H.M. Filling Station</p>
            <p className="text-xs" lang={lang}>{title}</p>
          </header>
          {!rows ? null : rows.length === 0 ? (
            <EmptyState title={bn ? 'এখনও কোনো তেল ক্রয় নেই' : 'No oil purchases yet'} />
          ) : (
            <table className="tabular w-full text-xs" lang={lang}>
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1.5 pr-2">{bn ? 'তারিখ' : 'Date'}</th>
                  <th className="pr-2">{bn ? 'ট্রাক নং' : 'Truck reg.'}</th>
                  <th className="pr-2">{bn ? 'চালক' : 'Driver'}</th>
                  <th className="pr-2">{bn ? 'চালান' : 'Challan'}</th>
                  <th className="pr-2 text-right">{bn ? 'লিটার' : 'Litres'}</th>
                  {canSeeCost ? <th className="pr-2 text-right">{bn ? 'ডিপো রেট' : 'Depot rate'}</th> : null}
                  {canSeeCost ? <th className="text-right">{bn ? 'মূল্য' : 'Value'}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="py-1.5 pr-2"><AdminDelete table="tanker_deliveries" id={r.deliveryId} /> {formatDate(r.date.slice(0, 10), lang)}</td>
                    <td className="pr-2">{r.truck}</td>
                    <td className="pr-2">{r.driver}</td>
                    <td className="pr-2">{r.challan}</td>
                    <td className="pr-2 text-right">{L(r.litres)}</td>
                    {canSeeCost ? <td className="pr-2 text-right">{formatBDT(r.rate, lang)}</td> : null}
                    {canSeeCost ? <td className="text-right font-semibold">{formatBDT(r.value, lang)}</td> : null}
                  </tr>
                ))}
                <tr className="border-t font-semibold" style={{ borderColor: 'var(--hairline)' }}>
                  <td className="py-1.5 pr-2" colSpan={4}>{bn ? 'মোট' : 'Total'}</td>
                  <td className="pr-2 text-right">{L(totL)}</td>
                  {canSeeCost ? <td /> : null}
                  {canSeeCost ? <td className="text-right">{formatBDT(totV, lang)}</td> : null}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>
    </section>
  );
}
