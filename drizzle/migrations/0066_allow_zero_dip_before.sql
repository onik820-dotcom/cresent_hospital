ALTER TABLE public.tanker_compartments DROP CONSTRAINT tanker_compartments_check;
ALTER TABLE public.tanker_compartments ADD CONSTRAINT tanker_compartments_check CHECK ((dip_before_mm = 0 AND dip_after_mm = 0) OR (dip_before_mm >= 0 AND dip_after_mm >= 1 AND dip_after_mm >= dip_before_mm));

CREATE OR REPLACE FUNCTION public.dip_to_litres(p_tank_id uuid, p_dip_mm numeric, p_at timestamp with time zone DEFAULT now())
 RETURNS numeric LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_version integer; v_final integer; v_code text; v_lo_mm integer; v_hi_mm integer;
  v_lo numeric; v_hi numeric; v_fraction numeric;
begin
  select code into v_code from public.tanks where id = p_tank_id;
  if v_code is null then
    raise exception 'Unknown tank %', p_tank_id using errcode = 'foreign_key_violation';
  end if;
  v_version := public.calibration_version_at(p_tank_id, p_at);
  if v_version is null then
    raise exception 'No calibration chart is in force for tank % on %', v_code, public.business_date(p_at) using errcode = 'no_data_found';
  end if;
  v_final := public.tank_final_dip_mm(p_tank_id, p_at);
  if v_final is null then
    raise exception 'Tank % has no metadata, so its final dip is unknown', v_code using errcode = 'no_data_found';
  end if;
  -- 0 mm means an empty tank: 0 litres.
  if p_dip_mm = 0 then return 0; end if;
  if p_dip_mm < 0 or p_dip_mm > v_final then
    raise exception 'Dip % mm is outside the range 0-% mm for tank %', p_dip_mm, v_final, v_code using errcode = 'check_violation';
  end if;
  -- Between 0 and 1 mm: straight line from 0 L to the 1 mm mark.
  if p_dip_mm < 1 then
    select litres into v_hi from public.tank_calibration where tank_id = p_tank_id and version = v_version and dip_mm = 1;
    return round(coalesce(v_hi,0) * p_dip_mm, 3);
  end if;
  if p_dip_mm = floor(p_dip_mm) then
    select litres into v_lo from public.tank_calibration where tank_id = p_tank_id and version = v_version and dip_mm = p_dip_mm::integer;
    if v_lo is null then
      raise exception 'Calibration chart for tank % v% has no row at % mm', v_code, v_version, p_dip_mm using errcode = 'no_data_found';
    end if;
    return round(v_lo, 3);
  end if;
  v_lo_mm := floor(p_dip_mm)::integer; v_hi_mm := ceil(p_dip_mm)::integer;
  select litres into v_lo from public.tank_calibration where tank_id = p_tank_id and version = v_version and dip_mm = v_lo_mm;
  select litres into v_hi from public.tank_calibration where tank_id = p_tank_id and version = v_version and dip_mm = v_hi_mm;
  if v_lo is null or v_hi is null then
    raise exception 'Calibration chart for tank % v% cannot bracket % mm', v_code, v_version, p_dip_mm using errcode = 'no_data_found';
  end if;
  v_fraction := p_dip_mm - v_lo_mm;
  return round(v_lo + (v_hi - v_lo) * v_fraction, 3);
end;
$function$;