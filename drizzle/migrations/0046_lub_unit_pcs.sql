ALTER TABLE public.lub_skus DROP CONSTRAINT IF EXISTS lub_skus_unit_check;
ALTER TABLE public.lub_skus ADD CONSTRAINT lub_skus_unit_check CHECK (unit IN ('litre','kg','pcs'));