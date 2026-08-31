create or replace function public.micham_verify_friend_code(friend_connection_code text)
returns table (
  id uuid,
  display_name text,
  currency text,
  connection_code text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select profile.id, profile.display_name, profile.currency, profile.connection_code
  from public.micham_profiles profile
  where profile.connection_code = upper(trim(friend_connection_code))
    and profile.id <> auth.uid()
  limit 1;
end;
$$;

grant execute on function public.micham_verify_friend_code(text) to authenticated;
