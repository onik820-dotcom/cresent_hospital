'use client';

import { useEffect, useState } from 'react';
import { Landmark, Plus, Trash2 } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { accountKey, getBankAccounts, saveBankAccounts, type BankAccount } from '@/lib/data/bank-names';

const INPUT = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';

/** Bank + account number list behind every bank dropdown in the app. */
export function BankNamesCard() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [list, setList] = useState<BankAccount[]>([]);
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useRefreshKey();

  useEffect(() => {
    getBankAccounts().then(setList);
  }, [refreshKey]);

  async function save(next: BankAccount[]) {
    const res = await saveBankAccounts(next);
    if (res.ok) {
      setList(await getBankAccounts());
      setError(null);
    } else setError(res.error ?? null);
  }

  function add() {
    if (!bank.trim()) return;
    save([...list, { bank: bank.trim(), account: account.trim() }]);
    setBank('');
    setAccount('');
  }

  return (
    <GlassCard lift={false} className="space-y-3">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'ব্যাংক ও হিসাব নম্বর' : 'Banks & account numbers'}
        </h2>
      </div>
      <Muted lang={lang}>
        {bn ? 'ব্যাংক স্টেটমেন্টের ড্রপডাউনে এগুলো আসবে।' : 'These appear in the bank statement dropdown.'}
      </Muted>
      {list.length === 0 ? (
        <Muted lang={lang}>{bn ? 'এখনও কোনো ব্যাংক নেই' : 'No banks yet'}</Muted>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
          {list.map((n) => (
            <li key={accountKey(n)} className="flex items-center gap-2 py-2">
              <span className="text-sm font-semibold">{n.bank}</span>
              <span className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>{n.account || '—'}</span>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => save(list.filter((x) => accountKey(x) !== accountKey(n)))}
                className="tap-target state-breach ml-auto rounded-lg px-2 py-1"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder={bn ? 'ব্যাংকের নাম' : 'Bank name'} className={INPUT} style={{ borderColor: 'var(--hairline)' }} />
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={bn ? 'হিসাব নম্বর' : 'Account number'}
          className={`${INPUT} tabular`}
          style={{ borderColor: 'var(--hairline)' }}
        />
        <Button onClick={add} lang={lang}>
          <Plus className="h-4 w-4" aria-hidden />
          {bn ? 'যোগ করুন' : 'Add'}
        </Button>
      </div>
      {error ? <p className="state-breach text-sm">{error}</p> : null}
    </GlassCard>
  );
}
