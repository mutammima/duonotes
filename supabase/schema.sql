-- ============================================================================
-- DuoNotes — Supabase schema (prefixed tables in the `public` schema)
-- ----------------------------------------------------------------------------
-- Safe to run inside a Supabase project you already use for another app: every
-- object is prefixed with `duonotes_`, so it can't collide with your other
-- app's tables, and NOTHING here touches `auth.users` or your existing data.
--
-- We use the `public` schema (always reachable by the Data API) with a name
-- prefix, rather than a custom schema, so there's no "expose schema" step.
--
-- Run this once:
--   Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.duonotes_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique not null,
  name        text not null default '',
  partner_id  uuid references public.duonotes_profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.duonotes_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.duonotes_profiles (id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  lock_type   text not null default 'none' check (lock_type in ('none', 'pin', 'biometric')),
  is_shared   boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists duonotes_notes_owner_id_idx on public.duonotes_notes (owner_id);

grant all on public.duonotes_profiles to authenticated, service_role;
grant all on public.duonotes_notes    to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.duonotes_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists duonotes_notes_touch_updated_at on public.duonotes_notes;
create trigger duonotes_notes_touch_updated_at
  before update on public.duonotes_notes
  for each row execute function public.duonotes_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Link two accounts as partners (by email), both directions
-- (No trigger on auth.users — the app creates its own profile row on sign-in,
--  so this never interferes with your other app.)
-- ---------------------------------------------------------------------------
create or replace function public.duonotes_link_partner(partner_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  pid uuid;
begin
  select id into pid from public.duonotes_profiles where email = lower(trim(partner_email));
  if pid is null then
    raise exception 'No DuoNotes account found for %', partner_email;
  end if;
  if pid = me then
    raise exception 'You cannot link to yourself';
  end if;
  update public.duonotes_profiles set partner_id = pid where id = me;
  update public.duonotes_profiles set partner_id = me  where id = pid;
end;
$$;

grant execute on function public.duonotes_link_partner(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.duonotes_profiles enable row level security;
alter table public.duonotes_notes    enable row level security;

-- Profiles: any signed-in user may look up profiles (needed to link a partner
-- by email). Only exposes email + display name. Users may edit only their own.
drop policy if exists duonotes_profiles_select on public.duonotes_profiles;
create policy duonotes_profiles_select on public.duonotes_profiles
  for select to authenticated using (true);

drop policy if exists duonotes_profiles_update on public.duonotes_profiles;
create policy duonotes_profiles_update on public.duonotes_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists duonotes_profiles_insert on public.duonotes_profiles;
create policy duonotes_profiles_insert on public.duonotes_profiles
  for insert to authenticated with check (id = auth.uid());

-- Notes: you can see your own notes, plus notes your partner has shared.
drop policy if exists duonotes_notes_select on public.duonotes_notes;
create policy duonotes_notes_select on public.duonotes_notes
  for select to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.duonotes_profiles where id = auth.uid())
    )
  );

drop policy if exists duonotes_notes_insert on public.duonotes_notes;
create policy duonotes_notes_insert on public.duonotes_notes
  for insert to authenticated with check (owner_id = auth.uid());

-- Both partners may edit a shared note (simple last-write-wins collaboration).
drop policy if exists duonotes_notes_update on public.duonotes_notes;
create policy duonotes_notes_update on public.duonotes_notes
  for update to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.duonotes_profiles where id = auth.uid())
    )
  ) with check (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.duonotes_profiles where id = auth.uid())
    )
  );

-- Only the owner may delete.
drop policy if exists duonotes_notes_delete on public.duonotes_notes;
create policy duonotes_notes_delete on public.duonotes_notes
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: stream note changes to connected clients
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'duonotes_notes'
  ) then
    alter publication supabase_realtime add table public.duonotes_notes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Optional cleanup: if you ran the earlier custom-schema version, you can
-- remove that now-unused schema (it's empty). Uncomment to run:
-- drop schema if exists duonotes cascade;
-- ---------------------------------------------------------------------------
