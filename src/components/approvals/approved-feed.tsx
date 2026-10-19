'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Banknote, Droplets, Droplet, Truck, UserPlus } from 'lucide-react';
import { Chip, EmptyState, GlassCard, Muted } from '@/components/ui/glass';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatLubQty, formatNumber, formatTime } from '@/lib/format';
import { useRefreshKey } from '@/lib/refresh';
import { supabase } from '@/integrations/supabase/client';
import { getApprovedFeed, type ApprovedFeed as Feed } from '@/lib/data/approvals';

/**
 * The owner's and the MD's view of the same work the manager handles — but
 * only once the manager has said yes. Nothing here can be changed; it is the
 * live record of settled sales, signed-off dips and refills, and lubricant
 * sales as they are entered.
 */
export function ApprovedFeed() {
  const { lang } = useLang();
  const refreshKey = useRefreshKey();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());

  const load = useCallback(() => {
    getApprovedFeed().then((f) => {
      setFeed(f);
      setUpdatedAt(new Date());
    });
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel('approved-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meter_readings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tank_dips' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tanker_deliveries' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lub_transactions' }, load)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const empty =
    feed &&
    feed.sales.length === 0 &&
    feed.dips.length === 0 &&
    feed.deliveries.length === 0 &&
    feed.lubSales.length === 0;

  return (
    <GlassCard lift={false}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'ম্যানেজার অনুমোদনের পর — লাইভ' : 'After the manager approves — live'}
        </h2>
        <div className="flex items-center gap-2">
          <Chip tone="ok">🟢 {lang === 'bn' ? 'লাইভ' : 'Live'}</Chip>
          <Muted className="tabular">{formatTime(updatedAt, lang)}</Muted>
        </div>
      </div>

      {!feed ? (
        <Muted className="mt-3" lang={lang}>
          {lang === 'bn' ? 'দেখা হচ্ছে…' : 'Loading…'}
        </Muted>
      ) : empty ? (
        <EmptyState
          title={lang === 'bn' ? 'এখনো কিছু অনুমোদিত হয়নি' : 'Nothing approved yet'}
          hint={
            lang === 'bn'
              ? 'ম্যানেজার অনুমোদন করলে এখানে সঙ্গে সঙ্গে দেখা যাবে।'
              : 'Once the manager approves, it shows here straight away.'
          }
        />
      ) : (
        <div className="mt-3 space-y-4">
          {feed.sales.length ? (
            <Group label={lang === 'bn' ? 'বিক্রি — নিষ্পত্তি হয়েছে' : 'Sales — settled'}>
              {feed.sales.map((s) => (
                <Row
                  key={s.id}
                  icon={
                    s.settlement === 'cash' ? (
                      <Banknote className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
                    ) : (
                      <UserPlus className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
                    )
                  }
                  title={`${s.machine || (lang === 'bn' ? 'মেশিন' : 'Machine')}${s.nozzleNo ? `-${s.nozzleNo}` : ''} · ${s.reading}`}
                  value={s.amount ? formatBDT(s.amount, lang) : ''}
                  tag={
                    s.settlement === 'cash'
                      ? lang === 'bn'
                        ? 'নগদ'
                        : 'Cash'
                      : `${lang === 'bn' ? 'বাকি' : 'Due'}${s.partyName ? ` · ${s.partyName}` : ''}`
                  }
                  detail={`${formatTime(s.at, lang)}${s.approvedBy ? ` · ${s.approvedBy}` : ''}`}
                />
              ))}
            </Group>
          ) : null}

          {feed.lubSales.length ? (
            <Group label={lang === 'bn' ? 'লুব্রিক্যান্ট বিক্রি — লাইভ' : 'Lubricant sales — live'}>
              {feed.lubSales.map((l) => (
                <Row
                  key={l.id}
                  icon={<Droplet className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />}
                  title={`${l.skuName} · ${formatLubQty(l.qty, l.unit, lang)}`}
                  value={formatBDT(l.amount, lang)}
                  tag={l.partyName ?? (lang === 'bn' ? 'নগদ' : 'Cash')}
                  detail={`${formatTime(l.at, lang)}${l.recordedBy ? ` · ${l.recordedBy}` : ''}`}
                />
              ))}
            </Group>
          ) : null}

          {feed.dips.length ? (
            <Group label={lang === 'bn' ? 'অনুমোদিত ডিপ' : 'Approved dips'}>
              {feed.dips.map((d) => (
                <Row
                  key={d.id}
                  icon={<Droplets className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />}
                  title={`${d.tankCode} · ${formatNumber(d.dipMm, { lang })} ${lang === 'bn' ? 'মিমি' : 'mm'}`}
                  value={`${formatNumber(d.litres, { lang, decimals: 3 })} ${lang === 'bn' ? 'লিটার' : 'L'}`}
                  tag={d.dipType}
                  detail={`${formatTime(d.at, lang)}${d.approvedBy ? ` · ${d.approvedBy}` : ''}`}
                />
              ))}
            </Group>
          ) : null}

          {feed.deliveries.length ? (
            <Group label={lang === 'bn' ? 'অনুমোদিত রিফিল' : 'Approved refills'}>
              {feed.deliveries.map((d) => (
                <Row
                  key={d.id}
                  icon={<Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />}
                  title={`${d.challanNo ?? '—'} · ${d.truckReg ?? '—'}`}
                  value={`${formatNumber(d.totalReceived, { lang, decimals: 3 })} ${lang === 'bn' ? 'লিটার' : 'L'}`}
                  tag={lang === 'bn' ? 'অনুমোদিত' : 'Approved'}
                  detail={`${formatTime(d.at, lang)}${d.approvedBy ? ` · ${d.approvedBy}` : ''}`}
                />
              ))}
            </Group>
          ) : null}
        </div>
      )}
    </GlassCard>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { lang } = useLang();
  return (
    <div className="space-y-2">
      <Muted lang={lang}>{label}</Muted>
      {children}
    </div>
  );
}

function Row({
  icon,
  title,
  value,
  tag,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  tag: string;
  detail: string;
}) {
  const { lang } = useLang();
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5"
      style={{ borderColor: 'var(--glass-border, rgba(0,0,0,0.08))' }}
    >
      {icon}
      <span className="text-sm font-medium" lang={lang}>
        {title}
      </span>
      {value ? <span className="tabular text-sm font-semibold">{value}</span> : null}
      <Chip lang={lang}>
        <BadgeCheck className="mr-1 inline h-3 w-3" aria-hidden />
        {tag}
      </Chip>
      <Muted className="ml-auto">{detail}</Muted>
    </div>
  );
}
