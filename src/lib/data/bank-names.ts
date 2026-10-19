import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';

const KEY = 'bank_names';

export interface BankAccount {
  bank: string;
  account: string;
}

export const accountKey = (a: BankAccount) => `${a.bank}|||${a.account}`;
export const accountLabel = (a: BankAccount) => (a.account ? `${a.bank} — ${a.account}` : a.bank);

function clean(list: unknown[]): BankAccount[] {
  const seen = new Map<string, BankAccount>();
  for (const raw of list) {
    const item: BankAccount =
      typeof raw === 'string'
        ? { bank: raw.trim(), account: '' }
        : { bank: String((raw as any)?.bank ?? '').trim(), account: String((raw as any)?.account ?? '').trim() };
    if (!item.bank) continue;
    seen.set(accountKey(item), item);
  }
  return [...seen.values()].sort((a, b) => a.bank.localeCompare(b.bank) || a.account.localeCompare(b.account));
}

/** Bank accounts (bank name + account number) offered in the bank deposit dropdown. */
export async function getBankAccounts(): Promise<BankAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
  const list = Array.isArray((data?.value as any)?.value) ? ((data!.value as any).value as unknown[]) : [];
  return clean(list);
}

export async function saveBankAccounts(list: BankAccount[]): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only an admin may change this list' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('settings')
    .update({ value: { value: clean(list) } as any, updated_by: profile.id })
    .eq('key', KEY);
  if (error) return { ok: false, error: error.message };
  signalRefresh();
  return { ok: true };
}
