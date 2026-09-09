insert into public.micham_system_settings(setting_key, value, description, is_public)
values
  ('dev_mode_users', '[]'::jsonb, 'User ids or emails allowed to see API debug responses in the app.', true),
  ('dev_mode_all', 'false'::jsonb, 'Show API debug responses for every app user. Testing only.', true)
on conflict (setting_key) do update
set
  value = excluded.value,
  description = excluded.description,
  is_public = excluded.is_public,
  updated_at = now();
