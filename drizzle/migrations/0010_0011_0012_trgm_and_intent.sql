-- 0011 — Move pg_trgm out of public

create schema if not exists extensions;
grant usage on schema extensions to authenticated, service_role;

drop index if exists public.idx_customers_name_trgm;
alter extension pg_trgm set schema extensions;

create index idx_customers_name_trgm
  on public.customers using gin (name extensions.gin_trgm_ops);

do $$
declare v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if v_schema <> 'extensions' then
    raise exception 'pg_trgm is still in schema %', v_schema;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_customers_name_trgm'
  ) then
    raise exception 'the customer name search index was not rebuilt';
  end if;
end $$;

-- 0012 — Document SECURITY DEFINER intent

comment on function public.jhm_role() is
  'SECURITY DEFINER on purpose: policies on other tables must be able to ask for the caller''s role without re-entering the policies on `profiles`, which would recurse. It reads exactly one row — the caller''s own — and returns only the role.';

comment on function public.current_shift_info() is
  'SECURITY DEFINER on purpose: a dispenser must know which shift they are standing in, but `shifts` carries rate_per_litre and no dispenser may see a rate, so that table stays closed to them. This returns only the id, date, type, start, end and status — no money of any kind.';

comment on function public.current_shift_id() is
  'SECURITY DEFINER on purpose, for the same reason as current_shift_info(). The RLS policies on meter_readings and tank_dips call it to confirm a dispenser is writing to the shift they are actually working.';

comment on function public.recalculate_from(uuid) is
  'SECURITY DEFINER on purpose: rewriting the book chain means standing the chain-guard trigger down for the transaction, which an ordinary caller cannot do. Its first statement refuses anyone who is not an admin.';