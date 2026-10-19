'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatDate, formatLitres, formatNumber, formatTime } from '@/lib/format';
import { dec } from '@/lib/calc/decimal';
import { Muted } from '@/components/ui/glass';

/**
 * The Daily Sheet.
 *
 * A replica of the paper form the station already fills in by hand, for one
 * business day, ending in its five signature lines.
 *
 * WHAT IS CERTAIN AND WHAT IS NOT. The brief describes this as "a faithful
 * digital replica of the existing paper form, including all five signature
 * lines", and that sentence is the only written description of the form that
 * exists. The form itself has not been seen. Five signature lines is therefore
 * a fact; which five, their order, and the order of the sections above them
 * are not.
 *
 * So every figure here is computed and certain, and every *caption* comes from
 * settings.daily_sheet_labels — headings and all five signature lines, in both
 * languages. Correcting the sheet against the real form is an admin edit to
 * one row, not a code change. Until somebody confirms it, the sheet says so on
 * its own face rather than presenting a guess as a replica.
 */

type Json = Record<string, unknown>;

interface Bilingual {
  en?: string;
  bn?: string;
}

export interface DailySheetData extends Json {
  date: string;
  station: { name: string; name_bn: string | null; address: string; dealer_name: string };
  labels: {
    title?: Bilingual;
    meters?: Bilingual;
    tanks?: Bilingual;
    sales?: Bilingual;
    credit?: Bilingual;
    lubricants?: Bilingual;
    expenses?: Bilingual;
    cash?: Bilingual;
    signatures?: Bilingual;
    signature_lines?: Bilingual[];
    confirmed?: boolean;
  };
  shift_count: number;
  shifts: Array<Json>;
  meters: Array<Json>;
  tanks: Array<Json>;
  deliveries: Array<Json>;
  sales: Json;
  credit: Array<Json>;
  lubricants: Array<Json>;
  expenses: Array<Json>;
  cash: Array<Json>;
  /** The people who signed off the day's work; printed on the signature lines. */
  signed_by?: string[];
  shift_in_charge?: string[];
}

/**
 * The Daily Sheet, in two shapes of the same data.
 *
 * On a phone the paper form is unreadable — nine columns of figures in a
 * 390 px window — so under 768 px a short read-only card is shown instead. Both
 * are always in the page and CSS picks one, which also means printing from a
 * phone still produces the full paper form: print rules hide the card and show
 * the form whatever the screen size.
 *
 * The headings and signature captions on the form come from Settings → Report
 * labels. Whether they have been checked against the printed form is the
 * admin's business and is settled there, not announced on every report.
 */
export function DailySheet({ sheet }: { sheet: DailySheetData }) {
  return (
    <>
      <div className="sheet-mobile md:hidden">
        <MobileSheet sheet={sheet} />
      </div>
      <div className="sheet-paper hidden md:block">
        <PaperSheet sheet={sheet} />
      </div>
    </>
  );
}

