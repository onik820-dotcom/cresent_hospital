'use client';

import { Link } from '@/lib/compat';
import { ChevronRight } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatDateTime, formatDip, formatLitres, formatNumber } from '@/lib/format';
import { Chip, GlassCard } from '@/components/ui/glass';
import { EquipmentControls } from '@/components/stock/equipment-controls';
import { ReturnToPurchased } from '@/components/stock/return-to-purchased';
import type { TankDetail } from '@/lib/data/stock';
import { HourglassGauge } from '@/components/stock/hourglass-gauge';
import { ExcessLine } from '@/components/tank-gauge';

/**
 * One tank, in full: what the rod last read, what that converts to, how full
 * that leaves it, and — for the roles allowed to see cost — what the fuel in it
 * is worth.
 */
export function TankCard({ tank, isAdmin, canReturn = false }: { tank: TankDetail; isAdmin: boolean; canReturn?: boolean }) {
  const { t, lang } = useLang();
  const fill = tank.fillPct ?? 0;
  const tone = tank.fillPct === null ? 'neutral' : fill < 15 ? 'breach' : fill < 30 ? 'watch' : 'ok';

  return (
    <GlassCard className="space-y-4" lift={false}>
      <div className="flex items-start gap-4">
        <HourglassGauge
          code={tank.code}
          litres={Number(tank.lastDipLitres ?? 0)}
          capacity={Number(tank.capacityLitres)}
          fillPct={tank.fillPct}
          size="lg"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              {t('tank.tank')} {tank.code}
            </h3>
            {tank.status !== 'active' ? <Chip tone="watch">{tank.status}</Chip> : <Chip tone="ok">{tank.status}</Chip>}
            {tank.chartExpired ? (
              <Chip tone="breach" lang={lang}>
                {t('tank.chartExpires')} {tank.validityTo}
              </Chip>
            ) : tank.chartExpiringSoon ? (
              <Chip tone="watch" lang={lang}>
                {t('tank.chartExpires')} {tank.validityTo}
              </Chip>
            ) : null}
          </div>

          {tank.lastDipLitres ? (
            <>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight">
                {formatLitres(tank.lastDipLitres, lang)}
              </p>
              <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('tank.dip')} {formatDip(tank.lastDipMm ?? 0, lang)} · {t('stock.fill')}{' '}
                {formatNumber(tank.fillPct ?? 0, { lang, decimals: 1 })}%
              </p>
              <ExcessLine code={tank.code} litres={Number(tank.lastDipLitres)} capacity={Number(tank.capacityLitres)} />
            </>
          ) : (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }} lang={lang}>
              {t('common.empty')}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Row label={t('tank.capacity')} value={formatLitres(tank.capacityLitres, lang)} />
            <Row
              label={t('tank.ullage')}
              value={tank.ullageLitres ? formatLitres(tank.ullageLitres, lang) : '—'}
            />
            <Row
              label={t('stock.finalDip')}
              value={tank.finalDipMm ? formatDip(tank.finalDipMm, lang) : '—'}
            />
            <Row
              label={t('tank.lastDip')}
              value={tank.lastDipAt ? formatDateTime(tank.lastDipAt, lang) : '—'}
            />
            {/* Cost is admin and MD only; RLS returns nothing to a manager. */}
            {tank.avgCost ? <Row label={t('stock.avgCost')} value={formatBDT(tank.avgCost, lang)} /> : null}
            {tank.stockValue ? <Row label={t('stock.stockValue')} value={formatBDT(tank.stockValue, lang)} /> : null}
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
        {tank.calibrationRows > 0 ? (
          <Link
            href={`/stock/${tank.id}`}
            className="tap-target inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium"
            style={{ color: 'var(--color-accent)' }}
            lang={lang}
          >
            {t('stock.viewChart')}
            <span className="tabular">
              ({formatNumber(tank.calibrationRows, { lang })} {t('stock.chartRows')})
            </span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <Chip tone="breach" lang={lang}>
            {t('stock.notCalibrated')}
          </Chip>
        )}

        {isAdmin ? (
          <div className="ml-auto">
            <EquipmentControls kind="tank" id={tank.id} code={tank.code} status={tank.status} />
          </div>
        ) : null}
        {canReturn ? (
          <ReturnToPurchased tankId={tank.id} code={tank.code} lastDipMm={tank.lastDipMm} />
        ) : null}
      </div>
    </GlassCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: 'var(--text-faint)' }}>{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </>
  );
}
