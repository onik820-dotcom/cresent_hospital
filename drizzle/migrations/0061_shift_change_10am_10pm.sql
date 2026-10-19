CREATE OR REPLACE FUNCTION public.business_date(p_at timestamp with time zone DEFAULT now())
 RETURNS date LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when (p_at at time zone 'Asia/Dhaka')::time < time '10:00'
      then ((p_at at time zone 'Asia/Dhaka')::date - 1)
    else (p_at at time zone 'Asia/Dhaka')::date
  end
$function$;