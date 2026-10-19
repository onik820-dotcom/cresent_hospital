-- 0034 — Quantity-only compartments carry litres, not dips.
-- set_compartment_receipt used to derive both from the two dips and failed on
-- NULL. Keep the provided litres when the dips are absent.

create or replace function public.set_compartment_receipt()
returns trigger
language plpgsql
as $$
declare
  v_at timestamptz;
begin
  select coalesce(d.arrived_at, now()) into v_at
  from public.tanker_deliveries d where d.id = new.delivery_id;

  if new.dip_before_mm is not null and new.dip_after_mm is not null then
    new.litres_before := public.dip_to_litres(new.tank_id, new.dip_before_mm, v_at);
    new.litres_after  := public.dip_to_litres(new.tank_id, new.dip_after_mm, v_at);

    if new.litres_after < new.litres_before then
      raise exception 'The dip after a discharge cannot be lower than the dip before it'
        using errcode = 'check_violation';
    end if;

    new.received_litres := round(new.litres_after - new.litres_before, 3);
    new.shortage_litres := round(new.declared_litres - new.received_litres, 3);
  end if;

  new.shortage_pct := case when new.declared_litres = 0 then null
                           else round(new.shortage_litres / new.declared_litres * 100, 4) end;
  new.shortage_flagged := coalesce(
    new.shortage_pct > public.setting_numeric('shortage_tolerance_pct', 0.3), false);

  return new;
end;
$$;

comment on function public.set_compartment_receipt() is
  'Derives receipt litres from the two dips when they are present; a quantity-only row keeps the litres it was inserted with.';