create or replace function public.clamp_expense_to_shift()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts;
begin
  if new.shift_id is null then return new; end if;
  select * into v_shift from public.shifts where id = new.shift_id;
  if v_shift.id is null then return new; end if;

  if new.spent_at is null
     or new.spent_at >= v_shift.ends_at
     or new.spent_at < v_shift.starts_at then
    new.spent_at := v_shift.ends_at - interval '1 second';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clamp_expense_to_shift on public.expenses;
create trigger trg_clamp_expense_to_shift
  before insert on public.expenses
  for each row execute function public.clamp_expense_to_shift();

create or replace function public.clamp_credit_sale_to_shift()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts;
begin
  if new.shift_id is null then return new; end if;
  select * into v_shift from public.shifts where id = new.shift_id;
  if v_shift.id is null then return new; end if;

  if new.sold_at is null
     or new.sold_at >= v_shift.ends_at
     or new.sold_at < v_shift.starts_at then
    new.sold_at := v_shift.ends_at - interval '1 second';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clamp_credit_sale_to_shift on public.credit_sales;
create trigger trg_clamp_credit_sale_to_shift
  before insert on public.credit_sales
  for each row execute function public.clamp_credit_sale_to_shift();

create or replace function public.clamp_lub_txn_to_shift()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts;
begin
  if new.shift_id is null then return new; end if;
  select * into v_shift from public.shifts where id = new.shift_id;
  if v_shift.id is null then return new; end if;

  if new.txn_at is null
     or new.txn_at >= v_shift.ends_at
     or new.txn_at < v_shift.starts_at then
    new.txn_at := v_shift.ends_at - interval '1 second';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clamp_lub_txn_to_shift on public.lub_transactions;
create trigger trg_clamp_lub_txn_to_shift
  before insert on public.lub_transactions
  for each row execute function public.clamp_lub_txn_to_shift();

comment on function public.clamp_expense_to_shift() is
  'Keeps a row''s timestamp inside the shift it is attached to. ends_at is exclusive, so close_shift() stamping a night shift at 06:00 put every one of its rows into the next business day.';

create or replace function public.profit_and_loss(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
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

  select coalesce(sum(round(lt.qty * coalesce(st.avg_cost, 0), 2)), 0)
    into v_lub_cogs
  from public.lub_transactions lt
  join public.lub_stock st on st.sku_id = lt.sku_id
  left join public.shifts s on s.id = lt.shift_id
  where lt.deleted_at is null
    and lt.txn_type = 'sale'
    and coalesce(s.shift_date, public.business_date(lt.txn_at)) between p_from and p_to;

  select
    coalesce(sum(e.amount) filter (where c."group" <> 'chairman'), 0),
    coalesce(sum(e.amount) filter (where c."group" =  'chairman'), 0)
  into v_pump_exp, v_chairman_exp
  from public.expenses e
  join public.expense_categories c on c.id = e.category_id
  left join public.shifts s on s.id = e.shift_id
  where e.deleted_at is null
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
    where e.deleted_at is null
      and coalesce(s.shift_date, public.business_date(e.spent_at)) between p_from and p_to
    group by c.name, c.name_bn, c."group"
  ) h;

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
      'revenue',  round(v_lub_revenue, 2),
      'cogs',     round(v_lub_cogs, 2),
      'gross',    round(v_lub_revenue - v_lub_cogs, 2),
      'cogs_is_estimate', true),

    'gross_profit', round((v_fuel_revenue - v_fuel_cogs) + (v_lub_revenue - v_lub_cogs), 2),

    'expenses', jsonb_build_object(
      'pump',     round(v_pump_exp, 2),
      'chairman', round(v_chairman_exp, 2),
      'own_use_included', round(v_own_use, 2),
      'by_head',  v_heads),

    'operating_profit',
      round((v_fuel_revenue - v_fuel_cogs) + (v_lub_revenue - v_lub_cogs) - v_pump_exp, 2),

    'chairman_drawings', round(v_chairman_exp, 2),

    'after_drawings',
      round((v_fuel_revenue - v_fuel_cogs) + (v_lub_revenue - v_lub_cogs)
            - v_pump_exp - v_chairman_exp, 2));
end;
$$;

revoke execute on function public.profit_and_loss(date, date) from anon, public;
grant execute on function public.profit_and_loss(date, date) to authenticated;

update public.expenses e
set spent_at = s.ends_at - interval '1 second'
from public.shifts s
where e.shift_id = s.id
  and (e.spent_at >= s.ends_at or e.spent_at < s.starts_at);

update public.credit_sales cs
set sold_at = s.ends_at - interval '1 second'
from public.shifts s
where cs.shift_id = s.id
  and (cs.sold_at >= s.ends_at or cs.sold_at < s.starts_at);

update public.lub_transactions lt
set txn_at = s.ends_at - interval '1 second'
from public.shifts s
where lt.shift_id = s.id
  and (lt.txn_at >= s.ends_at or lt.txn_at < s.starts_at);