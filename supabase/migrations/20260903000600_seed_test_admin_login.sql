alter table public.micham_admin_users
  add column if not exists login_id text unique;

update public.micham_admin_users
set login_id = lower(email)
where login_id is null;

insert into public.micham_admin_users(
  email,
  login_id,
  display_name,
  password_hash,
  role,
  status
)
values (
  'admin@sk.local',
  'admin@sk',
  'Admin',
  '$2b$12$UKZ4VrhuxMAF8P8Op5KujO5140k7eeuU2mPzCFx5/Tn/EYgQvRJPq',
  'SUPER_ADMIN',
  'ACTIVE'
)
on conflict (login_id) do update
set password_hash = excluded.password_hash,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

grant select, insert, update, delete on public.micham_admin_users to service_role;
