'use client';

import { useState } from 'react';
import { useRouter } from '@/lib/compat';
import { Check, Copy, LoaderCircle, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
const createClient = () => supabase;
import { useLang } from '@/lib/i18n/provider';
import { formatDate, formatDateTime } from '@/lib/format';
import { GlassCard, CardTitle, Chip, Muted, EmptyState, type ToneState } from '@/components/ui/glass';
import { Button } from '@/components/jhm/button';
import { FormWindow } from '@/components/ui/form-window';
import { createAccount, deleteAccount } from '@/lib/people/accounts.functions';
import type { Invitation, InvitationStatus, Person } from '@/lib/data/people';
import type { TranslationKey } from '@/lib/i18n/dictionary';

/**
 * A password the owner can read out over a phone: no ambiguous characters,
 * long enough for the database's own rule, and different every time.
 */
function suggestPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return [...bytes].map((n) => alphabet[n % alphabet.length]).join('');
}

const ROLE_KEY = {
  dispenser: 'role.dispenser',
  manager: 'role.manager',
  admin: 'role.admin',
  md: 'role.md',
  accountant: 'role.accountant',
} as const;

const STATUS: Record<InvitationStatus, { key: TranslationKey; tone: ToneState }> = {
  pending: { key: 'people.pending', tone: 'watch' },
  accepted: { key: 'people.accepted', tone: 'ok' },
  revoked: { key: 'people.revoked', tone: 'neutral' },
};

const FIELD =
  'tap-target w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none';

function Label({ htmlFor, children, lang }: { htmlFor: string; children: React.ReactNode; lang: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
      {children}
    </label>
  );
}

