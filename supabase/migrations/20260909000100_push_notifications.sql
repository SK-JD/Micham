create table if not exists public.micham_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.micham_app_users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  user_agent text,
  active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists micham_push_subscriptions_endpoint_idx
on public.micham_push_subscriptions(endpoint);

create index if not exists micham_push_subscriptions_user_active_idx
on public.micham_push_subscriptions(user_id, active);

drop trigger if exists micham_push_subscriptions_touch on public.micham_push_subscriptions;
create trigger micham_push_subscriptions_touch
before update on public.micham_push_subscriptions
for each row execute function public.micham_touch_updated_at();

alter table public.micham_push_subscriptions enable row level security;

revoke all on public.micham_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.micham_push_subscriptions to service_role;
