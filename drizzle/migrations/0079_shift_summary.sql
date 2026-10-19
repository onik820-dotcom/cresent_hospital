-- One row per closed shift, so the dashboard, daily sheet and "what was saved"
-- screen read a single place instead of each re-joining shift_sales,
-- shift_stock and cash_reconciliation.
--
-- This table is DERIVED. The books of record stay shift_sales / shift_stock /
-- cash_reconciliation and the raw rows behind them; nothing here is ever typed
-- by a person. It is refreshed by a trigger when a shift closes (or is closed
-- again after an admin edit), whenever a later correction moves a closed
-- shift's stock, and by recalculate_shift() for an admin.

CREATE TABLE IF NOT EXISTS public.shift_summary (
  shift_id               uuid PRIMARY KEY REFERENCES public.shifts(id),
  litres_sold            numeric(12,3),
  cash_sales             numeric(14,2),
  credit_sales           numeric(14,2),
  lubricant_sales        numeric(14,2),
  tank_book_closing      numeric(12,3),
  tank_physical_closing  numeric(12,3),
  stock_variance_litres  numeric(12,3),
  stock_variance_pct     numeric(9,4),
  tanks_flagged          integer NOT NULL DEFAULT 0,
  cash_expected          numeric(14,2),
  cash_counted           numeric(14,2),
  cash_variance          numeric(14,2),
  calculated_at          timestamptz NOT NULL DEFAULT now(),
  recalculated_by        uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.shift_summary IS
  'Derived, one row per closed shift. Written only by refresh_shift_summary(); never edited by hand. Drill-down figures live in shift_sales, shift_stock and cash_reconciliation.';

GRANT SELECT ON public.shift_summary TO authenticated;
GRANT ALL ON public.shift_summary TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.shift_summary FROM authenticated, anon;

ALTER TABLE public.shift_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_summary_select ON public.shift_summary;
CREATE POLICY shift_summary_select ON public.shift_summary
  FOR SELECT TO authenticated USING (public.can_read_money());

-- ---------------------------------------------------------------------------
-- refresh_shift_summary: rebuild one row from the books of record.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_shift_summary(p_shift_id uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sales    public.shift_sales;
  v_cash     public.cash_reconciliation;
  v_book     numeric;
  v_phys     numeric;
  v_sold     numeric;
  v_var      numeric;
  v_flagged  integer;
BEGIN
  SELECT * INTO v_sales FROM public.shift_sales WHERE shift_id = p_shift_id;
  SELECT * INTO v_cash  FROM public.cash_reconciliation WHERE shift_id = p_shift_id;
  -- A shift that was never closed through close_shift has nothing to summarise.
  IF v_sales.id IS NULL OR v_cash.id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(ss.book_closing), 0),
         sum(ss.physical_closing),
         coalesce(sum(ss.sold_from_tank), 0),
         sum(ss.variance_litres),
         count(*) FILTER (WHERE ss.variance_flagged)
    INTO v_book, v_phys, v_sold, v_var, v_flagged
    FROM public.shift_stock ss
   WHERE ss.shift_id = p_shift_id;

  INSERT INTO public.shift_summary AS s (
    shift_id, litres_sold, cash_sales, credit_sales, lubricant_sales,
    tank_book_closing, tank_physical_closing, stock_variance_litres, stock_variance_pct,
    tanks_flagged, cash_expected, cash_counted, cash_variance, calculated_at, recalculated_by
  ) VALUES (
    p_shift_id, v_sales.net_litres, v_cash.cash_sales, v_sales.credit_sales, v_sales.lubricant_sales,
    v_book, v_phys, v_var,
    CASE WHEN v_sold > 0 AND v_var IS NOT NULL THEN round(v_var / v_sold * 100, 4) END,
    coalesce(v_flagged, 0), v_cash.expected_cash, v_cash.counted_cash, v_cash.cash_variance,
    now(), p_actor
  )
  ON CONFLICT (shift_id) DO UPDATE SET
    litres_sold = EXCLUDED.litres_sold,
    cash_sales = EXCLUDED.cash_sales,
    credit_sales = EXCLUDED.credit_sales,
    lubricant_sales = EXCLUDED.lubricant_sales,
    tank_book_closing = EXCLUDED.tank_book_closing,
    tank_physical_closing = EXCLUDED.tank_physical_closing,
    stock_variance_litres = EXCLUDED.stock_variance_litres,
    stock_variance_pct = EXCLUDED.stock_variance_pct,
    tanks_flagged = EXCLUDED.tanks_flagged,
    cash_expected = EXCLUDED.cash_expected,
    cash_counted = EXCLUDED.cash_counted,
    cash_variance = EXCLUDED.cash_variance,
    calculated_at = now(),
    recalculated_by = coalesce(EXCLUDED.recalculated_by, s.recalculated_by);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_shift_summary(uuid, uuid) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: keep the summary in step without anyone remembering to.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_refresh_shift_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'shifts' THEN
    PERFORM public.refresh_shift_summary(NEW.id);
  ELSIF EXISTS (SELECT 1 FROM public.shifts s WHERE s.id = NEW.shift_id AND s.status = 'closed') THEN
    -- A later correction moved a closed shift's stock chain.
    PERFORM public.refresh_shift_summary(NEW.shift_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_refresh_shift_summary() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_shift_summary ON public.shifts;
CREATE TRIGGER trg_zz_shift_summary
  AFTER UPDATE OF status ON public.shifts
  FOR EACH ROW
  WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
  EXECUTE FUNCTION public.trg_refresh_shift_summary();

DROP TRIGGER IF EXISTS trg_zz_shift_summary ON public.shift_stock;
CREATE TRIGGER trg_zz_shift_summary
  AFTER INSERT OR UPDATE ON public.shift_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_shift_summary();

-- ---------------------------------------------------------------------------
-- recalculate_shift: admin-only. Re-reads the raw rows behind a CLOSED shift
-- and rewrites its derived figures, then refreshes the summary.
--
--   * stock:  physical closing re-read from the shift's closing dips, then the
--             existing recalculate_from() re-runs the chain from this shift on
--   * sales:  lubricant / credit / cash split re-read from the saved rows
--   * cash:   expenses, dues and bank deposits re-read; expected and variance
--             re-worked from the cash that was physically counted
--
-- The counted cash, meter readings and test litres are physical facts and are
-- never changed here. Correcting a meter reading goes through reopen_shift +
-- admin_reclose_shift, which re-prices the whole shift.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_shift(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift       public.shifts;
  v_sales       public.shift_sales;
  v_cash        public.cash_reconciliation;
  v_before      jsonb;
  v_after       jsonb;
  v_lub         jsonb;
  v_lub_total   numeric;
  v_lub_credit  numeric;
  v_credit_rows numeric;
  v_credit      numeric;
  v_cash_sales  numeric;
  v_exp_cash    numeric;
  v_deposits    numeric;
  v_dues_cash   numeric;
  v_opening     numeric;
  v_expected    numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin may recalculate a shift' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Unknown shift %', p_shift_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_shift.status <> 'closed' THEN
    RAISE EXCEPTION 'Only a closed shift can be recalculated. An open shift is worked out when it is closed.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sales FROM public.shift_sales WHERE shift_id = p_shift_id;
  SELECT * INTO v_cash  FROM public.cash_reconciliation WHERE shift_id = p_shift_id;
  IF v_sales.id IS NULL OR v_cash.id IS NULL THEN
    RAISE EXCEPTION 'That shift has no closing record to recalculate' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT to_jsonb(s) INTO v_before FROM public.shift_summary s WHERE s.shift_id = p_shift_id;
  PERFORM public.set_audit_reason('Admin recalculation of shift');

  -- 1. Stock: closing dips -> physical closing, then the existing chain recalculation.
  PERFORM set_config('app.recalculating', 'on', true);
  UPDATE public.shift_stock ss
     SET physical_closing = d.litres, updated_at = now()
    FROM (
      SELECT DISTINCT ON (x.tank_id) x.tank_id, x.litres
        FROM public.tank_dips x
       WHERE x.shift_id = p_shift_id AND x.dip_type = 'close' AND x.deleted_at IS NULL
       ORDER BY x.tank_id, x.recorded_at DESC, x.created_at DESC
    ) d
   WHERE ss.shift_id = p_shift_id AND ss.tank_id = d.tank_id
     AND ss.physical_closing IS DISTINCT FROM d.litres;
  PERFORM * FROM public.recalculate_from(p_shift_id);

  -- 2. Sales split, from the saved rows.
  v_lub        := public.shift_lubricant_sales(p_shift_id);
  v_lub_total  := (v_lub->>'total')::numeric;
  v_lub_credit := (v_lub->>'credit')::numeric;
  SELECT coalesce(round(sum(cs.amount), 2), 0) INTO v_credit_rows
    FROM public.credit_sales cs
   WHERE cs.shift_id = p_shift_id AND cs.deleted_at IS NULL AND cs.product = 'diesel';
  v_credit     := round(v_credit_rows + v_lub_credit, 2);
  v_cash_sales := round(v_sales.sales_amount + v_lub_total - v_credit, 2);
  IF v_cash_sales < 0 THEN
    RAISE EXCEPTION 'Credit sales of % cannot exceed total sales of %',
      v_credit, round(v_sales.sales_amount + v_lub_total, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.shift_sales
     SET lubricant_sales = round(v_lub_total, 2),
         credit_sales = v_credit,
         cash_sales = v_cash_sales,
         updated_at = now()
   WHERE shift_id = p_shift_id;

  -- 3. Cash drawer. Same rules compute_shift_close applies to saved expenses.
  SELECT coalesce(sum(e.amount), 0) INTO v_exp_cash
    FROM public.expenses e
    JOIN public.expense_categories c ON c.id = e.category_id
   WHERE e.shift_id = p_shift_id AND e.deleted_at IS NULL
     AND ( (c.name <> 'Petty Cash' AND c."group" <> 'own_use' AND e.paid_by = 'cash')
        OR (c.name = 'Petty Cash' AND e.paid_by <> 'petty') );

  SELECT coalesce(sum(b.amount), 0) INTO v_deposits
    FROM public.bank_transactions b
   WHERE b.shift_id = p_shift_id AND b.type = 'deposit' AND b.deleted_at IS NULL
     AND b.source_id IS NULL AND b.from_drawer;

  v_dues_cash := (public.shift_dues_collected(p_shift_id)->>'cash')::numeric;
  v_opening   := coalesce(public.previous_counted_cash(p_shift_id), v_cash.opening_cash);
  v_expected  := round(v_opening + v_cash_sales + v_dues_cash - v_exp_cash - v_deposits, 2);

  UPDATE public.cash_reconciliation
     SET opening_cash = v_opening,
         cash_sales = v_cash_sales,
         dues_collected = v_dues_cash,
         expenses_cash = round(v_exp_cash, 2),
         bank_deposits = round(v_deposits, 2),
         expected_cash = v_expected,
         cash_variance = round(counted_cash - v_expected, 2),
         updated_at = now()
   WHERE shift_id = p_shift_id;

  -- 4. The single place reports read.
  PERFORM public.refresh_shift_summary(p_shift_id, auth.uid());
  SELECT to_jsonb(s) INTO v_after FROM public.shift_summary s WHERE s.shift_id = p_shift_id;

  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'before', v_before,
    'after', v_after,
    'changed', (v_before - 'calculated_at' - 'recalculated_by') IS DISTINCT FROM (v_after - 'calculated_at' - 'recalculated_by')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_shift(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_shift(uuid) TO authenticated;

COMMENT ON FUNCTION public.recalculate_shift(uuid) IS
  'SECURITY DEFINER, admin-only (checked inside). Re-reads the saved rows behind a closed shift, rewrites its derived stock, sales split and cash figures, and refreshes shift_summary. Never changes counted cash, meter readings or test litres.';

-- Backfill every shift that has already been closed.
SELECT public.refresh_shift_summary(s.id) FROM public.shifts s WHERE s.status = 'closed';
