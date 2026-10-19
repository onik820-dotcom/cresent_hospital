
import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';

/**
 * The wizard's payload, as the database functions expect it. Every figure
 * travels as a string so nothing passes through a JavaScript float on the way.
 */
export interface ClosePayload {
  rate_per_litre: string;
  readings: Array<{ nozzle_id: string; closing: string; test_litres: string }>;
  dips: Array<{ tank_id: string; dip_mm: string }>;
  credit_sales: Array<{
    customer_id: string;
    litres?: string;
    rate?: string;
    amount: string;
    vehicle_no?: string;
    challan_no?: string;
  }>;
  lubricant_sales: Array<{ sku_id: string; qty: string; rate?: string; amount: string; customer_id?: string }>;
  expenses: Array<{ category_id: string; amount: string; description?: string; paid_by?: string }>;
  cash: {
    /**
     * Read only on the very first close. Once a shift has been closed the
     * database chains the opening from that shift's count and ignores this.
     */
    opening_cash: string;
    bank_deposits: string;
    counted_cash: string;
  };
  variance_reasons?: Record<string, string>;
  cash_variance_reason?: string;
}

export interface CloseSummary {
  readings: Array<{
    nozzle_id: string;
    dispenser_code: string;
    nozzle_no: number;
    tank_id: string;
    opening: number;
    closing: number;
    litres: number;
    test_litres: number;
    is_rollover: boolean;
    implausible: boolean;
    max_possible: number;
  }>;
  sales: {
    gross_litres: string;
    test_litres: string;
    net_litres: string;
    rate_per_litre: string;
    sales_amount: string;
    lubricant_sales: string;
    credit_sales: string;
    total_sales: string;
    cash_sales: string;
  };
  tanks: Array<{
    tank_id: string;
    tank_code: string;
    dip_mm: string;
    book_opening: string;
    refill_litres: string;
    returned_litres?: string;
    sold_from_tank: string;
    book_closing: string;
    physical_closing: string;
    variance_litres: string;
    variance_pct: string | null;
    variance_flagged: boolean;
  }>;
  expenses: { total: string; cash: string };
  cash: {
    opening_cash: string;
    /** 'previous_shift' once a shift has been closed; 'entered' only for the first. */
    opening_source: 'previous_shift' | 'entered';
    cash_sales: string;
    /** Cash collected from parties during this shift, summed from payment rows. */
    dues_collected: string;
    /** Collected by bKash, bank or cheque — real money, but not in the drawer. */
    dues_non_cash: string;
    dues_payment_count: number;
    expenses_cash: string;
    bank_deposits: string;
    expected_cash: string;
    counted_cash: string;
    cash_variance: string;
    requires_reason: boolean;
  };
  thresholds: { variance_pct: string; cash_tolerance: string };
  closed?: boolean;
}

export interface CloseResult {
  ok: boolean;
  error?: string;
  summary?: CloseSummary;
}

function fail(error: unknown, fallback: string): CloseResult {
  const message =
    typeof error === 'object' && error && 'message' in error ? String(error.message) : fallback;
  return { ok: false, error: message };
}

/**
 * The reconciliation summary, computed by the database and writing nothing.
 * The same function runs again inside close_shift, so what is shown here is
 * what gets stored.
 */
export async function previewClose(shiftId: string, payload: ClosePayload): Promise<CloseResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may close a shift' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('compute_shift_close', {
    p_shift_id: shiftId,
    p_payload: payload,
  });

  if (error) return fail(error, 'The close could not be worked out');
  return { ok: true, summary: data as CloseSummary };
}

/** Sign-off. Refused by the database if a flagged variance has no reason. */
export async function submitClose(shiftId: string, payload: ClosePayload): Promise<CloseResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may close a shift' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('close_shift', {
    p_shift_id: shiftId,
    p_payload: payload,
  });

  if (error) return fail(error, 'The shift could not be closed');

  
  
  
  
  return { ok: true, summary: data as CloseSummary };
}

/** Admin only: replaces a reopened shift's close and recalculates every later shift. */
export async function adminRecloseShift(shiftId: string, payload: ClosePayload): Promise<CloseResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only an admin may edit a closed shift' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_reclose_shift', { p_shift_id: shiftId, p_payload: payload as never });
  if (error) return fail(error, 'The shift could not be saved');
  return { ok: true, summary: data as unknown as CloseSummary };
}

