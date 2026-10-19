'use client';

import { useEffect, useState, useTransition } from 'react';
import { getTrucks, truckLabel, type TruckInfo } from '@/lib/data/trucks';
import { useLang } from '@/lib/i18n/provider';
import { signalRefresh } from '@/lib/refresh';
import { Button } from '@/components/jhm/button';
import { Muted } from '@/components/ui/glass';
import { FormWindow } from '@/components/ui/form-window';
import { editDelivery } from '@/components/refill-actions';
import type { DeliveryRow } from '@/lib/data/refill';

/** Correct a delivery already in the books; stock follows the correction. */
export function DeliveryEditWindow({
  delivery,
  canSeeCost,
  onClose,
}: {
  delivery: DeliveryRow;
  canSeeCost: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const [truck, setTruck] = useState(delivery.truckReg ?? '');
  const [driver, setDriver] = useState(delivery.driverName ?? '');
  const [fleet, setFleet] = useState<TruckInfo[]>([]);
  useEffect(() => {
    getTrucks().then(setFleet);
  }, []);
  const [rate, setRate] = useState(delivery.depotRate);
  const [lines, setLines] = useState(() =>
    delivery.compartments.map((c) => ({
      compartment_no: c.compartmentNo,
      tankCode: c.tankCode,
      declared: c.declaredLitres,
      received: c.receivedLitres,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await editDelivery({
        delivery_id: delivery.id,
        truck_reg: truck,
        driver_name: driver,
        depot_rate: rate,
        compartments: lines.map((l) => ({
          compartment_no: l.compartment_no,
          declared_litres: l.declared,
          received_litres: l.received,
        })),
      });
      if (result.ok) {
        signalRefresh();
        onClose();
      } else {
        setError(result.error ?? 'That delivery could not be changed');
      }
    });
  }

  return (
    <FormWindow
      title={lang === 'bn' ? 'ডেলিভারি সংশোধন' : 'Edit delivery'}
      subtitle={lang === 'bn' ? 'মজুদ সংশোধন অনুযায়ী বদলাবে' : 'The stock follows the correction'}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        {fleet.length ? (
          <select
            className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--hairline)' }}
            value=""
            onChange={(e) => {
              const t = fleet.find((f) => f.id === e.target.value);
              if (t) { setTruck(t.reg || t.name); setDriver(t.driver); }
            }}
          >
            <option value="">{lang === 'bn' ? 'ট্রাক বাছুন' : 'Choose truck'}</option>
            {fleet.map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}
          </select>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={lang === 'bn' ? 'ট্রাক নম্বর' : 'Truck registration'} value={truck} onChange={setTruck} />
          <Field label={lang === 'bn' ? 'চালকের নাম' : 'Driver'} value={driver} onChange={setDriver} />
          {canSeeCost ? (
            <Field
              label={lang === 'bn' ? 'ডিপো দর (৳/লিটার)' : 'Depot rate (৳/litre)'}
              value={rate}
              onChange={setRate}
            />
          ) : null}
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.compartment_no}
              className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <div>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>
                  {lang === 'bn' ? 'ট্যাংক' : 'Tank'}
                </p>
                <p className="mt-0.5 text-sm font-semibold tracking-tight">{line.tankCode}</p>
              </div>
              <Field
                label={lang === 'bn' ? 'ঘোষিত লিটার' : 'Declared litres'}
                value={line.declared}
                onChange={(v) =>
                  setLines((ls) => ls.map((l, i) => (i === index ? { ...l, declared: v } : l)))
                }
              />
              <Field
                label={lang === 'bn' ? 'পাওয়া লিটার' : 'Received litres'}
                value={line.received}
                onChange={(v) =>
                  setLines((ls) => ls.map((l, i) => (i === index ? { ...l, received: v } : l)))
                }
              />
            </div>
          ))}
        </div>

        <Muted lang={lang}>
          {lang === 'bn'
            ? 'পাওয়া লিটার বদলালে ট্যাংকের মজুদ ততটুকুই বাড়বে বা কমবে — নতুন করে যোগ হবে না।'
            : 'Changing the received litres moves the tank stock by the difference — nothing is added twice.'}
        </Muted>

        {error ? (
          <p className="state-breach text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button size="lg" className="w-full" disabled={pending} onClick={save} lang={lang}>
          {t('common.save')}
        </Button>
      </div>
    </FormWindow>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className="tabular tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--hairline)' }}
      />
    </label>
  );
}
