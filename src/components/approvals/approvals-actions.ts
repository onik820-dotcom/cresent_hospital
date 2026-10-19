import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { moneyStr } from '@/lib/calc/decimal';
import { signalRefresh } from '@/lib/refresh';

/**
 * A manager's decisions on submitted work: a sale becomes cash or a party's
 * due, and a dip or a delivery gets the manager's name against it.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function fail(error: unknown, fallback: string): ActionResult {
  const message =
    typeof error === 'object' && error && 'message' in error ? String(error.message) : fallback;
  return { ok: false, error: message };
}

async function requireOps() {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') return null;
  return profile;
}

/** Cash: the money is in the drawer, nothing is owed. */
export async function settleSaleAsCash(readingId: string, amount?: string): Promise<ActionResult> {
  const profile = await requireOps();
  if (!profile) return { ok: false, error: 'Only a manager or an admin may approve a sale' };

  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    settlement: 'cash',
    customer_id: null,
    approved_by: profile.id,
    approved_at: new Date().toISOString(),
    updated_by: profile.id,
  };
  if (amount && amount.trim()) patch['sale_amount'] = moneyStr(amount);

  const { error } = await supabase.from('meter_readings').update(patch).eq('id', readingId);
  if (error) return fail(error, 'That sale could not be marked cash');

  signalRefresh();
  return { ok: true };
}

/** Due: the sale goes on a party's account, exactly as a credit sale does. */
export async function settleSaleAsCredit(
  readingId: string,
  customerId: string,
  amount: string,
): Promise<ActionResult> {
  const profile = await requireOps();
  if (!profile) return { ok: false, error: 'Only a manager or an admin may approve a sale' };
  if (!customerId) return { ok: false, error: 'Pick the party first' };
  if (!amount || !amount.trim() || Number(amount) <= 0) return { ok: false, error: 'Enter the amount' };

  const supabase = await createClient();

  const { data: reading, error: readError } = await supabase
    .from('meter_readings')
    .select('id, shift_id')
    .eq('id', readingId)
    .maybeSingle();
  if (readError || !reading) return fail(readError, 'That sale could not be read');

  const { data: sale, error: saleError } = await supabase
    .from('credit_sales')
    .insert({
      shift_id: (reading as any).shift_id,
      customer_id: customerId,
      amount: moneyStr(amount),
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (saleError) return fail(saleError, 'That sale could not be put on the party account');

  const { error } = await supabase
    .from('meter_readings')
    .update({
      settlement: 'credit',
      customer_id: customerId,
      credit_sale_id: (sale as any).id,
      sale_amount: moneyStr(amount),
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('id', readingId);

  if (error) return fail(error, 'The sale was booked but could not be marked approved');

  signalRefresh();
  return { ok: true };
}

async function approve(table: 'tank_dips' | 'tanker_deliveries', id: string): Promise<ActionResult> {
  const profile = await requireOps();
  if (!profile) return { ok: false, error: 'Only a manager or an admin may approve this' };

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('id', id);

  if (error) return fail(error, 'That could not be approved');
  signalRefresh();
  return { ok: true };
}

export const approveDip = (id: string) => approve('tank_dips', id);
export const approveDelivery = (id: string) => approve('tanker_deliveries', id);
