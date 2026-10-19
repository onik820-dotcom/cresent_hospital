-- The decimal places carried on the average cost per litre were a literal 4 in
-- this function. They now come from settings.avco_rounding_decimals, which the
-- admin can see on Settings -> Calculation thresholds. The default is the same
-- 4, so nothing changes until someone changes the setting on purpose.
--
-- The value is clamped to 2..6: fewer than 2 would round cost to whole taka,
-- more than 6 is false precision on a figure that comes from a depot invoice.
-- No longer IMMUTABLE, because it now reads a table; STABLE is the honest label.

CREATE OR REPLACE FUNCTION public.moving_average_cost(
  p_old_stock  numeric,
  p_old_cost   numeric,
  p_received   numeric,
  p_depot_rate numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN coalesce(p_old_stock, 0) + coalesce(p_received, 0) = 0
      THEN round(p_depot_rate, d.places)
    ELSE round(
      (coalesce(p_old_stock, 0) * coalesce(p_old_cost, 0) + coalesce(p_received, 0) * p_depot_rate)
      / (coalesce(p_old_stock, 0) + coalesce(p_received, 0)), d.places)
  END
  FROM (SELECT greatest(2, least(6, public.setting_numeric('avco_rounding_decimals', 4)::integer)) AS places) d
$$;

REVOKE EXECUTE ON FUNCTION public.moving_average_cost(numeric, numeric, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.moving_average_cost(numeric, numeric, numeric, numeric) TO authenticated;
