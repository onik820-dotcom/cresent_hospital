'use client';

import { useEffect, useState, useTransition } from 'react';
import { KeyRound, Save, UserRound } from 'lucide-react';
import { Button } from '@/components/jhm/button';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { useLang } from '@/lib/i18n/provider';
import { getMyAccount, updateMyAccount, changeMyPassword, type MyAccount } from './account-actions';

const FIELD =
  'tap-target w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none';

const ROLE_LABEL: Record<string, { en: string; bn: string }> = {
  dispenser: { en: 'Employee', bn: 'কর্মচারী' },
  manager: { en: 'Manager', bn: 'ম্যানেজার' },
  admin: { en: 'Owner', bn: 'মালিক' },
  md: { en: 'MD', bn: 'এমডি' },
};

/** Every account holder's own page: what the books know about them, and the bits they may change. */
export function AccountScreen() {
  const { lang, setLang } = useLang();
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [form, setForm] = useState({ fullName: '', fullNameBn: '', phone: '', languagePref: 'bn' as 'bn' | 'en' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getMyAccount().then((a) => {
      if (!a) return;
      setAccount(a);
      setForm({
        fullName: a.fullName,
        fullNameBn: a.fullNameBn ?? '',
        phone: a.phone ?? '',
        languagePref: a.languagePref,
      });
    });
  }, []);

  if (!account) {
    return (
      <GlassCard lift={false}>
        <Muted lang={lang}>{lang === 'bn' ? 'দেখা হচ্ছে…' : 'Loading…'}</Muted>
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <GlassCard lift={false}>
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            <UserRound className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight" lang={lang}>
              {lang === 'bn' && account.fullNameBn ? account.fullNameBn : account.fullName}
            </p>
            <Muted>{account.email}</Muted>
          </div>
          <div className="ml-auto">
            <Chip lang={lang}>{ROLE_LABEL[account.role]?.[lang] ?? account.role}</Chip>
          </div>
        </div>
      </GlassCard>

      <GlassCard lift={false}>
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'আমার তথ্য' : 'My details'}
        </h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={lang === 'bn' ? 'নাম (ইংরেজি)' : 'Name (English)'}>
            <input
              className={FIELD}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label={lang === 'bn' ? 'নাম (বাংলা)' : 'Name (Bangla)'}>
            <input
              className={FIELD}
              value={form.fullNameBn}
              onChange={(e) => setForm({ ...form, fullNameBn: e.target.value })}
            />
          </Field>
          <Field label={lang === 'bn' ? 'মোবাইল' : 'Phone'}>
            <input
              className={FIELD}
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={lang === 'bn' ? 'ভাষা' : 'Language'}>
            <select
              className={FIELD}
              value={form.languagePref}
              onChange={(e) => setForm({ ...form, languagePref: e.target.value as 'bn' | 'en' })}
            >
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button
            disabled={pending}
            lang={lang}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setSaved(false);
                const r = await updateMyAccount(form);
                if (r.ok) {
                  setSaved(true);
                  setLang(form.languagePref);
                } else setError(r.error ?? 'That could not be saved');
              })
            }
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            {lang === 'bn' ? 'সংরক্ষণ' : 'Save'}
          </Button>
          {saved ? (
            <span className="state-ok text-xs" lang={lang}>
              {lang === 'bn' ? 'সংরক্ষিত হয়েছে' : 'Saved'}
            </span>
          ) : null}
          {error ? (
            <span className="state-breach text-xs" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </GlassCard>

      <PasswordCard />
    </div>
  );
}

function PasswordCard() {
  const { lang } = useLang();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <GlassCard lift={false}>
      <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
        {lang === 'bn' ? 'পাসওয়ার্ড বদল' : 'Change password'}
      </h2>
      <Muted className="mt-1" lang={lang}>
        {lang === 'bn' ? 'কমপক্ষে ১০ অক্ষর।' : 'At least 10 characters.'}
      </Muted>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          className={`${FIELD} max-w-xs`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          variant="glass"
          disabled={pending || !password}
          lang={lang}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              setDone(false);
              const r = await changeMyPassword(password);
              if (r.ok) {
                setDone(true);
                setPassword('');
              } else setError(r.error ?? 'That could not be changed');
            })
          }
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          {lang === 'bn' ? 'বদলান' : 'Change'}
        </Button>
        {done ? (
          <span className="state-ok text-xs" lang={lang}>
            {lang === 'bn' ? 'পাসওয়ার্ড বদলেছে' : 'Password changed'}
          </span>
        ) : null}
        {error ? (
          <span className="state-breach text-xs" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </GlassCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { lang } = useLang();
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
        {label}
      </span>
      {children}
    </label>
  );
}
