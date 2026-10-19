'use client';

import { useLang } from '@/lib/i18n/provider';
import { EmptyState, GlassCard } from '@/components/ui/glass';
import { CloseWizard, type ClosedInfo } from '@/components/shift/close-wizard';
import { ClosedShiftsList } from '@/components/shift/closed-shifts-list';
import type { CloseContext } from '@/lib/data/shift-close';

export function CloseScreen({
  context,
  initialStep = 0,
  onClosed,
}: {
  context: CloseContext;
  initialStep?: number;
  onClosed: (info: ClosedInfo) => void;
}) {
  const { t, lang } = useLang();
  const shift = context.shift;
  const editable = shift && ['open', 'closing', 'reopened'].includes(shift.status);

  return (
    <div className="space-y-5">
      {shift?.status === 'reopened' ? (
        <GlassCard lift={false} className="text-sm" >
          <p lang={lang}>
            {lang === 'bn'
              ? 'আপনি একটি বন্ধ শিফট সংশোধন করছেন। মিটার, ডিপ ও নগদ ঠিক করে আবার স্বাক্ষর দিন। আগে সেভ করা বাকি বিক্রি, লুব্রিকেন্ট ও খরচ ঠিক থাকবে — আবার লিখবেন না; শুধু বাদ পড়া নতুন এন্ট্রি যোগ করুন।'
              : 'You are editing a closed shift. Correct the meters, dips and cash and sign off again — later shifts and reports update automatically. Due sales, lubricants and expenses already saved are kept — do not type them again; add only entries that were missed.'}
          </p>
        </GlassCard>
      ) : null}
      {editable ? (
        <CloseWizard context={context} initialStep={initialStep} onClosed={onClosed} />
      ) : (
        <GlassCard lift={false}>
          <EmptyState
            title={t('shift.none')}
            hint={
              lang === 'bn'
                ? 'ড্যাশবোর্ড থেকে শিফট চালু করুন, তারপর এখানে বন্ধ করুন।'
                : 'Open a shift from the dashboard, then close it here.'
            }
          />
        </GlassCard>
      )}
      <ClosedShiftsList />
    </div>
  );
}
