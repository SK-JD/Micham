create or replace function public.micham_ensure_auth_app_user(
  profile_display_name text,
  profile_currency text,
  profile_connection_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  email_confirmed boolean;
begin
  if current_user_id is null then
    raise exception 'Cloud session is missing';
  end if;

  select email, email_confirmed_at is not null
  into current_email, email_confirmed
  from auth.users
  where id = current_user_id;

  if current_email is null then
    raise exception 'Cloud account email is missing';
  end if;

  if not email_confirmed then
    raise exception 'Verify your email before syncing this device';
  end if;

  insert into public.micham_app_users(
    id,
    email,
    display_name,
    currency,
    password_hash,
    connection_code,
    email_verified,
    status
  )
  values (
    current_user_id,
    current_email,
    nullif(trim(profile_display_name), ''),
    coalesce(nullif(trim(profile_currency), ''), 'INR'),
    'supabase-auth-managed',
    upper(trim(profile_connection_code)),
    email_confirmed,
    'active'
  )
  on conflict (id)
  do update set
    email = excluded.email,
    display_name = excluded.display_name,
    currency = excluded.currency,
    connection_code = excluded.connection_code,
    status = 'active',
    updated_at = now();

  return current_user_id;
end;
$$;

grant execute on function public.micham_ensure_auth_app_user(text, text, text) to authenticated;
