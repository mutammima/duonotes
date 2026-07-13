-- ============================================================================
-- DuoNotes — Supabase schema (isolated in its own `duonotes` schema)
-- ----------------------------------------------------------------------------
-- Safe to run inside a Supabase project you already use for another app: every
-- object lives in the dedicated `duonotes` schema and NOTHING here touches
-- `auth.users`, the `public` schema, or your other app's data.
--
-- Run this once:
--   Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- THEN expose the schema to the API (one click, see README):
--   Project Settings → API → "Exposed schemas" → add `duonotes` (keep the
--   existing ones) → Save.
--
-- Re-running this file is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Dedicated schema
-- ---------------------------------------------------------------------------
create schema if not exists duonotes;
grant usage on schema duonotes to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists duonotes.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique not null,
  name        text not null default '',
  partner_id  uuid references duonotes.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists duonotes.notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references duonotes.profiles (id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  lock_type   text not null default 'none' check (lock_type in ('none', 'pin', 'biometric')),
  is_shared   boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists notes_owner_id_idx on duonotes.notes (owner_id);

-- PostgREST talks to the DB as the `authenticated` / `service_role` roles;
-- grant them table access (row visibility is still governed by RLS below).
grant all on all tables in schema duonotes to authenticated, service_role;
alter default privileges in schema duonotes grant all on tables to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function duonotes.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_touch_updated_at on duonotes.notes;
create trigger notes_touch_updated_at
  before update on duonotes.notes
  for each row execute function duonotes.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Link two accounts as partners (by email), both directions
-- (No trigger on auth.users — the app creates its own profile row on sign-in,
--  so this schema never interferes with your other app.)
-- ---------------------------------------------------------------------------
create or replace function duonotes.link_partner(partner_email text)
returns void language plpgsql security definer set search_path = duonotes, public as $$
declare
  me  uuid := auth.uid();
  pid uuid;
begin
  select id into pid from duonotes.profiles where email = lower(trim(partner_email));
  if pid is null then
    raise exception 'No DuoNotes account found for %', partner_email;
  end if;
  if pid = me then
    raise exception 'You cannot link to yourself';
  end if;
  update duonotes.profiles set partner_id = pid where id = me;
  update duonotes.profiles set partner_id = me  where id = pid;
end;
$$;

grant execute on function duonotes.link_partner(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table duonotes.profiles enable row level security;
alter table duonotes.notes    enable row level security;

-- Profiles: any signed-in user may look up profiles (needed to link a partner
-- by email). Only exposes email + display name. Users may edit only their own.
drop policy if exists profiles_select on duonotes.profiles;
create policy profiles_select on duonotes.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on duonotes.profiles;
create policy profiles_update on duonotes.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on duonotes.profiles;
create policy profiles_insert on duonotes.profiles
  for insert to authenticated with check (id = auth.uid());

-- Notes: you can see your own notes, plus notes your partner has shared.
drop policy if exists notes_select on duonotes.notes;
create policy notes_select on duonotes.notes
  for select to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from duonotes.profiles where id = auth.uid())
    )
  );

drop policy if exists notes_insert on duonotes.notes;
create policy notes_insert on duonotes.notes
  for insert to authenticated with check (owner_id = auth.uid());

-- Both partners may edit a shared note (simple last-write-wins collaboration).
drop policy if exists notes_update on duonotes.notes;
create policy notes_update on duonotes.notes
  for update to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from duonotes.profiles where id = auth.uid())
    )
  ) with check (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from duonotes.profiles where id = auth.uid())
    )
  );

-- Only the owner may delete.
drop policy if exists notes_delete on duonotes.notes;
create policy notes_delete on duonotes.notes
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: stream note changes to connected clients
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'duonotes'
      and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table duonotes.notes;
  end if;
end $$;