function MobileSheet({ sheet }: { sheet: DailySheetData }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const s = (sheet.sales ?? {}) as Record<string, number | string>;
  const expenseTotal = sheet.expenses.reduce((a, e) => a.plus(dec(String(e.amount ?? 0))), dec(0)).toFixed(2);
  const counted = tot(sheet.cash, 'counted_cash');
  const variance = tot(sheet.cash, 'cash_variance');

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex items-baseline justify-between gap-3 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--hairline)' }}>
      <span style={{ color: 'var(--text-muted)' }} lang={lang}>{label}</span>
      <span className={`tabular ${strong ? 'text-base font-semibold' : 'font-medium'}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-base font-semibold tracking-tight" lang={lang}>
          {bn ? 'দৈনিক বিবরণী' : 'Daily sheet'}
        </h2>
        <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
          {formatDate(sheet.date, lang)}
          {sheet.shift_count > 0 ? ` · ${formatNumber(sheet.shift_count, { lang })} ${bn ? 'শিফট' : sheet.shift_count === 1 ? 'shift' : 'shifts'}` : ''}
        </p>
      </header>

      {sheet.shift_count === 0 ? (
        <p className="py-6 text-center text-sm" lang={lang}>
          {bn ? 'এই তারিখে কোনো শিফট বন্ধ হয়নি।' : 'No shift was closed on this date.'}
        </p>
      ) : (
        <>
          <div>
            <Row label={bn ? 'নিট লিটার' : 'Net litres'} value={formatLitres(String(s.net_litres ?? 0), lang)} />
            <Row label={bn ? 'জ্বালানি বিক্রি' : 'Fuel sales'} value={formatBDT(s.fuel_amount as number, lang)} />
            <Row label={bn ? 'লুব্রিকেন্ট বিক্রি' : 'Lubricant sales'} value={formatBDT(s.lubricant_amount as number, lang)} />
            <Row label={bn ? 'মোট বিক্রি' : 'Total sales'} value={formatBDT(s.total_amount as number, lang)} strong />
            <Row label={bn ? 'বাকি বিক্রি' : 'Credit sales'} value={formatBDT(s.credit_sales as number, lang)} />
            <Row label={bn ? 'নগদ বিক্রি' : 'Cash sales'} value={formatBDT(s.cash_sales as number, lang)} strong />
          </div>
          <div>
            <Row label={bn ? 'মোট খরচ' : 'Expenses'} value={formatBDT(expenseTotal, lang)} />
            <Row label={bn ? 'গোনা নগদ' : 'Cash counted'} value={formatBDT(counted, lang)} />
            <Row label={bn ? 'নগদ গরমিল' : 'Cash variance'} value={formatBDT(variance, lang, true)} strong />
          </div>
          {sheet.tanks.length > 0 ? (
            <div>
              {sheet.tanks.map((tk, i) => (
                <Row
                  key={i}
                  label={`${bn ? 'ট্যাংক' : 'Tank'} ${String(tk.tank_code ?? '')} · ${tk.shift_type === 'night' ? (bn ? 'রাত' : 'Night') : bn ? 'দিন' : 'Day'} · ${bn ? 'শেষ মজুদ' : 'closing'}`}
                  value={formatLitres(String(tk.physical_closing ?? tk.book_closing ?? 0), lang)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      <p className="text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>
        {bn
          ? 'সংক্ষিপ্ত দেখা। পূর্ণ ফর্ম দেখতে বা ছাপতে বড় পর্দায় খুলুন, অথবা ছাপুন — ছাপা কপিতে পূর্ণ ফর্মই আসে।'
          : 'A short read-only view. Open on a larger screen for the full form — printing always produces the full form.'}
      </p>
    </div>
  );
}

function PaperSheet({ sheet }: { sheet: DailySheetData }) {
  const { lang } = useLang();
  const L = (b?: Bilingual, fallback = '') => (b ? (lang === 'bn' ? (b.bn ?? b.en) : (b.en ?? b.bn)) ?? fallback : fallback);

  const labels = sheet.labels ?? {};
  const signatureLines = labels.signature_lines ?? [];
  const signedBy = sheet.signed_by ?? [];

  const s = (sheet.sales ?? {}) as Record<string, number | string>;
  const shiftLabel = (type: unknown) =>
    type === 'night' ? (lang === 'bn' ? 'রাত' : 'Night') : lang === 'bn' ? 'দিন' : 'Day';

  // Chairman expenses are counted with all other expenses in one book.
  const pumpExpenses = sheet.expenses.filter((e) => e.book !== 'own_use');
  const ownUseExpenses = sheet.expenses.filter((e) => e.book === 'own_use');

  return (
    <div className="print-sheet space-y-4 text-sm">
      {/* ---- masthead ---- */}
      <header className="print-block text-center">
        <h1 className="text-base font-bold tracking-tight">
          {lang === 'bn' && sheet.station.name_bn ? sheet.station.name_bn : sheet.station.name}
        </h1>
        <p className="text-xs">{sheet.station.address}</p>
        <p className="text-xs">
          {lang === 'bn' ? 'ডিলার' : 'Dealer'}: {sheet.station.dealer_name}
        </p>
        <h2 className="mt-2 text-sm font-semibold underline">
          {L(labels.title, lang === 'bn' ? 'দৈনিক বিবরণী' : 'Daily Sheet')}
        </h2>
        <p className="tabular mt-1 text-xs">
          {lang === 'bn' ? 'তারিখ' : 'Date'}: <strong>{formatDate(sheet.date, lang)}</strong>
          {sheet.shift_count > 0 ? (
            <>
              {'  ·  '}
              {lang === 'bn' ? 'শিফট' : 'Shifts'}: {formatNumber(sheet.shift_count, { lang })}
            </>
          ) : null}
        </p>
      </header>

      {sheet.shift_count === 0 ? (
        <p className="py-8 text-center text-sm" lang={lang}>
          {lang === 'bn'
            ? 'এই তারিখে কোনো শিফট বন্ধ হয়নি।'
            : 'No shift was closed on this date.'}
        </p>
      ) : null}

      {/* ---- 1. meters ---- */}
      {sheet.meters.length > 0 ? (
        <Section title={L(labels.meters, 'Meter readings')}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th>{lang === 'bn' ? 'মেশিন' : 'Machine'}</Th>
                <Th>{lang === 'bn' ? 'নজল' : 'Nozzle'}</Th>
                <Th>{lang === 'bn' ? 'শিফট' : 'Shift'}</Th>
                <Th right>{lang === 'bn' ? 'শুরুর রিডিং' : 'Opening'}</Th>
                <Th right>{lang === 'bn' ? 'শেষের রিডিং' : 'Closing'}</Th>
                <Th right>{lang === 'bn' ? 'লিটার' : 'Litres'}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.meters.map((m, i) => {
                const opening = m.opening as number | null;
                const closing = m.closing as number;
                const litres =
                  opening === null ? null : dec(closing).minus(dec(opening)).toFixed(2);
                return (
                  <tr key={i}>
                    <Td>{String(m.dispenser_code ?? '')}</Td>
                    <Td>{formatNumber(Number(m.nozzle_no ?? 0), { lang })}</Td>
                    <Td>{shiftLabel(m.shift_type)}</Td>
                    <Td right>{opening === null ? '—' : formatNumber(opening, { lang, decimals: 2 })}</Td>
                    <Td right>{formatNumber(closing, { lang, decimals: 2 })}</Td>
                    <Td right strong>
                      {litres === null ? '—' : formatNumber(litres, { lang, decimals: 2 })}
                    </Td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-foreground">
                <Td strong>{lang === 'bn' ? 'মোট' : 'Total'}</Td>
                <Td>{''}</Td>
                <Td>{''}</Td>
                <Td>{''}</Td>
                <Td>{''}</Td>
                <Td right strong>{formatNumber(sheet.meters.reduce((a, m) => m.opening === null || m.opening === undefined ? a : a.plus(dec(String(m.closing ?? 0)).minus(dec(String(m.opening)))), dec(0)).toFixed(2), { lang, decimals: 2 })}</Td>
              </tr>
            </tbody>
          </table>
        </Section>
      ) : null}

      {/* ---- 2. tanks ---- */}
      {sheet.tanks.length > 0 ? (
        <Section title={L(labels.tanks, 'Tank stock')}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th>{lang === 'bn' ? 'ট্যাংক' : 'Tank'}</Th>
                <Th>{lang === 'bn' ? 'শিফট' : 'Shift'}</Th>
                <Th right>{lang === 'bn' ? 'প্রারম্ভিক' : 'Opening'}</Th>
                <Th right>{lang === 'bn' ? 'গৃহীত' : 'Received'}</Th>
                <Th right>{lang === 'bn' ? 'ফেরত (ক্রয়ে)' : 'Returned'}</Th>
                <Th right>{lang === 'bn' ? 'বিক্রি' : 'Sold'}</Th>
                <Th right>{lang === 'bn' ? 'বই অনুযায়ী' : 'Book'}</Th>
                <Th right>{lang === 'bn' ? 'ডিপ (মিমি)' : 'Dip (mm)'}</Th>
                <Th right>{lang === 'bn' ? 'প্রকৃত' : 'Actual'}</Th>
                <Th right>{lang === 'bn' ? 'গরমিল' : 'Variance'}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.tanks.map((t, i) => (
                <tr key={i}>
                  <Td>{String(t.tank_code ?? '')}</Td>
                  <Td>{shiftLabel(t.shift_type)}</Td>
                  <Td right>{formatLitres(t.book_opening as number, lang)}</Td>
                  <Td right>{formatLitres(t.refill_litres as number, lang)}</Td>
                  <Td right>{formatLitres((t.returned_litres as number) ?? 0, lang)}</Td>
                  <Td right>{formatLitres(t.sold_from_tank as number, lang)}</Td>
                  <Td right>{formatLitres(t.book_closing as number, lang)}</Td>
                  <Td right>
                    {t.closing_dip_mm === null ? '—' : formatNumber(t.closing_dip_mm as number, { lang })}
                  </Td>
                  <Td right>{formatLitres(t.physical_closing as number, lang)}</Td>
                  <Td right strong={Boolean(t.variance_flagged)}>
                    {formatLitres(t.variance_litres as number, lang, true)}
                    {t.variance_flagged ? ' *' : ''}
                  </Td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground">
                <Td strong>{lang === 'bn' ? 'মোট' : 'Total'}</Td>
                <Td>{''}</Td>
                {['book_opening','refill_litres','returned_litres','sold_from_tank','book_closing'].map((k) => (
                  <Td key={k} right strong>{formatLitres(tot(sheet.tanks, k), lang)}</Td>
                ))}
                <Td>{''}</Td>
                <Td right strong>{formatLitres(tot(sheet.tanks, 'physical_closing'), lang)}</Td>
                <Td right strong>{formatLitres(tot(sheet.tanks, 'variance_litres'), lang, true)}</Td>
              </tr>
            </tbody>
          </table>
          {sheet.tanks.some((t) => t.variance_flagged) ? (
            <p className="mt-1 text-[10px]">
              {'* '}
              {sheet.tanks
                .filter((t) => t.variance_flagged && t.variance_reason)
                .map((t) => `${t.tank_code}: ${t.variance_reason}`)
                .join('  ·  ')}
            </p>
          ) : null}
        </Section>
      ) : null}

      {/* ---- tanker receipts ---- */}
      {sheet.deliveries.length > 0 ? (
        <Section
          title={
            lang === 'bn' ? 'ট্যাংকার গ্রহণ (মুভমেন্ট)' : 'Tanker receipts (movement)'
          }
        >
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th>{lang === 'bn' ? 'সময়' : 'Time'}</Th>
                <Th>{lang === 'bn' ? 'মুভমেন্ট' : 'Movement'}</Th>
                <Th>{lang === 'bn' ? 'চালান' : 'Challan'}</Th>
                <Th>{lang === 'bn' ? 'ট্রাক' : 'Truck'}</Th>
                <Th right>{lang === 'bn' ? 'ঘোষিত' : 'Declared'}</Th>
                <Th right>{lang === 'bn' ? 'গৃহীত' : 'Received'}</Th>
                <Th right>{lang === 'bn' ? 'ঘাটতি' : 'Shortage'}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.deliveries.map((d, i) => (
                <tr key={i}>
                  <Td>{formatTime(String(d.arrived_at), lang)}</Td>
                  <Td>
                    {d.movement === 'arrival'
                      ? lang === 'bn'
                        ? 'আগমন (ডিপো থেকে)'
                        : 'Arrival (from depot)'
                      : lang === 'bn'
                        ? 'খালাস (ট্যাংকে)'
                        : 'Unloading (into tank)'}
                  </Td>
                  <Td>{String(d.challan_no ?? '')}</Td>
                  <Td>{String(d.truck_reg ?? '')}</Td>
                  <Td right>{formatLitres(d.total_declared as number, lang)}</Td>
                  <Td right>{formatLitres(d.total_received as number, lang)}</Td>
                  <Td right>{formatLitres(d.total_shortage as number, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {/* ---- 3. sales summary ---- */}
      <Section title={L(labels.sales, 'Sales summary')}>
        <table className="w-full text-xs">
          <tbody>
            <Money label={lang === 'bn' ? 'মোট লিটার (গ্রস)' : 'Gross litres'} value={s.gross_litres} litres />
            <Money label={lang === 'bn' ? 'টেস্ট / পরিমাপ' : 'Test measure'} value={s.test_litres} litres />
            <Money label={lang === 'bn' ? 'নিট লিটার' : 'Net litres'} value={s.net_litres} litres strong />
            <Money label={lang === 'bn' ? 'বিক্রয় দর' : 'Rate per litre'} value={s.rate_per_litre} />
            <Money label={lang === 'bn' ? 'জ্বালানি বিক্রি' : 'Fuel sales'} value={s.fuel_amount} />
            <Money label={lang === 'bn' ? 'লুব্রিকেন্ট বিক্রি' : 'Lubricant sales'} value={s.lubricant_amount} />
            <Money label={lang === 'bn' ? 'মোট বিক্রি' : 'Total sales'} value={s.total_amount} strong />
            <Money label={lang === 'bn' ? 'বাদ: বাকি বিক্রি' : 'Less: credit sales'} value={s.credit_sales} />
            <Money label={lang === 'bn' ? 'নগদ বিক্রি' : 'Cash sales'} value={s.cash_sales} strong />
          </tbody>
        </table>
      </Section>

      {/* ---- 4. credit, party-wise ---- */}
      {sheet.credit.length > 0 ? (
        <Section title={L(labels.credit, 'Credit sales')}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th>{lang === 'bn' ? 'পার্টি' : 'Party'}</Th>
                <Th>{lang === 'bn' ? 'গাড়ি' : 'Vehicle'}</Th>
                <Th>{lang === 'bn' ? 'চালান' : 'Challan'}</Th>
                <Th right>{lang === 'bn' ? 'লিটার' : 'Litres'}</Th>
                <Th right>{lang === 'bn' ? 'দর' : 'Rate'}</Th>
                <Th right>{lang === 'bn' ? 'টাকা' : 'Amount'}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.credit.map((c, i) => (
                <tr key={i}>
                  <Td>
                    {lang === 'bn' && c.party_bn ? String(c.party_bn) : String(c.party ?? '')}
                    {c.over_limit ? ' *' : ''}
                  </Td>
                  <Td>{String(c.vehicle_no ?? '')}</Td>
                  <Td>{String(c.challan_no ?? '')}</Td>
                  <Td right>{c.litres === null ? '—' : formatLitres(c.litres as number, lang)}</Td>
                  <Td right>{c.rate === null ? '—' : formatBDT(c.rate as number, lang)}</Td>
                  <Td right strong>
                    {formatBDT(c.amount as number, lang)}
                  </Td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground">
                <Td strong>{lang === 'bn' ? 'মোট' : 'Total'}</Td>
                <Td>{''}</Td>
                <Td>{''}</Td>
                <Td right strong>{formatLitres(tot(sheet.credit, 'litres'), lang)}</Td>
                <Td>{''}</Td>
                <Td right strong>{formatBDT(tot(sheet.credit, 'amount'), lang)}</Td>
              </tr>
            </tbody>
          </table>
          {sheet.credit.some((c) => c.over_limit) ? (
            <p className="mt-1 text-[10px]" lang={lang}>
              {lang === 'bn'
                ? '* মালিকের অনুমোদনে ঋণসীমার বাইরে।'
                : '* allowed past the credit limit by the owner.'}
            </p>
          ) : null}
        </Section>
      ) : null}

      {/* ---- 5. lubricants ---- */}
      {sheet.lubricants.length > 0 ? (
        <Section title={L(labels.lubricants, 'Lubricants')}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th>{lang === 'bn' ? 'পণ্য' : 'Product'}</Th>
                <Th>{lang === 'bn' ? 'ধরন' : 'Movement'}</Th>
                <Th right>{lang === 'bn' ? 'পরিমাণ' : 'Quantity'}</Th>
                <Th right>{lang === 'bn' ? 'দর' : 'Rate'}</Th>
                <Th right>{lang === 'bn' ? 'মূল্য' : 'Value'}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.lubricants.map((l, i) => (
                <tr key={i}>
                  <Td>{lang === 'bn' && l.sku_bn ? String(l.sku_bn) : String(l.sku ?? '')}</Td>
                  <Td>
                    {l.txn_type === 'own_use'
                      ? lang === 'bn'
                        ? 'নিজস্ব ব্যবহার'
                        : 'Own use'
                      : lang === 'bn'
                        ? 'বিক্রয়'
                        : 'Sale'}
                    {l.vehicle_ref ? ` — ${String(l.vehicle_ref)}` : ''}
                  </Td>
                  <Td right>{formatLitres(l.qty as number, lang)}</Td>
                  <Td right>{formatBDT(l.rate as number, lang)}</Td>
                  <Td right strong>
                    {formatBDT(l.amount as number, lang)}
                  </Td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground">
                <Td strong>{lang === 'bn' ? 'মোট' : 'Total'}</Td>
                <Td>{''}</Td>
                <Td right strong>{formatLitres(tot(sheet.lubricants, 'qty'), lang)}</Td>
                <Td>{''}</Td>
                <Td right strong>{formatBDT(tot(sheet.lubricants, 'amount'), lang)}</Td>
              </tr>
            </tbody>
          </table>
          {sheet.lubricants.some((l) => l.txn_type === 'own_use') ? (
            <p className="mt-1 text-[10px]" lang={lang}>
              {lang === 'bn'
                ? 'নিজস্ব ব্যবহার ক্রয়মূল্যে খরচ হিসেবে বসেছে — বিক্রি নয়।'
                : 'Own use is booked as an expense at cost, not counted as a sale.'}
            </p>
          ) : null}
        </Section>
      ) : null}

      {/* ---- 6. expenses, two books ---- */}
      {sheet.expenses.length > 0 ? (
        <Section title={L(labels.expenses, 'Expenses')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <ExpenseBook
              title={lang === 'bn' ? 'পাম্পের খাতা' : 'Pump book'}
              rows={pumpExpenses}
            />
            {ownUseExpenses.length > 0 ? (
              <ExpenseBook
                title={lang === 'bn' ? 'নিজস্ব ব্যবহার' : 'Own use'}
                rows={ownUseExpenses}
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* ---- 7. the cash account ---- */}
      {sheet.cash.length > 0 ? (
        <Section title={L(labels.cash, 'Cash account')}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th>{lang === 'bn' ? 'শিফট' : 'Shift'}</Th>
                <Th right>{lang === 'bn' ? 'নগদ বিক্রি' : 'Cash sales'}</Th>
                <Th right>{lang === 'bn' ? 'বাকি আদায়' : 'Collected'}</Th>
                <Th right>{lang === 'bn' ? 'খরচ' : 'Expenses'}</Th>
                <Th right>{lang === 'bn' ? 'পেটি ক্যাশ ইন' : 'Petty cash in'}</Th>
                <Th right>{lang === 'bn' ? 'থাকার কথা' : 'Expected'}</Th>
                <Th right>{lang === 'bn' ? 'গোনা' : 'Counted'}</Th>
                <Th right>{lang === 'bn' ? 'গরমিল' : 'Variance'}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.cash.map((c, i) => (
                <tr key={i}>
                  <Td>{shiftLabel(c.shift_type)}</Td>
                  <Td right>{formatBDT(c.cash_sales as number, lang)}</Td>
                  <Td right>{formatBDT(c.dues_collected as number, lang)}</Td>
                  <Td right>{formatBDT(c.expenses_cash as number, lang)}</Td>
                  <Td right>{formatBDT((c.petty_in as number) ?? 0, lang)}</Td>
                  <Td right>{formatBDT(c.expected_cash as number, lang)}</Td>
                  <Td right strong>
                    {formatBDT(c.counted_cash as number, lang)}
                  </Td>
                  <Td right strong={dec(String(c.cash_variance ?? 0)).isZero() === false}>
                    {formatBDT(c.cash_variance as number, lang, true)}
                  </Td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground">
                <Td strong>{lang === 'bn' ? 'মোট' : 'Total'}</Td>
                {['cash_sales','dues_collected','expenses_cash','petty_in','expected_cash','counted_cash'].map((k) => (
                  <Td key={k} right strong>{formatBDT(tot(sheet.cash, k), lang)}</Td>
                ))}
                <Td right strong>{formatBDT(tot(sheet.cash, 'cash_variance'), lang, true)}</Td>
              </tr>
            </tbody>
          </table>
        </Section>
      ) : null}

      <BankSection date={sheet.date} />

      {/* ---- 8. shift in-charge signature ---- */}
      <section className="print-block pt-6">
        <div className="flex flex-wrap justify-end gap-8">
          {(sheet.shift_in_charge?.length ? sheet.shift_in_charge : ['']).map((name, i) => (
            <div key={i} className="w-48 text-center">
              <p className="mb-1 h-4 text-[11px] font-medium leading-tight">{name}</p>
              <div className="mb-1 border-t" style={{ borderColor: 'currentColor' }} />
              <p className="text-[10px] leading-tight" lang={lang}>
                {lang === 'bn' ? 'শিফট ইনচার্জের স্বাক্ষর' : 'Shift in-charge signature'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { lang } = useLang();
  return (
    <section className="print-block">
      <h3 className="mb-1 border-b text-xs font-semibold" style={{ borderColor: 'var(--hairline)' }} lang={lang}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border px-1.5 py-1 text-[10px] font-medium ${right ? 'text-right' : 'text-left'}`}
      style={{ borderColor: 'var(--hairline)' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`tabular border px-1.5 py-1 ${right ? 'text-right' : ''} ${strong ? 'font-semibold' : ''}`}
      style={{ borderColor: 'var(--hairline)' }}
    >
      {children}
    </td>
  );
}

