CREATE OR REPLACE FUNCTION public.check_credit_sale_amount()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'A due sale needs an amount above zero' USING errcode = 'check_violation';
  END IF;
  IF NEW.litres IS NOT NULL AND NEW.rate IS NOT NULL
     AND abs(round(NEW.litres * NEW.rate, 2) - NEW.amount) > 0.01 THEN
    RAISE EXCEPTION 'Amount % does not match % L x % = %', NEW.amount, NEW.litres, NEW.rate, round(NEW.litres * NEW.rate, 2)
      USING errcode = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ab_check_credit_amount ON public.credit_sales;
CREATE TRIGGER trg_ab_check_credit_amount BEFORE INSERT OR UPDATE OF amount, litres, rate ON public.credit_sales
  FOR EACH ROW EXECUTE FUNCTION public.check_credit_sale_amount();

CREATE OR REPLACE FUNCTION public.owner_sets_opening_due()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.opening_balance := 0;
    NEW.credit_limit := 0;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ab_owner_opening_due ON public.customers;
CREATE TRIGGER trg_ab_owner_opening_due BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.owner_sets_opening_due();