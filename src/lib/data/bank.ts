import { businessDate } from '@/lib/format';
import { createClient } from '@/lib/data/client';
import { sum } from '@/lib/calc/decimal';
import { asMoney } from '@/lib/data/numeric';

/**
 * Bank statement.
 *
 * Credit = money put into the bank (a deposit from the drawer).
 * Debit  = money taken out of the bank, with a reason.
 * Balance = all credits minus all debits.
 */
export interface BankDepositRow {
  id: string;
  kind: 'credit' | 'debit';
  txnDate: string;
  bankName: string;
  accountNo: string | null;
  amount: string;
  reference: string | null;
  shiftId: string | null;
  createdAt: string;
  recordedBy: string | null;
}

export interface BankDepositBook {
  rows: BankDepositRow[];
  /** Credits (deposits) per period — kept for the shift close and dashboards. */
  totals: { day: string; week: string; month: string; year: string; all: string };
  creditToday: string;
  debitToday: string;
  balance: string;
}

function startOf(kind: 'day' | 'week' | 'month' | 'year'): Date {
  const [y, m, day] = businessDate().split('-').map(Number);
  const d = new Date(y!, m! - 1, day!);
  if (kind === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (kind === 'month') d.setDate(1);
  if (kind === 'year') { d.setMonth(0); d.setDate(1); }
  return d;
}

export async function getBankDeposits(limit = 1000): Promise<BankDepositBook> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bank_transactions')
    .select('id, type, txn_date, bank_name, account_no, amount, reference, shift_id, created_at, profiles:created_by(full_name)')
    .in('type', ['deposit', 'withdrawal'])
    .is('deleted_at', null)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows: BankDepositRow[] = (data ?? []).map((r: any) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      kind: r.type === 'withdrawal' ? 'debit' : 'credit',
      txnDate: r.txn_date,
      bankName: r.bank_name,
      accountNo: r.account_no,
      amount: asMoney(r.amount),
      reference: r.reference,
      shiftId: r.shift_id,
      createdAt: r.created_at,
      recordedBy: p?.full_name ?? null,
    };
  });

  const credits = rows.filter((r) => r.kind === 'credit');
  const debits = rows.filter((r) => r.kind === 'debit');
  const within = (list: BankDepositRow[], from: Date) =>
    list.filter((r) => new Date(`${r.txnDate}T00:00:00`).getTime() >= from.getTime());
  const total = (list: BankDepositRow[]) => sum(list.map((r) => r.amount)).toFixed(2);

  return {
    rows,
    totals: {
      day: total(within(credits, startOf('day'))),
      week: total(within(credits, startOf('week'))),
      month: total(within(credits, startOf('month'))),
      year: total(within(credits, startOf('year'))),
      all: total(credits),
    },
    creditToday: total(within(credits, startOf('day'))),
    debitToday: total(within(debits, startOf('day'))),
    balance: sum(credits.map((r) => r.amount)).minus(sum(debits.map((r) => r.amount))).toFixed(2),
  };
}

/** What was banked out of one shift's drawer. Used by the shift close. */
export async function getShiftBankDeposits(shiftId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bank_transactions')
    .select('amount')
    .eq('type', 'deposit')
    .eq('shift_id', shiftId)
    .is('deleted_at', null)
    .is('source_id', null)
    .eq('from_drawer', true);
  return sum((data ?? []).map((r: any) => asMoney(r.amount))).toFixed(2);
}
