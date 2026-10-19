CREATE OR REPLACE FUNCTION public.record_tank_cost(p_tank_id uuid, p_stock_before numeric, p_received numeric, p_rate numeric, p_at timestamp with time zone, p_delivery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cost numeric;
  v_note text;
  v_rate numeric := p_rate;
  v_truck uuid;
begin
  if not public.can_write_ops() then
    raise exception 'Not allowed to record a tank cost' using errcode = 'insufficient_privilege';
  end if;

  -- A refill from purchased oil carries no depot rate of its own; it takes the
  -- cost of the purchased oil it came from, so it never drags the average down.
  if coalesce(v_rate, 0) <= 0 then
    select id into v_truck from public.tanks where code = 'TRUCK' and deleted_at is null limit 1;
    if v_truck is not null and public.tank_has_cost_history(v_truck, p_at) then
      v_rate := public.tank_avg_cost(v_truck, p_at);
    elsif public.tank_has_cost_history(p_tank_id, p_at) then
      v_rate := public.tank_avg_cost(p_tank_id, p_at);
    end if;
    v_rate := coalesce(v_rate, 0);
  end if;

  if public.tank_has_cost_history(p_tank_id, p_at) then
    v_cost := public.moving_average_cost(
      p_stock_before, public.tank_avg_cost(p_tank_id, p_at), p_received, v_rate);
    v_note := format('%s L received at %s into %s L already in the tank',
                     p_received, v_rate, p_stock_before);
  else
    v_cost := round(v_rate, 4);
    v_note := format('First valuation: %s L already in the tank take today''s depot rate of %s',
                     p_stock_before, v_rate);
  end if;

  insert into public.tank_cost_history
    (tank_id, effective_at, stock_before_litres, received_litres, depot_rate, avg_cost,
     trigger_delivery_id, note, created_by)
  values
    (p_tank_id, p_at, p_stock_before, p_received, v_rate, v_cost, p_delivery_id, v_note, auth.uid());
end;
$function$;