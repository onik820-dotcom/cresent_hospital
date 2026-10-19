create or replace function public.purchased_oil_litres()
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(0, coalesce(sum(case when tk.code = 'TRUCK' then c.received_litres
                                        else -(c.received_litres + coalesce(c.sold_litres,0)) end), 0))
  from public.tanker_compartments c
  join public.tanker_deliveries d on d.id = c.delivery_id and d.deleted_at is null
  join public.tanks tk on tk.id = c.tank_id
$$;
grant execute on function public.purchased_oil_litres() to authenticated, service_role;

do $m$
declare v text;
begin
  v := pg_get_functiondef('public.dashboard_kpis()'::regprocedure);
  v := replace(v,
    E'  where t.deleted_at is null and t.status <> ''removed'';\n\n  if v_month_litres',
    E'  where t.deleted_at is null and t.status <> ''removed'' and t.code <> ''TRUCK'';\n\n  v_stock := v_stock + public.purchased_oil_litres();\n\n  if v_month_litres');
  if position('purchased_oil_litres' in v) = 0 then raise exception 'dashboard_kpis patch failed'; end if;
  execute v;

  v := pg_get_functiondef('public.chat_tank_status()'::regprocedure);
  v := replace(v,
    'public.dip_to_litres(tk.id, d.dip_mm, d.recorded_at) as litres_now',
    'case when tk.code = ''TRUCK'' then public.purchased_oil_litres() else public.dip_to_litres(tk.id, d.dip_mm, d.recorded_at) end as litres_now');
  if position('purchased_oil_litres' in v) = 0 then raise exception 'chat patch failed'; end if;
  execute v;
end $m$;