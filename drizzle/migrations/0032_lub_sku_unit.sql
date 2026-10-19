ALTER TABLE public.lub_skus ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'litre';
ALTER TABLE public.lub_skus DROP CONSTRAINT IF EXISTS lub_skus_unit_check;
ALTER TABLE public.lub_skus ADD CONSTRAINT lub_skus_unit_check CHECK (unit IN ('litre','kg'));
COMMENT ON COLUMN public.lub_skus.unit IS 'How this product is measured and sold: litre or kg (grease).';
UPDATE public.lub_skus SET unit = 'kg' WHERE pack_type = 'grease';