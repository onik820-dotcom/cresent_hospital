import { createClient } from '@/lib/data/client';
import { asLitres, asMoney } from '@/lib/data/numeric';
import { decOr0, sum } from '@/lib/calc/decimal';
import { businessDayEnd } from '@/lib/format';

/**
 * The figures behind every dashboard.
 *
 * One call to one database function, so the manager's page and the MD's page
 * cannot quietly disagree about what the station sold today. Profit is absent
 * rather than zero for a role that may not see it: a zero would read as "no
 * profit", which is a different statement from "not yours to see".
 */

export interface DashboardKpis {
  businessDate: string;
  todaySales: string;
  todayLitres: string;
  monthSales: string;
  monthLitres: string;
  monthFrom: string;
  /** Today's sales settled as cash, in taka. */
  cashSaleToday: string;
  /** Today's lubricant sales value, in taka. */
  lubSaleToday: string;
  /** Money taken from parties against their dues today, in taka. */
  duesCollectedToday: string;
  duesCollectedCount: number;
  /** Everything spent today, in taka, across every book. */
  expensesToday: string;
  expensesTodayCount: number;
  /** Null until the first shift is closed — nothing has been counted yet. */
  cashInHand: string | null;
  duesOutstanding: string;
  partiesOverLimit: number;
  openVariances: number;
  stockLitres: string;
  /** Null when nothing has sold yet: there is no rate to divide by. */
  daysCover: string | null;
  /** Everything on the Mobil shelf, in litres across all active products. */
  mobilStockLitres: string;
  mobilSkuCount: number;
  /** Fuel physically received into the tanks on the business date. */
  todayRefillLitres: string;
  todayRefillCount: number;
  /** What the rod itself says entered the tanks today, before/after refill. */
  dipRefillLitres: string;
  dipRefillTanks: number;
  /** Absent for a manager. */
  monthProfit: string | null;
  seesProfit: boolean;
  /** 'day' | 'night' when the cards are scoped to the open shift. */
  shiftType?: string | null;
}

