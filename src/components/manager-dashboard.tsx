'use client';

import { useState, useTransition } from 'react';
import { Link } from '@tanstack/react-router';
import { useRouter } from '@/lib/compat';
import { ClipboardCheck, Droplets, PlayCircle, Receipt, Truck } from 'lucide-react';
import { Button } from '@/components/jhm/button';
import { openCurrentShift } from './manager-actions';
import { useLang } from '@/lib/i18n/provider';
import { formatDate, formatTime } from '@/lib/format';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { TankGauge } from '@/components/tank-gauge';
import type { CurrentShift, TankOverview } from '@/lib/data/overview';
import type { DashboardKpis } from '@/lib/data/dashboard';
import { OpenShiftCard } from '@/components/dashboard/open-shift-card';
import { ShiftCloseCard } from '@/components/dashboard/shift-close-card';

const QUICK_ENTRY = [
  { icon: Droplets, href: '/stock', label: { en: 'Stock', bn: 'মজুদ' } },
  { icon: Receipt, href: '/oil-purchase', label: { en: 'Oil purchase', bn: 'তেল ক্রয়' } },
  { icon: Truck, href: '/refill', label: { en: 'Tank refill', bn: 'ট্যাংক রিফিল' } },
  { icon: ClipboardCheck, href: '/shift/close', label: { en: 'Shift closing', bn: 'শিফট ক্লোজিং' } },
] as const;

export function ManagerDashboard({
  shift,
  tanks,
  kpis,
}: {
  shift: CurrentShift | null;
  tanks: TankOverview[];
  kpis: DashboardKpis | null;
}) {
  const { t, lang } = useLang();

  return (
    <div className="space-y-5">
      {/* The books run shift to shift, so closing the shift comes first. */}
      <OpenShiftCard />
      <ShiftCloseCard />

      <GlassCard className="flex flex-wrap items-center gap-x-6 gap-y-2" lift={false}>
        <div>
          <Muted lang={lang}>{shift ? formatDate(shift.shiftDate, lang) : ''}</Muted>
          <p className="text-base font-semibold tracking-tight" lang={lang}>
            {shift ? t(shift.shiftType === 'day' ? 'shift.day' : 'shift.night') : t('shift.none')}
          </p>
        </div>

        {shift ? (
          <>
            <div className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
              {formatTime(shift.startsAt, lang)} – {formatTime(shift.endsAt, lang)}
            </div>
            <Chip tone={shift.status === 'open' ? 'ok' : 'watch'} lang={lang}>
              {t(shift.status === 'open' ? 'shift.open' : shift.status === 'closing' ? 'shift.closing' : 'shift.reopened')}
            </Chip>
          </>
        ) : (
          <div className="ml-auto">
            <OpenShiftButton />
          </div>
        )}
      </GlassCard>

      <section className="grid gap-3 sm:grid-cols-2">
        {tanks.map((tank) => (
          <TankGauge key={tank.id} tank={tank} />
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {lang === 'bn' ? 'দ্রুত এন্ট্রি' : 'Quick entry'}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {QUICK_ENTRY.map(({ icon: Icon, href, label }) => (
            <Link key={label.en} to={href} lang={lang} className="block">
              <GlassCard className="flex h-full flex-col items-start gap-2">
                <Icon className="h-5 w-5" style={{ color: 'var(--color-accent)' }} aria-hidden />
                <span className="text-sm font-medium" lang={lang}>
                  {label[lang]}
                </span>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}

/**
 * Opens the shift covering right now. Without an open shift a dispenser has
 * nothing to attach a reading to, so this is the first thing done each morning
 * and each evening.
 */
function OpenShiftButton() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <Button
        size="sm"
        disabled={pending}
        lang={lang}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await openCurrentShift();
            if (result.ok) router.refresh();
            else setError(result.error ?? 'The shift could not be opened');
          })
        }
      >
        <PlayCircle className="h-3.5 w-3.5" aria-hidden />
        {lang === 'bn' ? 'শিফট চালু করুন' : 'Open shift'}
      </Button>
      {error ? (
        <p className="state-breach mt-1 text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <span className="sr-only">{t('shift.none')}</span>
    </div>
  );
}
