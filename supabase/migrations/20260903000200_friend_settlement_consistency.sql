alter table public.micham_friend_links
  drop constraint if exists micham_friend_links_status_check;

alter table public.micham_friend_links
  add constraint micham_friend_links_status_check
  check (status in ('pending', 'connected', 'blocked', 'removed'));

alter table public.micham_settlement_events
  add column if not exists client_mutation_id text;

create unique index if not exists micham_settlement_events_requested_mutation_idx
on public.micham_settlement_events(requested_by, client_mutation_id)
where client_mutation_id is not null;
