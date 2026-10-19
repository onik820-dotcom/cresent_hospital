-- 0037 — When the caller omits arrived_at the delivery falls back to now() instead of failing.
create or replace function public.record_tanker_delivery(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := auth.uid();
  v_v       jsonb;
  v_shift   uuid;
  v_id      uuid := gen_random_uuid();
  v_line    jsonb;
  v_qty_only boolean;
  v_dip_mm  numeric;
  v_at      timestamptz := coalesce(nullif(p_payload->>'arrived_at', '')::timestamptz, now());
begin
  if not public.can_write_ops() then
    raise exception 'Only a manager or admin can record a delivery' using errcode = 'insufficient_privilege';
  end if;

  p_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('arrived_at', v_at);
  v_v := public.compute_tanker_delivery(p_payload);

  if (v_v->>'overfilled')::boolean then
    raise exception 'This delivery would overfill a tank beyond its safe limit' using errcode = 'check_violation';
  end if;

  v_shift := nullif(p_payload->>'shift_id', '')::uuid;
  if v_shift is null then
    select s.id into v_shift from public.shifts s
    where s.starts_at <= v_at and s.ends_at >= v_at and s.status <> 'closed'
    order by s.starts_at desc limit 1;
  end if;

  insert into public.tanker_deliveries (
    id, station_id, po_id, challan_no, truck_reg, driver_name, arrived_at,
    depot_rate, total_declared, total_received, total_shortage, purchase_value,
    shift_id, notes, created_by
  ) values (
    v_id, (select station_id from public.profiles where id = v_actor),
    nullif(p_payload->>'po_id', '')::uuid, nullif(p_payload->>'challan_no', ''),
    nullif(p_payload->>'truck_reg', ''), nullif(p_payload->>'driver_name', ''),
    v_at,
    (v_v->>'depot_rate')::numeric, (v_v->>'total_declared')::numeric,
    (v_v->>'total_received')::numeric, (v_v->>'total_shortage')::numeric,
    (v_v->>'purchase_value')::numeric,
    v_shift, nullif(p_payload->>'notes', ''), v_actor
  );

  for v_line in select * from jsonb_array_elements(v_v->'lines') loop
    v_qty_only := coalesce((v_line->>'quantity_only')::boolean, false);

    insert into public.tanker_compartments (
      delivery_id, compartment_no, declared_litres, tank_id,
      dip_before_mm, dip_after_mm, litres_before, litres_after,
      received_litres, shortage_litres, created_by
    ) values (
      v_id, (v_line->>'compartment_no')::integer, (v_line->>'declared_litres')::numeric,
      (v_line->>'tank_id')::uuid,
      case when v_qty_only then 0 else (v_line->>'dip_before_mm')::numeric end,
      case when v_qty_only then 0 else (v_line->>'dip_after_mm')::numeric end,
      (v_line->>'litres_before')::numeric, (v_line->>'litres_after')::numeric,
      (v_line->>'received_litres')::numeric, (v_line->>'shortage_litres')::numeric,
      v_actor
    );

    -- Quantity-only entry still moves the stock: write the synthetic post-refill dip
    -- the stock page and dashboards read their level from.
    if v_qty_only and v_shift is not null then
      v_dip_mm := public.litres_to_dip((v_line->>'tank_id')::uuid, (v_line->>'litres_after')::numeric, v_at);
      insert into public.tank_dips (
        shift_id, tank_id, dip_type, dip_mm, litres,
        recorded_by, recorded_at, created_by
      ) values (
        v_shift, (v_line->>'tank_id')::uuid, 'post_refill', coalesce(v_dip_mm, 0),
        (v_line->>'litres_after')::numeric, v_actor, v_at, v_actor
      );
    end if;

    perform public.record_tank_cost(
      (v_line->>'tank_id')::uuid, (v_line->>'stock_before')::numeric,
      (v_line->>'received_litres')::numeric, (v_v->>'depot_rate')::numeric,
      v_at, v_id
    );
  end loop;

  insert into public.alerts (station_id, type, severity, title, title_bn, body, entity_ref, created_by)
  select (select station_id from public.profiles where id = v_actor), 'delivery.shortage',
         'warn', 'Tanker shortage',
         'ট্যাংকারে ঘাটতি',
         format('Shortage %s L (%s%%) on challan %s',
                (v_v->>'total_shortage')::numeric,
                round((v_v->>'total_shortage')::numeric / nullif((v_v->>'total_declared')::numeric, 0) * 100, 2),
                coalesce(nullif(p_payload->>'challan_no', ''), '—')),
         jsonb_build_object('delivery_id', v_id), v_actor
  where (v_v->>'flagged')::boolean;

  perform public.enqueue_sync_event('refill.received', jsonb_build_object('delivery_id', v_id, 'received', v_v->'total_received'), 'refill-' || v_id::text);

  return v_v || jsonb_build_object('id', v_id);
end;
$$;