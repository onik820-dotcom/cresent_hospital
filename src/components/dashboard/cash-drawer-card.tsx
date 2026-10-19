'use client';

import { useEffect, useState } from 'react';
import { Landmark, Wallet } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT } from '@/lib/format';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { FormWindow } from '@/components/ui/form-window';
import { BankAccountSelect } from '@/components/bank-account-select';
import type { BankAccount } from '@/lib/data/bank-names';
import { signalRefresh, useRefreshKey } from '@/lib/refresh';
import { getCashPosition } from '@/lib/data/money';
import { recordBankDeposit } from '@/components/bank-actions';

const INPUT = 'tabular tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;

/** Cash in drawer now, with a button to send some of it to the bank. */
export function CashDrawerCard() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const refreshKey = useRefreshKey();
  const [inHand, setInHand] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getCashPosition(1).then((p) => setInHand(p.inHand));
  }, [refreshKey]);

  return (
    <GlassCard lift={false} className="space-y-2">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'ড্রয়ারে নগদ' : 'Cash in drawer'}
        </h2>
      </div>
      <p className="tabular text-2xl font-semibold tracking-tight">{formatBDT(inHand ?? '0', lang)}</p>
      <Muted lang={lang}>
        {bn ? 'শেষ গণনা থেকে ব্যাংকে জমা ও পেটি ক্যাশ ইন বাদ দিয়ে' : 'Last count, less bank deposits and petty cash in since'}
      </Muted>
      <Button onClick={() => setOpen(true)} lang={lang}>
        <Landmark className="h-4 w-4" aria-hidden />
        {bn ? 'ব্যাংকে জমা দিন' : 'Deposit to bank'}
      </Button>
      {open ? <DepositWindow inHand={inHand} onClose={() => setOpen(false)} /> : null}
    </GlassCard>
  );
}

function DepositWindow({ inHand, onClose }: { inHand: string | null; onClose: () => void }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = Number(amount.replace(/[,\s৳]/g, '')) || 0;
  const after = inHand === null ? null : Number(inHand) - typed;

  async function save() {
    if (!account) return setError(bn ? 'ব্যাংক হিসাব বাছুন' : 'Choose the bank account');
    setBusy(true);
    setError(null);
    const res = await recordBankDeposit({
      bank_name: account.bank,
      account_no: account.account,
      amount: amount.replace(/[,\s৳]/g, ''),
      reference,
      from_drawer: true,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? (bn ? 'রাখা গেল না' : 'Could not be saved'));
    signalRefresh();
    onClose();
  }

  return (
    <FormWindow
      title={bn ? 'ড্রয়ার থেকে ব্যাংকে জমা' : 'Deposit drawer cash to bank'}
      subtitle={bn ? 'ব্যাংক স্টেটমেন্টে ক্রেডিট হবে এবং ড্রয়ার থেকে বাদ যাবে।' : 'Shows as a credit on the Bank statement and comes off the drawer.'}
      onClose={onClose}
    >
      <div className="grid gap-3">
        <BankAccountSelect value={account} onChange={setAccount} className={INPUT} style={BORDER} bn={bn} />
        <input className={INPUT} style={BORDER} inputMode="decimal" placeholder={bn ? 'টাকার পরিমাণ' : 'Amount'} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className={INPUT} style={BORDER} placeholder={bn ? 'স্লিপ/রেফারেন্স (ঐচ্ছিক)' : 'Slip / reference (optional)'} value={reference} onChange={(e) => setReference(e.target.value)} />
        <div className="tabular text-sm" lang={lang}>
          <div>{bn ? 'ড্রয়ারে এখন' : 'In drawer now'}: {formatBDT(inHand ?? '0', lang)}</div>
          <div>{bn ? 'জমার পর থাকবে' : 'Left after deposit'}: <strong className={after !== null && after < 0 ? 'state-breach' : ''}>{formatBDT(String((after ?? 0).toFixed(2)), lang)}</strong></div>
        </div>
      </div>
      {error ? <p className="state-breach mt-3 text-xs" lang={lang}>{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} lang={lang}>{bn ? 'বাতিল' : 'Cancel'}</Button>
        <Button onClick={save} disabled={busy} lang={lang}>{busy ? (bn ? 'রাখা হচ্ছে…' : 'Saving…') : bn ? 'জমা রাখুন' : 'Save deposit'}</Button>
      </div>
    </FormWindow>
  );
}
