import { businessDate, businessDayEnd, formatLubQty } from '@/lib/format';
import { createClient } from '@/lib/data/client';
import { asLitres, asMoney, asPctOrNull } from '@/lib/data/numeric';
import { dec, litresStr, moneyStr, sum as decSum } from '@/lib/calc/decimal';
import { reportById, visibleColumns, type ReportDefinition } from './registry';

/**
 * Running a report.
 *
 * Every figure is normalised at this boundary — PostgREST hands numerics back
 * as JavaScript doubles — so a row that reaches the screen, the workbook or
 * the printed page is the same row of fixed-point strings in all three. That
 * is the whole point of the registry: one query, one set of numbers, three
 * ways of looking at them.
 */

export interface ReportRow {
  [key: string]: string | number | null;
}

export interface ReportResult {
  report: ReportDefinition;
  rows: ReportRow[];
  /** Keyed by column, already formatted to the column's scale. */
  totals: Record<string, string>;
  from: string;
  to: string;
  /** Present for the two reports that are a page rather than a table. */
  sheet?: unknown;
  statement?: unknown;
  error?: string;
  /** Optional split of the rows into titled tables, each with its own total. */
  sections?: ReportSection[];
}

export interface ReportSection {
  en: string;
  bn: string;
  rows: ReportRow[];
  totals: Record<string, string>;
  /** Only these column keys are shown for this section (default: all). */
  cols?: string[];
  /** Short plain-language explanation under the heading. */
  noteEn?: string;
  noteBn?: string;
}

/**
 * PostgREST rows, as the untyped client hands them over.
 *
 * Without a generated Database type the client cannot know an embedded
 * resource's shape, so it widens every joined column into an error union. The
 * rows themselves are fine; the type is the client admitting it does not know
 * them. One cast at the point of use beats a cast on every field.
 */
type Raw = Record<string, unknown>;

function rowsOf(data: unknown): Raw[] {
  return (data ?? []) as Raw[];
}

/** One field of an untyped row, narrowed to what the formatters accept. */
function v(row: Raw, key: string): string | number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : '';
  return null;
}

/** The same, as a string, for a column that is text on the page. */
function text(row: Raw, key: string): string {
  const value = v(row, key);
  return value === null ? '' : String(value);
}

function first<T>(v: unknown): T | null {
  return Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null);
}


/** Cash put into the petty-cash box, per shift. It leaves the drawer and is shown on its own line. */
async function pettyInByShift(supabase: any, from: string, to: string) {
  const { data } = await supabase
    .from('expenses')
    .select('amount, shift_id, spent_at, expense_categories!inner(name), shifts(id, shift_date, shift_type, status)')
    .is('deleted_at', null)
    .neq('paid_by', 'petty')
    .eq('expense_categories.name', 'Petty Cash');
  const { data: allShifts } = await supabase
    .from('shifts')
    .select('id, shift_date, shift_type, status')
    .gte('shift_date', from)
    .lte('shift_date', to);
  // linked=false: the entry was saved without a shift, so the close never counted it.
  const out = new Map<string, { date: string; type: string; status: string; amt: number; linked: boolean }>();
  for (const e of (data ?? []) as any[]) {
    let s = Array.isArray(e.shifts) ? e.shifts[0] : e.shifts;
    const linked = !!s;
    if (!s) {
      // Place it by time: Dhaka 10:00–22:00 is the day shift, else night of the business day.
      const d = new Date(new Date(e.spent_at).getTime() + 6 * 3600e3);
      const h = d.getUTCHours();
      if (h < 10) d.setUTCDate(d.getUTCDate() - 1);
      const date = d.toISOString().slice(0, 10);
      const type = h >= 10 && h < 22 ? 'day' : 'night';
      s = ((allShifts ?? []) as any[]).find((x) => x.shift_date === date && x.shift_type === type) ?? { id: `${date}-${type}`, shift_date: date, shift_type: type, status: 'none' };
    }
    if (s.shift_date < from || s.shift_date > to) continue;
    const cur = out.get(s.id) ?? { date: s.shift_date, type: s.shift_type, status: s.status, amt: 0, linked };
    cur.amt += Number(e.amount);
    out.set(s.id, cur);
  }
  return out;
}

