-- Admin correction of a saved record, in one step.
--
-- A record can already be removed (admin_void_record) or a whole closed shift
-- re-closed (reopen_shift + admin_reclose_shift). What was missing was the
-- everyday case: "that expense was 500, not 5,000". Doing it as a bare UPDATE
-- from the browser has three problems — the reason for the change would not
-- reach the audit trail (each request is its own transaction), the shift's
-- cash and stock figures would be left stale unless a second call is made, and
-- a careless client could rewrite a column that other books depend on.
--
-- This function is the single door. It is admin-only, refuses every column that
-- is not on a short allow-list per table, records the reason, and recalculates
-- the shift in the same transaction, so either everything changes or nothing.
--
-- What may be edited is deliberately narrow:
--   expenses           amount, description, category, paid_by (not into or out of petty cash)
--   bank_transactions  amount, bank_name, account_no, reference — typed lines only
--   credit_sales       vehicle_no, challan_no — the party's ledger was posted from the
--                      amount when it was saved, so the amount itself is corrected by
--                      deleting the sale and entering it again
-- Meter readings and dips change litres and prices for the whole shift: use
-- reopen_shift and re-close. Payments and lubricant movements are tied to party
-- ledgers and shelf stock: delete and re-enter.

CREATE OR REPLACE FUNCTION public.admin_edit_record(
  p_table   text,
  p_id      uuid,
  p_changes jsonb,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allowed   text[];
  v_key       text;
  v_shift     uuid;
  v_status    public.shift_status;
  v_recalc    jsonb := NULL;
  v_paid_old  public.paid_by;
  v_paid_new  public.paid_by;
  v_amount    numeric;
  v_source    uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the owner/admin can edit a saved record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Say why the record is being changed (at least a few words)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing to change' USING ERRCODE = 'check_violation';
  END IF;

  v_allowed := CASE p_table
    WHEN 'expenses'          THEN ARRAY['amount', 'description', 'category_id', 'paid_by']
    WHEN 'bank_transactions' THEN ARRAY['amount', 'bank_name', 'account_no', 'reference']
    WHEN 'credit_sales'      THEN ARRAY['vehicle_no', 'challan_no']
    ELSE NULL
  END;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'This kind of record cannot be edited here. Delete it and enter it again, or reopen the shift.'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% cannot be changed on a saved %. Delete the record and enter it again.', v_key, p_table
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF p_changes ? 'amount' THEN
    v_amount := (p_changes->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'An amount has to be more than zero' USING ERRCODE = 'check_violation';
    END IF;
    v_amount := round(v_amount, 2);
  END IF;

  PERFORM public.set_audit_reason(btrim(p_reason));

  IF p_table = 'expenses' THEN
    SELECT e.shift_id, e.paid_by INTO v_shift, v_paid_old
      FROM public.expenses e WHERE e.id = p_id AND e.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That record does not exist or was deleted' USING ERRCODE = 'no_data_found'; END IF;

    v_paid_new := coalesce((p_changes->>'paid_by')::public.paid_by, v_paid_old);
    IF v_paid_new <> v_paid_old AND (v_paid_old = 'petty' OR v_paid_new = 'petty') THEN
      RAISE EXCEPTION 'An expense cannot be moved into or out of petty cash. Delete it and enter it again.'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.expenses e SET
      amount      = coalesce(v_amount, e.amount),
      description = CASE WHEN p_changes ? 'description' THEN nullif(btrim(p_changes->>'description'), '') ELSE e.description END,
      category_id = coalesce((p_changes->>'category_id')::uuid, e.category_id),
      paid_by     = v_paid_new
    WHERE e.id = p_id;

  ELSIF p_table = 'bank_transactions' THEN
    SELECT b.shift_id, b.source_id INTO v_shift, v_source
      FROM public.bank_transactions b WHERE b.id = p_id AND b.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That record does not exist or was deleted' USING ERRCODE = 'no_data_found'; END IF;
    IF v_source IS NOT NULL THEN
      RAISE EXCEPTION 'This bank line mirrors another record. Edit that record instead.' USING ERRCODE = 'check_violation';
    END IF;
    IF p_changes ? 'bank_name' AND coalesce(btrim(p_changes->>'bank_name'), '') = '' THEN
      RAISE EXCEPTION 'A bank line needs a bank name' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.bank_transactions b SET
      amount     = coalesce(v_amount, b.amount),
      bank_name  = coalesce(nullif(btrim(p_changes->>'bank_name'), ''), b.bank_name),
      account_no = CASE WHEN p_changes ? 'account_no' THEN nullif(btrim(p_changes->>'account_no'), '') ELSE b.account_no END,
      reference  = CASE WHEN p_changes ? 'reference' THEN nullif(btrim(p_changes->>'reference'), '') ELSE b.reference END
    WHERE b.id = p_id;

  ELSE -- credit_sales
    SELECT c.shift_id INTO v_shift
      FROM public.credit_sales c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That record does not exist or was deleted' USING ERRCODE = 'no_data_found'; END IF;

    UPDATE public.credit_sales c SET
      vehicle_no = CASE WHEN p_changes ? 'vehicle_no' THEN nullif(btrim(p_changes->>'vehicle_no'), '') ELSE c.vehicle_no END,
      challan_no = CASE WHEN p_changes ? 'challan_no' THEN nullif(btrim(p_changes->>'challan_no'), '') ELSE c.challan_no END
    WHERE c.id = p_id;
  END IF;

  -- A closed shift's cash and stock figures are re-worked in the same transaction.
  IF v_shift IS NOT NULL THEN
    SELECT s.status INTO v_status FROM public.shifts s WHERE s.id = v_shift;
    IF v_status = 'closed' THEN
      v_recalc := public.recalculate_shift(v_shift);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'table', p_table,
    'id', p_id,
    'shift_id', v_shift,
    'recalculated', v_recalc IS NOT NULL,
    'recalculation', v_recalc
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_edit_record(text, uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_record(text, uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.admin_edit_record(text, uuid, jsonb, text) IS
  'SECURITY DEFINER, admin-only (checked inside). Edits a short allow-list of columns on expenses, bank_transactions (typed lines) and credit_sales, records the reason in the audit trail, and recalculates the shift in the same transaction. Everything else is corrected by deleting and re-entering, or by reopening the shift.';
