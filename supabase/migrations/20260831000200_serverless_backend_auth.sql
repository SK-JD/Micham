create extension if not exists pgcrypto;

create table if not exists public.micham_app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  currency text not null default 'INR',
  password_hash text not null,
  connection_code text not null unique,
  email_verified boolean not null default false,
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.micham_app_users(id) on delete cascade,
  token_hash text not null unique,
  token_type text not null check (token_type in ('verify_email', 'reset_password')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.micham_user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.micham_app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.micham_rate_limits (
  bucket text primary key,
  request_count integer not null default 0,
  reset_at timestamptz not null
);

create table if not exists public.micham_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.micham_app_users(id) on delete cascade,
  export_type text not null default 'csv',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.micham_profiles drop constraint if exists micham_profiles_id_fkey;
alter table public.micham_entities drop constraint if exists micham_entities_owner_id_fkey;
alter table public.micham_friend_links drop constraint if exists micham_friend_links_owner_id_fkey;
alter table public.micham_friend_links drop constraint if exists micham_friend_links_friend_id_fkey;
alter table public.micham_app_config drop constraint if exists micham_app_config_updated_by_fkey;

do $$
begin
  alter table public.micham_profiles
    add constraint micham_profiles_id_app_user_fkey
    foreign key (id) references public.micham_app_users(id) on delete cascade not valid;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.micham_entities
    add constraint micham_entities_owner_app_user_fkey
    foreign key (owner_id) references public.micham_app_users(id) on delete cascade not valid;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.micham_friend_links
    add constraint micham_friend_links_owner_app_user_fkey
    foreign key (owner_id) references public.micham_app_users(id) on delete cascade not valid;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.micham_friend_links
    add constraint micham_friend_links_friend_app_user_fkey
    foreign key (friend_id) references public.micham_app_users(id) on delete cascade not valid;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.micham_app_config
    add constraint micham_app_config_updated_by_app_user_fkey
    foreign key (updated_by) references public.micham_app_users(id) on delete set null not valid;
exception
  when duplicate_object then null;
end;
$$;

drop trigger if exists micham_app_users_touch on public.micham_app_users;
create trigger micham_app_users_touch
before update on public.micham_app_users
for each row execute function public.micham_touch_updated_at();

create index if not exists micham_app_users_email_idx on public.micham_app_users(lower(email));
create index if not exists micham_email_tokens_user_type_idx on public.micham_email_tokens(user_id, token_type, expires_at);
create index if not exists micham_user_sessions_user_idx on public.micham_user_sessions(user_id, expires_at);
create index if not exists micham_export_jobs_user_created_idx on public.micham_export_jobs(user_id, created_at desc);

create or replace function public.micham_take_rate_limit(
  bucket_key text,
  max_requests integer,
  window_seconds integer,
  next_reset_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.micham_rate_limits;
begin
  insert into public.micham_rate_limits(bucket, request_count, reset_at)
  values (bucket_key, 1, next_reset_at)
  on conflict (bucket) do update
  set
    request_count = case
      when public.micham_rate_limits.reset_at <= now() then 1
      else public.micham_rate_limits.request_count + 1
    end,
    reset_at = case
      when public.micham_rate_limits.reset_at <= now() then next_reset_at
      else public.micham_rate_limits.reset_at
    end
  returning * into current_row;

  if current_row.request_count > max_requests then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (current_row.reset_at - now()))))
    );
  end if;

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on public.micham_app_users from anon, authenticated;
revoke all on public.micham_email_tokens from anon, authenticated;
revoke all on public.micham_user_sessions from anon, authenticated;
revoke all on public.micham_rate_limits from anon, authenticated;
revoke all on public.micham_export_jobs from anon, authenticated;

grant execute on function public.micham_take_rate_limit(text, integer, integer, timestamptz) to service_role;
