'use client';

import { useLang } from '@/lib/i18n/provider';
import { formatDateTime, formatDip, formatLitres, formatNumber } from '@/lib/format';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import type { TankOverview } from '@/lib/data/overview';
import { HourglassGauge, excessSplit } from '@/components/stock/hourglass-gauge';

/** "Main 12,000 L · Excess 1,250 L" under a T1/T2 reading. */
export function ExcessLine({ code, litres, capacity }: { code: string; litres: number; capacity: number }) {
  const { lang } = useLang();
  const s = excessSplit(code, litres, capacity);
  if (!s) return null;
  return (
    <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
      {lang === 'bn' ? 'মূল' : 'Main'} {formatLitres(s.mainLitres, lang)} · {lang === 'bn' ? 'অতিরিক্ত' : 'Excess'}{' '}
      {formatLitres(s.excessLitres, lang)} / {formatLitres(s.excessCap, lang)}
    </p>
  );
}

/**
 * One tank, as a vertical gauge with its dip and litres beside it. The fill
 * percentage is derived from the certified chart reading, never from a
 * geometric estimate.
 */
export function TankGauge({ tank }: { tank: TankOverview }) {
  const { t, lang } = useLang();
  const fill = tank.fillPct ?? 0;

  // Semantic only: a nearly empty tank is the thing worth noticing.
  const tone = tank.fillPct === null ? 'neutral' : fill < 15 ? 'breach' : fill < 30 ? 'watch' : 'ok';

  return (
    <GlassCard className="flex gap-4">
      <HourglassGauge code={tank.code} litres={Number(tank.lastDipLitres ?? 0)} capacity={Number(tank.capacityLitres)} fillPct={tank.fillPct} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">
            {t('tank.tank')} {tank.code}
          </h3>
          {tank.status !== 'active' ? <Chip tone="watch">{tank.status}</Chip> : null}
        </div>

        {tank.lastDipLitres ? (
          <>
            <p className="tabular mt-1 text-xl font-semibold tracking-tight">
              {formatLitres(tank.lastDipLitres, lang)}
            </p>
            <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('tank.dip')} {formatDip(tank.lastDipMm ?? 0, lang)}
              {tank.finalDipMm ? ` / ${formatNumber(tank.finalDipMm, { lang })}` : ''}
              {' · '}
              {formatNumber(tank.fillPct ?? 0, { lang, decimals: 1 })}%
            </p>
            <ExcessLine code={tank.code} litres={Number(tank.lastDipLitres)} capacity={Number(tank.capacityLitres)} />
            <Muted className="tabular mt-1">
              {t('tank.ullage')} {formatLitres(tank.ullageLitres ?? 0, lang)}
            </Muted>
            {tank.lastDipAt ? (
              <Muted className="tabular">
                {t('tank.lastDip')} {formatDateTime(tank.lastDipAt, lang)}
              </Muted>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('common.empty')}
            </p>
            <Muted>
              {t('tank.capacity')} {formatLitres(tank.capacityLitres, lang)}
            </Muted>
          </>
        )}

        {tank.chartExpired ? (
          <Chip tone="breach" className="mt-2">
            {t('tank.chartExpires')} {tank.chartValidTo}
          </Chip>
        ) : tank.chartExpiringSoon ? (
          <Chip tone="watch" className="mt-2">
            {t('tank.chartExpires')} {tank.chartValidTo}
          </Chip>
        ) : null}
      </div>
    </GlassCard>
  );
}
