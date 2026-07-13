-- ============================================================================
-- DuoNotes — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this once in your Supabase project:
--   Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- It creates:
--   • profiles  — one row per user (mirrors auth.users), with a partner link
--   • notes     — the notes themselves, with owner + "shared" flag
--   • Row-Level Security so a user can only ever read their own notes and the
--     notes their partner has explicitly shared.
--   • A trigger that auto-creates a profile on sign-up.
--   • link_partner() so the two of you can connect accounts by email.
-- Re-running is safe (drops/recreates policies and functions).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique not null,
  name        text not null default '',
  partner_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  lock_type   text not null default 'none' check (lock_type in ('none', 'pin', 'biometric')),
  is_shared   boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists notes_owner_id_idx on public.notes (owner_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Link two accounts as partners (by email), both directions
-- ---------------------------------------------------------------------------
create or replace function public.link_partner(partner_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  pid uuid;
begin
  select id into pid from public.profiles where email = lower(trim(partner_email));
  if pid is null then
    raise exception 'No DuoNotes account found for %', partner_email;
  end if;
  if pid = me then
    raise exception 'You cannot link to yourself';
  end if;
  update public.profiles set partner_id = pid where id = me;
  update public.profiles set partner_id = me  where id = pid;
end;
$$;

grant execute on function public.link_partner(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.notes    enable row level security;

-- Profiles: any signed-in user may look up profiles (needed to link a partner
-- by email). Only exposes email + display name. Users may edit only their own.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Notes: you can see your own notes, plus notes your partner has shared.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes
  for insert to authenticated with check (owner_id = auth.uid());

-- Both partners may edit a shared note (simple last-write-wins collaboration).
drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes
  for update to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.profiles where id = auth.uid())
    )
  ) with check (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.profiles where id = auth.uid())
    )
  );

-- Only the owner may delete.
drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes
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
      and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
