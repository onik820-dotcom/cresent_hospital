CREATE OR REPLACE FUNCTION public.can_read_money()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$ select public.jhm_role() in ('manager', 'admin', 'md', 'accountant') $$;

CREATE OR REPLACE FUNCTION public.is_accountant()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$ select public.jhm_role() = 'accountant' $$;

CREATE POLICY accountant_insert ON public.bank_transactions FOR INSERT TO authenticated WITH CHECK (public.is_accountant());
CREATE POLICY accountant_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.is_accountant());
CREATE POLICY accountant_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_accountant());
CREATE POLICY accountant_insert ON public.customer_ledger FOR INSERT TO authenticated WITH CHECK (public.is_accountant());

-- Only the owner (admin) may change or remove a saved record.
-- Managers and accountants may add records and approve pending ones.
CREATE OR REPLACE FUNCTION public.guard_record_edits()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r public.user_role := public.jhm_role();
  allowed text[] := array['updated_at','updated_by','approved_by','approved_at'];
BEGIN
  IF r IS NULL OR r NOT IN ('manager', 'accountant') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'meter_readings' THEN
    allowed := allowed || array['settlement','customer_id','credit_sale_id','sale_amount','confirmed_by','confirmed_at'];
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Only the owner can change or delete a saved record' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.credit_sales FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.lub_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.tanker_deliveries FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.tanker_compartments FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.tank_dips FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.meter_readings FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();
CREATE TRIGGER trg_aa_guard_edits BEFORE UPDATE ON public.lub_skus FOR EACH ROW EXECUTE FUNCTION public.guard_record_edits();