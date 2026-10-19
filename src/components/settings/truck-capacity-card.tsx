'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { formatLitres } from '@/lib/format';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { getTrucks, saveTrucks, type TruckInfo } from '@/lib/data/trucks';

const INPUT = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;
const EMPTY = { name: '', reg: '', driver: '', capacity: '' };

/** Trucks (name, registration, driver, capacity) behind every truck dropdown. */
export function TruckCapacityCard() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [list, setList] = useState<TruckInfo[]>([]);
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useRefreshKey();

  useEffect(() => {
    getTrucks().then(setList);
  }, [refreshKey]);

  async function save(next: TruckInfo[]) {
    const res = await saveTrucks(next);
    if (res.ok) {
      setList(await getTrucks());
      setError(null);
      return true;
    }
    setError(res.error ?? null);
    return false;
  }

  async function submit() {
    const capacity = Number(draft.capacity);
    if (!draft.name.trim() && !draft.reg.trim()) return setError(bn ? 'নাম বা নম্বর দিন' : 'Enter a name or registration');
    if (!(capacity > 0)) return setError(bn ? 'ধারণক্ষমতা লিটারে দিন' : 'Enter the capacity in litres');
    const item: TruckInfo = {
      id: editing ?? crypto.randomUUID(),
      name: draft.name.trim(),
      reg: draft.reg.trim(),
      driver: draft.driver.trim(),
      capacity,
    };
    const next = editing ? list.map((t) => (t.id === editing ? item : t)) : [...list, item];
    if (await save(next)) {
      setDraft(EMPTY);
      setEditing(null);
    }
  }

  const field = (key: keyof typeof EMPTY, label: string, mode?: 'decimal') => (
    <input
      value={draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      placeholder={label}
      inputMode={mode}
      className={INPUT}
      style={BORDER}
    />
  );

  return (
    <GlassCard lift={false} className="space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>{bn ? 'ট্রাক' : 'Trucks'}</h2>
      </div>
      <Muted lang={lang}>
        {bn ? 'তেল কেনা ও ডেলিভারির ট্রাক ড্রপডাউনে এগুলো আসবে।' : 'These appear in the truck dropdown for oil purchases and deliveries.'}
      </Muted>
      {list.length === 0 ? (
        <Muted lang={lang}>{bn ? 'এখনও কোনো ট্রাক নেই' : 'No trucks yet'}</Muted>
      ) : (
        <ul className="divide-y" style={BORDER}>
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-semibold">{t.name || '—'}</span>
              <span className="tabular">{t.reg || '—'}</span>
              <span style={{ color: 'var(--text-muted)' }}>{t.driver || '—'}</span>
              <span className="tabular">{formatLitres(String(t.capacity), lang)}</span>
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  aria-label="Edit"
                  onClick={() => {
                    setEditing(t.id);
                    setDraft({ name: t.name, reg: t.reg, driver: t.driver, capacity: String(t.capacity) });
                  }}
                  className="tap-target rounded-lg px-2 py-1"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => save(list.filter((x) => x.id !== t.id))}
                  className="tap-target state-breach rounded-lg px-2 py-1"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {field('name', bn ? 'ট্রাকের নাম' : 'Truck name')}
        {field('reg', bn ? 'রেজিস্ট্রেশন নম্বর' : 'Registration no.')}
        {field('driver', bn ? 'চালকের নাম' : 'Driver name')}
        {field('capacity', bn ? 'ধারণক্ষমতা (লিটার)' : 'Capacity (litres)', 'decimal')}
      </div>
      <div className="flex justify-end gap-2">
        {editing ? (
          <Button variant="ghost" onClick={() => { setEditing(null); setDraft(EMPTY); }} lang={lang}>
            {bn ? 'বাতিল' : 'Cancel'}
          </Button>
        ) : null}
        <Button onClick={submit} lang={lang}>
          {editing ? <Pencil className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {editing ? (bn ? 'সংরক্ষণ' : 'Save changes') : bn ? 'যোগ করুন' : 'Add truck'}
        </Button>
      </div>
      {error ? <p className="state-breach text-sm">{error}</p> : null}
    </GlassCard>
  );
}
