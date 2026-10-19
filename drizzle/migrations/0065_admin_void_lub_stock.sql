CREATE OR REPLACE FUNCTION public.admin_void_lub_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF old.deleted_at IS NULL AND new.deleted_at IS NOT NULL THEN
    UPDATE public.lub_stock
       SET qty_on_hand = round(qty_on_hand + CASE WHEN new.txn_type IN ('sale','own_use') THEN new.qty ELSE -new.qty END, 3),
           updated_at = now()
     WHERE sku_id = new.sku_id;
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS trg_void_lub_stock ON public.lub_transactions;
CREATE TRIGGER trg_void_lub_stock AFTER UPDATE OF deleted_at ON public.lub_transactions
  FOR EACH ROW EXECUTE FUNCTION public.admin_void_lub_stock();