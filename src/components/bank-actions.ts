import { businessDate } from '@/lib/format';
import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { dec, moneyStr } from '@/lib/calc/decimal';

export interface BankDepositInput {
  bank_name: string;
  account_no?: string;
  amount: string;
  reference?: string;
  txn_date?: string;
  /** Cash taken out of the drawer: lowers cash in drawer and the shift close. */
  from_drawer?: boolean;
}

export interface BankDepositResult {
  ok: boolean;
  error?: string;
}

/**
 * Cash banked leaves the drawer, so the slip is stamped with the shift that
 * was open when it was taken. The shift close then subtracts it without
 * anybody retyping the figure.
 */
export async function recordBankDeposit(input: BankDepositInput): Promise<BankDepositResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin' && profile?.role !== 'accountant') {
    return { ok: false, error: 'Only a manager or an admin may record a bank deposit' };
  }
  if (!input.bank_name.trim()) return { ok: false, error: 'Enter the bank name' };
  if (!input.amount.trim()) return { ok: false, error: 'Enter the amount' };

  const amount = moneyStr(input.amount);
  if (dec(amount).lessThanOrEqualTo(0)) {
    return { ok: false, error: 'A deposit must be more than zero' };
  }

  const supabase = await createClient();
  const [{ data: shift }, { data: station }] = await Promise.all([
    supabase.rpc('current_shift_id'),
    supabase.from('stations').select('id').limit(1).single(),
  ]);

  // The drawer lives inside a shift: take the running one, or the latest one still open.
  let shiftId = (shift as string | null) ?? null;
  if (!shiftId) {
    const { data: openShift } = await supabase
      .from('shifts')
      .select('id')
      .in('status', ['open', 'closing', 'reopened'])
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    shiftId = openShift?.id ?? null;
  }
  if (!shiftId) {
    return { ok: false, error: 'Open a shift first — the deposit comes out of that shift\'s cash' };
  }
  const { getCashPosition } = await import('@/lib/data/money');
  const pos = await getCashPosition(1);
  if (input.from_drawer && pos.inHand !== null && dec(amount).greaterThan(dec(pos.inHand))) {
    return { ok: false, error: `Only ৳${pos.inHand} cash is in hand — the deposit cannot be larger` };
  }

  const today = new Date();
  const localDate = businessDate(today);

  const { error } = await supabase.from('bank_transactions').insert({
    station_id: station?.id ?? null,
    shift_id: shiftId,
    txn_date: input.txn_date?.trim() || localDate,
    bank_name: input.bank_name.trim(),
    account_no: input.account_no?.trim() || null,
    type: 'deposit',
    amount,
    reference: input.reference?.trim() || (input.from_drawer ? 'Cash from drawer' : null),
    from_drawer: Boolean(input.from_drawer),
    created_by: profile.id,
  });

  if (error) {
    const message = 'message' in error ? String(error.message) : 'That deposit could not be recorded';
    return { ok: false, error: message };
  }
  return { ok: true };
}

export interface BankDebitInput {
  bank_name: string;
  account_no?: string;
  amount: string;
  reason: string;
  txn_date?: string;
}

/** Money taken out of the bank. A reason is required. */
export async function recordBankDebit(input: BankDebitInput): Promise<BankDepositResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin' && profile?.role !== 'accountant') {
    return { ok: false, error: 'Only a manager, account manager or admin may record a bank debit' };
  }
  if (!input.bank_name.trim()) return { ok: false, error: 'Choose the bank account' };
  if (!input.amount.trim()) return { ok: false, error: 'Enter the amount' };
  if (!input.reason.trim()) return { ok: false, error: 'Enter the reason for the debit' };
  const amount = moneyStr(input.amount);
  if (dec(amount).lessThanOrEqualTo(0)) return { ok: false, error: 'A debit must be more than zero' };

  const supabase = await createClient();
  const { data: station } = await supabase.from('stations').select('id').limit(1).single();
  const { error } = await supabase.from('bank_transactions').insert({
    station_id: station?.id ?? null,
    shift_id: null,
    txn_date: input.txn_date?.trim() || businessDate(new Date()),
    bank_name: input.bank_name.trim(),
    account_no: input.account_no?.trim() || null,
    type: 'withdrawal',
    amount,
    reference: input.reason.trim(),
    created_by: profile.id,
  });
  if (error) return { ok: false, error: String(error.message ?? 'That debit could not be recorded') };
  return { ok: true };
}

/** Owner only: correct a saved bank line. The database guard also enforces this. */
export async function updateBankTxn(
  id: string,
  input: { amount: string; reference?: string; txn_date?: string; bank_name?: string; account_no?: string },
): Promise<BankDepositResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only the owner may change a saved record' };
  const amount = moneyStr(input.amount);
  if (dec(amount).lessThanOrEqualTo(0)) return { ok: false, error: 'Amount must be more than zero' };
  const supabase = await createClient();
  const patch: Record<string, unknown> = { amount, reference: input.reference?.trim() || null, updated_by: profile.id };
  if (input.txn_date?.trim()) patch.txn_date = input.txn_date.trim();
  if (input.bank_name?.trim()) patch.bank_name = input.bank_name.trim();
  if (input.account_no !== undefined) patch.account_no = input.account_no.trim() || null;
  const { error } = await supabase.from('bank_transactions').update(patch as never).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Owner only: remove a bank line (kept hidden in history, never erased). */
export async function deleteBankTxn(id: string, reason: string): Promise<BankDepositResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only the owner may delete a saved record' };
  if (!reason.trim()) return { ok: false, error: 'Enter a reason' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('bank_transactions')
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id, delete_reason: reason.trim() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