export async function getDashboardKpis(): Promise<DashboardKpis | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('dashboard_kpis');
  if (error || !data) return null;

  const k = data as Record<string, never>;
  const today = k.today as unknown as { sales: number; litres: number };
  const month = k.month as unknown as { sales: number; litres: number; from: string };
  const businessDate = String(k.business_date);

  // Every "today" card is scoped to the current shift (day or night), so the
  // night shift never inherits the day shift's figures.
  const { data: shiftInfo } = await supabase.rpc('current_shift_info');
  const shift = (Array.isArray(shiftInfo) ? shiftInfo[0] : shiftInfo) as
    | { id: string; starts_at: string; ends_at: string; shift_type: string }
    | undefined;
  const from = shift?.starts_at ?? `${businessDate}T10:00:00+06:00`;
  const to = shift?.ends_at ?? businessDayEnd(businessDate);
  const refillTo = new Date(Math.max(new Date(to).getTime(), Date.now())).toISOString();

  // The two dashboard extras the RPC does not carry: the Mobil shelf, and
  // what physically entered the tanks today. Both read the same rows the
  // lubricants and refill screens read, so the cards cannot disagree with
  // those pages.
  const [
    { data: stockRows },
    { data: deliveries },
    { data: cashSales },
    { data: lubSales },
    { data: duePayments },
    { data: todayExpenses },
  ] = await Promise.all([
      supabase
        .from('lub_stock')
        .select('qty_on_hand, lub_skus!inner(deleted_at, is_active)')
        .is('lub_skus.deleted_at', null)
        .eq('lub_skus.is_active', true),
      supabase
        // Oil moved into station tanks (not purchases into the truck book, not
        // opening stock), including litres sold while the tank was filling.
        // An open shift running past its scheduled end keeps counting.
        .from('tanker_compartments')
        .select('delivery_id, received_litres, sold_litres, tanks!inner(code), tanker_deliveries!inner(arrived_at, deleted_at, is_opening_stock)')
        .neq('tanks.code', 'TRUCK')
        .is('tanker_deliveries.deleted_at', null)
        .eq('tanker_deliveries.is_opening_stock', false)
        // Whole business day (day + night shift), 10:00 to next 10:00.
        .gte('tanker_deliveries.arrived_at', `${businessDate}T10:00:00+06:00`)
        .lte('tanker_deliveries.arrived_at', new Date(Math.max(new Date(`${businessDate}T10:00:00+06:00`).getTime() + 86400000, Date.now())).toISOString()),
      // Today's cash-settled sales, from the meter readings the manager
      // marked "cash" — the same figures the approvals panel settles.
      supabase
        .from('meter_readings')
        .select('sale_amount, settlement')
        .is('deleted_at', null)
        .gte('created_at', from)
        .lte('created_at', to),
      // Today's lubricant sales value — own use is never a sale.
      supabase
        .from('lub_transactions')
        .select('amount')
        .is('deleted_at', null)
        .eq('txn_type', 'sale')
        .gte('txn_at', from)
        .lte('txn_at', to),
      // Dues collected today: money taken from parties against what they owe,
      // by any method. Sales are not collections, so credit sales stay out.
      supabase
        .from('payments')
        .select('amount')
        .is('deleted_at', null)
        .gte('received_at', from)
        .lte('received_at', to),
      // Everything spent today, across every expense book.
      supabase
        .from('expenses')
        .select('amount, expense_categories!inner(name)')
        .is('deleted_at', null)
        .neq('paid_by', 'petty')
        .neq('expense_categories.name', 'Petty Cash')
        .gte('spent_at', from)
        .lte('spent_at', to),
    ]);

  const mobilRows = (stockRows ?? []) as Array<{ qty_on_hand: string | number | null }>;
  const refillComps = (deliveries ?? []) as Array<{ delivery_id: string; received_litres: string | number | null; sold_litres: string | number | null }>;
  const refillRows = [...new Set(refillComps.map((c) => c.delivery_id))];
  const saleRows = (cashSales ?? []) as Array<{ sale_amount: string | number | null; settlement: string }>;
  const cashRows = saleRows.filter((r) => r.settlement === 'cash');
  const shiftSales = sum(saleRows.map((r) => decOr0(r.sale_amount)));
  let shiftRate = 0;
  if (shift?.id) {
    const { data: sr } = await supabase.from('shifts').select('rate_per_litre').eq('id', shift.id).maybeSingle();
    shiftRate = Number(sr?.rate_per_litre ?? 0);
  }
  // An open shift has no rate until it is closed; use the latest known rate.
  if (!(shiftRate > 0)) {
    const { data: last } = await supabase
      .from('shifts')
      .select('rate_per_litre')
      .not('rate_per_litre', 'is', null)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    shiftRate = Number(last?.rate_per_litre ?? 0);
  }
  const lubRows = (lubSales ?? []) as Array<{ amount: string | number | null }>;
  const dueRows = (duePayments ?? []) as Array<{ amount: string | number | null }>;
  const expenseRows = (todayExpenses ?? []) as Array<{ amount: string | number | null }>;

  // The rod's own account of today's refill, from the before/after dips the
  // employee takes. It stands on its own when no tanker paperwork exists yet.
  const { getDipRefillTotal } = await import('@/lib/data/dip-refill');
  const dipRefill = await getDipRefillTotal(businessDate);
  // Cash in drawer = last count minus cash sent to the bank since then.
  const { getCashPosition } = await import('@/lib/data/money');
  const drawer = await getCashPosition(1);

  return {
    businessDate,
    dipRefillLitres: dipRefill.litres,
    dipRefillTanks: dipRefill.tanks,
    mobilStockLitres: sum(mobilRows.map((r) => decOr0(r.qty_on_hand))).toFixed(3),
    mobilSkuCount: mobilRows.length,
    todayRefillLitres: sum(refillComps.map((c) => decOr0(c.received_litres).plus(decOr0(c.sold_litres)))).toFixed(3),
    todayRefillCount: refillRows.length,
    todaySales: shift ? shiftSales.toFixed(2) : asMoney(today?.sales),
    todayLitres: shift
      ? (shiftRate > 0 ? (Number(shiftSales.toFixed(2)) / shiftRate).toFixed(3) : '0.000')
      : asLitres(today?.litres),
    shiftType: shift?.shift_type ?? null,
    monthSales: asMoney(month?.sales),
    monthLitres: asLitres(month?.litres),
    monthFrom: String(month?.from ?? ''),
    cashSaleToday: shift
      ? sum(cashRows.map((r) => decOr0(r.sale_amount))).toFixed(2)
      : await closedDayCashSales(supabase, businessDate),
    lubSaleToday: sum(lubRows.map((r) => decOr0(r.amount))).toFixed(2),
    duesCollectedToday: sum(dueRows.map((r) => decOr0(r.amount))).toFixed(2),
    duesCollectedCount: dueRows.length,
    expensesToday: sum(expenseRows.map((r) => decOr0(r.amount))).toFixed(2),
    expensesTodayCount: expenseRows.length,
    cashInHand: drawer.inHand ?? (k.cash_in_hand === null ? null : asMoney(k.cash_in_hand)),
    duesOutstanding: asMoney(k.dues_outstanding),
    partiesOverLimit: Number(k.parties_over_limit ?? 0),
    openVariances: Number(k.open_variances ?? 0),
    stockLitres: asLitres(k.stock_litres),
    daysCover: k.days_cover === null || k.days_cover === undefined ? null : String(k.days_cover),
    monthProfit: k.month_profit === null || k.month_profit === undefined ? null : asMoney(k.month_profit),
    seesProfit: Boolean(k.sees_profit),
  };
}

/** With no shift open, today's cash sales come from the signed-off shift closings. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function closedDayCashSales(supabase: any, businessDate: string): Promise<string> {
  const { data } = await supabase
    .from('shift_sales')
    .select('cash_sales, shifts!inner(shift_date)')
    .eq('shifts.shift_date', businessDate);
  const rows = (data ?? []) as Array<{ cash_sales: string | number | null }>;
  return rows.reduce((a, r) => a + Number(r.cash_sales ?? 0), 0).toFixed(2);
}
