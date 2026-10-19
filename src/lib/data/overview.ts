import { createClient } from '@/lib/data/client';
import { D, dec } from '@/lib/calc/decimal';
import { CHART_EXPIRY_WARNING_DAYS } from '@/lib/calc/dip';

export interface TankOverview {
  id: string;
  code: string;
  status: 'active' | 'paused' | 'removed';
  capacityLitres: string;
  finalDipMm: number | null;
  /** Null until the first dip is recorded for this tank. */
  lastDipMm: string | null;
  lastDipLitres: string | null;
  lastDipAt: string | null;
  fillPct: number | null;
  ullageLitres: string | null;
  chartValidTo: string | null;
  chartDaysRemaining: number | null;
  chartExpired: boolean;
  chartExpiringSoon: boolean;
  calibrationRows: number;
}

interface TankRow {
  id: string;
  code: string;
  status: TankOverview['status'];
  capacity_litres: string;
  tank_metadata: Array<{ final_dip_mm: number; validity_to: string }> | null;
}

/**
 * Tank cards for the stock page and every dashboard: what the rod last said,
 * how full that makes the tank, and how long the certified chart still runs.
 */
export async function getTankOverview(): Promise<TankOverview[]> {
  const supabase = await createClient();

  const { data: tanks, error } = await supabase
    .from('tanks')
    .select('id, code, status, capacity_litres, tank_metadata(final_dip_mm, validity_to)')
    .is('deleted_at', null)
    .neq('status', 'removed')
    .neq('code', 'TRUCK')
    .order('code');

  if (error || !tanks) return [];

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  return Promise.all(
    (tanks as unknown as TankRow[]).map(async (tank) => {
      const metadata = tank.tank_metadata?.[0] ?? null;

      const [{ data: dip }, { count }] = await Promise.all([
        latestClosedDip(supabase, tank.id, 'dip_mm, litres, recorded_at'),
        supabase
          .from('tank_calibration')
          .select('id', { count: 'exact', head: true })
          .eq('tank_id', tank.id),
      ]);

      const capacity = dec(tank.capacity_litres);
      const litres = dip ? dec(dip.litres) : null;
      const validTo = metadata?.validity_to ?? null;
      const daysRemaining = validTo
        ? Math.floor((new Date(`${validTo}T23:59:59+06:00`).getTime() - now) / msPerDay)
        : null;

      return {
        id: tank.id,
        code: tank.code,
        status: tank.status,
        capacityLitres: capacity.toFixed(3),
        finalDipMm: metadata?.final_dip_mm ?? null,
        lastDipMm: dip ? dec(dip.dip_mm).toString() : null,
        lastDipLitres: litres ? litres.toFixed(3) : null,
        lastDipAt: dip?.recorded_at ?? null,
        fillPct:
          litres && !capacity.isZero()
            ? Number(litres.dividedBy(capacity).times(100).toDecimalPlaces(1, D.ROUND_HALF_UP))
            : null,
        ullageLitres: litres ? capacity.minus(litres).toFixed(3) : null,
        chartValidTo: validTo,
        chartDaysRemaining: daysRemaining,
        chartExpired: daysRemaining !== null && daysRemaining < 0,
        chartExpiringSoon:
          daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= CHART_EXPIRY_WARNING_DAYS,
        calibrationRows: count ?? 0,
      } satisfies TankOverview;
    }),
  );
}

export interface DispenserOverview {
  id: string;
  code: string;
  tankCode: string;
  status: 'active' | 'paused' | 'removed';
  nozzleCount: number;
  meterDigits: number;
  maxFlowLpm: string;
}

export async function getDispenserOverview(): Promise<DispenserOverview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('dispensers')
    .select('id, code, status, nozzle_count, meter_digits, max_flow_lpm, tanks(code)')
    .is('deleted_at', null)
    .neq('status', 'removed')
    .order('code');

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    code: string;
    status: DispenserOverview['status'];
    nozzle_count: number;
    meter_digits: number;
    max_flow_lpm: string;
    tanks: { code: string } | null;
  }>).map((row) => ({
    id: row.id,
    code: row.code,
    tankCode: row.tanks?.code ?? '—',
    status: row.status,
    nozzleCount: row.nozzle_count,
    meterDigits: row.meter_digits,
    maxFlowLpm: row.max_flow_lpm,
  }));
}

export interface CurrentShift {
  id: string;
  shiftDate: string;
  shiftType: 'day' | 'night';
  startsAt: string;
  endsAt: string;
  status: 'open' | 'closing' | 'closed' | 'reopened';
}

/**
 * The shift a dispenser is standing in. Read through the SECURITY DEFINER
 * function rather than the table, because `shifts` carries rate_per_litre and
 * a dispenser must never see a rate.
 */
export async function getCurrentShift(): Promise<CurrentShift | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('current_shift_info');
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;

  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    shift_date: string;
    shift_type: 'day' | 'night';
    starts_at: string;
    ends_at: string;
    status: CurrentShift['status'];
  };

  return {
    id: row.id,
    shiftDate: row.shift_date,
    shiftType: row.shift_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

/** How many readings and dips this dispenser has submitted in the current shift. */
export async function getMySubmissionCount(shiftId: string | null): Promise<{ readings: number; dips: number }> {
  if (!shiftId) return { readings: 0, dips: 0 };
  const supabase = await createClient();

  const [readings, dips] = await Promise.all([
    supabase.from('meter_readings').select('id', { count: 'exact', head: true }).eq('shift_id', shiftId),
    supabase.from('tank_dips').select('id', { count: 'exact', head: true }).eq('shift_id', shiftId),
  ]);

  return { readings: readings.count ?? 0, dips: dips.count ?? 0 };
}

/**
 * Tank stock comes from the closing dip of the latest closed shift, unless a
 * tank refill was recorded after it — then the refill's after-dip is shown,
 * so the card reflects the most recent refill. Before any shift has closed,
 * the latest refill dip wins, else the latest dip of any kind.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function latestClosedDip(supabase: any, tankId: string, cols: string) {
  const closed = await supabase
    .from('tank_dips')
    .select(`${cols}, shifts!tank_dips_shift_id_fkey!inner(status)`)
    .eq('tank_id', tankId)
    .eq('dip_type', 'close')
    .eq('shifts.status', 'closed')
    .is('deleted_at', null)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let refillQ = supabase
    .from('tank_dips')
    .select(cols)
    .eq('tank_id', tankId)
    .in('dip_type', ['post_refill', 'open'])
    .is('deleted_at', null);
  if (closed.data?.recorded_at) refillQ = refillQ.gt('recorded_at', closed.data.recorded_at);
  const refill = await refillQ.order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  if (refill.data) return refill;
  if (closed.data) return closed;
  // Closing dips only count once their shift is signed off; until then the
  // tank keeps showing its opening / refill stock.
  return supabase
    .from('tank_dips')
    .select(cols)
    .eq('tank_id', tankId)
    .neq('dip_type', 'close')
    .is('deleted_at', null)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}
