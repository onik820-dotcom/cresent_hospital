DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='daily_sheet' AND pronamespace='public'::regnamespace;
  d := replace(d, 'where ex.shift_id = any(v_shift_ids) and ex.deleted_at is null', 'where ex.shift_id = any(v_shift_ids) and ex.deleted_at is null and ec.name <> ''Petty Cash'' and ex.paid_by <> ''petty''');
  EXECUTE d;
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='profit_and_loss' AND pronamespace='public'::regnamespace;
  d := replace(d, 'where e.deleted_at is null', 'where e.deleted_at is null and c.name <> ''Petty Cash'' and e.paid_by <> ''petty''');
  EXECUTE d;
END $$;