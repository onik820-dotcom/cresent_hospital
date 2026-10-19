create or replace function public.admin_reclose_shift(p_shift_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status shift_status;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin may edit a closed shift' using errcode = 'insufficient_privilege';
  end if;
  select status into v_status from public.shifts where id = p_shift_id for update;
  if v_status is null then
    raise exception 'Unknown shift %', p_shift_id using errcode = 'no_data_found';
  end if;
  if v_status <> 'reopened' then
    raise exception 'Reopen the shift before editing it' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', 'Admin edit of closed shift', true);

  -- The new close replaces the old closing meters and dips.
  update public.meter_readings
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'Replaced by admin shift edit'
   where shift_id = p_shift_id and reading_type = 'close' and deleted_at is null;
  update public.tank_dips
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'Replaced by admin shift edit'
   where shift_id = p_shift_id and dip_type = 'close' and deleted_at is null;

  v_result := public.close_shift(p_shift_id, p_payload);

  -- Carry the corrected stock forward through every later shift.
  perform * from public.recalculate_from(p_shift_id);

  return v_result;
end;
$$;

revoke execute on function public.admin_reclose_shift(uuid, jsonb) from anon, public;
grant execute on function public.admin_reclose_shift(uuid, jsonb) to authenticated;