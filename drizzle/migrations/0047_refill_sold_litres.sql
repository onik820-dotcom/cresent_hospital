ALTER TABLE public.tanker_compartments ADD COLUMN IF NOT EXISTS sold_litres numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_tanker_delivery(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result   jsonb;
  v_actor    uuid := auth.uid();
  v_station  uuid := (select id from public.stations limit 1);
  v_delivery uuid;
  v_row      jsonb;
  v_tank     jsonb;
  v_totals   jsonb;
  v_shift    uuid;
  v_po       uuid;
  v_at       timestamptz;
  v_rate     numeric;
  v_dip_mm   numeric;
  v_sold     numeric;
begin
  if not public.can_write_ops() then
    raise exception 'Only a manager or an admin may record a delivery'
      using errcode = 'insufficient_privilege';
  end if;

  v_result := public.compute_tanker_delivery(p_payload);
  v_totals := v_result->'totals';
  v_at := (v_result->>'arrived_at')::timestamptz;
  v_rate := (v_result->>'depot_rate')::numeric;

  v_shift := nullif(p_payload->>'shift_id', '')::uuid;
  if v_shift is null then
    select s.id into v_shift from public.shifts s
    where v_at >= s.starts_at and v_at < s.ends_at
    order by s.starts_at desc limit 1;
  end if;

  if coalesce(btrim(p_payload->>'po_number'), '') <> '' then
    select id into v_po from public.purchase_orders
    where po_number = btrim(p_payload->>'po_number') and deleted_at is null limit 1;
  end if;

  insert into public.tanker_deliveries
    (station_id, po_id, challan_no, truck_reg, driver_name, arrived_at, depot_rate,
     total_declared, total_received, total_shortage, purchase_value, shift_id, notes, created_by)
  values
    (v_station, v_po,
     nullif(btrim(coalesce(p_payload->>'challan_no', '')), ''),
     nullif(btrim(coalesce(p_payload->>'truck_reg', '')), ''),
     nullif(btrim(coalesce(p_payload->>'driver_name', '')), ''),
     v_at, v_rate,
     (v_totals->>'declared')::numeric, (v_totals->>'received')::numeric,
     (v_totals->>'shortage')::numeric, (v_totals->>'purchase_value')::numeric,
     v_shift, nullif(btrim(coalesce(p_payload->>'notes', '')), ''), v_actor)
  returning id into v_delivery;

  for v_row in select * from jsonb_array_elements(v_result->'compartments')
  loop
    select coalesce(nullif(c->>'sold_litres', '')::numeric, 0) into v_sold
    from jsonb_array_elements(p_payload->'compartments') c
    where (c->>'compartment_no')::integer = (v_row->>'compartment_no')::integer
    limit 1;

    insert into public.tanker_compartments
      (delivery_id, compartment_no, declared_litres, tank_id,
       dip_before_mm, dip_after_mm, litres_before, litres_after,
       received_litres, shortage_litres, sold_litres, created_by)
    values
      (v_delivery, (v_row->>'compartment_no')::integer, (v_row->>'declared_litres')::numeric,
       (v_row->>'tank_id')::uuid,
       coalesce((v_row->>'dip_before_mm')::numeric, 0),
       coalesce((v_row->>'dip_after_mm')::numeric, 0),
       (v_row->>'litres_before')::numeric, (v_row->>'litres_after')::numeric,
       (v_row->>'received_litres')::numeric, (v_row->>'shortage_litres')::numeric,
       greatest(coalesce(v_sold, 0), 0), v_actor);

    if coalesce((v_row->>'quantity_only')::boolean, false) then
      v_dip_mm := public.litres_to_dip(
        (v_row->>'tank_id')::uuid, (v_row->>'litres_after')::numeric, v_at);
      insert into public.tank_dips
        (shift_id, tank_id, dip_type, dip_mm, litres,
         recorded_by, recorded_at, created_by)
      values
        (v_shift, (v_row->>'tank_id')::uuid, 'post_refill',
         coalesce(v_dip_mm, 0), (v_row->>'litres_after')::numeric,
         v_actor, v_at, v_actor);
    end if;

    if (v_row->>'over_safe_limit')::boolean then
      insert into public.alerts (station_id, type, severity, title, title_bn, body, entity_ref, created_by)
      values (v_station, 'tank.overfilled', 'warn',
        format('Tank %s filled past its safe limit', v_row->>'tank_code'),
        format('ট্যাংক %s নিরাপদ সীমার উপরে ভরা হয়েছে', v_row->>'tank_code'),
        format('Compartment %s left it at %s L against a safe limit of %s L',
               v_row->>'compartment_no', v_row->>'litres_after', v_row->>'safe_limit_litres'),
        jsonb_build_object('delivery_id', v_delivery, 'tank_id', v_row->>'tank_id'), v_actor);
    end if;
  end loop;

  for v_tank in select * from jsonb_array_elements(v_result->'tanks')
  loop
    perform public.record_tank_cost(
      (v_tank->>'tank_id')::uuid,
      (v_tank->>'stock_before')::numeric,
      (v_tank->>'received_litres')::numeric,
      v_rate, v_at, v_delivery);
  end loop;

  if coalesce((v_totals->>'shortage_pct')::numeric, 0)
     > public.setting_numeric('shortage_tolerance_pct', 0.3) then
    insert into public.alerts (station_id, type, severity, title, title_bn, body, entity_ref, created_by)
    values (v_station, 'delivery.shortage', 'warn',
      format('Delivery short by %s L', v_totals->>'shortage'),
      format('ডেলিভারিতে %s লিটার কম', v_totals->>'shortage'),
      format('Challan %s declared %s L, the rods measured %s L',
             coalesce(p_payload->>'challan_no', '—'), v_totals->>'declared', v_totals->>'received'),
      jsonb_build_object('delivery_id', v_delivery), v_actor);
  end if;

  perform public.enqueue_sync_event(
    'refill.received',
    v_result || jsonb_build_object('delivery_id', v_delivery),
    format('refill.received:%s', v_delivery));

  return v_result || jsonb_build_object('delivery_id', v_delivery, 'shift_id', v_shift);
end;
$function$;