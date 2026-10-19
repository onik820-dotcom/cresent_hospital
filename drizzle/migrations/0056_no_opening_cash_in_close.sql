CREATE OR REPLACE FUNCTION public.compute_cash_position(p_shift_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dues jsonb := public.shift_dues_collected(p_shift_id);
begin
  -- Opening cash is never carried into a shift close: the previous count stays in the drawer.
  return jsonb_build_object(
    'opening_cash', 0,
    'opening_source', 'previous_shift',
    'opening_entered', 0,
    'dues_collected', (v_dues->>'cash')::numeric,
    'dues_non_cash', (v_dues->>'non_cash')::numeric,
    'dues_payment_count', (v_dues->>'count')::integer);
end;
$function$;