ALTER TABLE public.tanker_deliveries ADD COLUMN IF NOT EXISTS is_opening_stock boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tanker_deliveries.is_opening_stock IS 'Opening tank stock entered at fresh start; does not draw from purchased oil.';
UPDATE public.tanker_deliveries SET is_opening_stock = true WHERE notes = 'Opening refill from oil purchase';
CREATE OR REPLACE FUNCTION public.purchased_oil_litres() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select greatest(0, coalesce(sum(case when tk.code = 'TRUCK' then c.received_litres
                                        else -(c.received_litres + coalesce(c.sold_litres,0)) end), 0))
  from public.tanker_compartments c
  join public.tanker_deliveries d on d.id = c.delivery_id and d.deleted_at is null and not d.is_opening_stock
  join public.tanks tk on tk.id = c.tank_id
$$;