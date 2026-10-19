-- 0035 — Restore the hardened search_path on set_compartment_receipt, dropped by the 0034 replace.
alter function public.set_compartment_receipt() set search_path = public, pg_temp;