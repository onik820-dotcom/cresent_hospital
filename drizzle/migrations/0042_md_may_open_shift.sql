CREATE POLICY shifts_md_open_insert ON public.shifts FOR INSERT TO authenticated
WITH CHECK (public.is_md() AND status = 'open');