'use client';

import { formatDate, formatLitres, formatPercent } from '@/lib/format';
import { stockLight, useThresholds, type Thresholds, type TrafficLight } from '@/lib/data/thresholds';
import type { ReportRow } from '@/lib/reports/run';

const LIGHT_STYLE: Record<TrafficLight, { dot: string; cls: string }> = {
  green: { dot: '●', cls: 'state-ok' },
  yellow: { dot: '●', cls: 'state-watch' },
  red: { dot: '●', cls: 'state-breach' },
};

/**
 * Green / yellow / red, from the limits on Settings → Calculation thresholds.
 * Red follows the database's own verdict (it knows the litre floor); yellow is
 * the warning band below it.
 */
function Light({ row, t, lang }: { row: ReportRow; t: Thresholds; lang: 'bn' | 'en' }) {
  const light = stockLight(row.variance_pct as string | null, Number(row.variance_flagged) === 1, t, row.variance_litres as string | null);
  const style = LIGHT_STYLE[light];
  const label = { green: lang === 'bn' ? 'সবুজ' : 'Green', yellow: lang === 'bn' ? 'হলুদ' : 'Yellow', red: lang === 'bn' ? 'লাল' : 'Red' }[light];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${style.cls}`} title={label}>
      <span aria-hidden>{style.dot}</span>
      <span className="sr-only">{label}</span>
      {row.variance_pct === null || row.variance_pct === undefined ? '—' : formatPercent(String(row.variance_pct), lang)}
    </span>
  );
}

/**
 * Tank stock & variance, one card per shift so each closing reads on its own.
 * Shortage is red, excess green, written in words rather than signs.
 */
export function StockVarianceView({ rows, lang }: { rows: ReportRow[]; lang: 'bn' | 'en' }) {
  const bn = lang === 'bn';
  const thresholds = useThresholds();
  const groups: { key: string; date: string; shift: string; rows: ReportRow[] }[] = [];
  for (const row of rows) {
    const key = `${row.shift_date}|${row.shift_type}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, date: String(row.shift_date ?? ''), shift: String(row.shift_type ?? ''), rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }

  const L = (v: unknown) => formatLitres(v === null || v === undefined || v === '' ? '0' : String(v), lang);
  const num = (v: unknown) => Number(v) || 0;

  const head = bn
    ? ['ট্যাংক', 'শুরুতে ছিল', '+ রিফিল', '− ফেরত', '− বিক্রি', 'থাকার কথা', 'ডিপে মাপা', 'ফলাফল', 'গরমিল %', 'কারণ']
    : ['Tank', 'Opening', '+ Received', '− Returned', '− Sold', 'Should be', 'Measured', 'Result', 'Variance %', 'Reason'];

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const net = g.rows.reduce((s, r) => s + num(r.variance_litres), 0);
        return (
          <section key={g.key} className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-semibold" lang={lang}>
                {formatDate(g.date, lang)} ·{' '}
                {g.shift === 'night' ? (bn ? 'রাতের শিফট' : 'Night shift') : bn ? 'দিনের শিফট' : 'Day shift'}
              </h3>
              <Result value={net} lang={lang} className="ml-auto text-xs" prefix={bn ? 'মোট: ' : 'Total: '} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    {head.map((h, i) => (
                      <th key={h} className={`border-b px-2 py-1.5 font-medium ${i === 0 || i === 9 ? 'text-left' : 'text-right'}`} style={{ borderColor: 'var(--hairline)' }} lang={lang}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-2 py-1.5 font-semibold">{String(r.tank_code)}</td>
                      <td className="tabular px-2 py-1.5 text-right">{L(r.book_opening)}</td>
                      <td className="tabular px-2 py-1.5 text-right">{num(r.refill_litres) ? L(r.refill_litres) : '—'}</td>
                      <td className="tabular px-2 py-1.5 text-right">{num(r.returned_litres) ? L(r.returned_litres) : '—'}</td>
                      <td className="tabular px-2 py-1.5 text-right">{num(r.sold_from_tank) ? L(r.sold_from_tank) : '—'}</td>
                      <td className="tabular px-2 py-1.5 text-right">{L(r.book_closing)}</td>
                      <td className="tabular px-2 py-1.5 text-right font-medium">{L(r.physical_closing)}</td>
                      <td className="tabular px-2 py-1.5 text-right"><Result value={num(r.variance_litres)} lang={lang} /></td>
                      <td className="tabular px-2 py-1.5 text-right"><Light row={r} t={thresholds} lang={lang} /></td>
                      <td className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>{r.variance_reason ? String(r.variance_reason) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>
        {bn
          ? 'থাকার কথা = শুরুতে ছিল + রিফিল − ফেরত − বিক্রি। ফলাফল = ডিপে মাপা − থাকার কথা।'
          : 'Should be = Opening + Received − Returned − Sold. Result = Measured − Should be.'}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>
        <span className="state-ok">●</span> {bn ? 'সবুজ' : 'Green'} &lt; {thresholds.stockVarianceWarnPct}% ·{' '}
        <span className="state-watch">●</span> {bn ? 'হলুদ' : 'Yellow'} {thresholds.stockVarianceWarnPct}–{thresholds.stockVarianceAlertPct}% ·{' '}
        <span className="state-breach">●</span> {bn ? 'লাল' : 'Red'} &gt; {thresholds.stockVarianceAlertPct}%{' '}
        {bn
          ? `(বিক্রির শতাংশ; ${thresholds.varianceFloorLitres} লিটার পর্যন্ত গরমিল গণ্য নয় — সেটিংসে বদলানো যায়)`
          : `(of litres sold; gaps up to ${thresholds.varianceFloorLitres} L are ignored — set in Settings)`}
      </p>
    </div>
  );
}

function Result({ value, lang, className = '', prefix = '' }: { value: number; lang: 'bn' | 'en'; className?: string; prefix?: string }) {
  const bn = lang === 'bn';
  const abs = formatLitres(Math.abs(value).toFixed(3), lang);
  if (Math.abs(value) < 0.5) {
    return <span className={className} style={{ color: 'var(--text-muted)' }} lang={lang}>{prefix}{bn ? 'ঠিক আছে' : 'Balanced'}</span>;
  }
  return value < 0 ? (
    <span className={`state-breach font-semibold ${className}`} lang={lang}>{prefix}{bn ? 'কম' : 'Short'} {abs}</span>
  ) : (
    <span className={`state-ok font-semibold ${className}`} lang={lang}>{prefix}{bn ? 'বেশি' : 'Extra'} {abs}</span>
  );
}
