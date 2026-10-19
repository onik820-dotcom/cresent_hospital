-- Two small things that share a migration because neither needs a table:
--   1. admin_exists(): lets the login screen tell a brand-new install (no admin
--      yet) from a working one, so it can show the setup instructions.
--   2. The thresholds the admin may tune from Settings -> Calculation
--      thresholds. The database's own rules already read
--      variance_threshold_pct, variance_floor_litres and cash_variance_tolerance
--      through setting_numeric(); those keys are left exactly as they are so the
--      screen and the database can never disagree. Only keys that are missing
--      are added, and nothing already configured is overwritten.

-- ---------------------------------------------------------------------------
-- 1. First run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.role = 'admin' AND p.is_active AND p.deleted_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.admin_exists() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;

COMMENT ON FUNCTION public.admin_exists() IS
  'SECURITY DEFINER, anon-callable on purpose: the sign-in screen has no session yet and must know whether the first admin account still has to be created. Returns one boolean and nothing else.';

-- ---------------------------------------------------------------------------
-- 2. Calculation thresholds (insert only what is missing)
-- ---------------------------------------------------------------------------
INSERT INTO public.settings (station_id, key, value, description)
SELECT (SELECT id FROM public.stations ORDER BY id LIMIT 1), v.key, v.value::jsonb, v.description
FROM (VALUES
  ('variance_threshold_pct', '{"value": 0.5}',
   'Stock variance past this percentage of litres sold is a breach: red on the dashboard, a reason is required to sign off, and an alert is raised.'),
  ('variance_warn_pct', '{"value": 0.3}',
   'Stock variance from this percentage up to variance_threshold_pct shows yellow. Below it is green.'),
  ('variance_floor_litres', '{"value": 7}',
   'A stock gap of this many litres or fewer is never flagged, whatever its percentage.'),
  ('cash_variance_tolerance', '{"value": 0}',
   'Taka tolerance treated as a clean cash close. Zero means any difference needs a reason.'),
  ('test_fire_litres_default', '{"value": 0.5}',
   'Litres pumped into the test measure per nozzle, pre-filled when a shift is closed. The manager can always change it.'),
  ('max_credit_limit_default', '{"value": 50000}',
   'Credit limit suggested for a new credit party, in taka. The admin can change it for any one party.'),
  ('avco_rounding_decimals', '{"value": 4}',
   'Decimal places carried on the average cost per litre.')
) AS v(key, value, description)
ON CONFLICT (station_id, key) DO NOTHING;
