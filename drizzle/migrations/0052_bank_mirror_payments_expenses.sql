ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS source_table text, ADD COLUMN IF NOT EXISTS source_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS bank_txn_source_uq ON public.bank_transactions(source_table, source_id) WHERE source_id IS NOT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS bank_name text, ADD COLUMN IF NOT EXISTS account_no text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS bank_name text, ADD COLUMN IF NOT EXISTS account_no text;

CREATE OR REPLACE FUNCTION public.mirror_to_bank() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_on boolean; v_type bank_txn_type; v_date date; v_ref text; v_station uuid;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_on := NEW.method = 'bank' AND NEW.deleted_at IS NULL;
    v_type := 'deposit';
    v_date := business_date(NEW.received_at);
    v_ref := concat_ws(' · ', 'Due collection: ' || (SELECT name FROM customers WHERE id = NEW.customer_id), NEW.reference);
    v_station := (SELECT station_id FROM customers WHERE id = NEW.customer_id);
  ELSE
    v_on := NEW.paid_by = 'bank' AND NEW.deleted_at IS NULL;
    v_type := 'withdrawal';
    v_date := business_date(NEW.spent_at);
    v_ref := concat_ws(' · ', 'Expense: ' || (SELECT name FROM expense_categories WHERE id = NEW.category_id), NEW.description);
    v_station := NEW.station_id;
  END IF;

  IF v_on THEN
    INSERT INTO bank_transactions(station_id, txn_date, bank_name, account_no, type, amount, reference, shift_id, created_by, source_table, source_id)
    VALUES (v_station, v_date, coalesce(nullif(NEW.bank_name,''), 'Bank'), nullif(NEW.account_no,''), v_type, NEW.amount, v_ref, NEW.shift_id, NEW.created_by, TG_TABLE_NAME, NEW.id)
    ON CONFLICT (source_table, source_id) WHERE source_id IS NOT NULL DO UPDATE
      SET txn_date = EXCLUDED.txn_date, bank_name = EXCLUDED.bank_name, account_no = EXCLUDED.account_no,
          amount = EXCLUDED.amount, reference = EXCLUDED.reference, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL;
  ELSE
    UPDATE bank_transactions SET deleted_at = now(), delete_reason = 'Source entry removed or no longer paid by bank'
     WHERE source_table = TG_TABLE_NAME AND source_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_to_bank ON public.payments;
CREATE TRIGGER trg_payment_to_bank AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.mirror_to_bank();
DROP TRIGGER IF EXISTS trg_expense_to_bank ON public.expenses;
CREATE TRIGGER trg_expense_to_bank AFTER INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.mirror_to_bank();