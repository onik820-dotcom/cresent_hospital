-- 0013 — Admin operations that must carry a reason

create or replace function public.admin_set_equipment_status(
  p_kind   text,
  p_id     uuid,
  p_status public.equipment_status,
  p_reason text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin may add, pause or remove equipment'
      using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('tank', 'dispenser') then
    raise exception 'Unknown equipment kind %', p_kind using errcode = 'check_violation';
  end if;

  if p_status = 'removed' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Removing equipment needs a reason' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);

  if p_kind = 'tank' then
    if p_status = 'removed' then
      if exists (
        select 1 from public.tank_dips d
        where d.tank_id = p_id and d.deleted_at is null
          and d.litres > 0
          and d.recorded_at = (
            select max(d2.recorded_at) from public.tank_dips d2
            where d2.tank_id = p_id and d2.deleted_at is null
          )
      ) then
        raise exception
          'Tank % still reads above empty on its last dip. Record an empty dip before removing it.',
          (select code from public.tanks where id = p_id)
          using errcode = 'check_violation';
      end if;

      if exists (
        select 1 from public.dispensers dp
        where dp.tank_id = p_id and dp.deleted_at is null and dp.status <> 'removed'
      ) then
        raise exception
          'Tank % still has dispensers drawing from it. Reassign or remove them first.',
          (select code from public.tanks where id = p_id)
          using errcode = 'check_violation';
      end if;
    end if;

    update public.tanks
    set status = p_status,
        deleted_at = case when p_status = 'removed' then now() else deleted_at end,
        deleted_by = case when p_status = 'removed' then auth.uid() else deleted_by end,
        delete_reason = case when p_status = 'removed' then p_reason else delete_reason end
    where id = p_id;

  else
    update public.dispensers
    set status = p_status,
        deleted_at = case when p_status = 'removed' then now() else deleted_at end,
        deleted_by = case when p_status = 'removed' then auth.uid() else deleted_by end,
        delete_reason = case when p_status = 'removed' then p_reason else delete_reason end
    where id = p_id;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'No % found with id %', p_kind, p_id using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.admin_set_equipment_status(text, uuid, public.equipment_status, text) is
  'Pause, resume or remove a tank or dispenser, with the reason recorded in the audit log in the same transaction. Removal is a soft delete.';

create or replace function public.admin_upsert_calibration_row(
  p_tank_id uuid,
  p_version integer,
  p_dip_mm  integer,
  p_litres  numeric,
  p_reason  text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_final    integer;
  v_prev     numeric;
  v_next     numeric;
  v_code     text := (select code from public.tanks where id = p_tank_id);
  v_from     date;
  v_to       date;
begin
  if not public.is_admin() then
    raise exception 'Only an admin may change a calibration chart'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Changing a certified calibration row needs a reason'
      using errcode = 'check_violation';
  end if;

  if p_litres < 0 then
    raise exception 'Litres cannot be negative' using errcode = 'check_violation';
  end if;

  select final_dip_mm into v_final from public.tank_metadata
   where tank_id = p_tank_id order by validity_from desc limit 1;

  if v_final is null then
    raise exception 'Tank % has no metadata, so its dip range is unknown', v_code
      using errcode = 'no_data_found';
  end if;

  if p_dip_mm < 1 or p_dip_mm > v_final then
    raise exception 'Dip % mm is outside the certified range 1-% mm for tank %', p_dip_mm, v_final, v_code
      using errcode = 'check_violation';
  end if;

  select litres into v_prev from public.tank_calibration
   where tank_id = p_tank_id and version = p_version and dip_mm < p_dip_mm
   order by dip_mm desc limit 1;

  select litres into v_next from public.tank_calibration
   where tank_id = p_tank_id and version = p_version and dip_mm > p_dip_mm
   order by dip_mm asc limit 1;

  if v_prev is not null and p_litres <= v_prev then
    raise exception
      '% L at % mm is not more than the % L at the millimetre below it — the chart must strictly increase',
      p_litres, p_dip_mm, v_prev using errcode = 'check_violation';
  end if;

  if v_next is not null and p_litres >= v_next then
    raise exception
      '% L at % mm is not less than the % L at the millimetre above it — the chart must strictly increase',
      p_litres, p_dip_mm, v_next using errcode = 'check_violation';
  end if;

  select valid_from, valid_to into v_from, v_to from public.tank_calibration
   where tank_id = p_tank_id and version = p_version limit 1;

  perform set_config('app.audit_reason', p_reason, true);

  insert into public.tank_calibration (tank_id, version, dip_mm, litres, valid_from, valid_to, created_by)
  values (p_tank_id, p_version, p_dip_mm, p_litres,
          coalesce(v_from, current_date), coalesce(v_to, current_date + 1), auth.uid())
  on conflict (tank_id, version, dip_mm) do update
    set litres = excluded.litres;
end;
$$;

comment on function public.admin_upsert_calibration_row(uuid, integer, integer, numeric, text) is
  'Admin only, reason required. Refuses any change that would stop the chart increasing strictly with dip.';

revoke execute on function public.admin_set_equipment_status(text, uuid, public.equipment_status, text) from anon, public;
revoke execute on function public.admin_upsert_calibration_row(uuid, integer, integer, numeric, text) from anon, public;
grant execute on function public.admin_set_equipment_status(text, uuid, public.equipment_status, text) to authenticated;
grant execute on function public.admin_upsert_calibration_row(uuid, integer, integer, numeric, text) to authenticated;