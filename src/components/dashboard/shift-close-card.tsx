'use client';

import { ClipboardList } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRouter } from '@/lib/compat';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';

/**
 * Shortcut to the shift-closing wizard, right on the dashboard — the manager
 * no longer has to hunt for it in the side menu at end of day.
 */
export function ShiftCloseCard() {
  const { lang } = useLang();
  const router = useRouter();

  return (
    <GlassCard lift={false} className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'শিফট ক্লোজিং' : 'Shift closing'}
        </h2>
      </div>
      <Muted lang={lang}>
        {lang === 'bn'
          ? 'শেষ রিডিং, ডিপ ও হিসাব মিলিয়ে শিফট বন্ধ করুন'
          : 'Close the shift — final readings, dips and the day’s books'}
      </Muted>

      <Button onClick={() => router.push('/shift/close')} lang={lang}>
        <ClipboardList className="h-4 w-4" aria-hidden />
        {lang === 'bn' ? 'শিফট বন্ধ করুন' : 'Close shift'}
      </Button>
    </GlassCard>
  );
}
