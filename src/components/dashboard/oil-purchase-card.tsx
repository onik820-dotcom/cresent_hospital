'use client';

import { Fuel } from 'lucide-react';
import { useRouter } from '@/lib/compat';
import { useLang } from '@/lib/i18n/provider';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';

/** Dashboard shortcut to the oil purchase page. */
export function OilPurchaseCard(_props: { canSeeCost?: boolean }) {
  const { lang } = useLang();
  const router = useRouter();
  return (
    <GlassCard lift={false} className="space-y-2">
      <div className="flex items-center gap-2">
        <Fuel className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'তেল ক্রয়' : 'Oil purchase'}
        </h2>
      </div>
      <Muted lang={lang}>
        {lang === 'bn'
          ? 'ট্রাকের ধারণক্ষমতা অনুযায়ী ক্রয় — মজুদে একবারই যোগ হবে'
          : 'Bought by the truck load — added to stock only once'}
      </Muted>
      <Button onClick={() => router.push('/oil-purchase')} lang={lang}>
        <Fuel className="h-4 w-4" aria-hidden />
        {lang === 'bn' ? 'তেল ক্রয় যোগ করুন' : 'Add oil purchase'}
      </Button>
    </GlassCard>
  );
}
