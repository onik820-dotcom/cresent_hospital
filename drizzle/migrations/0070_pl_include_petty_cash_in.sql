CREATE OR REPLACE FUNCTION public.profit_and_loss(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fuel_litres   numeric := 0;
  v_fuel_revenue  numeric := 0;
  v_fuel_cogs     numeric := 0;
  v_uncosted      numeric := 0;
  v_lub_revenue   numeric := 0;
  v_lub_cogs      numeric := 0;
  v_lub_qty       numeric := 0;
  v_own_use       numeric := 0;
  v_pump_exp      numeric := 0;
  v_chairman_exp  numeric := 0;
  v_heads         jsonb   := '[]'::jsonb;
  v_days          integer;
  v_row           record;
  v_gross         numeric;
begin
  if not (public.is_admin() or public.is_md()) then
    raise exception 'Profit is shown to the owner and the MD only'
      using errcode = 'insufficient_privilege';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Give a date range with the start on or before the end'
      using errcode = 'check_violation';
  end if;

  v_days := (p_to - p_from) + 1;

  for v_row in
    select ss.sold_from_tank, ss.tank_id, s.ends_at
    from public.shift_stock ss
    join public.shifts s on s.id = ss.shift_id
    where s.status = 'closed'
      and s.shift_date between p_from and p_to
  loop
    declare
      v_cost numeric := public.tank_cost_at(v_row.tank_id, v_row.ends_at);
    begin
      v_fuel_litres := v_fuel_litres + coalesce(v_row.sold_from_tank, 0);
      if v_cost is null then
        v_uncosted := v_uncosted + coalesce(v_row.sold_from_tank, 0);
      else
        v_fuel_cogs := v_fuel_cogs + round(coalesce(v_row.sold_from_tank, 0) * v_cost, 2);
      end if;
    end;
  end loop;

  select coalesce(sum(sa.sales_amount), 0)
    into v_fuel_revenue
  from public.shift_sales sa
  join public.shifts s on s.id = sa.shift_id
  where s.status = 'closed' and s.shift_date between p_from and p_to;

  select
    coalesce(sum(lt.amount) filter (where lt.txn_type = 'sale'), 0),
    coalesce(sum(lt.qty)    filter (where lt.txn_type = 'sale'), 0),
    coalesce(sum(lt.amount) filter (where lt.txn_type = 'own_use'), 0)
  into v_lub_revenue, v_lub_qty, v_own_use
  from public.lub_transactions lt
  left join public.shifts s on s.id = lt.shift_id
  where lt.deleted_at is null
    and coalesce(s.shift_date, public.business_date(lt.txn_at)) between p_from and p_to;

  select coalesce(sum(round(lt.qty * coalesce(nullif(st.avg_cost, 0), (select sk2.current_purchase_rate from public.lub_skus sk2 where sk2.id = lt.sku_id), 0), 2)), 0)
    into v_lub_cogs
  from public.lub_transactions lt
  join public.lub_stock st on st.sku_id = lt.sku_id
  left join public.shifts s on s.id = lt.shift_id
  where lt.deleted_at is null
    and lt.txn_type = 'sale'
    and coalesce(s.shift_date, public.business_date(lt.txn_at)) between p_from and p_to;

  select
    coalesce(sum(e.amount) filter (where c."group" not in ('chairman', 'own_use')), 0),
    coalesce(sum(e.amount) filter (where c."group" = 'chairman'), 0)
  into v_pump_exp, v_chairman_exp
  from public.expenses e
  join public.expense_categories c on c.id = e.category_id
  left join public.shifts s on s.id = e.shift_id
  where e.deleted_at is null and e.paid_by <> 'petty'
    and coalesce(s.shift_date, public.business_date(e.spent_at)) between p_from and p_to;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.total desc), '[]'::jsonb)
    into v_heads
  from (
    select
      c.name,
      c.name_bn,
      c."group" as book,
      round(sum(e.amount), 2) as total
    from public.expenses e
    join public.expense_categories c on c.id = e.category_id
    left join public.shifts s on s.id = e.shift_id
    where e.deleted_at is null and e.paid_by <> 'petty'
      and coalesce(s.shift_date, public.business_date(e.spent_at)) between p_from and p_to
    group by c.name, c.name_bn, c."group"
  ) h;

  v_gross := (v_fuel_revenue - v_fuel_cogs) + (v_lub_revenue - v_lub_cogs);

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', v_days,

    'fuel', jsonb_build_object(
      'litres',   round(v_fuel_litres, 3),
      'revenue',  round(v_fuel_revenue, 2),
      'cogs',     round(v_fuel_cogs, 2),
      'gross',    round(v_fuel_revenue - v_fuel_cogs, 2),
      'margin_per_litre',
        case when v_fuel_litres > 0
             then round((v_fuel_revenue - v_fuel_cogs) / v_fuel_litres, 4) end,
      'uncosted_litres', round(v_uncosted, 3)),

    'lubricants', jsonb_build_object(
      'qty',      round(v_lub_qty, 3),
      'by_unit', (select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit, 'qty', round(u.q, 3)) order by u.unit), '[]'::jsonb)
                  from (select sk.unit, sum(lt.qty) q
                        from public.lub_transactions lt
                        join public.lub_skus sk on sk.id = lt.sku_id
                        left join public.shifts s on s.id = lt.shift_id
                        where lt.deleted_at is null and lt.txn_type = 'sale'
                          and coalesce(s.shift_date, public.business_date(lt.txn_at)) between p_from and p_to
                        group by sk.unit) u),
      'revenue',  round(v_lub_revenue, 2),
      'cogs',     round(v_lub_cogs, 2),
      'gross',    round(v_lub_revenue - v_lub_cogs, 2),
      'cogs_is_estimate', true),

    'gross_profit', round(v_gross, 2),

    'expenses', jsonb_build_object(
      'pump',     round(v_pump_exp, 2),
      'chairman', round(v_chairman_exp, 2),
      'own_use',  round(v_own_use, 2),
      'by_head',  v_heads),

    'operating_profit', round(v_gross - v_pump_exp - v_own_use, 2),

    'chairman_drawings', round(v_chairman_exp, 2),

    'after_drawings', round(v_gross - v_pump_exp - v_own_use - v_chairman_exp, 2));
end;
$function$;