create extension if not exists pgcrypto;

create table if not exists public.micham_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  local_profile_id text,
  email text not null,
  display_name text not null,
  currency text not null default 'INR',
  connection_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'accounts',
    'categories',
    'transactions',
    'budgets',
    'recurringTransactions',
    'people',
    'settlements',
    'repayments'
  )),
  entity_id text not null,
  payload jsonb not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, entity_type, entity_id)
);

create table if not exists public.micham_friend_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  owner_person_id text,
  friend_person_id text,
  status text not null default 'connected' check (status in ('pending', 'connected', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, friend_id)
);

create table if not exists public.micham_app_config (
  id text primary key default 'primary',
  payload jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.micham_profiles enable row level security;
alter table public.micham_entities enable row level security;
alter table public.micham_friend_links enable row level security;
alter table public.micham_app_config enable row level security;

alter table public.micham_entities replica identity full;
alter table public.micham_friend_links replica identity full;
alter table public.micham_app_config replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.micham_entities;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.micham_friend_links;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.micham_app_config;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

drop policy if exists "profiles_select_authenticated" on public.micham_profiles;
create policy "profiles_select_authenticated"
on public.micham_profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.micham_profiles;
create policy "profiles_insert_own"
on public.micham_profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.micham_profiles;
create policy "profiles_update_own"
on public.micham_profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "entities_select_own_or_friend" on public.micham_entities;
create policy "entities_select_own_or_friend"
on public.micham_entities for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.micham_friend_links link
    where link.status = 'connected'
      and link.owner_id = owner_id
      and link.friend_id = auth.uid()
  )
);

drop policy if exists "entities_insert_own" on public.micham_entities;
create policy "entities_insert_own"
on public.micham_entities for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "entities_update_own" on public.micham_entities;
create policy "entities_update_own"
on public.micham_entities for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "friend_links_select_involved" on public.micham_friend_links;
create policy "friend_links_select_involved"
on public.micham_friend_links for select
to authenticated
using (owner_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "friend_links_insert_own" on public.micham_friend_links;
create policy "friend_links_insert_own"
on public.micham_friend_links for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "friend_links_update_involved" on public.micham_friend_links;
create policy "friend_links_update_involved"
on public.micham_friend_links for update
to authenticated
using (owner_id = auth.uid() or friend_id = auth.uid())
with check (owner_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "app_config_select_all" on public.micham_app_config;
create policy "app_config_select_all"
on public.micham_app_config for select
to anon, authenticated
using (true);

create or replace function public.micham_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists micham_profiles_touch on public.micham_profiles;
create trigger micham_profiles_touch
before update on public.micham_profiles
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_entities_touch on public.micham_entities;
create trigger micham_entities_touch
before update on public.micham_entities
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_friend_links_touch on public.micham_friend_links;
create trigger micham_friend_links_touch
before update on public.micham_friend_links
for each row execute function public.micham_touch_updated_at();

create or replace function public.micham_connect_friend(friend_connection_code text, owner_person_id text)
returns public.micham_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  friend_profile public.micham_profiles;
begin
  select *
  into friend_profile
  from public.micham_profiles
  where connection_code = upper(trim(friend_connection_code))
    and id <> auth.uid();

  if friend_profile.id is null then
    raise exception 'Friend connection code was not found';
  end if;

  insert into public.micham_friend_links(owner_id, friend_id, owner_person_id, status)
  values (auth.uid(), friend_profile.id, owner_person_id, 'connected')
  on conflict (owner_id, friend_id)
  do update set owner_person_id = excluded.owner_person_id, status = 'connected', updated_at = now();

  insert into public.micham_friend_links(owner_id, friend_id, status)
  values (friend_profile.id, auth.uid(), 'connected')
  on conflict (owner_id, friend_id)
  do update set status = 'connected', updated_at = now();

  return friend_profile;
end;
$$;

create or replace function public.micham_mirror_friend_entity(
  friend_connection_code text,
  mirrored_entity_type text,
  mirrored_entity_id text,
  mirrored_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  friend_profile public.micham_profiles;
begin
  select *
  into friend_profile
  from public.micham_profiles
  where connection_code = upper(trim(friend_connection_code))
    and id <> auth.uid();

  if friend_profile.id is null then
    raise exception 'Friend connection code was not found';
  end if;

  if not exists (
    select 1
    from public.micham_friend_links link
    where link.status = 'connected'
      and link.owner_id = auth.uid()
      and link.friend_id = friend_profile.id
  ) then
    raise exception 'Friend is not connected';
  end if;

  insert into public.micham_entities(owner_id, entity_type, entity_id, payload, deleted_at)
  values (
    friend_profile.id,
    mirrored_entity_type,
    mirrored_entity_id,
    mirrored_payload,
    nullif(mirrored_payload->>'deletedAt', '')::timestamptz
  )
  on conflict (owner_id, entity_type, entity_id)
  do update set payload = excluded.payload, deleted_at = excluded.deleted_at, updated_at = now();
end;
$$;
