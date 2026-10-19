create or replace function public.edit_tanker_delivery(p_delivery_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_d        public.tanker_deliveries;
  v_row      jsonb;
  v_c        public.tanker_compartments;
  v_dip      public.tank_dips;
  v_rate     numeric;
  v_new_recv numeric;
  v_new_decl numeric;
  v_delta    numeric;
  v_declared numeric;
  v_received numeric;
  v_short    numeric;
  v_tol      numeric := public.setting_numeric('shortage_tolerance_pct', 0.3);
begin
  if not public.can_write_ops() then
    raise exception 'Only a manager or an admin may edit a delivery'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_d from public.tanker_deliveries
   where id = p_delivery_id and deleted_at is null;
  if v_d.id is null then
    raise exception 'That delivery was not found';
  end if;

  v_rate := coalesce(nullif(btrim(coalesce(p_payload->>'depot_rate','')),'')::numeric, v_d.depot_rate);

  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'compartments', '[]'::jsonb))
  loop
    select * into v_c from public.tanker_compartments
     where delivery_id = p_delivery_id
       and compartment_no = (v_row->>'compartment_no')::integer;
    continue when v_c.id is null;

    v_new_recv := coalesce(nullif(btrim(coalesce(v_row->>'received_litres','')),'')::numeric, v_c.received_litres);
    v_new_decl := coalesce(nullif(btrim(coalesce(v_row->>'declared_litres','')),'')::numeric, v_c.declared_litres);
    v_delta := v_new_recv - v_c.received_litres;

    update public.tanker_compartments
       set declared_litres = v_new_decl,
           received_litres = v_new_recv,
           litres_after    = v_c.litres_before + v_new_recv,
           shortage_litres = greatest(v_new_decl - v_new_recv, 0),
           shortage_pct    = case when v_new_decl > 0
                                  then (greatest(v_new_decl - v_new_recv, 0) / v_new_decl) * 100
                                  else 0 end,
           shortage_flagged = case when v_new_decl > 0
                                   then ((greatest(v_new_decl - v_new_recv, 0) / v_new_decl) * 100) > v_tol
                                   else false end,
           updated_at = now(),
           updated_by = v_actor
     where id = v_c.id;

    -- The stock moves with the correction: the post-refill rod this delivery
    -- wrote is shifted by the difference, never written a second time.
    if v_delta <> 0 then
      select * into v_dip from public.tank_dips
       where tank_id = v_c.tank_id
         and dip_type = 'post_refill'
         and deleted_at is null
         and recorded_at = v_d.arrived_at
       order by created_at desc
       limit 1;

      if v_dip.id is not null then
        update public.tank_dips
           set litres = v_dip.litres + v_delta,
               dip_mm = coalesce(
                 public.litres_to_dip(v_c.tank_id, v_dip.litres + v_delta, v_d.arrived_at),
                 v_dip.dip_mm),
               updated_at = now(),
               updated_by = v_actor
         where id = v_dip.id;
      end if;
    end if;
  end loop;

  select coalesce(sum(declared_litres), 0), coalesce(sum(received_litres), 0)
    into v_declared, v_received
    from public.tanker_compartments
   where delivery_id = p_delivery_id;

  v_short := greatest(v_declared - v_received, 0);

  update public.tanker_deliveries
     set truck_reg      = coalesce(nullif(btrim(coalesce(p_payload->>'truck_reg','')),''), truck_reg),
         driver_name    = coalesce(nullif(btrim(coalesce(p_payload->>'driver_name','')),''), driver_name),
         depot_rate     = v_rate,
         total_declared = v_declared,
         total_received = v_received,
         total_shortage = v_short,
         purchase_value = v_received * v_rate,
         updated_at     = now(),
         updated_by     = v_actor
   where id = p_delivery_id;

  return jsonb_build_object('ok', true, 'received', v_received, 'shortage', v_short);
end;
$$;

revoke all on function public.edit_tanker_delivery(uuid, jsonb) from public, anon;
grant execute on function public.edit_tanker_delivery(uuid, jsonb) to authenticated;