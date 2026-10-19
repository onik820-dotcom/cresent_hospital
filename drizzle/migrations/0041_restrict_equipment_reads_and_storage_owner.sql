DROP POLICY IF EXISTS stations_select ON public.stations;
CREATE POLICY stations_select ON public.stations FOR SELECT TO authenticated USING (public.jhm_role() IS NOT NULL);
DROP POLICY IF EXISTS tanks_select_all ON public.tanks;
CREATE POLICY tanks_select_staff ON public.tanks FOR SELECT TO authenticated USING (public.jhm_role() IS NOT NULL);
DROP POLICY IF EXISTS tank_metadata_select_all ON public.tank_metadata;
CREATE POLICY tank_metadata_select_staff ON public.tank_metadata FOR SELECT TO authenticated USING (public.jhm_role() IS NOT NULL);
DROP POLICY IF EXISTS tank_calibration_select_all ON public.tank_calibration;
CREATE POLICY tank_calibration_select_staff ON public.tank_calibration FOR SELECT TO authenticated USING (public.jhm_role() IS NOT NULL);
DROP POLICY IF EXISTS dispensers_select_all ON public.dispensers;
CREATE POLICY dispensers_select_staff ON public.dispensers FOR SELECT TO authenticated USING (public.jhm_role() IS NOT NULL);
DROP POLICY IF EXISTS nozzles_select_all ON public.nozzles;
CREATE POLICY nozzles_select_staff ON public.nozzles FOR SELECT TO authenticated USING (public.jhm_role() IS NOT NULL);

DROP POLICY IF EXISTS storage_write_signed_in ON storage.objects;
CREATE POLICY storage_write_signed_in ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  owner_id = (select auth.uid()::text)
  AND public.jhm_role() IS NOT NULL
  AND (
    bucket_id IN ('meter-photos','dip-photos')
    OR (bucket_id IN ('receipts','challans') AND public.can_write_ops())
    OR (bucket_id = 'certificates' AND public.is_admin())
  )
);