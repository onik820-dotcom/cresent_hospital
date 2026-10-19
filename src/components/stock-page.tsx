'use client';

import { useEffect, useState } from 'react';
import { Gauge, Truck } from 'lucide-react';
import { getPurchasedOilLitres } from '@/lib/data/purchased-oil';
import { useLang } from '@/lib/i18n/provider';
import { formatNumber } from '@/lib/format';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { TankCard } from '@/components/stock/tank-card';
import { DipConverter } from '@/components/stock/dip-converter';
import { EquipmentControls } from '@/components/stock/equipment-controls';
import { AddDispenserForm, AddTankForm } from '@/components/stock/add-equipment';
import type { DispenserDetail, TankDetail } from '@/lib/data/stock';

export function StockPage({
  tanks,
  dispensers,
  isAdmin,
}: {
  tanks: TankDetail[];
  dispensers: DispenserDetail[];
  isAdmin: boolean;
}) {
  const { t, lang } = useLang();
  // Oil purchases are held on the books until a refill moves them into T1/T2;
  // that holding record is never shown as a tank.
  const purchased = tanks.find((tank) => tank.code === 'TRUCK');
  const [exactPurchased, setExactPurchased] = useState<number | null>(null);
  useEffect(() => {
    getPurchasedOilLitres().then(setExactPurchased);
  }, [tanks]);
  tanks = tanks.filter((tank) => tank.code !== 'TRUCK');
  const calibrated = tanks.filter((tank) => tank.calibrationRows > 0 && tank.finalDipMm);

  const tankTotal = tanks.reduce((s, tk) => s + (Number(tk.lastDipLitres) || 0), 0);
  const purchasedLeft = exactPurchased ?? (Number(purchased?.lastDipLitres) || 0);
  const overall = tankTotal + purchasedLeft;
  const bn = lang === 'bn';

  return (
    <div className="space-y-6">
      <GlassCard lift={false} className="space-y-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight" lang={lang}>{bn ? 'মোট তেল মজুদ' : 'Overall oil stock'}</h2>
        </div>
        <p className="tabular text-3xl font-semibold tracking-tight">{formatNumber(overall, { lang, decimals: 3 })} L</p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {tanks.map((tk) => (
            <div key={tk.id}>
              <Muted>{tk.code}</Muted>
              <p className="tabular font-semibold">{formatNumber(Number(tk.lastDipLitres) || 0, { lang, decimals: 3 })} L</p>
            </div>
          ))}
          <div>
            <Muted lang={lang}>{bn ? 'কেনা তেল' : 'Purchased oil'}</Muted>
            <p className="tabular font-semibold">{formatNumber(purchasedLeft, { lang, decimals: 3 })} L</p>
          </div>
        </div>
      </GlassCard>
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {t('stock.tankStock')}
          </h2>
          {isAdmin ? (
            <div className="ml-auto">
              <AddTankForm />
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {tanks.map((tank) => (
            <TankCard key={tank.id} tank={tank} isAdmin={isAdmin} />
          ))}
        </div>
      </section>

      {calibrated.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {t('stock.convert')}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {calibrated.map((tank) => (
              <DipConverter
                key={tank.id}
                tankId={tank.id}
                tankCode={tank.code}
                finalDipMm={tank.finalDipMm}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {t('stock.dispensers')}
          </h2>
          {isAdmin ? (
            <div className="ml-auto">
              <AddDispenserForm tanks={tanks.filter((tk) => tk.status !== 'removed').map((tk) => ({ id: tk.id, code: tk.code }))} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dispensers.map((dispenser) => (
            <GlassCard key={dispenser.id} className="space-y-2" lift={false}>
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
                <span className="text-sm font-semibold tracking-tight">{dispenser.code}</span>
                <Chip tone={dispenser.status === 'active' ? 'ok' : 'watch'} className="ml-auto">
                  {dispenser.status}
                </Chip>
              </div>

              <Muted className="tabular">
                {t('tank.tank')} {dispenser.tankCode} · {formatNumber(dispenser.nozzleCount, { lang })}{' '}
                {t('stock.nozzles')} · {formatNumber(dispenser.meterDigits, { lang })} {t('stock.digits')}
              </Muted>
              <Muted className="tabular">
                {t('stock.maxFlow')} {formatNumber(dispenser.maxFlowLpm, { lang, decimals: 0 })} L/min
              </Muted>

              {isAdmin ? (
                <EquipmentControls
                  kind="dispenser"
                  id={dispenser.id}
                  code={dispenser.code}
                  status={dispenser.status}
                />
              ) : null}
            </GlassCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {lang === 'bn' ? 'কেনা তেল' : 'Purchased oil'}
        </h2>
        <GlassCard lift={false} className="space-y-1">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            <Muted lang={lang}>
              {lang === 'bn' ? 'কেনা হয়েছে, এখনও ট্যাংকে দেওয়া হয়নি' : 'Bought, not yet refilled into the tanks'}
            </Muted>
          </div>
          <p className="tabular text-2xl font-semibold tracking-tight">
            {formatNumber(exactPurchased ?? purchased?.lastDipLitres ?? '0', { lang, decimals: 3 })} L
          </p>
          {isAdmin && purchased?.stockValue ? (
            <Muted className="tabular">
              ৳{formatNumber(
                exactPurchased !== null && Number(purchased.lastDipLitres) > 0
                  ? ((Number(purchased.stockValue) / Number(purchased.lastDipLitres)) * exactPurchased).toFixed(2)
                  : purchased.stockValue,
                { lang, decimals: 2 },
              )}
            </Muted>
          ) : null}
        </GlassCard>
      </section>
    </div>
  );
}
