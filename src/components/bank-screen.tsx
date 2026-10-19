'use client';

import { businessDate } from '@/lib/format';
import { accountKey, accountLabel, getBankAccounts, type BankAccount } from '@/lib/data/bank-names';

import { useEffect, useMemo, useState } from 'react';
import { Download, Landmark, Minus, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatDate } from '@/lib/format';
import { EmptyState, GlassCard, Muted } from '@/components/ui/glass';
import { Button } from '@/components/jhm/button';
import { FormWindow } from '@/components/ui/form-window';
import { signalRefresh } from '@/lib/refresh';
import type { BankDepositBook } from '@/lib/data/bank';
import { deleteBankTxn, recordBankDebit, recordBankDeposit, updateBankTxn } from './bank-actions';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

const INPUT = 'tabular tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;

export function BankScreen({ book, isAdmin = false }: { book: BankDepositBook; isAdmin?: boolean }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [period, setPeriod] = useState<Period>('month');
  const [adding, setAdding] = useState<'credit' | 'debit' | null>(null);
  const [bankFilter, setBankFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const bankOptions = useMemo(() => [...new Set(book.rows.map((r) => r.bankName))].sort(), [book.rows]);
  const accountOptions = useMemo(
    () => [...new Set(book.rows.filter((r) => !bankFilter || r.bankName === bankFilter).map((r) => r.accountNo ?? ''))].filter(Boolean).sort(),
    [book.rows, bankFilter],
  );

  const labels: Record<Period, string> = {
    day: bn ? 'আজ' : 'Today',
    week: bn ? 'এ সপ্তাহ' : 'This week',
    month: bn ? 'এ মাস' : 'This month',
    year: bn ? 'এ বছর' : 'This year',
    all: bn ? 'সব' : 'All',
  };

  const rows = useMemo(() => {
    const base = book.rows.filter(
      (r) => (!bankFilter || r.bankName === bankFilter) && (!accountFilter || (r.accountNo ?? '') === accountFilter),
    );
    if (period === 'all') return base;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    if (period === 'month') from.setDate(1);
    if (period === 'year') { from.setMonth(0); from.setDate(1); }
    return base.filter((r) => new Date(`${r.txnDate}T00:00:00`).getTime() >= from.getTime());
  }, [book.rows, period, bankFilter, accountFilter]);

  const creditSum = rows.filter((r) => r.kind === 'credit').reduce((a, r) => a + Number(r.amount), 0);
  const debitSum = rows.filter((r) => r.kind === 'debit').reduce((a, r) => a + Number(r.amount), 0);
  const net = (creditSum - debitSum).toFixed(2);

  const cards = [
    { label: bn ? 'আজ ক্রেডিট (জমা)' : 'Credit today', value: book.creditToday ?? '0', cls: 'state-ok' },
    { label: bn ? 'আজ ডেবিট (উত্তোলন)' : 'Debit today', value: book.debitToday ?? '0', cls: 'state-breach' },
    { label: bn ? 'ব্যালান্স' : 'Balance', value: book.balance ?? '0', cls: '' },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <GlassCard key={c.label} lift={false}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>{c.label}</p>
            <p className={`tabular mt-1 text-2xl font-semibold tracking-tight ${c.cls}`}>{formatBDT(c.value, lang)}</p>
          </GlassCard>
        ))}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2 no-print">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {bn ? 'ব্যাংক স্টেটমেন্ট' : 'Bank statement'}
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {(['day', 'week', 'month', 'year', 'all'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                lang={lang}
                className="tap-target rounded-lg px-3 py-1.5 text-xs font-medium"
                style={
                  period === key
                    ? { background: 'var(--color-accent)', color: 'white' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {labels[key]}
              </button>
            ))}
            <Button
              variant="ghost"
              disabled={rows.length === 0}
              onClick={() => {
                const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
                const head = ['Date', 'Bank', 'Account no.', 'Details', 'Recorded by', 'Credit', 'Debit'];
                const body = rows.map((r) =>
                  [r.txnDate, r.bankName, r.accountNo ?? '', r.reference ?? '', r.recordedBy ?? '',
                    r.kind === 'credit' ? r.amount : '', r.kind === 'debit' ? r.amount : ''].map(esc).join(','),
                );
                const total = ['Total', '', '', '', '', creditSum.toFixed(2), debitSum.toFixed(2)].map(esc).join(',');
                const csv = '\uFEFF' + [head.map(esc).join(','), ...body, total].join('\r\n');
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `bank-statement_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              lang={lang}
            >
              <Download className="h-4 w-4" aria-hidden />
              Excel
            </Button>
            <Button variant="ghost" onClick={() => window.print()} lang={lang}>
              <Printer className="h-4 w-4" aria-hidden />
              {bn ? 'প্রিন্ট' : 'Print'}
            </Button>
            <Button onClick={() => setAdding('credit')} lang={lang}>
              <Plus className="h-4 w-4" aria-hidden />
              {bn ? 'ক্রেডিট যোগ' : 'Add credit'}
            </Button>
            <Button variant="ghost" onClick={() => setAdding('debit')} lang={lang}>
              <Minus className="h-4 w-4" aria-hidden />
              {bn ? 'ডেবিট যোগ' : 'Add debit'}
            </Button>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2 no-print">
          <select className={`${INPUT} w-auto`} style={BORDER} value={bankFilter} onChange={(e) => { setBankFilter(e.target.value); setAccountFilter(''); }}>
            <option value="">{bn ? 'সব ব্যাংক' : 'All banks'}</option>
            {bankOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className={`${INPUT} w-auto`} style={BORDER} value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="">{bn ? 'সব হিসাব' : 'All accounts'}</option>
            {accountOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <GlassCard lift={false}>
          {bankFilter || accountFilter ? (
            <p className="mb-1 text-sm font-semibold" lang={lang}>
              {bankFilter || (bn ? 'সব ব্যাংক' : 'All banks')}{accountFilter ? ` — ${bn ? 'হিসাব' : 'A/C'} ${accountFilter}` : ''}
            </p>
          ) : null}
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <Landmark className="h-4 w-4" aria-hidden style={{ color: 'var(--text-muted)' }} />
            <span className="font-semibold tracking-tight" lang={lang}>{labels[period]}</span>
            <span className="tabular ml-auto state-ok" lang={lang}>{bn ? 'ক্রেডিট' : 'Credit'} {formatBDT(creditSum.toFixed(2), lang)}</span>
            <span className="tabular state-breach" lang={lang}>{bn ? 'ডেবিট' : 'Debit'} {formatBDT(debitSum.toFixed(2), lang)}</span>
            <span className="tabular font-semibold" lang={lang}>{bn ? 'নিট' : 'Net'} {formatBDT(net, lang)}</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState title={bn ? 'এই সময়ে কোনো লেনদেন নেই' : 'No bank entries in this period'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: 'var(--text-muted)' }}>
                    <th className="py-2 pr-3 font-medium" lang={lang}>{bn ? 'তারিখ' : 'Date'}</th>
                    <th className="py-2 pr-3 font-medium" lang={lang}>{bn ? 'ব্যাংক' : 'Bank'}</th>
                    <th className="py-2 pr-3 font-medium" lang={lang}>{bn ? 'হিসাব নং' : 'Account no.'}</th>
                    <th className="py-2 pr-3 font-medium" lang={lang}>{bn ? 'বিবরণ/কারণ' : 'Reference / reason'}</th>
                    <th className="py-2 pr-3 font-medium" lang={lang}>{bn ? 'লিখেছেন' : 'Recorded by'}</th>
                    <th className="py-2 pr-3 text-right font-medium" lang={lang}>{bn ? 'ক্রেডিট' : 'Credit'}</th>
                    <th className="py-2 text-right font-medium" lang={lang}>{bn ? 'ডেবিট' : 'Debit'}</th>
                    {isAdmin ? <th className="no-print py-2 pl-3" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t" style={BORDER}>
                      <td className="tabular py-2 pr-3 whitespace-nowrap">{formatDate(r.txnDate, lang)}</td>
                      <td className="py-2 pr-3">{r.bankName}</td>
                      <td className="tabular py-2 pr-3">{r.accountNo ?? '—'}</td>
                      <td className="py-2 pr-3">{r.reference ?? '—'}</td>
                      <td className="py-2 pr-3">{r.recordedBy ?? '—'}</td>
                      <td className="tabular py-2 pr-3 text-right font-medium state-ok">{r.kind === 'credit' ? formatBDT(r.amount, lang) : ''}</td>
                      <td className="tabular py-2 text-right font-medium state-breach">{r.kind === 'debit' ? formatBDT(r.amount, lang) : ''}</td>
                      {isAdmin ? (
                        <td className="no-print py-2 pl-3 whitespace-nowrap text-right">
                          <RowActions row={r} bn={bn} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </section>

      {adding ? <EntryWindow kind={adding} onClose={() => setAdding(null)} /> : null}
    </div>
  );
}

function EntryWindow({ kind, onClose }: { kind: 'credit' | 'debit'; onClose: () => void }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const isDebit = kind === 'debit';
  const localDate = businessDate(new Date());

  const [choice, setChoice] = useState('');
  const [banks, setBanks] = useState<BankAccount[]>([]);
  useEffect(() => {
    getBankAccounts().then((l) => {
      setBanks(l);
      if (l.length === 1) setChoice(accountKey(l[0]!));
    });
  }, []);
  const picked = banks.find((b) => accountKey(b) === choice);
  const bank = picked?.bank ?? '';
  const account = picked?.account ?? '';
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(localDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = isDebit
      ? await recordBankDebit({ bank_name: bank, account_no: account, amount, reason: reference, txn_date: date })
      : await recordBankDeposit({ bank_name: bank, account_no: account, amount, reference, txn_date: date });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? (bn ? 'রাখা গেল না' : 'Could not be saved'));
      return;
    }
    signalRefresh();
    onClose();
  }

  return (
    <FormWindow
      title={isDebit ? (bn ? 'ব্যাংক ডেবিট (উত্তোলন)' : 'Bank debit (money taken out)') : bn ? 'ব্যাংক ক্রেডিট (জমা)' : 'Bank credit (money put in)'}
      subtitle={
        isDebit
          ? bn ? 'ব্যাংক থেকে তোলা টাকা — কারণ লিখুন।' : 'Money taken from the bank. Write the reason.'
          : bn ? 'ড্রয়ার থেকে ব্যাংকে পাঠানো নগদ — শিফট বন্ধের হিসাবে এটি বাদ যাবে।' : 'Cash taken from the drawer to the bank. The shift close subtracts it automatically.'
      }
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {bn ? 'ব্যাংক ও হিসাব নম্বর' : 'Bank & account number'}
          </span>
          <select className={INPUT} style={BORDER} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{banks.length ? (bn ? 'ব্যাংক বাছুন' : 'Choose a bank account') : bn ? 'সেটিংসে ব্যাংক যোগ করুন' : 'Add banks in Settings'}</option>
            {banks.map((b) => (
              <option key={accountKey(b)} value={accountKey(b)}>{accountLabel(b)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {bn ? 'টাকার পরিমাণ' : 'Amount'}
          </span>
          <input className={INPUT} style={BORDER} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {bn ? 'তারিখ' : 'Date'}
          </span>
          <input className={INPUT} style={BORDER} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {isDebit ? (bn ? 'ডেবিটের কারণ' : 'Reason for debit') : bn ? 'স্লিপ/রেফারেন্স (ঐচ্ছিক)' : 'Slip / reference (optional)'}
          </span>
          <input className={INPUT} style={BORDER} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>

      {error ? <p className="state-breach mt-3 text-xs" lang={lang}>{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} lang={lang}>{bn ? 'বাতিল' : 'Cancel'}</Button>
        <Button onClick={save} disabled={busy} lang={lang}>
          {busy ? (bn ? 'রাখা হচ্ছে…' : 'Saving…') : isDebit ? (bn ? 'ডেবিট রাখুন' : 'Save debit') : bn ? 'ক্রেডিট রাখুন' : 'Save credit'}
        </Button>
      </div>
    </FormWindow>
  );
}

function RowActions({ row, bn }: { row: BankDepositBook['rows'][number]; bn: boolean }) {
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [amount, setAmount] = useState(String(row.amount));
  const [reference, setReference] = useState(row.reference ?? '');
  const [date, setDate] = useState(row.txnDate);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError(null);
    const res = mode === 'edit'
      ? await updateBankTxn(row.id, { amount, reference, txn_date: date })
      : await deleteBankTxn(row.id, reason);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Failed'); return; }
    setMode(null); signalRefresh();
  }

  return (
    <>
      <button type="button" aria-label={bn ? 'সম্পাদনা' : 'Edit'} title={bn ? 'সম্পাদনা' : 'Edit'} onClick={() => setMode('edit')} className="tap-target inline-flex rounded-lg p-1.5" style={{ color: 'var(--text-muted)' }}>
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" aria-label={bn ? 'মুছুন' : 'Delete'} title={bn ? 'মুছুন' : 'Delete'} onClick={() => setMode('delete')} className="tap-target inline-flex rounded-lg p-1.5 state-breach">
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      {mode ? (
        <FormWindow
          title={mode === 'edit' ? (bn ? 'এন্ট্রি সম্পাদনা' : 'Edit entry') : (bn ? 'এন্ট্রি মুছুন' : 'Delete entry')}
          onClose={() => setMode(null)}
        >
          <div className="space-y-3 text-left">
            <p className="text-sm">{row.bankName} {row.accountNo ? `— ${row.accountNo}` : ''}</p>
            {mode === 'edit' ? (
              <>
                <label className="block text-xs">{bn ? 'তারিখ' : 'Date'}<input type="date" className={INPUT} style={BORDER} value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <label className="block text-xs">{bn ? 'টাকা' : 'Amount'}<input inputMode="decimal" className={INPUT} style={BORDER} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                <label className="block text-xs">{bn ? 'বিবরণ/কারণ' : 'Reference / reason'}<input className={INPUT} style={BORDER} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
              </>
            ) : (
              <label className="block text-xs">{bn ? 'মুছার কারণ' : 'Reason for deleting'}<input className={INPUT} style={BORDER} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            )}
            {error ? <p className="state-breach text-sm">{error}</p> : null}
            <Button onClick={save} disabled={busy}>
              {mode === 'edit' ? (bn ? 'সংরক্ষণ' : 'Save') : (bn ? 'মুছুন' : 'Delete')}
            </Button>
          </div>
        </FormWindow>
      ) : null}
    </>
  );
}