function Money({
  label,
  value,
  litres,
  strong,
}: {
  label: string;
  value: unknown;
  litres?: boolean;
  strong?: boolean;
}) {
  const { lang } = useLang();
  return (
    <tr>
      <Td strong={strong}>{label}</Td>
      <Td right strong={strong}>
        {litres ? formatLitres(value as number, lang) : formatBDT(value as number, lang)}
      </Td>
    </tr>
  );
}

function ExpenseBook({ title, rows }: { title: string; rows: Array<Json> }) {
  const { lang } = useLang();
  const total = rows.reduce((acc, r) => acc.plus(dec(String(r.amount ?? 0))), dec(0));

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold" lang={lang}>
        {title}
      </p>
      <table className="w-full text-xs">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td>—</Td>
              <Td right>{formatBDT(0, lang)}</Td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <Td>
                  {lang === 'bn' && r.head_bn ? String(r.head_bn) : String(r.head ?? '')}
                  {r.description ? ` — ${String(r.description)}` : ''}
                </Td>
                <Td right>{formatBDT(r.amount as number, lang)}</Td>
              </tr>
            ))
          )}
          <tr>
            <Td strong>{lang === 'bn' ? 'মোট' : 'Total'}</Td>
            <Td right strong>
              {formatBDT(total.toFixed(2), lang)}
            </Td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}


