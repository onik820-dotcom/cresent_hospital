'use client';

import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT } from '@/lib/format';
import { GlassCard, Muted } from '@/components/ui/glass';
import { supabase } from '@/integrations/supabase/client';
import { useRefreshKey } from '@/lib/refresh';

interface Row { amount: number; txn_date: string; reference: string | null; bank_name: string }

/** Latest shift closing cash, each credited to the bank on sign-off. */
export function ClosingCashCard() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const refreshKey = useRefreshKey();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase
      .from('bank_transactions')
      .select('amount, txn_date, reference, bank_name')
      .eq('source_table', 'shift_closing_cash')
      .is('deleted_at', null)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [refreshKey]);

  return (
    <GlassCard lift={false} className="space-y-2">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'ক্লোজিং ক্যাশ (ব্যাংকে জমা)' : 'Closing cash (credited to bank)'}
        </h2>
      </div>
      {rows && rows.length === 0 ? <Muted lang={lang}>{bn ? 'এখনো কোনো শিফট বন্ধ হয়নি' : 'No shift closed yet'}</Muted> : null}
      {(rows ?? []).map((r, i) => {
        const night = (r.reference ?? '').includes('night');
        return (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-sm" lang={lang}>
              {r.txn_date} · {night ? (bn ? 'রাত' : 'Night') : bn ? 'দিন' : 'Day'}
            </span>
            <span className="tabular text-xl font-semibold">{formatBDT(String(r.amount), lang)}</span>
          </div>
        );
      })}
      {rows && rows[0] ? <Muted lang={lang}>{rows[0].bank_name}</Muted> : null}
    </GlassCard>
  );
}
