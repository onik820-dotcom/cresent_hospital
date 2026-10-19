create or replace function public.list_people()
returns table (
  id             uuid,
  full_name      text,
  full_name_bn   text,
  email          text,
  phone          text,
  role           public.user_role,
  is_active      boolean,
  created_at     timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.id, p.full_name, p.full_name_bn, u.email::text, p.phone,
         p.role, p.is_active, p.created_at, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.deleted_at is null
    and public.is_admin()
  order by
    case p.role when 'admin' then 0 when 'md' then 1 when 'manager' then 2 else 3 end,
    p.full_name;
$fn$;

create or replace function public.set_person_active(
  p_id     uuid,
  p_active boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an admin may activate or deactivate an account'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id = auth.uid() then
    raise exception 'You cannot switch off your own account'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this account is changing'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);

  update public.profiles p
     set is_active = p_active, updated_at = now(), updated_by = auth.uid()
   where p.id = p_id and p.deleted_at is null;

  if not found then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;
end;
$fn$;

grant execute on function public.list_people() to authenticated;
grant execute on function public.set_person_active(uuid, boolean, text) to authenticated;