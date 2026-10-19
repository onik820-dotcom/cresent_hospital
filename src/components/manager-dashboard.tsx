'use client';

import { Link } from '@tanstack/react-router';
import { Gauge, Receipt, Ruler } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { GlassCard } from '@/components/ui/glass';
import { TankGauge } from '@/components/tank-gauge';
import type { CurrentShift, TankOverview } from '@/lib/data/overview';
import type { DashboardKpis } from '@/lib/data/dashboard';
import { KpiRow } from '@/components/dashboard/kpi-row';
import { ShiftStatusBar } from '@/components/dashboard/shift-status-bar';
import { ActivityLog } from '@/components/dashboard/activity-log';

/** The three entries made most often, as large targets for a thumb. */
function QuickEntry() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const cardClass = 'flex min-h-24 flex-col items-start justify-between gap-3';

  return (
    <section aria-label={bn ? 'দ্রুত এন্ট্রি' : 'Quick entry'}>
      <h2 className="mb-2 text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
        {bn ? 'দ্রুত এন্ট্রি' : 'Quick entry'}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link to="/dispenser/meter" lang={lang} className="block">
          <GlassCard className={cardClass}>
            <Gauge className="h-7 w-7" style={{ color: 'var(--color-accent)' }} aria-hidden />
            <span className="text-base font-semibold" lang={lang}>
              {bn ? 'মিটার রিডিং' : 'Record meter'}
            </span>
          </GlassCard>
        </Link>
        <Link to="/dispenser/dip" lang={lang} className="block">
          <GlassCard className={cardClass}>
            <Ruler className="h-7 w-7" style={{ color: 'var(--color-accent)' }} aria-hidden />
            <span className="text-base font-semibold" lang={lang}>
              {bn ? 'ডিপ দিন' : 'Enter dip'}
            </span>
          </GlassCard>
        </Link>
        {/* Managers add an expense inside the shift close — the Expenses page is
            for the owner and the accountant — so this opens that step directly. */}
        <Link to="/shift/close" search={{ step: 4 }} lang={lang} className="block">
          <GlassCard className={cardClass}>
            <Receipt className="h-7 w-7" style={{ color: 'var(--color-accent)' }} aria-hidden />
            <span className="text-base font-semibold" lang={lang}>
              {bn ? 'খরচ যোগ করুন' : 'Add expense'}
            </span>
          </GlassCard>
        </Link>
      </div>
    </section>
  );
}

export function ManagerDashboard({
  shift,
  tanks,
  kpis,
}: {
  shift: CurrentShift | null;
  tanks: TankOverview[];
  kpis: DashboardKpis | null;
}) {
  const { lang } = useLang();

  return (
    <div className="space-y-5">
      {/* 1. How is today going? */}
      {kpis ? <KpiRow kpis={kpis} /> : null}

      {/* 2. The entries made all day. */}
      <QuickEntry />

      {/* 3. Is a shift running, since when, who opened it. */}
      <ShiftStatusBar shift={shift} />

      {/* 4. What the rods last said. */}
      <section className="grid gap-3 sm:grid-cols-2" aria-label={lang === 'bn' ? 'ট্যাংক' : 'Tanks'}>
        {tanks.map((tank) => (
          <TankGauge key={tank.id} tank={tank} />
        ))}
      </section>

      {/* 5. Checking back on an entry. */}
      <ActivityLog shiftId={shift && shift.status !== 'closed' ? shift.id : null} />
    </div>
  );
}
