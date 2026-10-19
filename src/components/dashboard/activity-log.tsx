'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatNumber, formatTime } from '@/lib/format';
import { useRefreshKey } from '@/lib/refresh';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { getShiftActivity, type ActivityEntry } from '@/lib/data/overview';

/**
 * Everything entered against the running shift, newest first. Folded away by
 * default — it is for checking back on an entry, not for the glance.
 */
export function ActivityLog({ shiftId }: { shiftId: string | null }) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const refreshKey = useRefreshKey();

  // Only fetched once someone asks to see it.
  useEffect(() => {
    if (!open || !shiftId) return;
    let alive = true;
    getShiftActivity(shiftId).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [open, shiftId, refreshKey]);

  if (!shiftId) return null;

  return (
    <GlassCard lift={false} className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap-target flex w-full items-center gap-2 text-left"
        lang={lang}
      >
        <h2 className="text-sm font-semibold tracking-tight">{bn ? 'আজকের এন্ট্রি' : "Today's activity"}</h2>
        {rows ? <Chip className="tabular">{formatNumber(rows.length, { lang })}</Chip> : null}
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open ? (
        rows === null ? (
          <div className="skeleton h-16 w-full" />
        ) : rows.length === 0 ? (
          <Muted lang={lang}>{bn ? 'এই শিফটে এখনো কোনো এন্ট্রি নেই।' : 'Nothing has been entered in this shift yet.'}</Muted>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="tabular w-12 shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
                  {formatTime(r.at, lang)}
                </span>
                <span className="min-w-0 flex-1 break-words" lang={lang}>
                  {bn ? r.labelBn : r.label}
                </span>
                {r.amount ? <span className="tabular shrink-0 font-medium">{formatBDT(r.amount, lang)}</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </GlassCard>
  );
}