export interface ClosedShiftRow {
  id: string;
  shiftDate: string;
  shiftType: 'day' | 'night';
  closedAt: string | null;
  netLitres: string | null;
  salesAmount: string | null;
  countedCash: string | null;
}

export async function listClosedShifts(limit = 30): Promise<ClosedShiftRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shifts')
    .select('id, shift_date, shift_type, closed_at, shift_sales(net_litres, sales_amount), cash_reconciliation(counted_cash)')
    .eq('status', 'closed')
    .order('starts_at', { ascending: false })
    .limit(limit);
  const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const s = one(r.shift_sales as { net_litres: string; sales_amount: string } | null);
    const c = one(r.cash_reconciliation as { counted_cash: string } | null);
    return {
      id: r.id as string,
      shiftDate: r.shift_date as string,
      shiftType: r.shift_type as 'day' | 'night',
      closedAt: (r.closed_at as string) ?? null,
      netLitres: s?.net_litres ?? null,
      salesAmount: s?.sales_amount ?? null,
      countedCash: c?.counted_cash ?? null,
    };
  });
}

export async function reopenShift(shiftId: string, reason: string): Promise<CloseResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') {
    return { ok: false, error: 'Only an admin may reopen a closed shift' };
  }
  if (reason.trim().length < 3) {
    return { ok: false, error: 'Reopening a shift needs a reason' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_shift', { p_shift_id: shiftId, p_reason: reason.trim() });
  if (error) return fail(error, 'That shift could not be reopened');

  
  
  
  return { ok: true };
}

export interface RecalcRow {
  out_shift_id: string;
  out_tank_id: string;
  out_book_opening: string;
  out_book_closing: string;
  out_variance_litres: string | null;
}

/**
 * Rebuild the book chain from a shift forward. Needed after any correction to
 * a closed shift, because every later shift's opening stock moves with it.
 */
export async function recalculateFrom(shiftId: string): Promise<{ ok: boolean; error?: string; rows?: RecalcRow[] }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') {
    return { ok: false, error: 'Only an admin may recalculate the stock chain' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('recalculate_from', { p_shift_id: shiftId });
  if (error) return { ok: false, error: error.message };

  
  
  return { ok: true, rows: (data ?? []) as RecalcRow[] };
}

/**
 * A close needs an opening reading for every nozzle. Normally that is the
 * previous shift's closing, or an 'open' round the dispenser submitted. When
 * neither exists — the very first close of a fresh station — the manager types
 * it on the meter step and it is written here as this shift's opening round.
 */
export async function recordOpeningReadings(
  shiftId: string,
  entries: Array<{ nozzle_id: string; reading: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may record an opening reading' };
  }
  const rows = entries
    .filter((e) => e.nozzle_id && e.reading.trim() !== '')
    .map((e) => ({
      shift_id: shiftId,
      nozzle_id: e.nozzle_id,
      reading_type: 'open' as const,
      reading: e.reading.trim(),
      is_rollover: false,
      recorded_by: profile.id,
      created_by: profile.id,
    }));
  if (rows.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from('meter_readings').insert(rows);
  if (error) {
    const message = 'message' in error ? String(error.message) : 'Those opening readings could not be saved';
    return { ok: false, error: message };
  }
  return { ok: true };
}

/**
 * The tank twin of recordOpeningReadings: an opening dip for this shift when
 * no previous close carries the book stock forward. Litres are left to the
 * database trigger, which reads the tank's certified calibration table.
 */
export async function recordOpeningDips(
  shiftId: string,
  entries: Array<{ tank_id: string; dip_mm: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may record an opening dip' };
  }
  const rows = entries
    .filter((e) => e.tank_id && e.dip_mm.trim() !== '')
    .map((e) => ({
      shift_id: shiftId,
      tank_id: e.tank_id,
      dip_type: 'open' as const,
      dip_mm: e.dip_mm.trim(),
      litres: 0,
      recorded_by: profile.id,
      created_by: profile.id,
    }));
  if (rows.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from('tank_dips').insert(rows);
  if (error) {
    const message = 'message' in error ? String(error.message) : 'Those opening dips could not be saved';
    return { ok: false, error: message };
  }
  return { ok: true };
}
