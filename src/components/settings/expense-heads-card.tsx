'use client';

import { useEffect, useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey, signalRefresh } from '@/lib/refresh';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { getExpenseCategories, type ExpenseCategory } from '@/lib/data/money';

const FIELD = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';

/** Expense heads offered in the expense dropdowns. Removing hides a head; past expenses keep it. */
export function ExpenseHeadsCard() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [list, setList] = useState<ExpenseCategory[]>([]);
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [chairman, setChairman] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useRefreshKey();

  useEffect(() => {
    getExpenseCategories().then((l) => setList(l.filter((c) => c.group !== 'own_use')));
  }, [refreshKey]);

  async function guard() {
    const p = await getSessionProfile();
    if (p?.role !== 'admin') {
      setError('Only an admin may change this list');
      return null;
    }
    return p;
  }

  async function add() {
    if (!name.trim()) return;
    const p = await guard();
    if (!p) return;
    const supabase = await createClient();
    const { data: station } = await supabase.from('stations').select('id').limit(1).single();
    const max = list.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    const { error: e } = await supabase.from('expense_categories').insert({
      station_id: station?.id ?? null,
      name: name.trim(),
      name_bn: nameBn.trim() || null,
      group: chairman ? 'chairman' : 'other',
      sort_order: max + 1,
      is_active: true,
      created_by: p.id,
    });
    if (e) return setError(e.message);
    setName('');
    setNameBn('');
    setChairman(false);
    setError(null);
    signalRefresh();
  }

  async function remove(id: string) {
    const p = await guard();
    if (!p) return;
    const supabase = await createClient();
    const { error: e } = await supabase
      .from('expense_categories')
      .update({ is_active: false, updated_by: p.id })
      .eq('id', id);
    if (e) return setError(e.message);
    setList((l) => l.filter((c) => c.id !== id));
    signalRefresh();
  }

  return (
    <GlassCard lift={false} className="space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'খরচের খাত' : 'Expense heads'}
        </h2>
      </div>
      <Muted lang={lang}>
        {bn ? 'খরচের ড্রপডাউনে এগুলো আসবে। মুছলে আগের খরচ থাকবে।' : 'These appear in the expense dropdown. Removing keeps past expenses.'}
      </Muted>
      {list.length === 0 ? (
        <Muted lang={lang}>{bn ? 'কোনো খাত নেই' : 'No heads yet'}</Muted>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <span className="text-sm font-semibold" lang={lang}>
                {bn && c.nameBn ? c.nameBn : c.name}
              </span>
              {c.group === 'chairman' ? <Muted lang={lang}>{bn ? 'চেয়ারম্যান' : 'Chairman'}</Muted> : null}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => remove(c.id)}
                className="tap-target state-breach ml-auto rounded-lg px-2 py-1"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={bn ? 'নাম (ইংরেজি)' : 'Name'} className={FIELD} style={{ borderColor: 'var(--hairline)' }} />
        <input value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder={bn ? 'নাম (বাংলা)' : 'Name in Bangla'} className={FIELD} style={{ borderColor: 'var(--hairline)' }} />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm" lang={lang}>
          <input type="checkbox" checked={chairman} onChange={(e) => setChairman(e.target.checked)} />
          {bn ? 'চেয়ারম্যান খরচ' : 'Chairman expense'}
        </label>
        <Button className="ml-auto" onClick={add} lang={lang}>
          <Plus className="h-4 w-4" aria-hidden />
          {bn ? 'যোগ করুন' : 'Add'}
        </Button>
      </div>
      {error ? <p className="state-breach text-sm">{error}</p> : null}
    </GlassCard>
  );
}
