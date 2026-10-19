create or replace function public.link_delivery_to_open_shift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shift_id is null then
    select s.id into new.shift_id from public.shifts s
    where s.status in ('open','closing','reopened') and s.starts_at <= new.arrived_at
    order by s.starts_at desc limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_link_delivery_to_open_shift on public.tanker_deliveries;
create trigger trg_link_delivery_to_open_shift before insert on public.tanker_deliveries
for each row execute function public.link_delivery_to_open_shift();