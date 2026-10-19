-- "After any admin record edit, recalculate." Edits made through
-- admin_edit_record() already do. This makes the other two admin changes —
-- deleting a record (admin_void_record) and correcting a bank line from the
-- bank statement screen — do the same, so a closed shift's cash and stock
-- figures are never left describing records that no longer exist.

-- Recalculate a shift only if it is closed; an open shift is worked out when it
-- closes, so there is nothing to refresh. Admin-only.
CREATE OR REPLACE FUNCTION public.recalculate_shift_if_closed(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin may recalculate a shift' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_shift_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF (SELECT s.status FROM public.shifts s WHERE s.id = p_shift_id) IS DISTINCT FROM 'closed' THEN
    RETURN NULL;
  END IF;
  RETURN public.recalculate_shift(p_shift_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_shift_if_closed(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_shift_if_closed(uuid) TO authenticated;

-- admin_void_record, unchanged except for the last step.
CREATE OR REPLACE FUNCTION public.admin_void_record(p_table text, p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credit uuid;
  v_shift  uuid;
  r record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the Owner/Admin can delete records';
  END IF;
  IF p_table NOT IN ('expenses','payments','credit_sales','lub_transactions','tank_dips','meter_readings','tanker_deliveries','bank_transactions','purchase_orders') THEN
    RAISE EXCEPTION 'This kind of record cannot be deleted here';
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN p_reason := 'Deleted by admin'; END IF;
  PERFORM public.set_audit_reason(p_reason);

  -- Which shift's figures this record fed, found before it is hidden.
  IF p_table IN ('expenses','payments','credit_sales','lub_transactions','bank_transactions','tank_dips') THEN
    EXECUTE format('SELECT shift_id FROM public.%I WHERE id = $1', p_table) INTO v_shift USING p_id;
  END IF;

  EXECUTE format('UPDATE public.%I SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = $1 WHERE id = $2 AND deleted_at IS NULL', p_table)
    USING p_reason, p_id;

  -- A meter sale settled on credit also voids its due sale.
  IF p_table = 'meter_readings' THEN
    SELECT credit_sale_id INTO v_credit FROM public.meter_readings WHERE id = p_id;
    IF v_credit IS NOT NULL THEN
      PERFORM public.admin_void_record('credit_sales', v_credit, p_reason);
    END IF;
  END IF;

  -- Reverse any ledger lines the record posted, so party balances stay right.
  FOR r IN SELECT * FROM public.customer_ledger
           WHERE source_table = p_table AND source_id = p_id AND entry_type <> 'adjustment'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.customer_ledger
                   WHERE source_table = p_table || ':void' AND source_id = p_id) THEN
      INSERT INTO public.customer_ledger
        (customer_id, entry_at, entry_date, entry_type, description, debit, credit, source_table, source_id, created_by)
      VALUES
        (r.customer_id, now(), public.business_date(now()), 'adjustment', 'Deleted: ' || p_reason,
         r.credit, r.debit, p_table || ':void', p_id, auth.uid());
    END IF;
  END LOOP;

  -- Bank statement lines mirrored from this record go too.
  UPDATE public.bank_transactions SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = p_reason
   WHERE source_id = p_id AND deleted_at IS NULL;

  -- A closed shift's cash and stock are worked out again without this record.
  PERFORM public.recalculate_shift_if_closed(v_shift);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_void_record(text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_void_record(text, uuid, text) TO authenticated;
