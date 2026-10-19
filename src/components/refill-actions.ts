
import { createClient } from '@/lib/data/client';
import { getPurchasedOilLitres } from '@/lib/data/purchased-oil';
import { getSessionProfile } from '@/lib/session';

export interface DeliveryCompartmentInput {
  compartment_no: number;
  declared_litres: string;
  tank_id: string;
  dip_before_mm: string;
  dip_after_mm: string;
  /** Set in quantity-only mode instead of the dips. */
  quantity_litres?: string;
  /** Litres sold from the tank while it was being refilled. */
  sold_litres?: string;
}

export interface DeliveryInput {
  po_number?: string;
  challan_no?: string;
  truck_reg?: string;
  driver_name?: string;
  depot_rate: string;
  arrived_at?: string;
  notes?: string;
  compartments: DeliveryCompartmentInput[];
}

export interface DeliveryPreview {
  depot_rate: string;
  arrived_at: string;
  compartments: Array<{
    compartment_no: number;
    tank_id: string;
    tank_code: string;
    declared_litres: string;
    litres_before: string;
    litres_after: string;
    received_litres: string;
    shortage_litres: string;
    shortage_pct: string | null;
    shortage_flagged: boolean;
    safe_limit_litres: string;
    over_safe_limit: boolean;
    headroom_before: string;
  }>;
  tanks: Array<{
    tank_id: string;
    tank_code: string;
    stock_before: string;
    received_litres: string;
    stock_after: string;
    /** Present only for admin and MD; a manager is not shown cost. */
    old_avg_cost?: string;
    new_avg_cost?: string;
    cost_basis?: 'moving_average' | 'first_delivery_depot_rate';
    depot_rate?: string;
  }>;
  totals: {
    declared: string;
    received: string;
    shortage: string;
    shortage_pct: string | null;
    purchase_value: string;
  };
  thresholds: { shortage_pct: string; overfill_pct: string };
  delivery_id?: string;
}

export interface DeliveryResult {
  ok: boolean;
  error?: string;
  preview?: DeliveryPreview;
}

function fail(error: unknown, fallback: string): DeliveryResult {
  const message =
    typeof error === 'object' && error && 'message' in error ? String(error.message) : fallback;
  return { ok: false, error: message };
}

function usable(input: DeliveryInput) {
  return {
    ...input,
    compartments: input.compartments.filter(
      (c) =>
        c.tank_id &&
        (Boolean(c.quantity_litres?.trim()) ||
          (c.dip_before_mm.trim() && c.dip_after_mm.trim())),
    ),
  };
}

/** Litres the truck holds from oil purchases — a refill may move no more than this. */
async function truckCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: ReturnType<typeof usable>,
  moving: number,
): Promise<string | null> {
  const isRefill = payload.compartments.every((c) => !c.quantity_litres?.trim());
  if (!isRefill) return null;
  const { data: truck } = await supabase.from('tanks').select('id').eq('code', 'TRUCK').is('deleted_at', null).maybeSingle();
  if (!truck) return null;
  const stock = await getPurchasedOilLitres();
  if (moving > stock + 0.001) {
    return stock <= 0
      ? 'The truck has no oil. Record an oil purchase first, then refill the tank from it.'
      : `The truck holds only ${stock.toFixed(3)} L from oil purchases, but this refill moves ${moving.toFixed(3)} L.`;
  }
  return null;
}

/**
 * Live figures as the dips are typed, computed by the database and writing
 * nothing. record runs the same function first, so what the form shows is what
 * gets stored.
 */