export async function runReport(
  id: string,
  from: string,
  to: string,
  canSeeCost: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Promise<ReportResult> {
  const report = reportById(id);
  if (!report) throw new Error(`No report called ${id}`);

  const supabase = client ?? (await createClient());
  const empty: ReportResult = { report, rows: [], totals: {}, from, to };

  switch (id) {
    // ---- the page-shaped reports ------------------------------------------
    case 'shift-closing-sheet':
      return empty;
    case 'daily-sheet': {
      const { data, error } = await supabase.rpc('daily_sheet', { p_date: to });

      // Whoever put their name against the day's work signs the paper form:
      // the manager who closed each shift, and whoever approved the dips,
      // the refills and the sales.
      const day = { from: `${to}T10:00:00+06:00`, until: businessDayEnd(to) };
      const [shifts, dips, deliveries, sales] = await Promise.all([
        supabase.from('shifts').select('closer:closed_by(full_name)').eq('shift_date', to),
        supabase
          .from('tank_dips')
          .select('approver:approved_by(full_name)')
          .gte('approved_at', day.from)
          .lte('approved_at', day.until),
        supabase
          .from('tanker_deliveries')
          .select('approver:approved_by(full_name)')
          .gte('approved_at', day.from)
          .lte('approved_at', day.until),
        supabase
          .from('meter_readings')
          .select('approver:approved_by(full_name)')
          .gte('approved_at', day.from)
          .lte('approved_at', day.until),
      ]);

      const names: string[] = [];
      for (const [result, key] of [
        [shifts, 'closer'],
        [dips, 'approver'],
        [deliveries, 'approver'],
        [sales, 'approver'],
      ] as const) {
        for (const row of rowsOf(result.data)) {
          const name = first<{ full_name: string }>((row as Record<string, unknown>)[key])?.full_name;
          if (name && !names.includes(name)) names.push(name);
        }
      }

      const closers: string[] = [];
      for (const row of rowsOf(shifts.data)) {
        const name = first<{ full_name: string }>((row as Record<string, unknown>).closer)?.full_name;
        if (name && !closers.includes(name)) closers.push(name);
      }

      // A tanker receipt is one of two movements: oil arriving from the depot
      // onto the truck, or that same oil being unloaded into a station tank.
      // The compartment's tank tells them apart — TRUCK means arrival.
      const movementRows = await supabase
        .from('tanker_deliveries')
        .select('arrived_at, compartments:tanker_compartments(tank:tank_id(code))')
        .is('deleted_at', null)
        .gte('arrived_at', day.from)
        .lte('arrived_at', day.until);

      const movementAt = new Map<number, string>();
      for (const row of rowsOf(movementRows.data)) {
        const codes = (
          (row.compartments ?? []) as Array<{ tank: { code: string } | { code: string }[] | null }>
        )
          .map((c) => first<{ code: string }>(c.tank)?.code ?? '')
          .filter(Boolean);
        const stamp = Date.parse(String(row.arrived_at));
        if (Number.isNaN(stamp)) continue;
        movementAt.set(stamp, codes.every((c) => c === 'TRUCK') ? 'arrival' : 'unloading');
      }

      const base = data as Record<string, unknown> | null;
      const sheetDeliveries = rowsOf(base?.deliveries).map((d) => ({
        ...d,
        movement: movementAt.get(Date.parse(String(d.arrived_at))) ?? 'unloading',
      }));

      const petty = await pettyInByShift(supabase, to, to);
      const cashRows = rowsOf(base?.cash).map((c) => ({ ...c, petty_in: 0 })) as Array<Record<string, unknown>>;
      for (const p of petty.values()) {
        const row = cashRows.find((c) => c.shift_type === p.type);
        if (row && p.status === 'closed' && p.linked) {
          row.petty_in = p.amt;
          row.expenses_cash = Number(row.expenses_cash ?? 0) - p.amt;
        } else if (row) {
          // Not inside the shift's count: take it off what stays in the drawer.
          row.petty_in = Number(row.petty_in) + p.amt;
          row.expected_cash = Number(row.expected_cash ?? 0) - p.amt;
          row.counted_cash = Number(row.counted_cash ?? 0) - p.amt;
        } else {
          cashRows.push({ shift_type: p.type, cash_sales: 0, dues_collected: 0, expenses_cash: 0, expected_cash: 0, counted_cash: 0, cash_variance: 0, petty_in: p.amt });
        }
      }
      const sheet = base
        ? { ...base, cash: cashRows, deliveries: sheetDeliveries, signed_by: names, shift_in_charge: closers }
        : data;
      return { ...empty, sheet, error: error?.message };
    }

    case 'profit-loss': {
      const { data, error } = await supabase.rpc('profit_and_loss', {
        p_from: from,
        p_to: to,
      });
      return { ...empty, statement: data, error: error?.message };
    }

    // ---- tables -----------------------------------------------------------
    case 'shift-reconciliation': {
      const { data, error: qErr } = await supabase
        .from('shift_sales')
        .select(
          'shift_id, net_litres, rate_per_litre, sales_amount, lubricant_sales, credit_sales, cash_sales, ' +
            'shifts!inner(shift_date, shift_type, starts_at)',
        )
        .gte('shifts.shift_date', from)
        .lte('shifts.shift_date', to)
        .order('starts_at', { referencedTable: 'shifts', ascending: true });

      // The cash count sits in its own table keyed by shift, so read it apart.
      const shiftIds = rowsOf(data).map((r) => text(r, 'shift_id')).filter(Boolean);
      const cashByShift = new Map<string, Raw>();
      if (shiftIds.length > 0) {
        const { data: cash } = await supabase
          .from('cash_reconciliation')
          .select('shift_id, opening_cash, dues_collected, expenses_cash, expected_cash, counted_cash, cash_variance, variance_reason')
          .in('shift_id', shiftIds);
        for (const c of rowsOf(cash)) cashByShift.set(text(c, 'shift_id'), c);
      }

      const rows = rowsOf(data).map((r) => {
        const s = first<{ shift_date: string; shift_type: string }>(r.shifts);
        const c = (cashByShift.get(text(r, 'shift_id')) ?? null) as {
          opening_cash: number;
          dues_collected: number;
          expenses_cash: number;
          expected_cash: number;
          counted_cash: number;
          cash_variance: number;
          variance_reason: string | null;
        } | null;
        return {
          shift_date: s?.shift_date ?? '',
          shift_type: s?.shift_type ?? '',
          net_litres: asLitres(v(r, 'net_litres')),
          rate_per_litre: asMoney(v(r, 'rate_per_litre')),
          sales_amount: asMoney(v(r, 'sales_amount')),
          lubricant_sales: asMoney(v(r, 'lubricant_sales')),
          credit_sales: asMoney(v(r, 'credit_sales')),
          cash_sales: asMoney(v(r, 'cash_sales')),
          opening_cash: asMoney(c?.opening_cash),
          dues_collected: asMoney(c?.dues_collected),
          expenses_cash: asMoney(c?.expenses_cash),
          expected_cash: asMoney(c?.expected_cash),
          counted_cash: asMoney(c?.counted_cash),
          cash_variance: asMoney(c?.cash_variance),
          variance_reason: c?.variance_reason ?? '',
        };
      });
      // Petty cash in gets its own column; for closed linked shifts it was inside expenses.
      const pettyR = await pettyInByShift(supabase, from, to);
      const ids = rowsOf(data).map((r) => text(r, 'shift_id'));
      rows.forEach((row: any, i) => {
        const p = pettyR.get(ids[i] ?? '');
        row.petty_in = asMoney(p?.amt ?? 0);
        if (!p) return;
        if (p.status === 'closed' && p.linked) {
          row.expenses_cash = asMoney(Number(row.expenses_cash) - p.amt);
        } else {
          row.expected_cash = asMoney(Number(row.expected_cash) - p.amt);
          row.counted_cash = asMoney(Number(row.counted_cash) - p.amt);
        }
      });
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'stock-variance': {
      const { data, error: qErr } = await supabase
        .from('shift_stock')
        .select(
          'book_opening, refill_litres, returned_litres, sold_from_tank, book_closing, physical_closing, ' +
            'variance_litres, variance_pct, variance_reason, ' +
            'tanks!inner(code), shifts!inner(shift_date, shift_type, starts_at)',
        )
        .gte('shifts.shift_date', from)
        .lte('shifts.shift_date', to)
        .order('starts_at', { referencedTable: 'shifts', ascending: true });

      const rows = rowsOf(data).map((r) => {
        const s = first<{ shift_date: string; shift_type: string }>(r.shifts);
        const t = first<{ code: string }>(r.tanks);
        return {
          shift_date: s?.shift_date ?? '',
          shift_type: s?.shift_type ?? '',
          tank_code: t?.code ?? '',
          book_opening: asLitres(v(r, 'book_opening')),
          refill_litres: asLitres(v(r, 'refill_litres')),
          returned_litres: asLitres(v(r, 'returned_litres') ?? 0),
          sold_from_tank: asLitres(v(r, 'sold_from_tank')),
          book_closing: asLitres(v(r, 'book_closing')),
          physical_closing: asLitres(v(r, 'physical_closing')),
          variance_litres: asLitres(v(r, 'variance_litres')),
          variance_pct: asPctOrNull(v(r, 'variance_pct')),
          variance_reason: text(r, 'variance_reason'),
        };
      });
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'purchase-register': {
      const { data, error: qErr } = await supabase
        .from('tanker_compartments')
        .select(
          'compartment_no, declared_litres, received_litres, shortage_litres, shortage_pct, ' +
            'tanks(code), tanker_deliveries!inner(challan_no, truck_reg, arrived_at, depot_rate, deleted_at, approver:approved_by(full_name))',
        )
        .is('tanker_deliveries.deleted_at', null)
        .gte('tanker_deliveries.arrived_at', `${from}T10:00:00+06:00`)
        .lte('tanker_deliveries.arrived_at', businessDayEnd(to));

      const rows = rowsOf(data)
        .map((r) => {
          const d = first<{
            challan_no: string | null;
            truck_reg: string | null;
            arrived_at: string;
            depot_rate: number;
            approver: unknown;
          }>(r.tanker_deliveries);
          const t = first<{ code: string }>(r.tanks);
          const received = asLitres(v(r, 'received_litres'));
          const rate = asMoney(d?.depot_rate);
          return {
            arrived_at: d?.arrived_at ?? '',
            approved_by: first<{ full_name: string }>(d?.approver)?.full_name ?? '',
            challan_no: d?.challan_no ?? '',
            truck_reg: d?.truck_reg ?? '',
            tank_code: t?.code ?? '',
            compartment_no: Number(v(r, 'compartment_no') ?? 0),
            declared_litres: asLitres(v(r, 'declared_litres')),
            received_litres: received,
            shortage_litres: asLitres(v(r, 'shortage_litres')),
            shortage_pct: asPctOrNull(v(r, 'shortage_pct')),
            // Valued on litres received, never on litres declared: the station
            // pays the depot for what the rods say arrived.
            depot_rate: rate,
            value: moneyStr(dec(received).times(dec(rate))),
          };
        })
        // Only depot purchases (oil loaded onto the truck) belong here; tank
        // refills have their own register.
        .filter((r) => r.tank_code === 'TRUCK')
        .map(({ tank_code: _t, compartment_no: _c, shortage_pct: _p, ...rest }) => rest)
        .sort((a, b) => (a.arrived_at < b.arrived_at ? -1 : 1));

      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'oil-stock': {
      const day = to;
      const endAt = businessDayEnd(day);
      const [{ data: comps, error: qErr }, { data: sales }, { data: stocks }, { data: tanks }, { data: rets }, { data: woff }] = await Promise.all([
        supabase
          .from('tanker_compartments')
          .select('received_litres, sold_litres, tanks!inner(code), tanker_deliveries!inner(arrived_at, deleted_at)')
          .is('tanker_deliveries.deleted_at', null)
          .lte('tanker_deliveries.arrived_at', endAt),
        supabase
          .from('shift_sales')
          .select('net_litres, shifts!inner(shift_date)')
          .gte('shifts.shift_date', from)
          .lte('shifts.shift_date', day),
        supabase
          .from('shift_stock')
          .select('tank_id, book_closing, physical_closing, shifts!inner(shift_date, starts_at, status)')
          .lte('shifts.shift_date', day)
          .in('shifts.status', ['closed', 'reopened']),
        supabase.from('tanks').select('id, code').is('deleted_at', null).neq('code', 'TRUCK').order('code'),
        supabase.from('tank_returns').select('litres, returned_at').is('deleted_at', null).lte('returned_at', endAt),
        supabase.from('settings').select('value').eq('key', 'purchased_oil_writeoff').maybeSingle(),
      ]);

      // Business date of each delivery (day starts 10:00 Dhaka).
      const bizDate = (at: string) => (at ? businessDate(new Date(at)) : '');
      const rt = rowsOf(rets).map((r) => ({
        date: bizDate(text(r, 'returned_at')),
        litres: dec(asLitres(v(r, 'litres'))),
      }));
      const writeoff = dec(Number((woff as { value?: unknown } | null)?.value ?? 0) || 0);
      const c = rowsOf(comps).map((r) => {
        const at = first<{ arrived_at: string }>(r.tanker_deliveries)?.arrived_at ?? '';
        return {
          date: bizDate(at),
          truck: first<{ code: string }>(r.tanks)?.code === 'TRUCK',
          rec: dec(asLitres(v(r, 'received_litres'))),
          sold: dec(asLitres(v(r, 'sold_litres') ?? 0)),
        };
      });
      const s = rowsOf(sales).map((r) => ({
        date: first<{ shift_date: string }>(r.shifts)?.shift_date ?? '',
        litres: dec(asLitres(v(r, 'net_litres'))),
      }));
      const sumFor = (item: string, keep: (d: string) => boolean) => {
        const inW = c.filter((x) => keep(x.date));
        return {
          item,
          purchased: litresStr(decSum(inW.filter((x) => x.truck).map((x) => x.rec))),
          refilled: litresStr(decSum(inW.filter((x) => !x.truck).map((x) => x.rec.plus(x.sold)))),
          returned: litresStr(decSum(rt.filter((x) => keep(x.date)).map((x) => x.litres))),
          sold: litresStr(decSum(s.filter((x) => keep(x.date)).map((x) => x.litres))),
          stock: null as string | null,
        };
      };
      const dmy = (d: string) => d.split('-').reverse().join('-');
      const periodLabel = from === to ? dmy(day) : `${dmy(from)} to ${dmy(day)}`;
      const periodRows = [sumFor(periodLabel, (d) => d >= from && d <= day)];
      const days = Array.from(new Set([...c.map((x) => x.date), ...s.map((x) => x.date), ...rt.map((x) => x.date)]))
        .filter((d) => d >= from && d <= day)
        .sort();
      const dayRows = days.map((d) => sumFor(dmy(d), (x) => x === d));

      // Stock on the date: each tank's closing from its last closed shift, plus purchased oil not yet moved.
      const latest = new Map<string, { at: string; litres: string }>();
      for (const r of rowsOf(stocks)) {
        const sh = first<{ starts_at: string }>(r.shifts);
        const id = text(r, 'tank_id');
        const prev = latest.get(id);
        if (!prev || (sh?.starts_at ?? '') > prev.at) {
          latest.set(id, { at: sh?.starts_at ?? '', litres: asLitres(v(r, 'physical_closing') ?? v(r, 'book_closing')) });
        }
      }
      // Same rule as the app's purchased-oil figure: purchases − refills + returns − write-off.
      const purchasedLeft = decSum(c.map((x) => (x.truck ? x.rec : x.rec.plus(x.sold).negated())))
        .plus(decSum(rt.map((x) => x.litres)))
        .minus(writeoff);
      const stockRows = [
        ...rowsOf(tanks).map((t) => ({
          item: `Tank ${text(t, 'code')}`,
          purchased: null,
          refilled: null,
          returned: null,
          sold: null,
          stock: latest.get(text(t, 'id'))?.litres ?? litresStr(dec(0)),
        })),
        {
          item: 'Purchased oil (not yet in tanks)',
          purchased: null,
          refilled: null,
          returned: null,
          sold: null,
          stock: litresStr(purchasedLeft.isNegative() ? dec(0) : purchasedLeft),
        },
      ];
      const flow = ['item', 'purchased', 'refilled', 'returned', 'sold'];
      const dayTotals = totalsFor(report, dayRows, canSeeCost);
      delete dayTotals.stock;
      const stockTotals = { stock: totalsFor(report, stockRows, canSeeCost).stock ?? '' };
      const sections: ReportSection[] = [
        {
          en: '1. Summary for the selected period',
          bn: '১. নির্বাচিত সময়ের সারসংক্ষেপ',
          noteEn: 'Purchased = oil bought from the depot. Refilled = oil moved from the truck into the tanks (incl. oil sold during refill). Returned = oil sent from a tank back to purchased oil. Sold = pump sales from closed shifts.',
          noteBn: 'ক্রয় = ডিপো থেকে কেনা তেল। রিফিল = ট্রাক থেকে ট্যাংকে নেওয়া তেল (রিফিলের সময় বিক্রিসহ)। ফেরত = ট্যাংক থেকে ক্রয়কৃত তেলে ফেরত। বিক্রি = বন্ধ শিফটের পাম্প বিক্রি।',
          rows: periodRows,
          totals: {},
          cols: flow,
        },
        {
          en: '2. Day by day',
          bn: '২. দিনভিত্তিক',
          noteEn: 'Only days with a purchase, refill or sale are listed.',
          noteBn: 'শুধু ক্রয়, রিফিল বা বিক্রির দিনগুলো দেখানো হয়েছে।',
          rows: dayRows,
          totals: dayRows.length ? dayTotals : {},
          cols: flow,
        },
        {
          en: `3. Stock in hand on ${dmy(day)}`,
          bn: `৩. ${dmy(day)} তারিখে হাতে মজুদ`,
          noteEn: 'Tank stock is from each tank\'s last closed shift. Purchased oil not yet in tanks = depot purchases − refills + returns from tanks.',
          noteBn: 'ট্যাংকের মজুদ শেষ বন্ধ শিফট থেকে। ট্যাংকে না নেওয়া কেনা তেল = ডিপো ক্রয় − রিফিল + ট্যাংক থেকে ফেরত।',
          rows: stockRows,
          totals: stockTotals,
          cols: ['item', 'stock'],
        },
      ];
      return { ...empty, rows: [...periodRows, ...dayRows, ...stockRows], totals: {}, sections, error: qErr?.message };
    }

    case 'tank-refill-register': {
      const { data, error: qErr } = await supabase
        .from('tanker_compartments')
        .select(
          'dip_before_mm, dip_after_mm, litres_before, litres_after, received_litres, sold_litres, ' +
            'tanks!inner(code), tanker_deliveries!inner(arrived_at, deleted_at, approver:approved_by(full_name))',
        )
        .neq('tanks.code', 'TRUCK')
        .is('tanker_deliveries.deleted_at', null)
        .gte('tanker_deliveries.arrived_at', `${from}T10:00:00+06:00`)
        .lte('tanker_deliveries.arrived_at', businessDayEnd(to));

      const rows = rowsOf(data)
        .map((r) => {
          const d = first<{ arrived_at: string; approver: unknown }>(r.tanker_deliveries);
          const received = asLitres(v(r, 'received_litres'));
          const sold = asLitres(v(r, 'sold_litres'));
          return {
            arrived_at: d?.arrived_at ?? '',
            tank_code: first<{ code: string }>(r.tanks)?.code ?? '',
            dip_before_mm: v(r, 'dip_before_mm'),
            dip_after_mm: v(r, 'dip_after_mm'),
            litres_before: asLitres(v(r, 'litres_before')),
            litres_after: asLitres(v(r, 'litres_after')),
            received_litres: received,
            sold_litres: sold,
            total_refill: litresStr(dec(received).plus(dec(sold))),
            approved_by: first<{ full_name: string }>(d?.approver)?.full_name ?? '',
          };
        })
        .sort((a, b) => (a.arrived_at < b.arrived_at ? -1 : a.arrived_at > b.arrived_at ? 1 : a.tank_code.localeCompare(b.tank_code)));

      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'sales-register': {
      const { data, error: qErr } = await supabase
        .from('credit_sales')
        .select(
          'sold_at, vehicle_no, challan_no, litres, rate, amount, over_limit_approved_by, ' +
            'customers(name, name_bn), shifts!inner(shift_date)',
        )
        .is('deleted_at', null)
        .gte('shifts.shift_date', from)
        .lte('shifts.shift_date', to)
        .order('sold_at');

      const rows = rowsOf(data).map((r) => ({
        sold_at: text(r, 'sold_at'),
        party: first<{ name: string }>(r.customers)?.name ?? '',
        vehicle_no: text(r, 'vehicle_no'),
        challan_no: text(r, 'challan_no'),
        litres: v(r, 'litres') === null ? null : asLitres(v(r, 'litres')),
        rate: v(r, 'rate') === null ? null : asMoney(v(r, 'rate')),
        amount: asMoney(v(r, 'amount')),
        over_limit: v(r, 'over_limit_approved_by') ? 'yes' : '',
      }));
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'customer-ageing': {
      const { data, error: qErr } = await supabase.rpc('customer_ageing', { p_as_of: to });
      const rows = rowsOf(data)
        .map((r) => ({
          customer_name: String(v(r, 'customer_name') ?? ''),
          credit_limit: asMoney(v(r, 'credit_limit') as number),
          balance: asMoney(v(r, 'balance') as number),
          bucket_0_30: asMoney(v(r, 'bucket_0_30') as number),
          bucket_31_60: asMoney(v(r, 'bucket_31_60') as number),
          bucket_61_90: asMoney(v(r, 'bucket_61_90') as number),
          bucket_90_plus: asMoney(v(r, 'bucket_90_plus') as number),
          oldest_item_days: (v(r, 'oldest_item_days') as number) ?? null,
        }))
        // A party with nothing outstanding is not a line on an ageing report.
        .filter((r: ReportRow) => Number(v(r, 'balance')) !== 0);
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'expense-register': {
      const { data, error: qErr } = await supabase
        .from('expenses')
        .select(
          'spent_at, description, paid_by, amount, ' +
            'expense_categories!inner(name, name_bn, group), shifts(shift_date)',
        )
        .is('deleted_at', null)
        .gte('spent_at', `${from}T10:00:00+06:00`)
        .lte('spent_at', businessDayEnd(to))
        .neq('paid_by', 'petty')
        .order('spent_at');

      const rows = rowsOf(data)
        .filter((r) => first<{ name: string }>(r.expense_categories)?.name !== 'Petty Cash')
        .map((r) => {
        const c = first<{ name: string; group: string }>(r.expense_categories);
        return {
          spent_at: text(r, 'spent_at'),
          book: c?.group === 'chairman' ? 'Chairman' : 'Pump',
          head: c?.name ?? '',
          description: text(r, 'description'),
          paid_by: text(r, 'paid_by'),
          amount: asMoney(v(r, 'amount')),
        };
      });
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'cash-book': {
      const { data, error: qErr } = await supabase
        .from('cash_reconciliation')
        .select(
          'opening_cash, cash_sales, dues_collected, expenses_cash, bank_deposits, ' +
            'shift_id, expected_cash, counted_cash, cash_variance, shifts!inner(shift_date, shift_type, starts_at)',
        )
        .gte('shifts.shift_date', from)
        .lte('shifts.shift_date', to)
        .order('starts_at', { referencedTable: 'shifts', ascending: true });

      const rows = rowsOf(data).map((r) => {
        const s = first<{ shift_date: string; shift_type: string }>(r.shifts);
        return {
          shift_id: text(r, 'shift_id'),
          shift_date: s?.shift_date ?? '',
          shift_type: s?.shift_type ?? '',
          opening_cash: asMoney(v(r, 'opening_cash')),
          cash_sales: asMoney(v(r, 'cash_sales')),
          dues_collected: asMoney(v(r, 'dues_collected')),
          expenses_cash: asMoney(v(r, 'expenses_cash')),
          petty_in: asMoney(0),
          bank_deposits: asMoney(v(r, 'bank_deposits')),
          // Expected and Counted are shown before the bank deposit; the
          // deposit then comes off, leaving the balance in the drawer.
          expected_cash: asMoney(Number(v(r, 'expected_cash')) + Number(v(r, 'bank_deposits'))),
          counted_cash: asMoney(Number(v(r, 'counted_cash')) + Number(v(r, 'bank_deposits'))),
          cash_variance: asMoney(v(r, 'cash_variance')),
          balance: asMoney(v(r, 'counted_cash')),
        };
      });

      // Drawer cash sent to the bank from a shift that hasn't closed yet: it has
      // already left the drawer, so it shows here now and comes off the balance.
      const { data: deps } = await supabase
        .from('bank_transactions')
        .select('amount, shift_id, shifts!inner(shift_date, shift_type, starts_at, status)')
        .eq('type', 'deposit')
        .eq('from_drawer', true)
        .is('deleted_at', null)
        .is('source_id', null)
        .neq('shifts.status', 'closed')
        .gte('shifts.shift_date', from)
        .lte('shifts.shift_date', to);
      const pend = new Map<string, { date: string; type: string; starts: string; amt: number }>();
      for (const d of rowsOf(deps)) {
        const s = first<{ shift_date: string; shift_type: string; starts_at: string }>(d.shifts);
        const k = text(d, 'shift_id');
        const cur = pend.get(k) ?? { date: s?.shift_date ?? '', type: s?.shift_type ?? '', starts: s?.starts_at ?? '', amt: 0 };
        cur.amt += Number(v(d, 'amount'));
        pend.set(k, cur);
      }
      // Petty cash in: for a closed shift it was inside that shift's expenses,
      // so it moves to its own column; for an open shift it comes off the balance now.
      const petty = await pettyInByShift(supabase, from, to);
      for (const [sid, p] of petty) {
        const row = rows.find((x) => x.shift_id === sid);
        if (row && p.status === 'closed' && p.linked) {
          row.petty_in = asMoney(p.amt);
          row.expenses_cash = asMoney(Number(row.expenses_cash) - p.amt);
        } else if (row) {
          row.petty_in = asMoney(p.amt);
          row.expected_cash = asMoney(Number(row.expected_cash) - p.amt);
          row.counted_cash = asMoney(Number(row.counted_cash) - p.amt);
          row.balance = asMoney(Number(row.balance) - p.amt);
        } else {
          rows.push({
            shift_id: sid, shift_date: p.date, shift_type: p.type,
            opening_cash: asMoney(0), cash_sales: asMoney(0), dues_collected: asMoney(0),
            expenses_cash: asMoney(0), petty_in: asMoney(p.amt), bank_deposits: asMoney(0),
            expected_cash: asMoney(0), counted_cash: asMoney(0), cash_variance: asMoney(0),
            balance: asMoney(-p.amt),
          });
        }
      }
      for (const p of pend.values()) {
        rows.push({
          shift_id: '',
          petty_in: asMoney(0),
          shift_date: p.date,
          shift_type: p.type,
          opening_cash: asMoney(0),
          cash_sales: asMoney(0),
          dues_collected: asMoney(0),
          expenses_cash: asMoney(0),
          bank_deposits: asMoney(p.amt),
          expected_cash: asMoney(0),
          counted_cash: asMoney(0),
          cash_variance: asMoney(0),
          balance: asMoney(-p.amt),
        });
      }
      rows.sort((a, b) =>
        `${a.shift_date}-${a.shift_type === 'day' ? 0 : 1}`.localeCompare(`${b.shift_date}-${b.shift_type === 'day' ? 0 : 1}`),
      );
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'dispenser-performance': {
      const { data, error: qErr } = await supabase
        .from('meter_readings')
        .select(
          'shift_id, reading, is_rollover, reading_type, ' +
            'nozzles!inner(nozzle_no, dispensers!inner(code, tanks(code))), ' +
            'shifts!inner(shift_date, shift_type)',
        )
        .is('deleted_at', null)
        .gte('shifts.shift_date', from)
        .lte('shifts.shift_date', to);

      // One row per nozzle per shift: litres = highest closing − lowest opening.
      type Acc = { row: ReportRow; open: number | null; close: number | null; rollovers: number };
      const byKey = new Map<string, Acc>();
      for (const r of rowsOf(data)) {
        const n = first<{ nozzle_no: number; dispensers: unknown }>(r.nozzles);
        const d = first<{ code: string; tanks: unknown }>(n?.dispensers);
        const t = first<{ code: string }>(d?.tanks);
        const sh = first<{ shift_date: string; shift_type: string }>(r.shifts);
        const sid = text(r, 'shift_id');
        const key = `${sid}|${d?.code}-${n?.nozzle_no}`;
        const acc = byKey.get(key) ?? {
          row: {
            shift_date: sh?.shift_date ?? '',
            shift_type: sh?.shift_type ?? '',
            dispenser_code: d?.code ?? '',
            nozzle_no: n?.nozzle_no ?? 0,
            tank_code: t?.code ?? '',
          },
          open: null,
          close: null,
          rollovers: 0,
        };
        const reading = Number(v(r, 'reading'));
        if (text(r, 'reading_type') === 'open') {
          acc.open = acc.open === null ? reading : Math.min(acc.open, reading);
        } else {
          acc.close = acc.close === null ? reading : Math.max(acc.close, reading);
          if (v(r, 'is_rollover')) acc.rollovers += 1;
        }
        byKey.set(key, acc);
      }

      // Shift close fills the opening from the previous shift's closing meter,
      // so where no opening reading was saved, carry that closing forward.
      const ordered = [...byKey.values()].sort((a, b) =>
        `${String(a.row.shift_date)}-${a.row.shift_type === 'day' ? 0 : 1}`.localeCompare(
          `${String(b.row.shift_date)}-${b.row.shift_type === 'day' ? 0 : 1}`,
        ),
      );
      const lastClose = new Map<string, number>();
      for (const acc of ordered) {
        const nk = `${String(acc.row.dispenser_code)}-${String(acc.row.nozzle_no)}`;
        if (acc.open === null && lastClose.has(nk)) acc.open = lastClose.get(nk)!;
        if (acc.close !== null) lastClose.set(nk, acc.close);
      }

      const rows = ordered
        .map(({ row, open, close, rollovers }) => {
          const litres =
            open !== null && close !== null && close >= open ? dec(String(close)).minus(dec(String(open))) : dec('0');
          return {
            ...row,
            opening: open === null ? '' : String(open),
            closing: close === null ? '' : String(close),
            litres: litresStr(litres),
            test_litres: '0.000',
            rollovers,
          } as ReportRow;
        })
        .sort((a, b) =>
          `${String(a.shift_date)}-${a.shift_type === 'day' ? 0 : 1}-${String(a.dispenser_code)}-${String(a.nozzle_no)}`.localeCompare(
            `${String(b.shift_date)}-${b.shift_type === 'day' ? 0 : 1}-${String(b.dispenser_code)}-${String(b.nozzle_no)}`,
          ),
        );
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'lubricant-movement': {
      const [{ data, error: qErr }, { data: skus }] = await Promise.all([
        supabase
          .from('lub_transactions')
          .select('txn_at, txn_type, qty, rate, amount, vehicle_ref, lub_skus(name, unit), customers(name)')
          .is('deleted_at', null)
          .eq('txn_type', 'sale')
          .gte('txn_at', `${from}T10:00:00+06:00`)
          .lte('txn_at', businessDayEnd(to))
          .order('txn_at'),
        supabase
          .from('lub_skus')
          .select('name, unit, current_sale_rate, lub_stock(qty_on_hand)')
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('name'),
      ]);

      // Quantity is shown in each product's own unit (PCS, kg or litres), as on the Lubricants page.
      const stockRows = rowsOf(skus).map((s) => {
        const st = first<{ qty_on_hand: number }>(s.lub_stock);
        const qty = asLitres(st?.qty_on_hand ?? 0);
        const rate = asMoney(v(s, 'current_sale_rate'));
        return {
          txn_at: '',
          sku: text(s, 'name'),
          txn_type: 'In stock',
          qty: formatLubQty(qty, text(s, 'unit'), 'en'),
          rate,
          amount: moneyStr(dec(qty).times(dec(rate))),
          party: '',
        };
      });
      const saleRows = rowsOf(data).map((r) => {
        const sku = first<{ name: string; unit: string }>(r.lub_skus);
        return {
          txn_at: text(r, 'txn_at'),
          sku: sku?.name ?? '',
          txn_type: 'Sale',
          qty: formatLubQty(asLitres(v(r, 'qty')), sku?.unit, 'en'),
          rate: asMoney(v(r, 'rate')),
          amount: asMoney(v(r, 'amount')),
          party: first<{ name: string }>(r.customers)?.name ?? text(r, 'vehicle_ref'),
        };
      });
      const sections = [
        { en: 'Stock on hand (at sale rate)', bn: 'মজুদ (বিক্রয় দরে)', rows: stockRows, totals: totalsFor(report, stockRows, canSeeCost) },
        { en: 'Sales', bn: 'বিক্রয়', rows: saleRows, totals: totalsFor(report, saleRows, canSeeCost) },
      ];
      const rows = [...stockRows, ...saleRows];
      return { ...empty, rows, totals: {}, sections, error: qErr?.message };
    }

    case 'dip-register': {
      const { data, error: qErr } = await supabase
        .from('tank_dips')
        .select('recorded_at, dip_type, dip_mm, litres, tanks(code), profiles:recorded_by(full_name), approver:approved_by(full_name)')
        .is('deleted_at', null)
        .gte('recorded_at', `${from}T10:00:00+06:00`)
        .lte('recorded_at', businessDayEnd(to))
        .order('recorded_at', { ascending: false });

      const LABEL: Record<string, string> = {
        open: 'Shift open',
        close: 'Shift close',
        pre_refill: 'Before refill',
        post_refill: 'After refill',
      };

      const rows = rowsOf(data).map((r) => ({
        recorded_at: text(r, 'recorded_at'),
        tank_code: first<{ code: string }>(r.tanks)?.code ?? '',
        dip_type: LABEL[text(r, 'dip_type')] ?? text(r, 'dip_type'),
        dip_mm: v(r, 'dip_mm'),
        litres: asLitres(v(r, 'litres')),
        recorded_by: first<{ full_name: string }>(r.profiles)?.full_name ?? '',
        approved_by: first<{ full_name: string }>(r.approver)?.full_name ?? '',
      })).filter((r) => r.tank_code.toUpperCase() !== 'TRUCK');
      return { ...empty, rows, totals: totalsFor(report, rows, canSeeCost), error: qErr?.message };
    }

    case 'audit-log': {
      const { data, error: qErr } = await supabase
        .from('audit_log')
        .select('created_at, table_name, action, actor_role, actor_id, reason')
        .gte('created_at', `${from}T10:00:00+06:00`)
        .lte('created_at', businessDayEnd(to))
        .order('created_at', { ascending: false })
        .limit(2000);

      const actorIds = [...new Set(rowsOf(data).map((r) => text(r, 'actor_id')).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
        for (const p of rowsOf(people)) nameById.set(text(p, 'id'), text(p, 'full_name'));
      }

      const ACTION: Record<string, string> = { insert: 'Added', update: 'Changed', delete: 'Deleted' };
      const rows = rowsOf(data).map((r) => ({
        at: text(r, 'created_at'),
        actor: nameById.get(text(r, 'actor_id')) ?? 'system',
        actor_role: text(r, 'actor_role'),
        table_name: text(r, 'table_name').replace(/_/g, ' '),
        action: ACTION[text(r, 'action')] ?? text(r, 'action'),
        summary: text(r, 'reason'),
      }));
      return { ...empty, rows, totals: {}, error: qErr?.message };
    }

    default:
      return empty;
  }
}

/**
 * Totals for the columns that asked for one.
 *
 * Summed from the rows on the page rather than fetched separately: a total
 * that came from a different query than its rows is a total nobody can check
 * by adding up the column.
 */
function totalsFor(
  report: ReportDefinition,
  rows: ReportRow[],
  canSeeCost: boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const column of visibleColumns(report, canSeeCost)) {
    if (!column.total) continue;
    const values: string[] = [];
    for (const row of rows) {
      const value = row[column.key];
      if (value === null || value === undefined || value === '') continue;
      values.push(String(value));
    }
    // decimal.js, not +=. A column of money added with floats is exactly the
    // thing lib/data/numeric.ts exists to prevent.
    const total = decSum(values);
    out[column.key] =
      column.kind === 'litres'
        ? litresStr(total)
        : column.kind === 'number'
          ? total.toFixed(0)
          : moneyStr(total);
  }
  return out;
}
