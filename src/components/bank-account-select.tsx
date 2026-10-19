import { useEffect, useState } from 'react';
import { accountKey, accountLabel, getBankAccounts, type BankAccount } from '@/lib/data/bank-names';

/** Pick one of the bank accounts listed in Settings. */
export function BankAccountSelect({
  value,
  onChange,
  className,
  style,
  bn,
}: {
  value: BankAccount | null;
  onChange: (a: BankAccount | null) => void;
  className?: string;
  style?: React.CSSProperties;
  bn: boolean;
}) {
  const [list, setList] = useState<BankAccount[]>([]);
  useEffect(() => {
    getBankAccounts().then((l) => {
      setList(l);
      if (!value && l.length === 1) onChange(l[0] ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <select
      value={value ? accountKey(value) : ''}
      onChange={(e) => onChange(list.find((a) => accountKey(a) === e.target.value) ?? null)}
      className={className}
      style={style}
    >
      <option value="">{list.length ? (bn ? 'ব্যাংক হিসাব বাছুন' : 'Choose bank account') : bn ? 'সেটিংসে ব্যাংক যোগ করুন' : 'Add banks in Settings'}</option>
      {list.map((a) => (
        <option key={accountKey(a)} value={accountKey(a)}>{accountLabel(a)}</option>
      ))}
    </select>
  );
}