export async function previewDelivery(input: DeliveryInput): Promise<DeliveryResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may record a delivery' };
  }

  const payload = usable(input);
  if (payload.compartments.length === 0) {
    return { ok: false, error: 'Enter the dips for at least one compartment' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('compute_tanker_delivery', { p_payload: payload });
  if (error) return fail(error, 'That delivery could not be worked out');
  const pv = data as DeliveryPreview;
  const moving = pv.compartments.reduce((s, c) => s + (Number(c.received_litres) || 0), 0);
  const truckErr = await truckCheck(supabase, payload, moving);
  if (truckErr) return { ok: false, error: truckErr, preview: pv };
  return { ok: true, preview: pv };
}

export async function recordDelivery(input: DeliveryInput): Promise<DeliveryResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may record a delivery' };
  }

  const payload = usable(input);
  if (payload.compartments.length === 0) {
    return { ok: false, error: 'Enter the dips for at least one compartment' };
  }

  const supabase = await createClient();
  const { data: check, error: checkErr } = await supabase.rpc('compute_tanker_delivery', { p_payload: payload });
  if (checkErr) return fail(checkErr, 'That delivery could not be worked out');
  const moving = (check as DeliveryPreview).compartments.reduce((s, c) => s + (Number(c.received_litres) || 0), 0);
  const truckErr = await truckCheck(supabase, payload, moving);
  if (truckErr) return { ok: false, error: truckErr };

  const { data, error } = await supabase.rpc('record_tanker_delivery', { p_payload: payload });
  if (error) return fail(error, 'That delivery could not be recorded');

  // A dip refill is oil already bought onto the truck: take it off the truck
  // so the same litres are never counted twice.
  const preview = data as DeliveryPreview;
  const isRefill = payload.compartments.every((c) => !c.quantity_litres?.trim());
  if (isRefill) {
    // The after-refill rod becomes each tank's current level everywhere.
    const tankDips = preview.compartments
      .map((c) => {
        const src = payload.compartments.find((p) => p.compartment_no === c.compartment_no);
        return { tank_id: c.tank_id, mm: Number(src?.dip_after_mm), litres: c.litres_after };
      })
      .filter((d) => d.tank_id && Number.isFinite(d.mm) && d.mm > 0);
    if (tankDips.length > 0) {
      const { error: tdErr } = await supabase.from('tank_dips').insert(
        tankDips.map((d) => ({
          tank_id: d.tank_id,
          dip_type: 'post_refill' as const,
          shift_id: (data as { shift_id?: string | null }).shift_id ?? null,
          dip_mm: d.mm,
          litres: d.litres,
          recorded_by: profile.id,
        })),
      );
      if (tdErr) return fail(tdErr, 'Refill saved, but the tank levels could not be updated');
    }

    const { data: truck } = await supabase.from('tanks').select('id').eq('code', 'TRUCK').is('deleted_at', null).maybeSingle();
    if (truck) {
      const moved = preview.compartments
        .filter((c) => c.tank_id !== truck.id)
        .reduce((s, c) => s + (Number(c.received_litres) || 0), 0);
      if (moved > 0) {
        const { data: last } = await supabase
          .from('tank_dips')
          .select('litres')
          .eq('tank_id', truck.id)
          .is('deleted_at', null)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const left = Math.max(0, (Number(last?.litres) || 0) - moved);
        // The chart starts at 1 mm, so an emptied truck sits on the lowest mark.
        let dipMm = 1;
        if (left > 0) {
          const { data: mm } = await supabase.rpc('litres_to_dip', { p_tank_id: truck.id, p_litres: left, p_at: new Date().toISOString() });
          dipMm = Math.max(1, Math.round(Number(mm) || 0));
        }
        const { error: dipErr } = await supabase.from('tank_dips').insert({
          tank_id: truck.id,
          dip_type: 'post_refill',
          dip_mm: dipMm,
          recorded_by: profile.id,
        });
        if (dipErr) return fail(dipErr, 'Refill saved, but the truck stock could not be reduced');
      }
    }
  }

  
  
  
  
  return { ok: true, preview };
}

export interface DeliveryEditInput {
  delivery_id: string;
  truck_reg?: string;
  driver_name?: string;
  depot_rate?: string;
  compartments: Array<{
    compartment_no: number;
    declared_litres?: string;
    received_litres?: string;
  }>;
}

/**
 * Correcting a delivery already in the books. The litres move the post-refill
 * rod this delivery wrote — the stock is adjusted, never added a second time.
 */
export async function editDelivery(input: DeliveryEditInput): Promise<DeliveryResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, error: 'Only a manager or an admin may edit a delivery' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('edit_tanker_delivery', {
    p_delivery_id: input.delivery_id,
    p_payload: {
      truck_reg: input.truck_reg ?? '',
      driver_name: input.driver_name ?? '',
      depot_rate: input.depot_rate ?? '',
      compartments: input.compartments,
    },
  });
  if (error) return fail(error, 'That delivery could not be changed');
  return { ok: true };
}
