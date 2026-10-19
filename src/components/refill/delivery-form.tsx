// ============= Full file contents =============

'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/lib/compat';
import { AlertTriangle, CheckCircle2, Plus, Trash2, Truck } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatLitres, formatNumber, formatPercent } from '@/lib/format';
import { Button } from '@/components/jhm/button';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import {
  previewDelivery,
  recordDelivery,
  type DeliveryInput,
  type DeliveryPreview,
} from '@/components/refill-actions';
import type { RefillTank } from '@/lib/data/refill';
import { getTruckCapacities } from '@/lib/data/truck-capacities';
import { getTrucks, truckLabel, type TruckInfo } from '@/lib/data/trucks';

const DECLARED_DEFAULT = '4500';
/** The purchase truck carries this much; the challan can never exceed it. */
const TRUCK_CAPACITY_DEFAULT = '18000';

interface Row {
  tankId: string;
  declared: string;
  dipBefore: string;
  dipAfter: string;
  /** Litres typed by hand; in refill mode it fills the after-rod, in purchase mode it is the whole load. */
  quantity: string;
  /** Optional litres sold from the tank while it was being refilled. */
  sold: string;
}

function blankRow(tanks: RefillTank[], index = 0): Row {
  const tank = tanks[index] ?? tanks[0];
  return {
    tankId: tank?.id ?? '',
    declared: '',
    dipBefore: tank?.currentDipMm ?? '',
    dipAfter: '',
    quantity: '',
    sold: '',
  };
}

/** The truck itself is the holding tank oil purchases land in. */
function truckTank(tanks: RefillTank[]): RefillTank | undefined {
  return tanks.find((tk) => tk.code === 'TRUCK');
}


