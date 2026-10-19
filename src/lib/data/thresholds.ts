import { useEffect, useState } from 'react';
import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';

/**
 * The numbers the admin may tune from Settings → Calculation thresholds.
 *
 * Stored in the same `settings` table the database reads through
 * setting_numeric(), under the same keys, so the screen and the database rules
 * (reason required past the variance limit, cash tolerance, cost rounding)
 * cannot disagree. A value that cannot be read falls back to the default the
 * migration seeds, never to zero.
 */
export interface Thresholds {
  /** Stock variance past this % of litres sold is a breach (red). */
  stockVarianceAlertPct: number;
  /** From here up to the alert limit is a warning (yellow). */
  stockVarianceWarnPct: number;
  /** A stock gap of this many litres or fewer is never flagged. */
  varianceFloorLitres: number;
  /** Cash difference, in taka, still treated as a clean close. */
  cashVarianceTolerance: number;
  /** Litres per nozzle suggested for the test measure. */
  testFireLitresDefault: number;
  /** Credit limit suggested for a new party, in taka. */
  maxCreditLimitDefault: number;
  /** Decimal places carried on the average cost per litre. */
  avcoRoundingDecimals: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  stockVarianceAlertPct: 0.5,
  stockVarianceWarnPct: 0.3,
  varianceFloorLitres: 7,
  cashVarianceTolerance: 0,
  testFireLitresDefault: 0.5,
  maxCreditLimitDefault: 50000,
  avcoRoundingDecimals: 4,
};

/** Setting key behind each field. The first three are read by the database too. */
export const THRESHOLD_KEYS: Record<keyof Thresholds, string> = {
  stockVarianceAlertPct: 'variance_threshold_pct',
  stockVarianceWarnPct: 'variance_warn_pct',
  varianceFloorLitres: 'variance_floor_litres',
  cashVarianceTolerance: 'cash_variance_tolerance',
  testFireLitresDefault: 'test_fire_litres_default',
  maxCreditLimitDefault: 'max_credit_limit_default',
  avcoRoundingDecimals: 'avco_rounding_decimals',
};

const FIELDS = Object.keys(THRESHOLD_KEYS) as Array<keyof Thresholds>;

/** Sensible bounds, so a typo cannot silence an alert or break a rounding rule. */
export const THRESHOLD_LIMITS: Record<keyof Thresholds, { min: number; max: number }> = {
  stockVarianceAlertPct: { min: 0.01, max: 100 },
  stockVarianceWarnPct: { min: 0, max: 100 },
  varianceFloorLitres: { min: 0, max: 10000 },
  cashVarianceTolerance: { min: 0, max: 1000000 },
  testFireLitresDefault: { min: 0, max: 50 },
  maxCreditLimitDefault: { min: 0, max: 1000000000 },
  avcoRoundingDecimals: { min: 2, max: 6 },
};

export type TrafficLight = 'green' | 'yellow' | 'red';

/**
 * The colour of a stock variance. `flagged` is the database's own verdict;
 * when it says breach, it is red whatever the percentage. Otherwise a gap no
 * bigger than the litre floor is green (the database never flags those, so the
 * screen must not colour them as if it did), and the warning band decides the rest.
 */
export function stockLight(
  variancePct: number | string | null | undefined,
  flagged: boolean | undefined,
  t: Pick<Thresholds, 'stockVarianceAlertPct' | 'stockVarianceWarnPct' | 'varianceFloorLitres'> = DEFAULT_THRESHOLDS,
  varianceLitres?: number | string | null,
): TrafficLight {
  if (flagged) return 'red';
  if (varianceLitres !== null && varianceLitres !== undefined && varianceLitres !== '') {
    const litres = Math.abs(Number(varianceLitres));
    if (Number.isFinite(litres) && litres <= t.varianceFloorLitres) return 'green';
  }
  if (variancePct === null || variancePct === undefined || variancePct === '') return 'green';
  const pct = Math.abs(Number(variancePct));
  if (!Number.isFinite(pct)) return 'green';
  if (pct > t.stockVarianceAlertPct) return 'red';
  if (pct >= t.stockVarianceWarnPct) return 'yellow';
  return 'green';
}

function readNumber(raw: unknown, fallback: number): number {
  const v = (raw as { value?: unknown } | null | undefined)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function getThresholds(): Promise<Thresholds> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', Object.values(THRESHOLD_KEYS));
  const byKey = new Map(((data ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_THRESHOLDS };
  for (const field of FIELDS) {
    out[field] = readNumber(byKey.get(THRESHOLD_KEYS[field]), DEFAULT_THRESHOLDS[field]);
  }
  return out;
}

export interface ThresholdResult {
  ok: boolean;
  error?: string;
}

/** Admin only — the settings table's own policy says so too. */
export async function saveThresholds(next: Thresholds): Promise<ThresholdResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only an admin may change these' };

  for (const field of FIELDS) {
    const { min, max } = THRESHOLD_LIMITS[field];
    const v = next[field];
    if (!Number.isFinite(v) || v < min || v > max) {
      return { ok: false, error: `${THRESHOLD_KEYS[field]} must be between ${min} and ${max}` };
    }
  }
  if (next.stockVarianceWarnPct > next.stockVarianceAlertPct) {
    return { ok: false, error: 'The yellow level cannot be above the red level' };
  }
  if (!Number.isInteger(next.avcoRoundingDecimals)) {
    return { ok: false, error: 'Cost rounding must be a whole number of decimal places' };
  }

  const supabase = await createClient();
  const { data: station } = await supabase.from('stations').select('id').limit(1).maybeSingle();
  const rows = FIELDS.map((field) => ({
    station_id: station?.id ?? null,
    key: THRESHOLD_KEYS[field],
    value: { value: next[field] },
    updated_by: profile.id,
  }));
  const { error } = await supabase.from('settings').upsert(rows as never, { onConflict: 'station_id,key' });
  if (error) return { ok: false, error: error.message };

  cached = null;
  signalRefresh();
  return { ok: true };
}

let cached: Promise<Thresholds> | null = null;

/**
 * The thresholds, fetched once and shared. `loaded` is false while the
 * defaults are standing in, for the few callers that must not act on a guess.
 */
export function useThresholdsState(): { value: Thresholds; loaded: boolean } {
  const [state, setState] = useState<{ value: Thresholds; loaded: boolean }>({
    value: DEFAULT_THRESHOLDS,
    loaded: false,
  });
  useEffect(() => {
    let alive = true;
    cached ??= getThresholds().catch(() => DEFAULT_THRESHOLDS);
    cached.then((value) => alive && setState({ value, loaded: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useThresholds(): Thresholds {
  return useThresholdsState().value;
}
