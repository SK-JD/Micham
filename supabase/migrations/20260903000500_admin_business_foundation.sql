create extension if not exists pgcrypto;

create table if not exists public.micham_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'ADMIN' check (role in ('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'VIEWER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.micham_admin_users(id) on delete cascade,
  token_hash text not null unique,
  ip_address text,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.micham_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.micham_admin_users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.micham_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  is_default boolean not null default false,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists micham_one_default_active_plan_idx
on public.micham_plans((is_default))
where is_default = true and status = 'ACTIVE';

create table if not exists public.micham_features (
  feature_key text primary key,
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_plan_features (
  plan_id uuid not null references public.micham_plans(id) on delete cascade,
  feature_key text not null references public.micham_features(feature_key) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

create table if not exists public.micham_plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.micham_plans(id) on delete cascade,
  limit_key text not null,
  limit_value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, limit_key)
);

create table if not exists public.micham_user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.micham_app_users(id) on delete cascade,
  plan_id uuid not null references public.micham_plans(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'TRIAL', 'CANCELLED', 'EXPIRED')),
  source text not null default 'SYSTEM' check (source in ('SYSTEM', 'ADMIN', 'SELF', 'IMPORT')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists micham_user_one_active_subscription_idx
on public.micham_user_subscriptions(user_id)
where status in ('ACTIVE', 'TRIAL');

create table if not exists public.micham_feature_flags (
  flag_key text primary key,
  name text not null,
  description text,
  enabled boolean not null default false,
  rollout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_system_settings (
  setting_key text primary key,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ARCHIVED')),
  target text not null default 'ALL' check (target in ('ALL', 'PLAN', 'USER')),
  target_value text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.micham_admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_ad_placements (
  placement_key text primary key,
  name text not null,
  description text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_ad_configs (
  id uuid primary key default gen_random_uuid(),
  placement_key text not null references public.micham_ad_placements(placement_key) on delete cascade,
  provider text not null default 'INTERNAL',
  status text not null default 'INACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.micham_plan_ad_policies (
  plan_id uuid not null references public.micham_plans(id) on delete cascade,
  placement_key text not null references public.micham_ad_placements(placement_key) on delete cascade,
  allowed boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, placement_key)
);

create index if not exists micham_admin_sessions_admin_idx on public.micham_admin_sessions(admin_id, expires_at);
create index if not exists micham_admin_audit_admin_created_idx on public.micham_admin_audit_logs(admin_id, created_at desc);
create index if not exists micham_admin_audit_target_idx on public.micham_admin_audit_logs(target_type, target_id, created_at desc);
create index if not exists micham_subscriptions_user_status_idx on public.micham_user_subscriptions(user_id, status);
create index if not exists micham_announcements_status_window_idx on public.micham_announcements(status, starts_at, ends_at);
create index if not exists micham_ad_configs_placement_status_idx on public.micham_ad_configs(placement_key, status);

drop trigger if exists micham_admin_users_touch on public.micham_admin_users;
create trigger micham_admin_users_touch
before update on public.micham_admin_users
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_plans_touch on public.micham_plans;
create trigger micham_plans_touch
before update on public.micham_plans
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_features_touch on public.micham_features;
create trigger micham_features_touch
before update on public.micham_features
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_plan_features_touch on public.micham_plan_features;
create trigger micham_plan_features_touch
before update on public.micham_plan_features
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_plan_limits_touch on public.micham_plan_limits;
create trigger micham_plan_limits_touch
before update on public.micham_plan_limits
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_user_subscriptions_touch on public.micham_user_subscriptions;
create trigger micham_user_subscriptions_touch
before update on public.micham_user_subscriptions
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_feature_flags_touch on public.micham_feature_flags;
create trigger micham_feature_flags_touch
before update on public.micham_feature_flags
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_system_settings_touch on public.micham_system_settings;
create trigger micham_system_settings_touch
before update on public.micham_system_settings
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_announcements_touch on public.micham_announcements;
create trigger micham_announcements_touch
before update on public.micham_announcements
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_ad_placements_touch on public.micham_ad_placements;
create trigger micham_ad_placements_touch
before update on public.micham_ad_placements
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_ad_configs_touch on public.micham_ad_configs;
create trigger micham_ad_configs_touch
before update on public.micham_ad_configs
for each row execute function public.micham_touch_updated_at();

drop trigger if exists micham_plan_ad_policies_touch on public.micham_plan_ad_policies;
create trigger micham_plan_ad_policies_touch
before update on public.micham_plan_ad_policies
for each row execute function public.micham_touch_updated_at();

insert into public.micham_plans(code, name, description, status, is_default, sort_order)
values ('FREE', 'Free', 'Default plan for every Micham account.', 'ACTIVE', true, 10)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    is_default = excluded.is_default,
    sort_order = excluded.sort_order;

insert into public.micham_features(feature_key, name, description, status)
values
  ('CLOUD_SYNC', 'Cloud sync', 'Sync local data to the server and other signed-in devices.', 'ACTIVE'),
  ('FRIENDS', 'Friends', 'Friend requests, connected friends, and shared money records.', 'ACTIVE'),
  ('SETTLEMENTS', 'Settlements', 'Partial and full repayment acknowledgement workflow.', 'ACTIVE'),
  ('AI_ASSISTANT', 'AI assistant', 'Optional AI chat and receipt assistance.', 'ACTIVE'),
  ('REPORT_EXPORT', 'Report export', 'Download filtered reports and email account exports.', 'ACTIVE'),
  ('ADVANCED_REPORTS', 'Advanced reports', 'Category, account, and budget reporting views.', 'ACTIVE'),
  ('RECEIPTS', 'Receipts', 'Attach and view receipt images with transactions.', 'ACTIVE')
on conflict (feature_key) do update
set name = excluded.name,
    description = excluded.description,
    status = excluded.status;

insert into public.micham_plan_features(plan_id, feature_key, enabled)
select plan.id, feature.feature_key, true
from public.micham_plans plan
cross join public.micham_features feature
where plan.code = 'FREE'
on conflict (plan_id, feature_key) do update
set enabled = excluded.enabled;

insert into public.micham_plan_limits(plan_id, limit_key, limit_value, description)
select plan.id, seed.limit_key, seed.limit_value::jsonb, seed.description
from public.micham_plans plan
cross join (
  values
    ('monthly_transactions', 'null', 'Reserved monthly transaction limit. Null means not enforced.'),
    ('friends_count', 'null', 'Reserved connected friend limit. Null means not enforced.'),
    ('receipt_storage_mb', 'null', 'Reserved receipt storage limit. Null means not enforced.')
) as seed(limit_key, limit_value, description)
where plan.code = 'FREE'
on conflict (plan_id, limit_key) do update
set limit_value = excluded.limit_value,
    description = excluded.description;

insert into public.micham_feature_flags(flag_key, name, description, enabled)
values
  ('cloud_sync', 'Cloud sync', 'Controls cloud sync UI and API usage.', true),
  ('registration', 'Registration', 'Controls new cloud account registration.', true),
  ('friends', 'Friends', 'Controls friend request and shared money features.', true),
  ('settlements', 'Settlements', 'Controls settlement acknowledgement features.', true),
  ('ai_assistant', 'AI assistant', 'Controls optional AI assistant entry points.', false),
  ('ads', 'Ads', 'Controls future ad placements.', false)
on conflict (flag_key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.micham_system_settings(setting_key, value, description, is_public)
values
  ('maintenance_mode', 'false'::jsonb, 'When true, user-facing write APIs should be paused by policy.', true),
  ('registration_enabled', 'true'::jsonb, 'When false, new cloud account registration should be paused.', true),
  ('sync_enabled', 'true'::jsonb, 'When false, cloud sync should be paused.', true),
  ('support_email', '""'::jsonb, 'Public support email shown by clients when configured.', true)
on conflict (setting_key) do update
set description = excluded.description,
    is_public = excluded.is_public;

insert into public.micham_ad_placements(placement_key, name, description, enabled)
values
  ('HOME_BANNER', 'Home banner', 'Reserved ad placement on the dashboard.', false),
  ('REPORTS_BANNER', 'Reports banner', 'Reserved ad placement on reports.', false),
  ('FRIENDS_BANNER', 'Friends banner', 'Reserved ad placement on friends page.', false)
on conflict (placement_key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.micham_user_subscriptions(user_id, plan_id, status, source)
select app_user.id, plan.id, 'ACTIVE', 'SYSTEM'
from public.micham_app_users app_user
cross join public.micham_plans plan
where plan.code = 'FREE'
  and app_user.status = 'active'
  and not exists (
    select 1
    from public.micham_user_subscriptions existing
    where existing.user_id = app_user.id
      and existing.status in ('ACTIVE', 'TRIAL')
  );

alter table public.micham_admin_users enable row level security;
alter table public.micham_admin_sessions enable row level security;
alter table public.micham_admin_audit_logs enable row level security;
alter table public.micham_plans enable row level security;
alter table public.micham_features enable row level security;
alter table public.micham_plan_features enable row level security;
alter table public.micham_plan_limits enable row level security;
alter table public.micham_user_subscriptions enable row level security;
alter table public.micham_feature_flags enable row level security;
alter table public.micham_system_settings enable row level security;
alter table public.micham_announcements enable row level security;
alter table public.micham_ad_placements enable row level security;
alter table public.micham_ad_configs enable row level security;
alter table public.micham_plan_ad_policies enable row level security;

revoke all on public.micham_admin_users from anon, authenticated;
revoke all on public.micham_admin_sessions from anon, authenticated;
revoke all on public.micham_admin_audit_logs from anon, authenticated;
revoke all on public.micham_plans from anon, authenticated;
revoke all on public.micham_features from anon, authenticated;
revoke all on public.micham_plan_features from anon, authenticated;
revoke all on public.micham_plan_limits from anon, authenticated;
revoke all on public.micham_user_subscriptions from anon, authenticated;
revoke all on public.micham_feature_flags from anon, authenticated;
revoke all on public.micham_system_settings from anon, authenticated;
revoke all on public.micham_announcements from anon, authenticated;
revoke all on public.micham_ad_placements from anon, authenticated;
revoke all on public.micham_ad_configs from anon, authenticated;
revoke all on public.micham_plan_ad_policies from anon, authenticated;

grant select, insert, update, delete on public.micham_admin_users to service_role;
grant select, insert, update, delete on public.micham_admin_sessions to service_role;
grant select, insert on public.micham_admin_audit_logs to service_role;
grant select, insert, update, delete on public.micham_plans to service_role;
grant select, insert, update, delete on public.micham_features to service_role;
grant select, insert, update, delete on public.micham_plan_features to service_role;
grant select, insert, update, delete on public.micham_plan_limits to service_role;
grant select, insert, update, delete on public.micham_user_subscriptions to service_role;
grant select, insert, update, delete on public.micham_feature_flags to service_role;
grant select, insert, update, delete on public.micham_system_settings to service_role;
grant select, insert, update, delete on public.micham_announcements to service_role;
grant select, insert, update, delete on public.micham_ad_placements to service_role;
grant select, insert, update, delete on public.micham_ad_configs to service_role;
grant select, insert, update, delete on public.micham_plan_ad_policies to service_role;
