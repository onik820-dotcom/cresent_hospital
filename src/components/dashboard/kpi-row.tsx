'use client';

import { useEffect, useState } from 'react';
import { Banknote, CalendarClock, ChevronDown, Droplets, Fuel, Gauge, HandCoins, Truck, Wallet } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatLitres, formatNumber } from '@/lib/format';
import { CardTitle, CardValue, GlassCard, Muted } from '@/components/ui/glass';
import type { DashboardKpis } from '@/lib/data/dashboard';

const EXPANDED_KEY = 'jhm.kpi.expanded';

/**
 * The same figures on every dashboard that is allowed to see them.
 *
 * Profit appears only when the database sent it. A manager's response has no
 * profit key at all, so there is nothing for a browser to reveal.
 */
export function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  const { t, lang } = useLang();
  const bn = lang === 'bn';
  const [expanded, setExpanded] = useState(false);

  // Remember whether this device likes the extra cards open.
  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem(EXPANDED_KEY) === '1');
    } catch {
      /* private browsing */
    }
  }, []);
  function toggle() {
    setExpanded((open) => {
      try {
        window.localStorage.setItem(EXPANDED_KEY, open ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !open;
    });
  }

  /** A figure the page has not received yet must never crash the dashboard. */
  const sh = kpis.shiftType === 'night' ? (bn ? 'রাতের শিফট' : 'night shift') : kpis.shiftType === 'day' ? (bn ? 'দিনের শিফট' : 'day shift') : null;
  const tag = (s: string) => (sh ? `${s} · ${sh}` : s);
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const drawer = kpis.cashInHand === null ? null : num(kpis.cashInHand);

  return (
    <div className="space-y-3">
      {/* The four that answer "how is today going?" — the question asked every
          hour. Two columns on a phone, four on a PC. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={bn ? 'আজকের মূল হিসাব' : 'Key figures today'}>
        <Kpi
          icon={Banknote}
          title={tag(t('kpi.todaySales'))}
          value={formatBDT(num(kpis.todaySales).toFixed(2), lang)}
          hint={`${bn ? 'নগদ' : 'Cash'} ${formatBDT(num(kpis.cashSaleToday).toFixed(2), lang)}`}
        />
        <Kpi
          icon={Gauge}
          title={tag(bn ? 'বিক্রিত লিটার' : 'Litres sold')}
          value={formatLitres(num(kpis.todayLitres).toFixed(3), lang)}
          hint={bn ? 'আজ মিটার থেকে' : 'from the meters today'}
        />
        <Kpi
          icon={Wallet}
          title={bn ? 'ড্রয়ারে নগদ' : 'Cash in drawer'}
          value={drawer === null ? '—' : formatBDT(drawer.toFixed(2), lang)}
          hint={
            drawer === null
              ? bn
                ? 'প্রথম শিফট বন্ধ হওয়ার পর দেখা যাবে'
                : 'Shows after the first shift is closed'
              : `${bn ? 'আদায়' : 'Dues in'} ${formatBDT(num(kpis.duesCollectedToday).toFixed(2), lang)} · ${
                  bn ? 'খরচ' : 'Spent'
                } ${formatBDT(num(kpis.expensesToday).toFixed(2), lang)}`
          }
        />
        <Kpi
          icon={HandCoins}
          title={t('kpi.duesOutstanding')}
          value={formatBDT(num(kpis.duesOutstanding).toFixed(2), lang)}
          hint={
            kpis.partiesOverLimit > 0
              ? `${formatNumber(kpis.partiesOverLimit, { lang })} ${bn ? 'পার্টি সীমার বাইরে' : 'past their limit'}`
              : undefined
          }
          tone={kpis.partiesOverLimit > 0 ? 'breach' : undefined}
        />
      </section>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="kpi-secondary"
          lang={lang}
          className="tap-target inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          {expanded ? (bn ? 'কম দেখুন' : 'See less') : bn ? 'আরও দেখুন' : 'See more'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>

      {/* Planning figures. They can stay folded away during the shift. */}
      {expanded ? (
        <section id="kpi-secondary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Small
            icon={Droplets}
            title={tag(bn ? 'লুব্রিক্যান্ট বিক্রি' : 'Lubricant sales')}
            value={formatBDT(num(kpis.lubSaleToday).toFixed(2), lang)}
            hint={bn ? 'আজকের মবিল বিক্রি' : "today's lubricant sales"}
          />
          <Small
            icon={Fuel}
            title={bn ? 'ট্যাংকে মজুদ' : 'Tank stock level'}
            value={formatLitres(num(kpis.stockLitres).toFixed(3), lang)}
          />
          <Small
            icon={CalendarClock}
            title={bn ? 'মজুদ কতদিন চলবে' : 'Days of stock cover'}
            value={
              kpis.daysCover === null
                ? '—'
                : `${formatNumber(kpis.daysCover, { lang, decimals: 1 })} ${bn ? 'দিন' : 'days'}`
            }
            hint={kpis.daysCover === null ? (bn ? 'এখনো বিক্রি নেই' : 'nothing sold yet') : undefined}
          />
          {/* Two independent measures of the same thing: tanker paperwork, and
              the rod's own before/after reading. Deliveries never write dips,
              so adding them cannot double-count. */}
          <Small
            icon={Truck}
            title={bn ? 'আজ রিফিল (সব শিফট)' : "Today's refills · all shifts"}
            value={
              kpis.todayRefillCount > 0
                ? `${formatNumber(kpis.todayRefillCount, { lang })} ${
                    bn ? 'টি ট্যাংকার' : kpis.todayRefillCount === 1 ? 'tanker' : 'tankers'
                  }`
                : bn
                  ? 'কোনো রিফিল নেই'
                  : 'No refill'
            }
            hint={
              [
                `${formatLitres((num(kpis.todayRefillLitres) + num(kpis.dipRefillLitres)).toFixed(3), lang)} ${
                  bn ? 'ট্যাংকে' : 'into tanks'
                }`,
                kpis.dipRefillTanks > 0
                  ? `${formatLitres(num(kpis.dipRefillLitres).toFixed(3), lang)} ${bn ? 'ডিপ অনুযায়ী' : 'measured by dip'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
            }
          />
        </section>
      ) : null}
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
