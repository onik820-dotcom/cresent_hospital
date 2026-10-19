-- 0034 — Quantity-only tanker entry
-- A compartment row may carry quantity_litres instead of before/after dips.
-- The declared and received litres are then that quantity; stock-before is
-- read from the latest dip, and a synthetic post-refill dip is written so the
-- stock page and dashboards move with the delivery.

create or replace function public.compute_tanker_delivery(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate        numeric;
  v_at          timestamptz;
  v_row         jsonb;
  v_lines       jsonb := '[]'::jsonb;
  v_tank        record;
  v_before      numeric;
  v_after       numeric;
  v_received    numeric;
  v_shortage    numeric;
  v_short_pct   numeric;
  v_tolerance   numeric := public.setting_numeric('shortage_tolerance_pct', 0.3);
  v_limit_pct   numeric := public.setting_numeric('overfill_limit_pct', 95);
  v_declared    numeric;
  v_safe_limit  numeric;
  v_total_decl  numeric := 0;
  v_total_recv  numeric := 0;
  v_by_tank     jsonb := '{}'::jsonb;
  v_tanks       jsonb := '[]'::jsonb;
  v_first_before jsonb := '{}'::jsonb;
  v_old_stock   numeric;
  v_old_cost    numeric;
  v_new_cost    numeric;
  v_tank_recv   numeric;
  v_has_history boolean;
  v_basis       text;
  v_entry       jsonb;
  v_qty_only    boolean;
  v_may_see_cost boolean := public.is_admin() or public.is_md();
begin
  if not (public.can_write_ops() or public.is_md()) then
    raise exception 'Not allowed to price a delivery' using errcode = 'insufficient_privilege';
  end if;

  v_rate := round((p_payload->>'depot_rate')::numeric, 2);
  if v_rate is null or v_rate < 0 then
    raise exception 'A depot rate is required' using errcode = 'check_violation';
  end if;
  v_at := coalesce((p_payload->>'arrived_at')::timestamptz, now());

  for v_row in
    select * from jsonb_array_elements(coalesce(p_payload->'compartments', '[]'::jsonb))
    order by (value->>'compartment_no')::integer
  loop
    select t.id, t.code, t.capacity_litres into v_tank
    from public.tanks t where t.id = (v_row->>'tank_id')::uuid;

    if v_tank.id is null then
      raise exception 'Compartment %: unknown tank', v_row->>'compartment_no'
        using errcode = 'no_data_found';
    end if;

    v_qty_only := coalesce(nullif(btrim(v_row->>'dip_before_mm'), '') is null
                           or nullif(btrim(v_row->>'dip_after_mm'), '') is null,
                           true)
                  and nullif(btrim(coalesce(v_row->>'quantity_litres', '')), '') is not null;

    if v_qty_only then
      v_received := round((v_row->>'quantity_litres')::numeric, 3);
      if v_received is null or v_received <= 0 then
        raise exception 'Compartment %: a quantity in litres is required',
          v_row->>'compartment_no' using errcode = 'check_violation';
      end if;
      v_declared := v_received;
      v_shortage := 0;
      v_short_pct := 0;
      select d.litres into v_before
      from public.tank_dips d
      where d.tank_id = v_tank.id and d.deleted_at is null
      order by d.recorded_at desc limit 1;
      v_before := round(coalesce(v_before, 0), 3);
      v_after := round(v_before + v_received, 3);
    else
      v_declared := round(coalesce((v_row->>'declared_litres')::numeric, 4500), 3);
      v_before := public.dip_to_litres(v_tank.id, (v_row->>'dip_before_mm')::numeric, v_at);
      v_after  := public.dip_to_litres(v_tank.id, (v_row->>'dip_after_mm')::numeric, v_at);

      if v_after < v_before then
        raise exception
          'Compartment %: the dip after a discharge cannot be lower than the dip before it',
          v_row->>'compartment_no' using errcode = 'check_violation';
      end if;

      v_received := round(v_after - v_before, 3);
      v_shortage := round(v_declared - v_received, 3);
      v_short_pct := case when v_declared = 0 then null
                          else round(v_shortage / v_declared * 100, 4) end;
    end if;

    if not (v_first_before ? v_tank.id::text) then
      v_first_before := jsonb_set(v_first_before, array[v_tank.id::text], to_jsonb(v_before), true);
    end if;

    v_safe_limit := round(v_tank.capacity_litres * v_limit_pct / 100, 3);

    v_total_decl := v_total_decl + v_declared;
    v_total_recv := v_total_recv + v_received;
    v_by_tank := jsonb_set(v_by_tank, array[v_tank.id::text],
      to_jsonb(coalesce((v_by_tank->>v_tank.id::text)::numeric, 0) + v_received), true);

    v_lines := v_lines || jsonb_build_object(
      'compartment_no', (v_row->>'compartment_no')::integer,
      'tank_id', v_tank.id,
      'tank_code', v_tank.code,
      'quantity_only', v_qty_only,
      'declared_litres', v_declared,
      'dip_before_mm', nullif(btrim(coalesce(v_row->>'dip_before_mm', '')), '')::numeric,
      'dip_after_mm', nullif(btrim(coalesce(v_row->>'dip_after_mm', '')), '')::numeric,
      'litres_before', v_before,
      'litres_after', v_after,
      'received_litres', v_received,
      'shortage_litres', v_shortage,
      'shortage_pct', v_short_pct,
      'shortage_flagged', coalesce(v_short_pct > v_tolerance, false),
      'safe_limit_litres', v_safe_limit,
      'over_safe_limit', v_after > v_safe_limit,
      'headroom_before', round(v_safe_limit - v_before, 3));
  end loop;

  for v_tank in
    select t.id, t.code from public.tanks t where t.deleted_at is null order by t.code
  loop
    continue when not (v_by_tank ? v_tank.id::text);

    v_tank_recv := round((v_by_tank->>v_tank.id::text)::numeric, 3);
    v_old_stock := round(coalesce((v_first_before->>v_tank.id::text)::numeric, 0), 3);
    v_has_history := public.tank_has_cost_history(v_tank.id, v_at);
    v_old_cost  := public.tank_avg_cost(v_tank.id, v_at);

    if v_has_history then
      v_new_cost := public.moving_average_cost(v_old_stock, v_old_cost, v_tank_recv, v_rate);
      v_basis := 'moving_average';
    else
      v_new_cost := round(v_rate, 4);
      v_basis := 'first_delivery_depot_rate';
    end if;

    v_entry := jsonb_build_object(
      'tank_id', v_tank.id,
      'tank_code', v_tank.code,
      'stock_before', v_old_stock,
      'received_litres', v_tank_recv,
      'stock_after', round(v_old_stock + v_tank_recv, 3));

    if v_may_see_cost then
      v_entry := v_entry || jsonb_build_object(
        'old_avg_cost', v_old_cost,
        'has_cost_history', v_has_history,
        'cost_basis', v_basis,
        'depot_rate', v_rate,
        'new_avg_cost', v_new_cost);
    end if;

    v_tanks := v_tanks || v_entry;
  end loop;

  return jsonb_build_object(
    'depot_rate', v_rate,
    'arrived_at', v_at,
    'compartments', v_lines,
    'tanks', v_tanks,
    'totals', jsonb_build_object(
      'declared', round(v_total_decl, 3),
      'received', round(v_total_recv, 3),
      'shortage', round(v_total_decl - v_total_recv, 3),
      'shortage_pct', case when v_total_decl = 0 then null
                           else round((v_total_decl - v_total_recv) / v_total_decl * 100, 4) end,
      'purchase_value', round(v_total_recv * v_rate, 2)),
    'thresholds', jsonb_build_object('shortage_pct', v_tolerance, 'overfill_pct', v_limit_pct));
end;
$$;

comment on function public.compute_tanker_delivery(jsonb) is
  'Works out a delivery compartment by compartment and writes nothing. A row with quantity_litres and no dips is a quantity-only entry: declared equals received.';

create or replace function public.record_tanker_delivery(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
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
    insert into public.tanker_compartments
      (delivery_id, compartment_no, declared_litres, tank_id,
       dip_before_mm, dip_after_mm, litres_before, litres_after,
       received_litres, shortage_litres, created_by)
    values
      (v_delivery, (v_row->>'compartment_no')::integer, (v_row->>'declared_litres')::numeric,
       (v_row->>'tank_id')::uuid, (v_row->>'dip_before_mm')::numeric, (v_row->>'dip_after_mm')::numeric,
       (v_row->>'litres_before')::numeric, (v_row->>'litres_after')::numeric,
       (v_row->>'received_litres')::numeric, (v_row->>'shortage_litres')::numeric, v_actor);

    -- A quantity-only entry leaves no rod behind; write the post-refill dip the
    -- quantity implies so the stock page, gauges and dip register all move.
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
$$;

comment on function public.record_tanker_delivery(jsonb) is
  'Records a delivery in one transaction. Dip rows are valued on litres received; quantity-only rows also write the implied post-refill dip so stock moves.';