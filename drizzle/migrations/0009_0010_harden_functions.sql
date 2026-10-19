-- 0010 — Hardening: pin search_path, tighten EXECUTE privileges

alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_md() set search_path = public, pg_temp;
alter function public.is_dispenser() set search_path = public, pg_temp;
alter function public.can_write_ops() set search_path = public, pg_temp;
alter function public.can_read_money() set search_path = public, pg_temp;
alter function public.business_date(timestamptz) set search_path = public, pg_temp;
alter function public.setting_numeric(text, numeric) set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.calibration_version_at(uuid, timestamptz) set search_path = public, pg_temp;
alter function public.tank_final_dip_mm(uuid, timestamptz) set search_path = public, pg_temp;
alter function public.dip_to_litres(uuid, numeric, timestamptz) set search_path = public, pg_temp;
alter function public.litres_to_dip(uuid, numeric, timestamptz) set search_path = public, pg_temp;
alter function public.set_dip_litres() set search_path = public, pg_temp;
alter function public.set_compartment_receipt() set search_path = public, pg_temp;
alter function public.moving_average_cost(numeric, numeric, numeric, numeric) set search_path = public, pg_temp;
alter function public.tank_avg_cost(uuid, timestamptz) set search_path = public, pg_temp;
alter function public.previous_shift_stock(uuid, timestamptz) set search_path = public, pg_temp;
alter function public.enforce_stock_chain() set search_path = public, pg_temp;
alter function public.set_ledger_running_balance() set search_path = public, pg_temp;
alter function public.customer_balance(uuid) set search_path = public, pg_temp;
alter function public.post_credit_sale_to_ledger() set search_path = public, pg_temp;
alter function public.post_payment_to_ledger() set search_path = public, pg_temp;
alter function public.apply_lub_transaction() set search_path = public, pg_temp;
alter function public.prevent_hard_delete() set search_path = public, pg_temp;
alter function public.audit_log_is_append_only() set search_path = public, pg_temp;
alter function public.set_audit_reason(text) set search_path = public, pg_temp;
alter function public.assert_md_is_read_only() set search_path = public, pg_temp;
alter function public.audit_trigger() set search_path = public, pg_temp;

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

revoke execute on function public.audit_trigger() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;
revoke execute on function public.set_dip_litres() from authenticated;
revoke execute on function public.set_compartment_receipt() from authenticated;
revoke execute on function public.enforce_stock_chain() from authenticated;
revoke execute on function public.set_ledger_running_balance() from authenticated;
revoke execute on function public.post_credit_sale_to_ledger() from authenticated;
revoke execute on function public.post_payment_to_ledger() from authenticated;
revoke execute on function public.apply_lub_transaction() from authenticated;
revoke execute on function public.prevent_hard_delete() from authenticated;
revoke execute on function public.audit_log_is_append_only() from authenticated;

grant execute on function public.current_shift_info() to authenticated;
grant execute on function public.current_shift_id() to authenticated;
grant execute on function public.dip_to_litres(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.litres_to_dip(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.calibration_version_at(uuid, timestamptz) to authenticated;
grant execute on function public.tank_final_dip_mm(uuid, timestamptz) to authenticated;
grant execute on function public.business_date(timestamptz) to authenticated;
grant execute on function public.customer_balance(uuid) to authenticated;
grant execute on function public.tank_avg_cost(uuid, timestamptz) to authenticated;
grant execute on function public.setting_numeric(text, numeric) to authenticated;
grant execute on function public.moving_average_cost(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.set_audit_reason(text) to authenticated;
grant execute on function public.assert_md_is_read_only() to authenticated;
grant execute on function public.jhm_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_md() to authenticated;
grant execute on function public.is_dispenser() to authenticated;
grant execute on function public.can_write_ops() to authenticated;
grant execute on function public.can_read_money() to authenticated;

grant execute on function public.recalculate_from(uuid) to authenticated;

grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;