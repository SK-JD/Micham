create table if not exists public.micham_receipt_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.micham_app_users(id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  related_type text not null check (related_type in ('transaction', 'settlement')),
  related_id text not null,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists micham_receipt_files_user_active_idx
  on public.micham_receipt_files(user_id, uploaded_at)
  where deleted_at is null;

create table if not exists public.micham_user_storage_limits (
  user_id uuid primary key references public.micham_app_users(id) on delete cascade,
  limit_bytes bigint not null check (limit_bytes > 0),
  updated_at timestamptz not null default now()
);

insert into public.micham_system_settings(setting_key, value, description, is_public)
values ('receipt_storage_default_limit_bytes', '26214400'::jsonb, 'Default receipt storage limit per user in bytes.', true)
on conflict (setting_key) do nothing;

revoke all on public.micham_receipt_files from anon, authenticated;
revoke all on public.micham_user_storage_limits from anon, authenticated;
grant select, insert, update, delete on public.micham_receipt_files to service_role;
grant select, insert, update, delete on public.micham_user_storage_limits to service_role;
