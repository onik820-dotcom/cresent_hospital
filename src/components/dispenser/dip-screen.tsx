'use client';

import { useState } from 'react';
import { useLang } from '@/lib/i18n/provider';
import { Link } from '@/lib/compat';
import { EmptyState, GlassCard } from '@/components/ui/glass';
import { DispenserFrame } from '@/components/dispenser/dispenser-frame';
import { DipEntry, type TankOption } from '@/components/dispenser/dip-entry';

export function DipScreen({
  shiftId,
  tanks,
  userId,
  dipType,
}: {
  shiftId: string | null;
  tanks: TankOption[];
  userId: string;
  dipType: 'close' | 'pre_refill' | 'post_refill';
}) {
  const { t, lang } = useLang();
  const [version, setVersion] = useState(0);

  const beforeLabel = lang === 'bn' ? 'রিফিলের আগে' : 'Before refill';
  const afterLabel = lang === 'bn' ? 'রিফিলের পরে' : 'After refill';

  const title =
    dipType === 'close'
      ? t('dispenser.enterDip')
      : dipType === 'pre_refill'
        ? lang === 'bn'
          ? 'রিফিলের আগের ডিপ'
          : 'Dip before refill'
        : lang === 'bn'
          ? 'রিফিলের পরের ডিপ'
          : 'Dip after refill';

  // A refill is two readings, not one. The rod is read before the tanker
  // discharges and again after it, and the difference is what was received —
  // so the second reading is offered right here rather than left to memory.
  const refill = dipType !== 'close';

  return (
    <DispenserFrame title={title} userId={userId} refreshKey={version}>
      {refill && (
        <div className="flex gap-2">
          {(
            [
              ['pre_refill', beforeLabel],
              ['post_refill', afterLabel],
            ] as const
          ).map(([type, label]) => (
            <Link
              key={type}
              href={`/dispenser/dip?type=${type}`}
              className={`tap-target flex-1 rounded-2xl border px-4 py-3 text-center text-sm font-medium transition ${
                dipType === type
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border/60 bg-card/50 text-muted-foreground'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      {tanks.length === 0 ? (
        <GlassCard lift={false}>
          <EmptyState title={t('stock.notCalibrated')} />
        </GlassCard>
      ) : (
        <DipEntry
          key={dipType}
          shiftId={shiftId}
          tanks={tanks}
          userId={userId}
          dipType={dipType}
          onQueued={() => setVersion((v) => v + 1)}
        />
      )}
    </DispenserFrame>
  );
}

