'use client';

import { formatDate, formatLitres } from '@/lib/format';
import type { ReportRow } from '@/lib/reports/run';

/**
 * Tank stock & variance, one card per shift so each closing reads on its own.
 * Shortage is red, excess green, written in words rather than signs.
 */
export function StockVarianceView({ rows, lang }: { rows: ReportRow[]; lang: 'bn' | 'en' }) {
  const bn = lang === 'bn';
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
    ? ['ট্যাংক', 'শুরুতে ছিল', '+ রিফিল', '− ফেরত', '− বিক্রি', 'থাকার কথা', 'ডিপে মাপা', 'ফলাফল', 'কারণ']
    : ['Tank', 'Opening', '+ Received', '− Returned', '− Sold', 'Should be', 'Measured', 'Result', 'Reason'];

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
                      <th key={h} className={`border-b px-2 py-1.5 font-medium ${i === 0 || i === 8 ? 'text-left' : 'text-right'}`} style={{ borderColor: 'var(--hairline)' }} lang={lang}>
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
