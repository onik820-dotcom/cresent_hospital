CREATE OR REPLACE FUNCTION public.daily_sheet(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_station    public.stations;
  v_labels     jsonb;
  v_shifts     jsonb;
  v_meters     jsonb;
  v_tanks      jsonb;
  v_credit     jsonb;
  v_lubs       jsonb;
  v_expenses   jsonb;
  v_cash       jsonb;
  v_deliveries jsonb;
  v_sales      record;
  v_shift_ids  uuid[];
begin
  if not public.can_read_money() then
    raise exception 'The daily sheet is not open to your role'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_station from public.stations limit 1;

  select s.value into v_labels
  from public.settings s
  where s.key = 'daily_sheet_labels'
  limit 1;

  select array_agg(sh.id order by sh.starts_at) into v_shift_ids
  from public.shifts sh
  where sh.shift_date = p_date;

  v_shift_ids := coalesce(v_shift_ids, array[]::uuid[]);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb) into v_shifts
  from (
    select
      sh.id, sh.shift_type, sh.status, sh.starts_at, sh.ends_at,
      sh.rate_per_litre,
      p.full_name as closed_by, p.full_name_bn as closed_by_bn,
      sh.closed_at
    from public.shifts sh
    left join public.profiles p on p.id = sh.closed_by
    where sh.id = any(v_shift_ids)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.dispenser_code, m.nozzle_no, m.starts_at), '[]'::jsonb)
    into v_meters
  from (
    select
      d.code as dispenser_code,
      n.nozzle_no,
      sh.shift_type,
      sh.starts_at,
      coalesce(
      (select mr0.reading from public.meter_readings mr0
        where mr0.nozzle_id = n.id and mr0.shift_id = sh.id
          and mr0.reading_type = 'open' and mr0.deleted_at is null
        order by mr0.created_at desc limit 1),
      (select mr2.reading
         from public.meter_readings mr2
         join public.shifts s2 on s2.id = mr2.shift_id
        where mr2.nozzle_id = n.id
          and mr2.reading_type = 'close'
          and mr2.deleted_at is null
          and s2.starts_at < sh.starts_at
        order by s2.starts_at desc, mr2.created_at desc
        limit 1)) as opening,
      mr.reading as closing,
      mr.is_rollover
    from public.meter_readings mr
    join public.nozzles n     on n.id = mr.nozzle_id
    join public.dispensers d  on d.id = n.dispenser_id
    join public.shifts sh     on sh.id = mr.shift_id
    where mr.shift_id = any(v_shift_ids)
      and mr.reading_type = 'close'
      and mr.deleted_at is null
  ) m;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.tank_code, t.starts_at), '[]'::jsonb)
    into v_tanks
  from (
    select
      tk.code as tank_code,
      sh.shift_type,
      sh.starts_at,
      ss.book_opening,
      ss.refill_litres,
      ss.sold_from_tank,
      ss.book_closing,
      ss.physical_closing,
      ss.variance_litres,
      ss.variance_pct,
      ss.variance_flagged,
      ss.variance_reason,
      (select td.dip_mm from public.tank_dips td
        where td.shift_id = ss.shift_id and td.tank_id = ss.tank_id
          and td.dip_type = 'close' and td.deleted_at is null
        order by td.recorded_at desc limit 1) as closing_dip_mm
    from public.shift_stock ss
    join public.tanks tk  on tk.id = ss.tank_id
    join public.shifts sh on sh.id = ss.shift_id
    where ss.shift_id = any(v_shift_ids)
  ) t;

  select
    coalesce(sum(sa.gross_litres), 0)    as gross_litres,
    coalesce(sum(sa.test_litres), 0)     as test_litres,
    coalesce(sum(sa.net_litres), 0)      as net_litres,
    coalesce(max(sa.rate_per_litre), 0)  as rate,
    coalesce(sum(sa.sales_amount), 0)    as fuel_amount,
    coalesce(sum(sa.lubricant_sales), 0) as lubricant_amount,
    coalesce(sum(sa.cash_sales), 0)      as cash_sales,
    coalesce(sum(sa.credit_sales), 0)    as credit_sales
  into v_sales
  from public.shift_sales sa
  where sa.shift_id = any(v_shift_ids);

  select coalesce(jsonb_agg(to_jsonb(c) order by c.sold_at), '[]'::jsonb) into v_credit
  from (
    select
      cu.name as party, cu.name_bn as party_bn,
      cs.vehicle_no, cs.challan_no, cs.litres, cs.rate, cs.amount, cs.sold_at,
      cs.over_limit_approved_by is not null as over_limit
    from public.credit_sales cs
    join public.customers cu on cu.id = cs.customer_id
    where cs.shift_id = any(v_shift_ids) and cs.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.txn_at), '[]'::jsonb) into v_lubs
  from (
    select sk.name as sku, sk.name_bn as sku_bn, lt.txn_type,
           lt.qty, lt.rate, lt.amount, lt.vehicle_ref, lt.txn_at
    from public.lub_transactions lt
    join public.lub_skus sk on sk.id = lt.sku_id
    where lt.shift_id = any(v_shift_ids)
      and lt.deleted_at is null
      and lt.txn_type in ('sale', 'own_use')
  ) l;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.spent_at), '[]'::jsonb) into v_expenses
  from (
    select ec.name as head, ec.name_bn as head_bn, ec."group" as book,
           ex.description, ex.paid_by, ex.amount, ex.spent_at
    from public.expenses ex
    join public.expense_categories ec on ec.id = ex.category_id
    where ex.shift_id = any(v_shift_ids) and ex.deleted_at is null
  ) e;

  select coalesce(jsonb_agg(to_jsonb(dl) order by dl.arrived_at), '[]'::jsonb) into v_deliveries
  from (
    select td.challan_no, td.truck_reg, td.arrived_at,
           td.total_declared, td.total_received, td.total_shortage
    from public.tanker_deliveries td
    where td.deleted_at is null
      and public.business_date(td.arrived_at) = p_date
  ) dl;

  select coalesce(jsonb_agg(to_jsonb(ca) order by ca.starts_at), '[]'::jsonb) into v_cash
  from (
    select sh.shift_type, sh.starts_at,
           cr.opening_cash, cr.cash_sales, cr.dues_collected, cr.expenses_cash,
           cr.bank_deposits, cr.expected_cash, cr.counted_cash, cr.cash_variance,
           cr.variance_reason
    from public.cash_reconciliation cr
    join public.shifts sh on sh.id = cr.shift_id
    where cr.shift_id = any(v_shift_ids)
  ) ca;

  return jsonb_build_object(
    'date', p_date,
    'station', jsonb_build_object(
      'name', v_station.name, 'name_bn', v_station.name_bn,
      'address', v_station.address, 'dealer_name', v_station.dealer_name),
    'labels', coalesce(v_labels, '{}'::jsonb),
    'shift_count', coalesce(array_length(v_shift_ids, 1), 0),
    'shifts', v_shifts,
    'meters', v_meters,
    'tanks', v_tanks,
    'deliveries', v_deliveries,
    'sales', jsonb_build_object(
      'gross_litres',     round(v_sales.gross_litres, 3),
      'test_litres',      round(v_sales.test_litres, 3),
      'net_litres',       round(v_sales.net_litres, 3),
      'rate_per_litre',   round(v_sales.rate, 2),
      'fuel_amount',      round(v_sales.fuel_amount, 2),
      'lubricant_amount', round(v_sales.lubricant_amount, 2),
      'total_amount',     round(v_sales.fuel_amount + v_sales.lubricant_amount, 2),
      'cash_sales',       round(v_sales.cash_sales, 2),
      'credit_sales',     round(v_sales.credit_sales, 2)),
    'credit', v_credit,
    'lubricants', v_lubs,
    'expenses', v_expenses,
    'cash', v_cash);
end;
$function$;