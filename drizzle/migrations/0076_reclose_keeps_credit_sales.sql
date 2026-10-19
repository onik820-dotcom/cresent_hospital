DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.compute_shift_close(uuid,jsonb)'::regprocedure);
  IF position('reclose_existing_credit' in d) = 0 THEN
    d := replace(d,
      $a$  v_credit := v_credit + (v_lub_recorded->>'credit')::numeric;$a$,
      $b$  v_credit := v_credit + (v_lub_recorded->>'credit')::numeric;
  -- reclose_existing_credit: a reopened shift keeps the due sales already saved on it.
  if (select status from public.shifts where id = p_shift_id) = 'reopened' then
    v_credit := v_credit + coalesce((select round(sum(cs.amount), 2) from public.credit_sales cs
      where cs.shift_id = p_shift_id and cs.deleted_at is null and cs.product = 'diesel'), 0);
  end if;$b$);
    IF position('reclose_existing_credit' in d) = 0 THEN
      RAISE EXCEPTION 'compute_shift_close credit line not found';
    END IF;
    EXECUTE d;
  END IF;
END
$mig$;

create or replace function public.admin_reclose_shift(p_shift_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status shift_status;
  v_result jsonb;
  v_payload jsonb;
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

  -- Saved due sales, lubricant sales and expenses stay as they are; they are
  -- counted from their own rows, so the edit must not insert them a second time.
  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('credit_sales', '[]'::jsonb, 'lubricant_sales', '[]'::jsonb, 'expenses', '[]'::jsonb);

  update public.meter_readings
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'Replaced by admin shift edit'
   where shift_id = p_shift_id and reading_type = 'close' and deleted_at is null;
  update public.tank_dips
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'Replaced by admin shift edit'
   where shift_id = p_shift_id and dip_type = 'close' and deleted_at is null;

  v_result := public.close_shift(p_shift_id, v_payload);

  perform * from public.recalculate_from(p_shift_id);

  return v_result;
end;
$$;

revoke execute on function public.admin_reclose_shift(uuid, jsonb) from anon, public;
grant execute on function public.admin_reclose_shift(uuid, jsonb) to authenticated;