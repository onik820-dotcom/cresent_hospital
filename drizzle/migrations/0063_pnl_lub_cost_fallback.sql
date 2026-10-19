DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='profit_and_loss' AND pronamespace='public'::regnamespace;
  d := replace(d, 'round(lt.qty * coalesce(st.avg_cost, 0), 2)', 'round(lt.qty * coalesce(nullif(st.avg_cost, 0), (select sk2.current_purchase_rate from public.lub_skus sk2 where sk2.id = lt.sku_id), 0), 2)');
  EXECUTE d;
END $$;