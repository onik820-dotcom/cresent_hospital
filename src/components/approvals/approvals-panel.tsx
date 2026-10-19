'use client';

import { useEffect, useState, useTransition } from 'react';
import { BadgeCheck, Banknote, Droplets, Truck, UserPlus } from 'lucide-react';
import { Button } from '@/components/jhm/button';
import { Chip, EmptyState, GlassCard, Muted } from '@/components/ui/glass';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatTime } from '@/lib/format';
import { useRefreshKey } from '@/lib/refresh';
import { getPendingWork, type PendingWork } from '@/lib/data/approvals';
import { getCreditParties, type CreditParty } from '@/lib/data/money';
import { approveDelivery, approveDip, settleSaleAsCash, settleSaleAsCredit } from './approvals-actions';

/**
 * The manager's in-tray. Every sale the dispenser submitted waits here until
 * it is marked cash or put on a party's account; dips and tanker deliveries
 * wait for the manager's name against them.
 */
export function ApprovalsPanel() {
  const { lang } = useLang();
  const refreshKey = useRefreshKey();
  const [work, setWork] = useState<PendingWork | null>(null);
  const [parties, setParties] = useState<CreditParty[]>([]);

  useEffect(() => {
    getPendingWork().then(setWork);
    getCreditParties().then((p) => setParties(p.filter((x) => x.isActive)));
  }, [refreshKey]);

  const empty =
    work && work.sales.length === 0 && work.dips.length === 0 && work.deliveries.length === 0;

  return (
    <GlassCard lift={false}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Pending approvals'}
        </h2>
        {work && !empty ? (
          <Chip tone="watch" lang={lang}>
            {work.sales.length + work.dips.length + work.deliveries.length}
          </Chip>
        ) : null}
      </div>

      {!work ? (
        <Muted className="mt-3" lang={lang}>
          {lang === 'bn' ? 'দেখা হচ্ছে…' : 'Loading…'}
        </Muted>
      ) : empty ? (
        <EmptyState
          title={lang === 'bn' ? 'কিছু বাকি নেই' : 'Nothing waiting'}
          hint={lang === 'bn' ? 'ডিসপেনসারের জমা এখানে আসবে।' : 'Dispenser submissions land here for review.'}
        />
      ) : (
        <div className="mt-3 space-y-4">
          {work.sales.length ? (
            <div className="space-y-2">
              <Muted lang={lang}>{lang === 'bn' ? 'বিক্রি — নগদ না বাকি?' : 'Sales — cash or due?'}</Muted>
              {work.sales.map((s) => (
                <SaleRow key={s.id} sale={s} parties={parties} />
              ))}
            </div>
          ) : null}

          {work.dips.length ? (
            <div className="space-y-2">
              <Muted lang={lang}>{lang === 'bn' ? 'ডিপ' : 'Dips'}</Muted>
              {work.dips.map((d) => (
                <SimpleRow
                  key={d.id}
                  icon={<Droplets className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />}
                  title={`${d.tankCode} · ${d.dipMm} মিমি`}
                  detail={`${formatTime(d.recordedAt, lang)} · ${d.recordedBy ?? ''}`}
                  onApprove={() => approveDip(d.id)}
                />
              ))}
            </div>
          ) : null}

          {work.deliveries.length ? (
            <div className="space-y-2">
              <Muted lang={lang}>{lang === 'bn' ? 'রিফিল' : 'Refills'}</Muted>
              {work.deliveries.map((d) => (
                <SimpleRow
                  key={d.id}
                  icon={<Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />}
                  title={`${d.challanNo ?? '—'} · ${d.truckReg ?? '—'}`}
                  detail={`${formatTime(d.arrivedAt, lang)} · ${d.totalReceived} L`}
                  onApprove={() => approveDelivery(d.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </GlassCard>
  );
}

function SaleRow({ sale, parties }: { sale: PendingWork['sales'][number]; parties: CreditParty[] }) {
  const { lang } = useLang();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'credit'>('idle');
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState(sale.amount ?? '');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'That did not go through');
    });
  }

  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--glass-border, rgba(0,0,0,0.08))' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium" lang={lang}>
          {sale.machine || (lang === 'bn' ? 'মেশিন' : 'Machine')}
          {sale.nozzleNo ? `-${sale.nozzleNo}` : ''}
        </span>
        <span className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
          {sale.reading}
        </span>
        {sale.amount ? (
          <span className="tabular text-sm font-semibold">{formatBDT(sale.amount, lang)}</span>
        ) : null}
        <Muted className="ml-auto">
          {formatTime(sale.recordedAt, lang)} · {sale.recordedBy ?? ''}
        </Muted>
      </div>

      {mode === 'idle' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} lang={lang} onClick={() => run(() => settleSaleAsCash(sale.id, amount))}>
            <Banknote className="h-3.5 w-3.5" aria-hidden />
            {lang === 'bn' ? 'নগদ' : 'Cash'}
          </Button>
          <Button size="sm" variant="glass" disabled={pending} lang={lang} onClick={() => setMode('credit')}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            {lang === 'bn' ? 'বাকি' : 'Due'}
          </Button>
        </div>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
          <select
            className="tap-target rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--glass-border, rgba(0,0,0,0.12))', background: 'transparent' }}
            value={party}
            onChange={(e) => setParty(e.target.value)}
            lang={lang}
          >
            <option value="">{lang === 'bn' ? 'পার্টি বাছুন' : 'Pick the party'}</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {lang === 'bn' && p.nameBn ? p.nameBn : p.name}
              </option>
            ))}
          </select>
          <input
            className="tap-target tabular rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--glass-border, rgba(0,0,0,0.12))', background: 'transparent' }}
            inputMode="decimal"
            placeholder={lang === 'bn' ? 'টাকা' : 'Amount'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              lang={lang}
              onClick={() => run(() => settleSaleAsCredit(sale.id, party, amount))}
            >
              {lang === 'bn' ? 'পার্টির খাতায়' : 'Put on account'}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} lang={lang} onClick={() => setMode('idle')}>
              {lang === 'bn' ? 'বাতিল' : 'Cancel'}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="state-breach mt-1 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SimpleRow({
  icon,
  title,
  detail,
  onApprove,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onApprove: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const { lang } = useLang();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5"
      style={{ borderColor: 'var(--glass-border, rgba(0,0,0,0.08))' }}
    >
      {icon}
      <span className="text-sm font-medium" lang={lang}>
        {title}
      </span>
      <Muted>{detail}</Muted>
      <div className="ml-auto">
        <Button
          size="sm"
          variant="glass"
          disabled={pending}
          lang={lang}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await onApprove();
              if (!r.ok) setError(r.error ?? 'That did not go through');
            })
          }
        >
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {lang === 'bn' ? 'অনুমোদন' : 'Approve'}
        </Button>
      </div>
      {error ? (
        <p className="state-breach w-full text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