/** Column total, added with decimal.js so money never drifts. */
function tot(rows: Array<Json>, key: string): string {
  return rows
    .reduce((acc, r) => (r[key] === null || r[key] === undefined || r[key] === '' ? acc : acc.plus(dec(String(r[key])))), dec(0))
    .toFixed(3);
}
/** Bank credits and debits entered in the bank statement for this day. */
function BankSection({ date }: { date: string }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [rows, setRows] = useState<Array<{ type: string; bank_name: string; account_no: string | null; amount: number; reference: string | null }> | null>(null);
  useEffect(() => {
    supabase
      .from('bank_transactions')
      .select('type, bank_name, account_no, amount, reference')
      .eq('txn_date', date)
      .in('type', ['deposit', 'withdrawal'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .then(({ data }) => setRows((data ?? []) as never));
  }, [date]);
  if (!rows) return null;
  const credit = rows.filter((r) => r.type === 'deposit').reduce((a, r) => a.plus(dec(String(r.amount))), dec(0));
  const debit = rows.filter((r) => r.type !== 'deposit').reduce((a, r) => a.plus(dec(String(r.amount))), dec(0));
  return (
    <Section title={bn ? 'ব্যাংক জমা ও উত্তোলন' : 'Bank credit and debit'}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <Th>{bn ? 'ব্যাংক' : 'Bank'}</Th>
            <Th>{bn ? 'হিসাব নম্বর' : 'Account no.'}</Th>
            <Th>{bn ? 'বিবরণ' : 'Details'}</Th>
            <Th right>{bn ? 'জমা (ক্রেডিট)' : 'Credit'}</Th>
            <Th right>{bn ? 'উত্তোলন (ডেবিট)' : 'Debit'}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><Td>{bn ? 'এই দিনে কিছু নেই' : 'None on this day'}</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td></tr>
          ) : null}
          {rows.map((r, i) => (
            <tr key={i}>
              <Td>{r.bank_name}</Td>
              <Td>{r.account_no ?? '—'}</Td>
              <Td>{r.reference ?? '—'}</Td>
              <Td right>{r.type === 'deposit' ? formatBDT(r.amount, lang) : ''}</Td>
              <Td right>{r.type !== 'deposit' ? formatBDT(r.amount, lang) : ''}</Td>
            </tr>
          ))}
          <tr className="border-t-2 border-foreground">
            <Td strong>{bn ? 'মোট' : 'Total'}</Td><Td>{''}</Td><Td>{''}</Td>
            <Td right strong>{formatBDT(credit.toFixed(2), lang)}</Td>
            <Td right strong>{formatBDT(debit.toFixed(2), lang)}</Td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}
