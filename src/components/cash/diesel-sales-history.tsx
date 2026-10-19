'use client';

import { AdminDelete } from '@/components/admin-delete';
import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { businessDate, formatBDT, formatDateTime, formatNumber } from '@/lib/format';
import { sum } from '@/lib/calc/decimal';
import { Chip, EmptyState, GlassCard, Muted } from '@/components/ui/glass';
import type { DieselSaleRow } from '@/lib/data/diesel-sales';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

const PERIODS: Period[] = ['day', 'week', 'month', 'year', 'all'];

function label(period: Period, lang: 'bn' | 'en'): string {
  const bn: Record<Period, string> = {
    day: 'আজ',
    week: 'এ সপ্তাহ',
    month: 'এ মাস',
    year: 'এ বছর',
    all: 'সব',
  };
  const en: Record<Period, string> = {
    day: 'Today',
    week: 'This week',
    month: 'This month',
    year: 'This year',
    all: 'All',
  };
  return lang === 'bn' ? bn[period] : en[period];
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inPeriod(rowDate: string, period: Period, today: string): boolean {
  if (period === 'all') return true;
  if (period === 'day') return rowDate === today;
  if (period === 'week') return rowDate >= shiftDays(today, -6) && rowDate <= today;
  if (period === 'month') return rowDate.slice(0, 7) === today.slice(0, 7);
  return rowDate.slice(0, 4) === today.slice(0, 4);
}

/**
 * The whole diesel sale history, filtered to a day, a week, a month or a year,
 * and printable exactly as it reads on screen.
 */
export function DieselSalesHistory({ rows }: { rows: DieselSaleRow[] }) {
  const { t, lang } = useLang();
  const [period, setPeriod] = useState<Period>('month');
  const today = businessDate();

  const filtered = useMemo(
    () => rows.filter((r) => inPeriod(businessDate(new Date(r.soldAt)), period, today)),
    [rows, period, today],
  );

  const total = sum(filtered.map((r) => r.amount));
  const cashTotal = sum(filtered.filter((r) => r.settlement === 'cash').map((r) => r.amount));
  const dueTotal = sum(filtered.filter((r) => r.settlement === 'credit').map((r) => r.amount));
  const pendingTotal = sum(filtered.filter((r) => r.settlement === 'pending').map((r) => r.amount));

  return (
    <section className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2
          className="text-sm font-semibold tracking-tight"
          style={{ color: 'var(--text-muted)' }}
          lang={lang}
        >
          {lang === 'bn' ? 'ডিজেল বিক্রির ইতিহাস' : 'Diesel sales history'}
        </h2>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className="tap-target rounded-lg px-2.5 py-1 text-[11px] font-medium"
              style={
                period === p
                  ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }
                  : { color: 'var(--text-faint)' }
              }
              lang={lang}
            >
              {label(p, lang)}
            </button>
          ))}

          <button
            type="button"
            onClick={() => window.print()}
            className="tap-target ml-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--color-accent)', color: 'white' }}
            lang={lang}
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            {lang === 'bn' ? 'প্রিন্ট' : 'Print'}
          </button>
        </div>
      </div>

      <GlassCard lift={false} className="space-y-3">
        <div className="print-sheet">
          <header className="print-only mb-3 text-center">
            <p className="text-sm font-semibold">J.H.M. Filling Station</p>
            <p className="text-xs">
              {lang === 'bn' ? 'ডিজেল বিক্রির ইতিহাস' : 'Diesel sales history'} ·{' '}
              {label(period, lang)}
            </p>
          </header>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label={lang === 'bn' ? 'মোট বিক্রি' : 'Total sold'} value={formatBDT(total, lang)} strong />
            <Figure label={t('cash.sales')} value={formatBDT(cashTotal, lang)} />
            <Figure label={lang === 'bn' ? 'বাকিতে' : 'On due'} value={formatBDT(dueTotal, lang)} />
            <Figure
              label={lang === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Awaiting approval'}
              value={formatBDT(pendingTotal, lang)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title={t('common.empty')}
                hint={
                  lang === 'bn'
                    ? 'এই সময়ের মধ্যে কোনো ডিজেল বিক্রি নেই।'
                    : 'No diesel sales were recorded in this period.'
                }
              />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    <Th>{lang === 'bn' ? 'সময়' : 'When'}</Th>
                    <Th>{lang === 'bn' ? 'মেশিন' : 'Machine'}</Th>
                    <Th>{lang === 'bn' ? 'রিডিং' : 'Reading'}</Th>
                    <Th>{lang === 'bn' ? 'টাকা' : 'Amount'}</Th>
                    <Th>{lang === 'bn' ? 'ধরন' : 'Settlement'}</Th>
                    <Th>{lang === 'bn' ? 'পার্টি' : 'Party'}</Th>
                    <Th>{lang === 'bn' ? 'নিয়েছেন' : 'Recorded by'}</Th>
                    <Th>{lang === 'bn' ? 'অনুমোদন' : 'Approved by'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                      <Td><AdminDelete table="meter_readings" id={r.id} /> {formatDateTime(r.soldAt, lang)}</Td>
                      <Td>
                        {r.machine}
                        {r.nozzleNo === null ? '' : `·${formatNumber(r.nozzleNo, { lang })}`}
                      </Td>
                      <Td className="tabular">{formatNumber(r.reading, { lang, decimals: 2 })}</Td>
                      <Td className="tabular">{formatBDT(r.amount, lang)}</Td>
                      <Td>
                        <Chip
                          tone={
                            r.settlement === 'cash'
                              ? 'ok'
                              : r.settlement === 'credit'
                                ? 'watch'
                                : 'neutral'
                          }
                          lang={lang}
                        >
                          {r.settlement === 'cash'
                            ? lang === 'bn'
                              ? 'নগদ'
                              : 'Cash'
                            : r.settlement === 'credit'
                              ? lang === 'bn'
                                ? 'বাকি'
                                : 'Due'
                              : lang === 'bn'
                                ? 'অপেক্ষায়'
                                : 'Pending'}
                        </Chip>
                      </Td>
                      <Td>{r.partyName ?? '—'}</Td>
                      <Td>{r.recordedBy ?? '—'}</Td>
                      <Td>{r.approvedBy ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Muted className="mt-2" lang={lang}>
            {lang === 'bn'
              ? `${formatNumber(filtered.length, { lang })} টি বিক্রি দেখানো হচ্ছে।`
              : `${filtered.length} sales shown.`}
          </Muted>
        </div>
      </GlassCard>
    </section>
  );
}

function Figure({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { lang } = useLang();
  return (
    <div>
      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }} lang={lang}>
        {l}
      </p>
      <p className={`tabular text-sm ${strong ? 'font-semibold' : ''}`}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  return (
    <th className="px-2 py-1.5 text-[11px] font-medium" lang={lang}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className ?? ''}`}>{children}</td>;
}