export function PeopleBoard({
  people,
  invitations,
  meId,
}: {
  people: Person[];
  invitations: Invitation[];
  meId: string;
}) {
  const { t, lang } = useLang();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [fullNameBn, setFullNameBn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'manager' | 'dispenser' | 'md' | 'accountant' | 'admin'>('dispenser');
  const [password, setPassword] = useState(() => suggestPassword());

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Whichever row is currently asking for a reason, and what has been typed.
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMade(null);
    setCopied(false);

    const result = await createAccount({
      data: {
        email: email.trim().toLowerCase(),
        password,
        role,
        fullName,
        fullNameBn: fullNameBn || undefined,
        phone: phone || undefined,
      },
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Shown once, here, so the owner can hand it over. Nothing stores it.
    setMade({ email: email.trim().toLowerCase(), password });
    setFullName('');
    setFullNameBn('');
    setEmail('');
    setPhone('');
    setPassword(suggestPassword());
    router.refresh();
  }


  async function cancelInvitation(id: string) {
    setPending(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('revoke_invitation', { p_id: id, p_reason: reason });
    setPending(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setAsking(null);
    setReason('');
    router.refresh();
  }

  async function setActive(id: string, active: boolean) {
    setPending(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('set_person_active', {
      p_id: id,
      p_active: active,
      p_reason: reason,
    });
    setPending(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setAsking(null);
    setReason('');
    router.refresh();
  }

  async function removePerson(id: string) {
    setPending(true);
    const result = await deleteAccount({ data: { id, reason } })
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    setAsking(null);
    setReason('');
    router.refresh();
  }

  async function copyDetails() {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(`${made.email} / ${made.password}`);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard still shows the details in a
      // field the person can select by hand, so nothing is lost.
      setCopied(false);
    }
  }


  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl" lang={lang}>
          {t('people.title')}
        </h1>
        <Muted lang={lang}>{t('people.subtitle')}</Muted>
      </div>

      {error ? (
        <p className="state-breach text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <div>
        <Button type="button" onClick={() => setInviting(true)} lang={lang}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {t('people.invite')}
        </Button>
      </div>

      {inviting ? (
        <FormWindow
          title={t('people.invite')}
          subtitle={t('people.inviteOnlyTwo')}
          onClose={() => setInviting(false)}
          wide
        >
        <form onSubmit={invite} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name" lang={lang}>
              {t('people.name')}
            </Label>
            <input
              id="invite-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={FIELD}
              style={{ borderColor: 'var(--hairline)' }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-name-bn" lang={lang}>
              {t('people.nameBn')}
            </Label>
            <input
              id="invite-name-bn"
              value={fullNameBn}
              onChange={(e) => setFullNameBn(e.target.value)}
              className={FIELD}
              style={{ borderColor: 'var(--hairline)' }}
              lang="bn"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-email" lang={lang}>
              {t('people.email')}
            </Label>
            <input
              id="invite-email"
              type="email"
              required
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              style={{ borderColor: 'var(--hairline)' }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-phone" lang={lang}>
              {t('people.phone')}
            </Label>
            <input
              id="invite-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD}
              style={{ borderColor: 'var(--hairline)' }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role" lang={lang}>
              {t('people.role')}
            </Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'manager' | 'dispenser' | 'md' | 'accountant')}
              className={FIELD}
              style={{ borderColor: 'var(--hairline)' }}
              lang={lang}
            >
              <option value="dispenser">{t('role.dispenser')}</option>
              <option value="manager">{t('role.manager')}</option>
              <option value="md">{t('role.md')}</option>
              <option value="accountant">{t('role.accountant')}</option>
              <option value="admin">{t('role.admin')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-password" lang={lang}>
              {t('people.password')}
            </Label>
            <div className="flex items-center gap-2">
              <input
                id="invite-password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${FIELD} flex-1 font-mono text-xs`}
                style={{ borderColor: 'var(--hairline)' }}
              />
              <Button type="button" variant="glass" onClick={() => setPassword(suggestPassword())} lang={lang}>
                {t('people.newPassword')}
              </Button>
            </div>
          </div>


          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending} lang={lang}>
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              {pending ? t('people.creating') : t('people.create')}
            </Button>
          </div>
        </form>

        {made ? (
          <div className="mt-5 space-y-2 rounded-xl p-3" style={{ background: 'var(--color-accent-soft)' }}>
            <Label htmlFor="made-details" lang={lang}>
              {t('people.accountReady')}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="made-details"
                readOnly
                value={`${made.email} / ${made.password}`}
                onFocus={(e) => e.currentTarget.select()}
                className={`${FIELD} flex-1 font-mono text-xs`}
                style={{ borderColor: 'var(--hairline)' }}
              />
              <Button type="button" variant="glass" onClick={copyDetails} lang={lang}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? t('people.copied') : t('people.copy')}
              </Button>
            </div>
            <Muted lang={lang}>{t('people.handOver')}</Muted>
          </div>
        ) : null}

        </FormWindow>
      ) : null}


      {/* ---------------------------------------------------------------- */}
      <GlassCard>
        <CardTitle lang={lang}>{t('people.invitations')}</CardTitle>

        {invitations.length === 0 ? (
          <EmptyState title={t('people.noInvites')} />
        ) : (
          <ul className="mt-3 divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {invitations.map((invitation) => (
              <li key={invitation.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invitation.fullName}</p>
                    <Muted className="truncate">{invitation.email}</Muted>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip lang={lang}>{t(ROLE_KEY[invitation.role])}</Chip>
                    <Chip tone={STATUS[invitation.status].tone} lang={lang}>
                      {t(STATUS[invitation.status].key)}
                    </Chip>
                    {invitation.status === 'pending' ? (
                      <>
                        <Muted lang={lang}>
                          {t('people.expires')} {formatDate(invitation.expiresAt, lang)}
                        </Muted>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAsking(asking === invitation.id ? null : invitation.id);
                            setReason('');
                          }}
                          lang={lang}
                        >
                          {t('people.cancelInvite')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                {asking === invitation.id ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-48 flex-1 space-y-1.5">
                      <Label htmlFor={`reason-${invitation.id}`} lang={lang}>
                        {t('people.cancelReason')}
                      </Label>
                      <input
                        id={`reason-${invitation.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className={FIELD}
                        style={{ borderColor: 'var(--hairline)' }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={pending || reason.trim() === ''}
                      onClick={() => cancelInvitation(invitation.id)}
                      lang={lang}
                    >
                      {t('common.confirm')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* ---------------------------------------------------------------- */}
      <GlassCard>
        <CardTitle lang={lang}>{t('people.accounts')}</CardTitle>

        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--hairline)' }}>
          {people.map((person) => (
            <li key={person.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {lang === 'bn' && person.fullNameBn ? person.fullNameBn : person.fullName}
                    {person.id === meId ? (
                      <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-faint)' }} lang={lang}>
                        {t('people.you')}
                      </span>
                    ) : null}
                  </p>
                  <Muted className="truncate">{person.email}</Muted>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip lang={lang}>{t(ROLE_KEY[person.role])}</Chip>
                  <Chip tone={person.isActive ? 'ok' : 'breach'} lang={lang}>
                    {person.isActive ? t('people.active') : t('people.inactive')}
                  </Chip>
                  <Muted lang={lang}>
                    {t('people.lastSeen')}{' '}
                    {person.lastSignInAt ? formatDateTime(person.lastSignInAt, lang) : t('people.never')}
                  </Muted>
                  {person.id === meId ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAsking(asking === person.id ? null : person.id);
                        setReason('');
                      }}
                      lang={lang}
                    >
                      {person.isActive ? t('people.deactivate') : t('people.reactivate')}
                    </Button>
                  )}
                </div>
              </div>

              {asking === person.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1 space-y-1.5">
                    <Label htmlFor={`reason-${person.id}`} lang={lang}>
                      {t('people.activeReason')}
                    </Label>
                    <input
                      id={`reason-${person.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className={FIELD}
                      style={{ borderColor: 'var(--hairline)' }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant={person.isActive ? 'danger' : 'primary'}
                    disabled={pending || reason.trim() === ''}
                    onClick={() => setActive(person.id, !person.isActive)}
                    lang={lang}
                  >
                    {t('common.confirm')}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending || reason.trim() === ''}
                    onClick={() => {
                      if (window.confirm(lang === 'bn' ? 'এই অ্যাকাউন্টটি স্থায়ীভাবে মুছে ফেলবেন?' : 'Delete this account permanently?')) removePerson(person.id);
                    }}
                    lang={lang}
                  >
                    {lang === 'bn' ? 'অ্যাকাউন্ট মুছুন' : 'Delete account'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
