'use client';

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import { FormWindow } from '@/components/ui/form-window';
import { DeliveryForm } from '@/components/refill/delivery-form';
import { getRefillTanks, type RefillTank } from '@/lib/data/refill';

/**
 * Moving oil from the truck into a tank, straight from the dashboard. Dip
 * mode sets the tank level from the before/after rods — the oil was already
 * counted once at purchase, so this never adds it a second time.
 */
export function TruckRefillCard({ canSeeCost }: { canSeeCost: boolean }) {
  const { lang } = useLang();
  const [tanks, setTanks] = useState<RefillTank[] | null>(null);
  const [open, setOpen] = useState(false);
  const refreshKey = useRefreshKey();

  useEffect(() => {
    let alive = true;
    getRefillTanks().then((rows) => {
      if (alive) setTanks(rows);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <GlassCard lift={false} className="space-y-2">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'ট্রাক থেকে ট্যাংকে রিফিল' : 'Truck to tank refill'}
        </h2>
      </div>
      <Muted lang={lang}>
        {lang === 'bn'
          ? 'ডিপ পড়ে ট্যাংকের মজুদ ঠিক হয় — তেল আবার কেনা হয় না'
          : 'Sets the tank level from the dips — the oil is not bought again'}
      </Muted>

      <Button onClick={() => setOpen(true)} disabled={!tanks || tanks.length === 0} lang={lang}>
        <Truck className="h-4 w-4" aria-hidden />
        {lang === 'bn' ? 'ট্যাংকে রিফিল যোগ করুন' : 'Add tank refill'}
      </Button>

      {open && tanks ? (
        <FormWindow
          title={lang === 'bn' ? 'ট্রাক থেকে ট্যাংকে রিফিল' : 'Truck to tank refill'}
          subtitle={
            lang === 'bn'
              ? 'ডিপ পড়ে ট্যাংকের মজুদ ঠিক হয় — তেল আবার কেনা হয় না'
              : 'Sets the tank level from the dips — the oil is not bought again'
          }
          onClose={() => setOpen(false)}
          wide
        >
          <DeliveryForm tanks={tanks} canSeeCost={canSeeCost} mode="dip" />
        </FormWindow>
      ) : null}
    </GlassCard>
  );
}
