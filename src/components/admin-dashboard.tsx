'use client';

import { Link } from '@/lib/compat';
import { AlertTriangle } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatNumber } from '@/lib/format';
import { GlassCard, Muted } from '@/components/ui/glass';
import { TankGauge } from '@/components/tank-gauge';
import { EquipmentControls } from '@/components/stock/equipment-controls';
import type { DispenserOverview, TankOverview } from '@/lib/data/overview';
import type { DashboardKpis } from '@/lib/data/dashboard';
import { ClosingCashCard } from '@/components/dashboard/closing-cash-card';
import { KpiRow } from '@/components/dashboard/kpi-row';

export function AdminDashboard({
  tanks = [],
  kpis,
}: {
  tanks: TankOverview[];
  dispensers: DispenserOverview[];
  kpis: DashboardKpis | null;
}) {
  const { t, lang } = useLang();
  const expiringCharts = tanks.filter((tank) => tank.chartExpiringSoon || tank.chartExpired);

  return (
    <div className="space-y-5">
      {kpis ? <KpiRow kpis={kpis} /> : null}

      {expiringCharts.length > 0 ? (
        <GlassCard className="flex items-start gap-3" lift={false}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 state-watch" aria-hidden />
          <div>
            <p className="text-sm font-semibold tracking-tight" lang={lang}>
              {lang === 'bn' ? 'ক্যালিব্রেশন চার্টের মেয়াদ' : 'Calibration charts approaching expiry'}
            </p>
            <Muted lang={lang}>
              {expiringCharts
                .map((tank) =>
                  `${tank.code}: ${tank.chartValidTo}` +
                  (tank.chartDaysRemaining !== null
                    ? ` (${formatNumber(tank.chartDaysRemaining, { lang })} ${lang === 'bn' ? 'দিন' : 'days'})`
                    : ''),
                )
                .join(' · ')}
            </Muted>
          </div>
        </GlassCard>
      ) : null}

      <ClosingCashCard />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {lang === 'bn' ? 'ট্যাংক' : 'Tanks'}
          </h2>
          {/* The forms live on the stock page, next to the charts they depend on. */}
          <Link href="/stock" className="text-xs font-medium" style={{ color: 'var(--color-accent)' }} lang={lang}>
            {t('stock.addTank')} →
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {tanks.map((tank) => (
            <div key={tank.id} className="space-y-2">
              <TankGauge tank={tank} />
              <div className="flex flex-wrap items-center gap-2 px-1">
                <Muted className="tabular">
                  {t('tank.calibration')}: {formatNumber(tank.calibrationRows, { lang })}{' '}
                  {lang === 'bn' ? 'সারি' : 'rows'}
                  {tank.finalDipMm ? ` · ${lang === 'bn' ? 'পূর্ণ ডিপ' : 'final dip'} ${formatNumber(tank.finalDipMm, { lang })} mm` : ''}
                </Muted>
                <div className="ml-auto">
                  <EquipmentControls kind="tank" id={tank.id} code={tank.code} status={tank.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
