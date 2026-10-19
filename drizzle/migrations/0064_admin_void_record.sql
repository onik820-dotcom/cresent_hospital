CREATE OR REPLACE FUNCTION public.admin_void_record(p_table text, p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credit uuid;
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
END;
$$;

REVOKE ALL ON FUNCTION public.admin_void_record(text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_void_record(text, uuid, text) TO authenticated;