DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='profit_and_loss' AND pronamespace='public'::regnamespace;
  d := replace(d, $r$'qty',      round(v_lub_qty, 3),$r$, $r$'qty',      round(v_lub_qty, 3),
      'by_unit', (select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit, 'qty', round(u.q, 3)) order by u.unit), '[]'::jsonb)
                  from (select sk.unit, sum(lt.qty) q
                        from public.lub_transactions lt
                        join public.lub_skus sk on sk.id = lt.sku_id
                        left join public.shifts s on s.id = lt.shift_id
                        where lt.deleted_at is null and lt.txn_type = 'sale'
                          and coalesce(s.shift_date, public.business_date(lt.txn_at)) between p_from and p_to
                        group by sk.unit) u),$r$);
  EXECUTE d;
END $$;