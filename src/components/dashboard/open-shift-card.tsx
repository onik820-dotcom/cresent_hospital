import { useEffect, useState, useTransition } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayCircle } from 'lucide-react';
import { useRouter } from '@/lib/compat';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { useLang } from '@/lib/i18n/provider';
import { signalRefresh, useRefreshKey } from '@/lib/refresh';
import { openCurrentShift } from '@/components/manager-actions';

/** Opens the day or night shift covering right now, from any dashboard. */
export function OpenShiftCard() {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const bn = lang === 'bn';
  const refreshKey = useRefreshKey();
  const [live, setLive] = useState<{ shift_date: string; shift_type: string; status: string }[] | null>(null);

  // Live: re-check every 15 s and whenever anyone opens or closes a shift.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('shifts')
        .select('shift_date, shift_type, status')
        .in('status', ['open', 'closing', 'reopened'])
        .order('starts_at', { ascending: false });
      if (alive) setLive(data ?? []);
    };
    load();
    const timer = setInterval(load, 15000);
    const channel = supabase
      .channel('open-shift-card')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, load)
      .subscribe();
    return () => {
      alive = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [refreshKey]);
  const isOpen = (live?.length ?? 0) > 0;

  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <PlayCircle className="h-6 w-6 text-primary" aria-hidden />
        <div>
          <h2 className="font-semibold">{bn ? 'শিফট চালু' : 'Open shift'}</h2>
          <Muted>{bn ? 'এখনকার ডে বা নাইট শিফট চালু হবে' : 'Opens the current day or night shift'}</Muted>
          {live ? (
            <p className={`mt-1 text-sm font-medium ${isOpen ? 'state-ok' : 'state-breach'}`} role="status">
              {isOpen
                ? live!
                    .map((l) =>
                      `${bn ? 'চালু' : 'Open'}: ${l.shift_date} ${
                        l.shift_type === 'day' ? (bn ? 'ডে' : 'day') : bn ? 'নাইট' : 'night'
                      }${l.status === 'closing' ? (bn ? ' (বন্ধ হচ্ছে)' : ' (closing)') : ''}`,
                    )
                    .join(' · ')
                : bn
                  ? 'কোনো শিফট চালু নেই'
                  : 'No shift is open'}
            </p>
          ) : null}
          {message ? (
            <p className={`mt-1 text-xs ${message.ok ? 'state-ok' : 'state-breach'}`} role="status">
              {message.text}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        disabled={pending}
        lang={lang}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await openCurrentShift();
            if (result.ok) {
              setMessage({ ok: true, text: bn ? 'শিফট চালু হয়েছে' : 'Shift opened' });
              signalRefresh();
              router.refresh();
            } else {
              setMessage({ ok: false, text: result.error ?? 'The shift could not be opened' });
            }
          })
        }
      >
        <PlayCircle className="h-4 w-4" aria-hidden />
        {bn ? 'শিফট চালু করুন' : 'Open shift'}
      </Button>
    </GlassCard>
  );
}
