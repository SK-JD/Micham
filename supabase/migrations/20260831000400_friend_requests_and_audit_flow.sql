alter table public.micham_friend_links
  add column if not exists requested_by uuid references public.micham_app_users(id) on delete set null,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists responded_at timestamptz,
  add column if not exists blocked_by uuid references public.micham_app_users(id) on delete set null;

create table if not exists public.micham_transaction_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.micham_app_users(id) on delete cascade,
  transaction_id text not null,
  previous_payload jsonb not null,
  next_payload jsonb not null,
  edit_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.micham_settlement_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.micham_app_users(id) on delete cascade,
  friend_id uuid not null references public.micham_app_users(id) on delete cascade,
  settlement_entity_id text not null,
  event_type text not null check (event_type in ('owe_created', 'repayment_requested', 'repayment_confirmed', 'repayment_rejected', 'settlement_closed')),
  amount numeric(14, 2) not null default 0,
  previous_event_id uuid references public.micham_settlement_events(id) on delete set null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  requested_by uuid references public.micham_app_users(id) on delete set null,
  acknowledged_by uuid references public.micham_app_users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists micham_friend_links_status_idx on public.micham_friend_links(owner_id, friend_id, status);
create index if not exists micham_transaction_revisions_owner_transaction_idx on public.micham_transaction_revisions(owner_id, transaction_id, created_at desc);
create index if not exists micham_settlement_events_pair_idx on public.micham_settlement_events(owner_id, friend_id, settlement_entity_id, created_at desc);
create index if not exists micham_settlement_events_pending_idx on public.micham_settlement_events(friend_id, status, created_at desc);

grant select, insert, update, delete on public.micham_friend_links to service_role;
grant select, insert, update, delete on public.micham_transaction_revisions to service_role;
grant select, insert, update, delete on public.micham_settlement_events to service_role;
