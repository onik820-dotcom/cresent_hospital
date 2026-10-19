'use client';

import { useRouter } from '@/lib/compat'; import { useSearch } from '@tanstack/react-router';
import { Download, FileDown, Printer } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatDate, formatDateTime, formatLitres, formatNumber, formatPercent } from '@/lib/format';
import { EmptyState, GlassCard, Muted } from '@/components/ui/glass';
import type { ReportColumn } from '@/lib/reports/registry';
import type { ReportRow } from '@/lib/reports/run';
import { DailySheet, type DailySheetData } from '@/components/reports/daily-sheet';
import { ProfitStatement, type ProfitStatementData } from '@/components/reports/profit-statement';
import { ShiftSalesSheet } from '@/components/cash/shift-sales-sheet';
import { StockVarianceView } from '@/components/reports/stock-variance-view';

interface ReportChoice {
  id: string;
  en: string;
  bn: string;
  descriptionEn: string;
  descriptionBn: string;
  period: 'range' | 'day';
  layout: string | null;
}

export function ReportsScreen({
  available,
  reportId,
  columns,
  rows,
  totals,
  sections,
  sheet,
  statement,
  error,
  from,
  to,
  period,
}: {
  available: ReportChoice[];
  reportId: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, string>;
  sections?: { en: string; bn: string; rows: ReportRow[]; totals: Record<string, string>; cols?: string[]; noteEn?: string; noteBn?: string }[] | null;
  sheet: unknown;
  statement: unknown;
  error: string | null;
  from: string;
  to: string;
  period: 'range' | 'day';
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const params = useSearch({ strict: false }) as Record<string, string | undefined>;

  const current = available.find((r) => r.id === reportId);

  function go(next: Partial<{ r: string; from: string; to: string }>) {
    const q = new URLSearchParams();
    for (const key of ['r', 'from', 'to'] as const) {
      const value = next[key] ?? params[key];
      if (typeof value === 'string' && value) q.set(key, value);
    }
    router.push(`/reports?${q.toString()}`);
  }

  const isTable = reportId !== 'shift-closing-sheet' && !sheet && !statement;

  /** Excel-readable file built from the rows on screen. */
  function downloadExcel() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = columns.map((c) => esc(lang === 'bn' ? c.bn : c.en)).join(',');
    const body = rows.map((row) =>
      columns.map((c) => esc(row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key]))).join(','),
    );
    const totalLine =
      Object.keys(totals).length > 0
        ? [columns.map((c, i) => esc(i === 0 ? 'Total' : (totals[c.key] ?? ''))).join(',')]
        : [];
    const csv = '\uFEFF' + [header, ...body, ...totalLine].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportId}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* ---- everything in this block comes off when the page prints ---- */}
      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {t('nav.reports')}
          </h1>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {period === 'range' ? (
              <label className="flex items-center gap-1.5 text-xs">
                <span style={{ color: 'var(--text-faint)' }} lang={lang}>
                  {lang === 'bn' ? 'থেকে' : 'From'}
                </span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => go({ from: e.target.value })}
                  className="tabular rounded-lg border bg-transparent px-2 py-1.5 text-xs outline-none"
                  style={{ borderColor: 'var(--hairline)' }}
                />
              </label>
            ) : null}

            <label className="flex items-center gap-1.5 text-xs">
              <span style={{ color: 'var(--text-faint)' }} lang={lang}>
                {period === 'range' ? (lang === 'bn' ? 'পর্যন্ত' : 'To') : lang === 'bn' ? 'তারিখ' : 'Date'}
              </span>
              <input
                type="date"
                value={to}
                onChange={(e) => go({ to: e.target.value })}
                className="tabular rounded-lg border bg-transparent px-2 py-1.5 text-xs outline-none"
                style={{ borderColor: 'var(--hairline)' }}
              />
            </label>

            {isTable ? (
              <button
                type="button"
                onClick={downloadExcel}
                disabled={rows.length === 0}
                className="tap-target flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                style={{ borderColor: 'var(--hairline)' }}
                lang={lang}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Excel
              </button>
            ) : null}

            {/* Both open the browser's print dialog, which is also how a PDF is made:
                the buttons differ so each is found where it is looked for. Everything
                outside the report itself is hidden by the print rules. */}
            <button
              type="button"
              onClick={() => window.print()}
              className="tap-target flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--hairline)' }}
              lang={lang}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              {lang === 'bn' ? 'প্রিন্ট' : 'Print'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title={lang === 'bn' ? 'প্রিন্টারের জায়গায় “Save as PDF” বাছুন' : 'In the print window, choose “Save as PDF” as the printer'}
              className="tap-target flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: 'var(--color-accent)', color: 'white' }}
              lang={lang}
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              {lang === 'bn' ? 'PDF এক্সপোর্ট' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* Quick ranges, because a month is the question people actually ask. */}
        {period === 'range' ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={lang === 'bn' ? 'সময়কাল' : 'Period'}>
            {(() => {
              const prev = previousMonth(to);
              const presets = [
                [lang === 'bn' ? 'আজ' : 'Today', to, to],
                [lang === 'bn' ? 'এ মাস' : 'This month', `${to.slice(0, 7)}-01`, to],
                [lang === 'bn' ? 'গত মাস' : 'Last month', prev.from, prev.to],
                [lang === 'bn' ? 'এ বছর' : 'This year', `${to.slice(0, 4)}-01-01`, to],
              ] as const;
              const matched = presets.some(([, f, t2]) => from === f && to === t2);
              return (
                <>
                  {presets.map(([label, f, t2]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => go({ from: f, to: t2 })}
                      aria-pressed={from === f && to === t2}
                      className="tap-target rounded-lg px-2.5 py-1 text-[11px] font-medium"
                      style={
                        from === f && to === t2
                          ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }
                          : { color: 'var(--text-faint)' }
                      }
                      lang={lang}
                    >
                      {label}
                    </button>
                  ))}
                  {/* Any other pair of dates, picked above, is a custom range. */}
                  <span
                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
                    style={!matched ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent)' } : { color: 'var(--text-faint)' }}
                    lang={lang}
                  >
                    {lang === 'bn' ? 'নিজের তারিখ' : 'Custom range'}
                  </span>
                </>
              );
            })()}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {available.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => go({ r: r.id })}
              lang={lang}
              className="tap-target rounded-lg px-3 py-1.5 text-xs font-medium"
              style={
                r.id === reportId
                  ? { background: 'var(--color-accent)', color: 'white' }
                  : { border: '1px solid var(--hairline)', color: 'var(--text-muted)' }
              }
            >
              {lang === 'bn' ? r.bn : r.en}
            </button>
          ))}
        </div>

        {current ? (
          <Muted lang={lang}>{lang === 'bn' ? current.descriptionBn : current.descriptionEn}</Muted>
        ) : null}
      </div>

      {error ? (
        <GlassCard lift={false}>
          <p className="state-breach text-sm">{error}</p>
        </GlassCard>
      ) : null}

      <GlassCard lift={false}>
        {reportId === 'shift-closing-sheet' ? (
          <ShiftSalesSheet from={from} to={to} embedded />
        ) : sheet ? (
          <DailySheet sheet={sheet as DailySheetData} />
        ) : statement ? (
          <ProfitStatement data={statement as ProfitStatementData} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('common.empty')}
            hint={
              lang === 'bn'
                ? 'এই সময়ের কোনো রেকর্ড নেই।'
                : 'Nothing was recorded in this period.'
            }
          />
        ) : (
          <div className="print-sheet">
            <header className="print-only mb-3 text-center">
              <h1 className="text-base font-bold">
                {lang === 'bn' ? 'জে.এইচ.এম. ফিলিং স্টেশন' : 'M/S. J.H.M. Filling Station'}
              </h1>
              <h2 className="text-sm font-semibold">
                {lang === 'bn' ? current?.bn : current?.en}
              </h2>
              <p className="tabular text-xs">
                {period === 'day'
                  ? formatDate(to, lang)
                  : `${formatDate(from, lang)} — ${formatDate(to, lang)}`}
              </p>
            </header>

            {reportId === 'stock-variance' ? <StockVarianceView rows={rows} lang={lang} /> : null}
            {(reportId === 'stock-variance' ? [] : (sections ?? [{ en: '', bn: '', rows, totals }])).map((sec, si) => (
            <div key={si} className={`overflow-x-auto ${sec.en ? (si > 0 ? 'mt-10 border-t-4 pt-6' : '') : ''}`} style={sec.en && si > 0 ? { borderColor: 'var(--hairline)' } : undefined}>
              {sec.en ? (
                <h3 className="mb-2 text-base font-semibold" lang={lang}>
                  {lang === 'bn' ? sec.bn : sec.en}
                </h3>
              ) : null}
              {sec.noteEn ? (
                <p className="mb-2 text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>
                  {lang === 'bn' ? sec.noteBn : sec.noteEn}
                </p>
              ) : null}
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    {(sec.cols ? columns.filter((c) => sec.cols!.includes(c.key)) : columns).map((c) => (
                      <th
                        key={c.key}
                        className={`border-b px-2 py-2 font-medium ${
                          isNumeric(c) ? 'text-right' : 'text-left'
                        }`}
                        style={{ borderColor: 'var(--hairline)' }}
                        lang={lang}
                      >
                        {lang === 'bn' ? c.bn : c.en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.length === 0 ? (
                    <tr><td colSpan={(sec.cols ? columns.filter((c) => sec.cols!.includes(c.key)) : columns).length} className="px-2 py-2" style={{ color: 'var(--text-faint)' }} lang={lang}>{lang === 'bn' ? 'কিছু নেই' : 'None in this period'}</td></tr>
                  ) : null}
                  {sec.rows.map((row, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                      {(sec.cols ? columns.filter((c) => sec.cols!.includes(c.key)) : columns).map((c) => (
                        <td
                          key={c.key}
                          className={`px-2 py-1.5 ${isNumeric(c) ? 'tabular text-right' : ''}`}
                        >
                          {render(row[c.key], c, lang)}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {Object.keys(sec.totals).length > 0 ? (
                    <tr className="border-t-2" style={{ borderColor: 'var(--text-muted)' }}>
                      {(sec.cols ? columns.filter((c) => sec.cols!.includes(c.key)) : columns).map((c, i) => (
                        <td
                          key={c.key}
                          className={`px-2 py-2 font-semibold ${isNumeric(c) ? 'tabular text-right' : ''}`}
                        >
                          {i === 0
                            ? lang === 'bn'
                              ? 'মোট'
                              : 'Total'
                            : sec.totals[c.key] !== undefined
                              ? render(sec.totals[c.key], c, lang)
                              : ''}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            ))}

            <Muted className="mt-2" lang={lang}>
              {formatNumber(rows.length, { lang })}{' '}
              {lang === 'bn' ? 'সারি' : rows.length === 1 ? 'row' : 'rows'}
            </Muted>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/** First and last day of the month before the one `day` (YYYY-MM-DD) falls in. */
function previousMonth(day: string): { from: string; to: string } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)); // 1-12
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const last = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const mm = String(prevMonth).padStart(2, '0');
  return { from: `${prevYear}-${mm}-01`, to: `${prevYear}-${mm}-${String(last).padStart(2, '0')}` };
}

function isNumeric(c: ReportColumn) {
  return c.kind === 'money' || c.kind === 'litres' || c.kind === 'number' || c.kind === 'percent';
}

function render(value: string | number | null | undefined, c: ReportColumn, lang: 'bn' | 'en') {
  if (value === null || value === undefined || value === '') return '—';
  switch (c.kind) {
    case 'money':
      return formatBDT(value, lang);
    case 'litres':
      return formatLitres(value, lang);
    case 'percent':
      return formatPercent(String(value), lang);
    case 'number':
      return formatNumber(value, { lang });
    case 'date':
      return formatDate(String(value), lang);
    case 'datetime':
      return formatDateTime(String(value), lang);
    default:
      return String(value);
  }
}