export function DeliveryForm({
  tanks,
  canSeeCost,
  mode = 'dip',
}: {
  tanks: RefillTank[];
  canSeeCost: boolean;
  /** 'quantity' = oil purchase by truck load; 'dip' = truck-to-tank refill by rod. */
  mode?: 'dip' | 'quantity';
}) {
  const { t, lang } = useLang();
  const router = useRouter();

  const [truck] = useState('');
  const [driver] = useState('');
  const [rate, setRate] = useState('');
  const stationTanks = tanks.filter((tk) => tk.code !== 'TRUCK');
  const [rows, setRows] = useState<Row[]>(() => [blankRow(mode === 'dip' ? stationTanks : tanks)]);
  const [truckCapacity, setTruckCapacity] = useState(TRUCK_CAPACITY_DEFAULT);
  const [fleet, setFleet] = useState<TruckInfo[]>([]);
  useEffect(() => {
    getTrucks().then(setFleet);
  }, []);
    useEffect(() => {
    if (mode !== 'quantity') return;
    getTruckCapacities().then((list) => {
      setTruckCapacity(String(Math.max(...list)));
    });
  }, [mode]);
  /** Oil purchase: one line per truck load. */
  const [loads, setLoads] = useState<Array<{ reg: string; driver: string; qty: string; truckId?: string; cap?: number }>>([
    { reg: '', driver: '', qty: '' },
  ]);

  const hold = mode === 'quantity' ? truckTank(tanks) : undefined;

  // The purchase always lands on the truck itself — no tank is chosen here.
  useEffect(() => {
    if (mode === 'quantity' && hold && rows[0] && rows[0].tankId !== hold.id) {
      setRows((rs) => rs.map((r, i) => (i === 0 ? { ...r, tankId: hold.id } : r)));
    }
  }, [mode, hold, rows]);

  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<DeliveryPreview | null>(null);
  const [pending, startTransition] = useTransition();

  // In the refill, litres come from the dips; with no challan figure typed,
  // the declared amount follows what the rods measured.
  const measured = useMemo(
    () => rows.map((_, i) => preview?.compartments.find((c) => c.compartment_no === i + 1)?.received_litres ?? ''),
    [rows, preview],
  );
  const measuredKey = measured.join('|');

  const input: DeliveryInput = useMemo(
    () => ({
      truck_reg: truck || undefined,
      driver_name: driver || undefined,
      depot_rate: rate || '0',
      compartments: mode === 'quantity'
        ? loads.map((l, i) => ({
            compartment_no: i + 1,
            declared_litres: l.qty || DECLARED_DEFAULT,
            tank_id: hold?.id ?? '',
            dip_before_mm: '',
            dip_after_mm: '',
            quantity_litres: l.qty,
          }))
        : rows.map((r, i) => ({
        compartment_no: i + 1,
        declared_litres:
          mode === 'dip'
            ? r.declared.trim()
              ? String(Number(r.declared) - (Number(r.sold) || 0))
              : measuredKey.split('|')[i] || DECLARED_DEFAULT
            : r.declared || DECLARED_DEFAULT,
        tank_id: r.tankId,
        dip_before_mm: mode === 'dip' ? r.dipBefore : '',
        dip_after_mm: mode === 'dip' ? r.dipAfter : '',
        quantity_litres: undefined,
        sold_litres: mode === 'dip' && r.sold.trim() ? r.sold.trim() : undefined,
      })),
    }),
    [truck, driver, rate, rows, mode, measuredKey, loads, hold],
  );

  const ready =
    mode === 'quantity'
      ? Boolean(rate.trim()) && Boolean(hold) && loads.some((l) => l.qty.trim())
      : rows.some((r) => r.tankId && r.dipBefore && r.dipAfter);

  const refresh = useCallback(() => {
    if (!ready) {
      setPreview(null);
      return;
    }
    startTransition(async () => {
      const result = await previewDelivery(input);
      if (result.ok && result.preview) {
        setPreview(result.preview);
        setError(null);
      } else {
        setPreview(result.preview ?? null);
        setError(result.error ?? null);
      }
    });
  }, [input, ready]);

  useEffect(() => {
    const timer = setTimeout(refresh, 400);
    return () => clearTimeout(timer);
  }, [refresh]);

  function save() {
    setError(null);
    startTransition(async () => {
      if (mode === 'quantity') {
        // Each truck load is its own purchase, so every truck keeps its number.
        let last: DeliveryPreview | null = null;
        let total = 0;
        for (const l of loads.filter((x) => x.qty.trim())) {
          const res = await recordDelivery({
            truck_reg: l.reg || undefined,
            driver_name: l.driver || undefined,
            depot_rate: rate || '0',
            compartments: [
              { compartment_no: 1, declared_litres: l.qty, tank_id: hold?.id ?? '', dip_before_mm: '', dip_after_mm: '', quantity_litres: l.qty },
            ],
          });
          if (!res.ok || !res.preview) {
            setError(res.error ?? 'That purchase could not be recorded');
            if (total > 0) router.refresh();
            return;
          }
          last = res.preview;
          total += Number(res.preview.totals.received) || 0;
        }
        if (last) {
          setSaved({ ...last, totals: { ...last.totals, received: String(total), shortage: '0' } });
          setLoads([{ reg: '', driver: '', qty: '' }]);
          router.refresh();
        }
        return;
      }
      const result = await recordDelivery(input);
      if (result.ok && result.preview) {
        setSaved(result.preview);
        router.refresh();
      } else {
        setError(result.error ?? 'That delivery could not be recorded');
      }
    });
  }

  if (saved) {
    return (
      <GlassCard lift={false} className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 state-ok" aria-hidden />
        <h2 className="text-base font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'ডেলিভারি লিপিবদ্ধ হয়েছে' : 'Delivery recorded'}
        </h2>
        <p className="tabular text-lg font-semibold">{formatLitres(saved.totals.received, lang)}</p>
        <Muted className="tabular" lang={lang}>
          {Number(saved.totals.shortage) > 0
            ? lang === 'bn'
              ? 'ঘাটতি'
              : 'Shortage'
            : Number(saved.totals.shortage) < 0
              ? lang === 'bn'
                ? 'বাড়তি'
                : 'Excess'
              : lang === 'bn'
                ? 'ঘাটতি'
                : 'Shortage'}{' '}
          {Number(saved.totals.shortage) !== 0 ? (Number(saved.totals.shortage) > 0 ? '-' : '+') : ''}
          {formatLitres(String(Math.abs(Number(saved.totals.shortage))), lang)}
        </Muted>
        <Muted lang={lang}>
          {mode === 'quantity'
            ? lang === 'bn'
              ? 'তেল ট্রাকের মজুদে যোগ হয়েছে — ট্যাংকে রিফিল করলে ট্যাংকে যাবে।'
              : 'Added to the truck stock — refilling moves it into the tank.'
            : lang === 'bn'
              ? 'তেলের মজুদে যোগ হয়েছে।'
              : 'Added to the oil stock.'}
        </Muted>
        <Button
          size="lg"
          onClick={() => {
            setSaved(null);
            setPreview(null);
            setRows([mode === 'dip' ? blankRow(stationTanks) : blankRow(tanks, hold ? tanks.indexOf(hold) : 0)]);
          }}
          lang={lang}
        >
          {lang === 'bn' ? 'আরেকটি ডেলিভারি' : 'Another delivery'}
        </Button>
      </GlassCard>
    );
  }

  // Refill figures including oil sold while the tank was filling.
  const lineReceived = (i: number) => {
    const c = preview?.compartments.find((x) => x.compartment_no === i + 1);
    return c ? Number(c.received_litres) + (Number(rows[i]?.sold) || 0) : 0;
  };
  const totReceived = rows.reduce((s, _, i) => s + lineReceived(i), 0);
  const declaredTyped = rows.some((r) => r.declared.trim());
  const totDeclared = rows.reduce(
    (s, r, i) => s + (r.declared.trim() ? Number(r.declared) || 0 : lineReceived(i)),
    0,
  );
  const totShortage = totDeclared - totReceived;
  const truckCap = Number(truckTank(tanks)?.capacityLitres ?? TRUCK_CAPACITY_DEFAULT) || 18000;
  const overTruckRefill = totReceived > truckCap;
  const overDeclared = declaredTyped && totReceived > totDeclared;
  const shortageSeen = declaredTyped && totShortage > 0;

  const allOk =
    preview !== null &&
    !shortageSeen &&
    preview.compartments.every((c) => !c.over_safe_limit);

  // Oil purchase: what the truck carries against what the truck can hold.
  const purchased = loads.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  const overTruck = loads.some((l) => (Number(l.qty) || 0) > (l.cap ?? (Number(truckCapacity) || 0)));


  return (
    <div className="space-y-4">
      <GlassCard lift={false} className="space-y-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
            {mode === 'quantity'
              ? lang === 'bn'
                ? 'তেল ক্রয়'
                : 'Oil purchase'
              : lang === 'bn'
                ? 'ট্রাক থেকে ট্যাংকে রিফিল'
                : 'Truck to tank refill'}
          </h2>
        </div>

        {mode === 'quantity' ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={lang === 'bn' ? 'ডিপো দর (৳/লিটার)' : 'Depot rate (৳/litre)'}
                value={rate}
                onChange={setRate}
              />
            </div>
            {loads.map((l, i) => {
              const set = (patch: Partial<typeof l>) =>
                setLoads((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const over = (Number(l.qty) || 0) > (l.cap ?? (Number(truckCapacity) || 0));
              return (
                <div
                  key={i}
                  className="space-y-2 rounded-xl border p-3"
                  style={{ borderColor: over ? 'var(--color-breach)' : 'var(--hairline)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" lang={lang}>
                      {lang === 'bn' ? `ট্রাক ${i + 1}` : `Truck ${i + 1}`}
                    </span>
                    {loads.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setLoads((ls) => ls.filter((_, j) => j !== i))}
                        className="tap-target ml-auto rounded-lg px-2 py-1 text-xs"
                        style={{ color: 'var(--text-muted)' }}
                        lang={lang}
                      >
                        <Trash2 className="inline h-3.5 w-3.5" aria-hidden /> {lang === 'bn' ? 'সরান' : 'Remove'}
                      </button>
                    ) : null}
                  </div>
                  {(
                    <label className="block space-y-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                        {lang === 'bn' ? 'ট্রাক বাছুন' : 'Choose truck'}
                      </span>
                      <select
                        className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                        style={{ borderColor: 'var(--hairline)' }}
                        value={l.truckId ?? ''}
                        onChange={(e) => {
                          const t = fleet.find((f) => f.id === e.target.value);
                          set(t ? { truckId: t.id, reg: t.reg || t.name, driver: t.driver, cap: t.capacity, qty: l.qty || String(t.capacity) } : { truckId: undefined, cap: undefined });
                        }}
                      >
                        <option value="">{fleet.length ? (lang === 'bn' ? 'ট্রাক বাছুন' : 'Choose a truck') : lang === 'bn' ? 'সেটিংসে ট্রাক যোগ করুন' : 'Add trucks in Settings'}</option>
                        {fleet.map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={lang === 'bn' ? 'ট্রাক নম্বর' : 'Truck registration'} value={l.reg} onChange={(v) => set({ reg: v })} />
                    <Field label={lang === 'bn' ? 'চালকের নাম' : 'Driver'} value={l.driver} onChange={(v) => set({ driver: v })} />
                    <Field label={lang === 'bn' ? 'তেলের পরিমাণ (লিটার)' : 'Oil quantity (litres)'} value={l.qty} onChange={(v) => set({ qty: v })} />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => setLoads((ls) => [...ls, { reg: '', driver: '', qty: '' }])} lang={lang}>
                <Plus className="h-4 w-4" aria-hidden />
                {lang === 'bn' ? 'আরেকটি ট্রাক' : 'Another truck'}
              </Button>
              <span className="tabular ml-auto text-sm font-semibold" lang={lang}>
                {lang === 'bn' ? 'মোট' : 'Total'} {formatLitres(String(purchased), lang)}
              </span>
            </div>
          </div>
        ) : null}

        {mode === 'quantity' && overTruck ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="breach" className="tabular" lang={lang}>
              {lang === 'bn' ? 'প্রতি ট্রাক সর্বোচ্চ' : 'Max per truck'} {formatLitres(truckCapacity || '0', lang)}
            </Chip>
            <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
              {lang === 'bn' ? 'একটি ট্রাকে ধারণক্ষমতার বেশি' : 'A truck has more than it can carry'}
            </span>
          </div>
        ) : null}
      </GlassCard>

      {/* Truck-to-tank refill: one line per tank, litres fill the rod. */}
      {mode === 'dip' ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const line = preview?.compartments.find((c) => c.compartment_no === index + 1);
            const tank = tanks.find((tk) => tk.id === row.tankId);

            return (
              <GlassCard
                key={index}
                lift={false}
                className="space-y-3"
                style={
                  line?.over_safe_limit
                    ? { borderColor: 'var(--color-breach)' }
                    : line?.shortage_flagged
                      ? { borderColor: 'var(--color-watch)' }
                      : undefined
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                      {lang === 'bn' ? 'ট্যাংক নম্বর' : 'Tank no.'}
                    </span>
                    <select
                      value={row.tankId}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  tankId: e.target.value,
                                  quantity: '',
                                  dipBefore:
                                    tanks.find((tk) => tk.id === e.target.value)?.currentDipMm ?? r.dipBefore,
                                  dipAfter: '',
                                }
                              : r,
                          ),
                        )
                      }
                      className="tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'var(--hairline)' }}
                    >
                      {(mode === 'dip' ? stationTanks : tanks).map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.code}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Field
                    label={lang === 'bn' ? 'আগের ডিপ (মিমি)' : 'Dip before (mm)'}
                    value={row.dipBefore}
                    onChange={(v) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, dipBefore: v } : r)))}
                    hint={
                      tank?.currentDipMm
                        ? `${lang === 'bn' ? 'এখন' : 'now'} ${formatNumber(tank.currentDipMm, { lang })}`
                        : undefined
                    }
                  />
                  <Field
                    label={lang === 'bn' ? 'পরের ডিপ (মিমি)' : 'Dip after (mm)'}
                    value={row.dipAfter}
                    onChange={(v) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, dipAfter: v } : r)))}
                  />
                  <Field
                    label={lang === 'bn' ? 'রিফিলের সময় বিক্রি (লিটার, ঐচ্ছিক)' : 'Sales during refill (litres, optional)'}
                    value={row.sold}
                    onChange={(v) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, sold: v } : r)))}
                  />
                  <Field
                    label={lang === 'bn' ? 'ঘোষিত লিটার (ঐচ্ছিক)' : 'Declared litres (optional)'}
                    value={row.declared}
                    onChange={(v) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, declared: v } : r)))}
                  />
                  <div className="space-y-1">
                    <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                      {lang === 'bn' ? 'তেলের পরিমাণ (লিটার)' : 'Oil quantity (litres)'}
                    </span>
                    <div
                      className="tabular tap-target flex w-full items-center rounded-xl border px-3 py-2 text-sm font-semibold"
                      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-solid)' }}
                    >
                      {line ? formatLitres(String(lineReceived(index)), lang) : '—'}
                    </div>
                    <Muted lang={lang}>{lang === 'bn' ? 'ডিপ + রিফিলের সময় বিক্রি' : 'dips + sales during refill'}</Muted>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {line ? (
                    <>
                      <Chip tone={Number(line.shortage_litres) > 0 || line.over_safe_limit ? 'breach' : 'ok'} className="tabular" lang={lang}>
                        {Number(line.shortage_litres) > 0 || line.over_safe_limit
                          ? lang === 'bn'
                            ? 'ঠিক নয়'
                            : 'Not okay'
                          : lang === 'bn'
                            ? 'ঠিক আছে'
                            : 'Okay'}
                      </Chip>
                      {line.over_safe_limit ? (
                        <Chip tone="breach" lang={lang}>
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {lang === 'bn' ? 'নিরাপদ সীমার উপরে' : 'Past the safe limit'}
                        </Chip>
                      ) : null}
                      <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }} lang={lang}>
                        {formatLitres(line.litres_before, lang)} → {formatLitres(line.litres_after, lang)} ={' '}
                        <strong>{formatLitres(line.received_litres, lang)}</strong>{' '}
                        {lang === 'bn' ? 'পাওয়া গেছে' : 'received'}
                      </span>
                      <Chip
                        tone={Number(line.shortage_litres) > 0 ? 'breach' : 'ok'}
                        className="tabular"
                        lang={lang}
                      >
                        {Number(line.shortage_litres) > 0
                          ? lang === 'bn'
                            ? 'ঘাটতি'
                            : 'Shortage'
                          : Number(line.shortage_litres) < 0
                            ? lang === 'bn'
                              ? 'বাড়তি'
                              : 'Excess'
                            : lang === 'bn'
                              ? 'ঠিক আছে'
                              : 'Matches'}{' '}
                        {Number(line.shortage_litres) !== 0
                          ? `${Number(line.shortage_litres) > 0 ? '-' : '+'}${formatLitres(
                              String(Math.abs(Number(line.shortage_litres))),
                              lang,
                            )} ${Number(line.shortage_litres) > 0 ? '-' : ''}${formatPercent(
                              String(Math.abs(Number(line.shortage_pct))),
                              lang,
                            )}`
                          : null}
                      </Chip>
                    </>
                  ) : null}

                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((_, i) => i !== index))}
                      className="tap-target ml-auto rounded-lg px-2 py-1 text-xs"
                      style={{ color: 'var(--text-muted)' }}
                      lang={lang}
                    >
                      <Trash2 className="inline h-3.5 w-3.5" aria-hidden />{' '}
                      {lang === 'bn' ? 'সরান' : 'Remove'}
                    </button>
                  ) : null}
                </div>
              </GlassCard>
            );
          })}

          <Button
            variant="ghost"
            onClick={() => setRows((rs) => [...rs, blankRow(mode === 'dip' ? stationTanks : tanks, rs.length)])}
            lang={lang}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {lang === 'bn' ? 'আরেকটি ট্যাংক' : 'Another tank'}
          </Button>
        </div>
      ) : null}

      {preview && mode !== 'quantity' ? (
        <GlassCard lift={false} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight" lang={lang}>
              {lang === 'bn' ? 'হিসাব বিবরণী' : 'Statement'}
            </h3>
            <Chip tone={allOk ? 'ok' : 'watch'} className="ml-auto" lang={lang}>
              {allOk
                ? lang === 'bn'
                  ? 'ফলাফল ঠিক আছে'
                  : 'Results okay'
                : lang === 'bn'
                  ? 'ফলাফল ঠিক নয়'
                  : 'Results not okay'}
            </Chip>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label={lang === 'bn' ? 'ঘোষিত' : 'Declared'} value={formatLitres(String(totDeclared), lang)} />
            <Stat label={lang === 'bn' ? 'পাওয়া গেছে' : 'Received'} value={formatLitres(String(totReceived), lang)} />
            <Stat
              label={
                totShortage > 0
                  ? lang === 'bn' ? 'ঘাটতি' : 'Shortage'
                  : totShortage < 0
                    ? lang === 'bn' ? 'বাড়তি' : 'Excess'
                    : lang === 'bn' ? 'ঘাটতি/বাড়তি' : 'Shortage/Excess'
              }
              value={`${totShortage > 0 ? '-' : totShortage < 0 ? '+' : ''}${formatLitres(String(Math.abs(totShortage)), lang)}${
                totDeclared > 0 ? ` · ${formatPercent(String(Math.abs((totShortage / totDeclared) * 100)), lang)}` : ''
              }`}
            />
          </div>

          {overTruckRefill || overDeclared || shortageSeen ? (
            <div className="space-y-1">
              {overTruckRefill ? (
                <p className="state-ok flex items-center gap-1 text-sm" lang={lang}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {lang === 'bn'
                    ? `রিফিল ট্রাকের ধারণক্ষমতা (${formatLitres(String(truckCap), lang)}) ছাড়িয়েছে — ${formatLitres(String(totReceived - truckCap), lang)} বেশি`
                    : `Refill is more than the truck capacity (${formatLitres(String(truckCap), lang)}) by ${formatLitres(String(totReceived - truckCap), lang)}`}
                </p>
              ) : null}
              {overDeclared ? (
                <p className="state-ok flex items-center gap-1 text-sm" lang={lang}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {lang === 'bn'
                    ? `রিফিল ঘোষিত লিটারের চেয়ে ${formatLitres(String(totReceived - totDeclared), lang)} বেশি`
                    : `Refill is ${formatLitres(String(totReceived - totDeclared), lang)} more than the declared litres`}
                </p>
              ) : null}
              {shortageSeen ? (
                <p className="state-breach flex items-center gap-1 text-sm" lang={lang}>
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {lang === 'bn'
                    ? `ঘাটতি পাওয়া গেছে: -${formatLitres(String(totShortage), lang)}`
                    : `Shortage found: -${formatLitres(String(totShortage), lang)}`}
                </p>
              ) : null}
            </div>
          ) : null}

          <Muted lang={lang}>
            {lang === 'bn'
              ? 'রডে মাপা লিটার অনুযায়ী ট্যাংকের মজুদ ঠিক হবে — তেল আবার কেনা হয় না।'
              : 'The tank level is set from the litres the rods measured — the oil is not bought again.'}
          </Muted>

          <div className="space-y-1">
            {preview.tanks.map((tk) => (
              <p key={tk.tank_id} className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                <strong>{tk.tank_code}</strong>: {formatLitres(tk.stock_before, lang)} +{' '}
                {formatLitres(tk.received_litres, lang)} = {formatLitres(tk.stock_after, lang)}
                {canSeeCost && tk.new_avg_cost ? (
                  <>
                    {' · '}
                    {lang === 'bn' ? 'গড় ক্রয়মূল্য' : 'average cost'}{' '}
                    <strong>{formatBDT(tk.new_avg_cost, lang)}</strong>
                    {tk.cost_basis === 'first_delivery_depot_rate' ? (
                      <>
                        {' '}
                        <span className="state-watch">
                          ({lang === 'bn' ? 'প্রথম মূল্যায়ন' : 'first valuation'})
                        </span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </p>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {error ? (
        <p className="state-breach text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        size="lg"
        className="w-full"
        disabled={!preview || pending || (mode === 'quantity' && overTruck)}
        onClick={save}
        lang={lang}
      >
        {t('common.save')}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
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
      {hint ? <Muted>{hint}</Muted> : null}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
        {label}
      </p>
      <p className="tabular mt-0.5 text-sm font-semibold tracking-tight">{value}</p>
    </div>
  );
}
