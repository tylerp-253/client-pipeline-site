-- Client Pipeline: initial schema.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- Everything here is safe to run on a new, empty project.

-- ------------------------------------------------------------------
-- Shared helpers
-- ------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Profiles: one per signed-up person. Holds approval and billing state.
-- People can read their own row. Only admins (via admin_set_access)
-- and the server (Stripe webhook, using the secret key) change it.
-- ------------------------------------------------------------------

create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text not null,
  status                 text not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected')),
  is_admin               boolean not null default false,
  comped                 boolean not null default false,
  plan                   text check (plan in ('app', 'coaching')),
  subscription_status    text,
  current_period_end     timestamptz,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile is created automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the signed-in person is an admin. Security definer so the
-- profiles policy below can call it without recursing into itself.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- True when a profile may use the paid features.
create or replace function public.profile_has_access(p public.profiles)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p.status = 'approved'
     and (p.is_admin or p.comped or coalesce(p.subscription_status, '') in ('active', 'trialing'));
$$;

alter table public.profiles enable row level security;

create policy "Read own profile, admins read all"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or public.is_admin());

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Admins approve, reject and comp people with this, never with a direct update.
create or replace function public.admin_set_access(target uuid, new_status text, new_comped boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then
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

revoke execute on function public.admin_set_access(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_access(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------------
-- Workspaces: one per agency or client. Private to their owner.
-- ------------------------------------------------------------------

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled workspace' check (char_length(name) between 1 and 120),
  mode        text not null default 'self' check (mode in ('self', 'guided')),
  intake      jsonb not null default '{}'::jsonb check (octet_length(intake::text) <= 60000),
  asset       jsonb check (asset is null or octet_length(asset::text) <= 8000),
  checklist   jsonb not null default '{}'::jsonb check (octet_length(checklist::text) <= 2000),
  coach_notes text not null default '' check (char_length(coach_notes) <= 20000),
  recap       text not null default '' check (char_length(recap) <= 10000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index workspaces_user_id_idx on public.workspaces (user_id);

create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;

create policy "Own workspaces"
  on public.workspaces for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.workspaces from anon;
grant select, insert, update, delete on public.workspaces to authenticated;

-- ------------------------------------------------------------------
-- Prospects: belong to a workspace. Private to their owner.
-- ------------------------------------------------------------------

create table public.prospects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company      text not null check (char_length(company) between 1 and 200),
  contact      text not null default '' check (char_length(contact) <= 200),
  role         text not null default '' check (char_length(role) <= 200),
  url          text not null default '' check (char_length(url) <= 500),
  material     text not null default '' check (char_length(material) <= 20000),
  notes        text not null default '' check (char_length(notes) <= 5000),
  status       text not null default 'New'
               check (status in ('New', 'Drafted', 'Approved', 'Sent', 'Replied', 'Call booked', 'Not a fit')),
  finding      jsonb check (finding is null or octet_length(finding::text) <= 6000),
  emails       jsonb check (emails is null or octet_length(emails::text) <= 20000),
  asset        jsonb check (asset is null or octet_length(asset::text) <= 20000),
  missing      text not null default '' check (char_length(missing) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index prospects_user_id_idx on public.prospects (user_id);
create index prospects_workspace_id_idx on public.prospects (workspace_id);

create trigger prospects_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

alter table public.prospects enable row level security;

create policy "Own prospects"
  on public.prospects for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workspaces w
       where w.id = workspace_id and w.user_id = (select auth.uid())
    )
  );

revoke all on public.prospects from anon;
grant select, insert, update, delete on public.prospects to authenticated;

-- ------------------------------------------------------------------
-- AI usage: a daily counter per person, so one account can't run up
-- your Claude bill. Only the server touches it.
-- ------------------------------------------------------------------

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Adds one to today's count and says whether the call is allowed.
create or replace function public.bump_ai_usage(p_user uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  insert into public.ai_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into new_count;
  return new_count <= p_limit;
end;
$$;

revoke execute on function public.bump_ai_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, integer) to service_role;
