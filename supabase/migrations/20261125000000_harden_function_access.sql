-- Tightens which helper functions the public API can reach, following
-- Supabase's security advisor.

-- is_admin() is only needed inside row-level security and admin_set_access,
-- so it moves to a schema the API doesn't expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function public.admin_set_access(target uuid, new_status text, new_comped boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change access' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Unknown status %', new_status using errcode = '22023';
  end if;
  update public.profiles
     set status = new_status,
         comped = coalesce(new_comped, comped)
   where id = target
  returning * into result;
  if result.id is null then
    raise exception 'No such person' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- The sign-up trigger runs on its own; nobody needs to call it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
