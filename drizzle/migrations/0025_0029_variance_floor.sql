insert into public.settings (station_id, key, value, description)
values (
  (select id from public.stations limit 1),
  'variance_floor_litres',
  '{"value": 7}',
  'Below this many litres a variance is not flagged, whatever the percentage says: one millimetre of dip rod is 6.87 L on both tanks, so anything smaller cannot be told apart from how the rod was read. Raise it if the rods are read to the nearest 2 mm in practice.')
on conflict (station_id, key) do nothing;

create or replace function public.variance_is_flagged(
  p_variance_litres numeric,
  p_variance_pct numeric)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_variance_litres is null then false
    when abs(p_variance_litres)
         <= public.setting_numeric('variance_floor_litres', 7) then false
    when p_variance_pct is null then true
    else abs(p_variance_pct) > public.setting_numeric('variance_threshold_pct', 0.5)
  end
$$;

comment on function public.variance_is_flagged(numeric, numeric) is
  'Whether a stock variance needs a written reason: past the percentage AND bigger than one millimetre of dip rod. The single source of this rule — enforce_stock_chain, recalculate_from and compute_shift_close all call it.';

revoke execute on function public.variance_is_flagged(numeric, numeric) from anon, public;
grant execute on function public.variance_is_flagged(numeric, numeric) to authenticated;

create or replace function public.enforce_stock_chain()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_starts_at timestamptz;
  v_prev public.shift_stock;
begin
  if coalesce(current_setting('app.recalculating', true), 'off') = 'on' then
    return new;
  end if;

  select starts_at into v_starts_at from public.shifts where id = new.shift_id;
  v_prev := public.previous_shift_stock(new.tank_id, v_starts_at);

  if v_prev.id is not null and round(v_prev.book_closing, 3) <> round(new.book_opening, 3) then
    raise exception
      'Stock chain break on tank %: opening % L does not match the previous shift closing of % L. Correct the earlier shift and run recalculate_from().',
      (select code from public.tanks where id = new.tank_id),
      round(new.book_opening, 3), round(v_prev.book_closing, 3)
      using errcode = 'check_violation';
  end if;

  if round(new.book_closing, 3)
     <> round(new.book_opening + new.refill_litres - new.sold_from_tank, 3) then
    raise exception 'book_closing must equal book_opening + refill_litres - sold_from_tank'
      using errcode = 'check_violation';
  end if;

  if new.physical_closing is not null then
    new.variance_litres := round(new.physical_closing - new.book_closing, 3);
    new.variance_pct := case
      when new.sold_from_tank = 0 then null
      else round(new.variance_litres / new.sold_from_tank * 100, 4)
    end;
    new.variance_flagged := public.variance_is_flagged(new.variance_litres, new.variance_pct);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shift_stock_chain on public.shift_stock;
create trigger trg_shift_stock_chain
  before insert or update on public.shift_stock
  for each row execute function public.enforce_stock_chain();

create or replace function public.recalculate_from(p_shift_id uuid)
returns table (
  out_shift_id       uuid,
  out_tank_id        uuid,
  out_book_opening   numeric,
  out_book_closing   numeric,
  out_variance_litres numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from      timestamptz;
  r_tank      record;
  r_row       record;
  v_opening   numeric;
  v_closing   numeric;
  v_variance  numeric;
  v_pct       numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an admin may recalculate the stock chain' using errcode = 'insufficient_privilege';
  end if;

  select starts_at into v_from from public.shifts where id = p_shift_id;
  if v_from is null then
    raise exception 'Unknown shift %', p_shift_id using errcode = 'no_data_found';
  end if;

  perform set_config('app.recalculating', 'on', true);

  for r_tank in
    select t.id from public.tanks t where t.deleted_at is null order by t.code
  loop
    v_opening := (
      select ss.book_closing
      from public.shift_stock ss
      join public.shifts s on s.id = ss.shift_id
      where ss.tank_id = r_tank.id and s.starts_at < v_from
      order by s.starts_at desc
      limit 1
    );

    if v_opening is null then
      v_opening := (
        select ss.book_opening
        from public.shift_stock ss
        join public.shifts s on s.id = ss.shift_id
        where ss.tank_id = r_tank.id and s.starts_at >= v_from
        order by s.starts_at asc
        limit 1
      );
    end if;

    continue when v_opening is null;

    for r_row in
      select ss.id, ss.shift_id, ss.refill_litres, ss.sold_from_tank, ss.physical_closing
      from public.shift_stock ss
      join public.shifts s on s.id = ss.shift_id
      where ss.tank_id = r_tank.id and s.starts_at >= v_from
      order by s.starts_at asc
    loop
      v_closing := round(v_opening + r_row.refill_litres - r_row.sold_from_tank, 3);

      if r_row.physical_closing is null then
        v_variance := null;
        v_pct := null;
      else
        v_variance := round(r_row.physical_closing - v_closing, 3);
        v_pct := case
          when r_row.sold_from_tank = 0 then null
          else round(v_variance / r_row.sold_from_tank * 100, 4)
        end;
      end if;

      update public.shift_stock
      set book_opening     = v_opening,
          book_closing     = v_closing,
          variance_litres  = v_variance,
          variance_pct     = v_pct,
          variance_flagged = public.variance_is_flagged(v_variance, v_pct),
          updated_at = now()
      where id = r_row.id;

      out_shift_id        := r_row.shift_id;
      out_tank_id         := r_tank.id;
      out_book_opening    := v_opening;
      out_book_closing    := v_closing;
      out_variance_litres := v_variance;
      return next;

      v_opening := v_closing;
    end loop;
  end loop;

  perform set_config('app.recalculating', 'off', true);
  return;
end;
$$;

comment on function public.recalculate_from(uuid) is
  'Admin-only. Rewrites book_opening/book_closing for every shift from the given shift forward, per tank. Called after a shift is reopened or edited.';

alter type public.expense_group add value if not exists 'own_use';