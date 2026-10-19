-- Sales submitted by a dispenser wait for the manager to mark them cash or due,
-- and dips and tanker deliveries carry the approving manager's name.

ALTER TABLE public.meter_readings
  ADD COLUMN IF NOT EXISTS sale_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS settlement text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS credit_sale_id uuid REFERENCES public.credit_sales(id),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.meter_readings
  DROP CONSTRAINT IF EXISTS meter_readings_settlement_check;
ALTER TABLE public.meter_readings
  ADD CONSTRAINT meter_readings_settlement_check
  CHECK (settlement IN ('pending', 'cash', 'credit'));

UPDATE public.meter_readings
   SET sale_amount = NULLIF(ai_extracted->>'confirmedAmount', '')::numeric
 WHERE sale_amount IS NULL
   AND ai_extracted ? 'confirmedAmount';

CREATE INDEX IF NOT EXISTS meter_readings_settlement_idx
  ON public.meter_readings (settlement) WHERE deleted_at IS NULL;

ALTER TABLE public.tank_dips
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.tanker_deliveries
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
