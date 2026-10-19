'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ClipboardCheck, Clock } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatDate, formatNumber, formatTime } from '@/lib/format';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { getShiftStatusInfo, type CurrentShift, type ShiftStatusInfo } from '@/lib/data/overview';
import { OpenShiftCard } from '@/components/dashboard/open-shift-card';

/** "3 h 12 min" / "৩ ঘ ১২ মি" — how long the shift has been running. */
function elapsedLabel(fromIso: string, nowMs: number, lang: 'en' | 'bn'): string {
  const minutes = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = formatNumber(h, { lang });
  const mm = formatNumber(m, { lang });
  if (lang === 'bn') return h > 0 ? `${hh} ঘ ${mm} মি` : `${mm} মি`;
  return h > 0 ? `${hh} h ${mm} min` : `${mm} min`;
}

/**
 * One line that answers "is a shift running, since when, and who opened it?".
 * With no shift in progress it becomes the way to open one.
 */
export function ShiftStatusBar({ shift }: { shift: CurrentShift | null }) {
  const { t, lang } = useLang();
  const bn = lang === 'bn';
  const [info, setInfo] = useState<ShiftStatusInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!shift) {
      setInfo(null);
      return;
    }
    let alive = true;
    getShiftStatusInfo(shift.id).then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, [shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The elapsed time moves; nothing else on this bar does.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (!shift || shift.status === 'closed') return <OpenShiftCard />;

  const running = shift.status === 'open' || shift.status === 'closing' || shift.status === 'reopened';
  const tone = shift.status === 'open' ? 'ok' : 'watch';
  const statusKey = shift.status === 'open' ? 'shift.open' : shift.status === 'closing' ? 'shift.closing' : 'shift.reopened';
  const since = info?.openedAt ?? shift.startsAt;
  const who = info?.openedBy ? (bn && info.openedBy.nameBn ? info.openedBy.nameBn : info.openedBy.name) : null;

  return (
    <GlassCard lift={false} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <Chip tone={tone} lang={lang}>
          {t(statusKey)}
        </Chip>
        <div>
          <p className="text-sm font-semibold tracking-tight" lang={lang}>
            {t(shift.shiftType === 'day' ? 'shift.day' : 'shift.night')}
            <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>
              {formatDate(shift.shiftDate, lang)}
            </span>
          </p>
          <Muted className="tabular">
            {formatTime(shift.startsAt, lang)} – {formatTime(shift.endsAt, lang)}
          </Muted>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tabular" lang={lang}>
          {running ? (bn ? 'চলছে' : 'Running') : ''} {elapsedLabel(since, now, lang)}
        </span>
        {who ? (
          <span lang={lang}>
            · {bn ? 'চালু করেছেন' : 'opened by'} <strong style={{ color: 'inherit' }}>{who}</strong>
            {info?.openedAt ? ` ${formatTime(info.openedAt, lang)}` : ''}
          </span>
        ) : null}
      </div>

      {running ? (
        <Link
          to="/shift/close"
          lang={lang}
          className="tap-target ml-auto inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden />
          {bn ? 'শিফট বন্ধ করুন' : 'Close shift'}
        </Link>
      ) : null}
    </GlassCard>
  );
}
