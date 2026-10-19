DO $mig$
DECLARE d text; o text;
BEGIN
  SELECT pg_get_functiondef('public.daily_sheet(date)'::regprocedure) INTO d;
  o := d;
  d := replace(d, E'      ss.refill_litres,\n      ss.sold_from_tank,', E'      ss.refill_litres,\n      ss.returned_litres,\n      ss.sold_from_tank,');
  IF d = o THEN RAISE EXCEPTION 'daily_sheet not changed'; END IF;
  EXECUTE d;
END
$mig$;