-- 0039 — Quantity-only rows carry 0 dips, so the per-column minimums and the
-- before<=after ordering now allow the 0/0 pair and nothing else outside 1+.

alter table public.tanker_compartments drop constraint tanker_compartments_dip_before_mm_check;
alter table public.tanker_compartments drop constraint tanker_compartments_dip_after_mm_check;
alter table public.tanker_compartments drop constraint tanker_compartments_check;

alter table public.tanker_compartments
  add constraint tanker_compartments_dip_before_mm_check check (dip_before_mm = 0 or dip_before_mm >= 1),
  add constraint tanker_compartments_dip_after_mm_check  check (dip_after_mm = 0 or dip_after_mm >= 1),
  add constraint tanker_compartments_check check (
    (dip_before_mm = 0 and dip_after_mm = 0)
    or (dip_before_mm >= 1 and dip_after_mm >= dip_before_mm)
  );

comment on constraint tanker_compartments_check on public.tanker_compartments is
  'Dips are either both 0 (quantity-only entry, no rod taken) or a real before/after pair with after >= before.';