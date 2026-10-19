CREATE TABLE public.tank_returns (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null references public.tanks(id),
  dip_before_mm numeric not null,
  dip_after_mm numeric not null,
  litres numeric not null,
  shift_id uuid references public.shifts(id),
  note text,
  returned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  deleted_at timestamptz
);
GRANT SELECT ON public.tank_returns TO authenticated;
GRANT ALL ON public.tank_returns TO service_role;
ALTER TABLE public.tank_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ops can read tank returns" ON public.tank_returns FOR SELECT TO authenticated
  USING (public.is_admin() or public.is_md() or public.jhm_role() = 'manager');

CREATE OR REPLACE FUNCTION public.record_tank_return(p_tank uuid, p_before numeric, p_after numeric, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_now timestamptz := now(); v_l numeric; v_shift uuid; v_id uuid;
begin
  if not (public.is_admin() or public.jhm_role() = 'manager') then
    raise exception 'Only an admin or manager may return oil' using errcode = 'insufficient_privilege';
  end if;
  if p_after < 0 or p_after >= p_before then raise exception 'The dip after must be lower than the dip before' using errcode = 'check_violation'; end if;
  v_l := round(public.dip_to_litres(p_tank, p_before, v_now) - public.dip_to_litres(p_tank, p_after, v_now), 3);
  v_shift := public.current_shift_id();
  insert into public.tank_returns(tank_id, dip_before_mm, dip_after_mm, litres, shift_id, note, returned_at, created_by)
  values (p_tank, p_before, p_after, v_l, v_shift, nullif(trim(p_note), ''), v_now, auth.uid()) returning id into v_id;
  insert into public.tank_dips(shift_id, tank_id, dip_type, dip_mm, litres, recorded_by, recorded_at, created_by) values
    (v_shift, p_tank, 'pre_refill', p_before, public.dip_to_litres(p_tank, p_before, v_now), auth.uid(), v_now - interval '1 second', auth.uid()),
    (v_shift, p_tank, 'post_refill', p_after, public.dip_to_litres(p_tank, p_after, v_now), auth.uid(), v_now, auth.uid());
  return jsonb_build_object('id', v_id, 'litres', v_l);
end $$;
GRANT EXECUTE ON FUNCTION public.record_tank_return(uuid, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchased_oil_litres()
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select greatest(0, coalesce((
    select sum(case when tk.code = 'TRUCK' then c.received_litres
                    else -(c.received_litres + coalesce(c.sold_litres,0)) end)
    from public.tanker_compartments c
    join public.tanker_deliveries d on d.id = c.delivery_id and d.deleted_at is null and not d.is_opening_stock
    join public.tanks tk on tk.id = c.tank_id), 0)
    - coalesce((select (value #>> '{}')::numeric from public.settings where key = 'purchased_oil_writeoff' limit 1), 0)
    + coalesce((select sum(litres) from public.tank_returns where deleted_at is null), 0));
$function$;