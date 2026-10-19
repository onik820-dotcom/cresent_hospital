CREATE OR REPLACE FUNCTION public.purchased_oil_litres()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select greatest(0, coalesce((
    select sum(case when tk.code = 'TRUCK' then c.received_litres
                    else -(c.received_litres + coalesce(c.sold_litres,0)) end)
    from public.tanker_compartments c
    join public.tanker_deliveries d on d.id = c.delivery_id and d.deleted_at is null and not d.is_opening_stock
    join public.tanks tk on tk.id = c.tank_id), 0)
    - coalesce((select (value #>> '{}')::numeric from public.settings where key = 'purchased_oil_writeoff' limit 1), 0));
$$;