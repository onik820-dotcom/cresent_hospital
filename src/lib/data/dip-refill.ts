import { businessDayEnd } from '@/lib/format';
import { createClient } from '@/lib/data/client';
import { dec, decOr0, sum } from '@/lib/calc/decimal';

/**
 * Refills measured by the rod.
 *
 * A refill is two dips: the rod is read before the tanker discharges and
 * again after it. The difference between the two certified conversions is
 * what physically entered the tank — so the employee's two readings alone are
 * enough to state the refill amount, with no paperwork in between. Pairing is
 * done here, once, so the dispenser screen, the dashboards and the refill page
 * can never state different litres for the same pair of readings.
 */
export interface DipRefill {
  tankId: string;
  tankCode: string;
  beforeDipMm: string;
  beforeLitres: string;
  afterDipMm: string;
  afterLitres: string;
  receivedLitres: string;
  beforeAt: string;
  afterAt: string;
  recordedBy: string | null;
  approvedBy: string | null;
}

interface DipRow {
  id: string;
  tank_id: string;
  dip_type: string;
  dip_mm: string | number;
  litres: string | number | null;
  recorded_at: string;
  tanks: { code: string } | null;
  recorder: { full_name: string } | null;
  approver: { full_name: string } | null;
}

/**
 * Pair every "after refill" dip with the "before refill" dip that preceded it
 * on the same tank. A lone reading on either side is simply not a refill yet
 * and is left out rather than guessed at.
 */
export async function getDipRefills(opts?: { fromISO?: string; toISO?: string; limit?: number }): Promise<DipRefill[]> {
  const supabase = await createClient();

  let query = supabase
    .from('tank_dips')
    .select(
      'id, tank_id, dip_type, dip_mm, litres, recorded_at, tanks(code), ' +
        'recorder:recorded_by(full_name), approver:approved_by(full_name)',
    )
    .in('dip_type', ['pre_refill', 'post_refill'])
    .is('deleted_at', null)
    .order('recorded_at', { ascending: true })
    .limit(500);

  if (opts?.fromISO) query = query.gte('recorded_at', opts.fromISO);
  if (opts?.toISO) query = query.lte('recorded_at', opts.toISO);

  const { data, error } = await query;
  if (error || !data) return [];

  const pending = new Map<string, DipRow>();
  const pairs: DipRefill[] = [];

  for (const row of data as unknown as DipRow[]) {
    if (row.dip_type === 'pre_refill') {
      pending.set(row.tank_id, row);
      continue;
    }

    const before = pending.get(row.tank_id);
    if (!before) continue;
    pending.delete(row.tank_id);

    const beforeLitres = decOr0(before.litres);
    const afterLitres = decOr0(row.litres);
    const received = afterLitres.minus(beforeLitres);
    // A fall in the rod between the two readings is not a refill: it is sales
    // carrying on around the tanker, and must not be reported as fuel in.
    if (received.lessThanOrEqualTo(0)) continue;

    pairs.push({
      tankId: row.tank_id,
      tankCode: row.tanks?.code ?? before.tanks?.code ?? '—',
      beforeDipMm: dec(before.dip_mm).toString(),
      beforeLitres: beforeLitres.toFixed(3),
      afterDipMm: dec(row.dip_mm).toString(),
      afterLitres: afterLitres.toFixed(3),
      receivedLitres: received.toFixed(3),
      beforeAt: before.recorded_at,
      afterAt: row.recorded_at,
      recordedBy: row.recorder?.full_name ?? before.recorder?.full_name ?? null,
      approvedBy: row.approver?.full_name ?? null,
    });
  }

  pairs.sort((a, b) => (a.afterAt < b.afterAt ? 1 : -1));
  return opts?.limit ? pairs.slice(0, opts.limit) : pairs;
}

/** Everything the rod says entered the tanks on one business date. */
export async function getDipRefillTotal(businessDate: string): Promise<{ litres: string; tanks: number }> {
  const pairs = await getDipRefills({
    fromISO: `${businessDate}T10:00:00+06:00`,
    toISO: businessDayEnd(businessDate),
  });
  return {
    litres: sum(pairs.map((p) => dec(p.receivedLitres))).toFixed(3),
    tanks: new Set(pairs.map((p) => p.tankId)).size,
  };
}
