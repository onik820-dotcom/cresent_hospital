'use client';

import { Banknote, Droplets, Fuel, HandCoins, Receipt, Truck, Wallet } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatLitres, formatNumber } from '@/lib/format';
import { CardTitle, CardValue, GlassCard, Muted } from '@/components/ui/glass';
import type { DashboardKpis } from '@/lib/data/dashboard';

/**
 * The same figures on every dashboard that is allowed to see them.
 *
 * Profit appears only when the database sent it. A manager's response has no
 * profit key at all, so there is nothing for a browser to reveal.
 */
export function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  const { t, lang } = useLang();

  /** A figure the page has not received yet must never crash the dashboard. */
  const sh = kpis.shiftType === 'night' ? (lang === 'bn' ? 'রাতের শিফট' : 'night shift') : kpis.shiftType === 'day' ? (lang === 'bn' ? 'দিনের শিফট' : 'day shift') : null;
  const tag = (s: string) => (sh ? `${s} · ${sh}` : s);
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };


  return (
    <div className="space-y-3">
      {/* One grid for all cards: two columns on a phone, four on a PC, so no
          row ever leaves a bare half-empty stretch on a wide screen. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Banknote}
          title={tag(t('kpi.todaySales'))}
          value={formatBDT(num(kpis.todaySales).toFixed(2), lang)}
          hint={`${formatLitres(num(kpis.todayLitres).toFixed(3), lang)} ${lang === 'bn' ? 'বিক্রি' : 'sold'}`}
        />
        <Kpi
          icon={Wallet}
          title={tag(lang === 'bn' ? 'নগদ বিক্রির টাকা' : 'Cash sale amount')}
          value={formatBDT(num(kpis.cashSaleToday).toFixed(2), lang)}
          hint={lang === 'bn' ? 'আজ নগদে বিক্রি' : "settled cash today"}
        />
        <Kpi
          icon={HandCoins}
          title={t('kpi.duesOutstanding')}
          value={formatBDT(num(kpis.duesOutstanding).toFixed(2), lang)}
          hint={
            kpis.partiesOverLimit > 0
              ? `${formatNumber(kpis.partiesOverLimit, { lang })} ${
                  lang === 'bn' ? 'পার্টি সীমার বাইরে' : 'past their limit'
                }`
              : undefined
          }
          tone={kpis.partiesOverLimit > 0 ? 'breach' : undefined}
        />
        <Kpi
          icon={Fuel}
          title={lang === 'bn' ? 'তেলের মজুদ' : 'Oil stock'}
          value={formatLitres(num(kpis.stockLitres).toFixed(3), lang)}
          hint={
            kpis.daysCover === null
              ? undefined
              : `${formatNumber(kpis.daysCover, { lang, decimals: 1 })} ${
                  lang === 'bn' ? 'দিন চলবে' : 'days of cover'
                }`
          }
        />
        {/* The same smaller cards for everybody who can see this page. */}
        <Small


          icon={Droplets}
          title={tag(lang === 'bn' ? 'লুব্রিক্যান্ট বিক্রির টাকা' : 'Lubricant sell amount')}
          value={formatBDT(num(kpis.lubSaleToday).toFixed(2), lang)}
          hint={lang === 'bn' ? 'আজকের মবিল বিক্রি' : "today's lubricant sales"}
        />
        {/* Two independent measures of the same thing: tanker paperwork, and
            the rod's own before/after reading. Deliveries never write dips,
            so adding them cannot double-count. */}
        <Small
          icon={Truck}
          title={lang === 'bn' ? 'আজ ট্যাংকে রিফিল (সব শিফট)' : "Today's refill into tank · all shifts"}
          value={formatLitres(
            (num(kpis.todayRefillLitres) + num(kpis.dipRefillLitres)).toFixed(3),
            lang,
          )}
          hint={
            [
              kpis.todayRefillCount > 0
                ? `${formatNumber(kpis.todayRefillCount, { lang })} ${
                    lang === 'bn' ? 'টি ট্যাংকার এসেছে' : kpis.todayRefillCount === 1 ? 'tanker arrived' : 'tankers arrived'
                  }`
                : null,
              kpis.dipRefillTanks > 0
                ? `${formatLitres(num(kpis.dipRefillLitres).toFixed(3), lang)} ${
                    lang === 'bn' ? 'ডিপ অনুযায়ী' : 'measured by dip'
                  }`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || (lang === 'bn' ? 'আজ কোনো রিফিল নেই' : 'no refill today')
          }
        />

        {/* Today's money in from parties, and today's money out. */}
        <Small
          icon={HandCoins}
          title={tag(lang === 'bn' ? 'আজকের বাকি আদায়' : 'Due collection today')}
          value={formatBDT(num(kpis.duesCollectedToday).toFixed(2), lang)}
          hint={
            num(kpis.duesCollectedCount) > 0
              ? `${formatNumber(kpis.duesCollectedCount, { lang })} ${
                  lang === 'bn' ? 'টি আদায়' : num(kpis.duesCollectedCount) === 1 ? 'payment' : 'payments'
                }`
              : lang === 'bn'
                ? 'আজ কোনো আদায় নেই'
                : 'nothing collected today'
          }
        />
        <Small
          icon={Receipt}
          title={tag(lang === 'bn' ? 'আজকের খরচ' : "Today's expenses")}
          value={formatBDT(num(kpis.expensesToday).toFixed(2), lang)}
          hint={
            num(kpis.expensesTodayCount) > 0
              ? `${formatNumber(kpis.expensesTodayCount, { lang })} ${
                  lang === 'bn' ? 'টি খরচ' : num(kpis.expensesTodayCount) === 1 ? 'entry' : 'entries'
                }`
              : lang === 'bn'
                ? 'আজ কোনো খরচ নেই'
                : 'nothing spent today'
          }
        />
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  title,
  value,
  hint,
  tone,
}: {
  icon: typeof Fuel;
  title: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'breach';
}) {
  const { lang } = useLang();
  return (
    <GlassCard>
      <CardTitle className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden />
        {title}
      </CardTitle>
      <CardValue className={`break-words text-xl sm:text-2xl lg:text-3xl ${tone ? `state-${tone}` : ''}`}>{value}</CardValue>
      {hint ? <Muted lang={lang}>{hint}</Muted> : null}
    </GlassCard>
  );
}

function Small({
  icon: Icon,
  title,
  value,
  hint,
  tone,
}: {
  icon?: typeof Fuel;
  title: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'breach';
}) {
  const { lang } = useLang();
  return (
    <GlassCard lift={false}>
      <CardTitle className="flex items-center gap-1.5 text-xs">
        {Icon ? (
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden />
        ) : null}
        {title}
      </CardTitle>
      <p className={`tabular mt-1 break-words text-lg font-semibold tracking-tight sm:text-xl ${tone ? `state-${tone}` : ''}`}>
        {value}
      </p>
      {hint ? <Muted lang={lang}>{hint}</Muted> : null}
    </GlassCard>
  );
}
