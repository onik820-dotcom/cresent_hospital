ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tank_dips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tanker_deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lub_transactions;
ALTER TABLE public.meter_readings REPLICA IDENTITY FULL;
ALTER TABLE public.tank_dips REPLICA IDENTITY FULL;
ALTER TABLE public.tanker_deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.lub_transactions REPLICA IDENTITY FULL;