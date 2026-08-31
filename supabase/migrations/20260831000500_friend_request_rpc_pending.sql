create or replace function public.micham_connect_friend(friend_connection_code text, owner_person_id text)
returns public.micham_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  friend_profile public.micham_profiles;
begin
  select *
  into friend_profile
  from public.micham_profiles
  where connection_code = upper(trim(friend_connection_code))
    and id <> auth.uid();

  if friend_profile.id is null then
    raise exception 'Friend connection code was not found';
  end if;

  if exists (
    select 1
    from public.micham_friend_links link
    where link.status = 'blocked'
      and (
        (link.owner_id = auth.uid() and link.friend_id = friend_profile.id)
        or (link.owner_id = friend_profile.id and link.friend_id = auth.uid())
      )
  ) then
    raise exception 'This friend connection is blocked';
  end if;

  insert into public.micham_friend_links(owner_id, friend_id, owner_person_id, status, requested_by, requested_at, responded_at, blocked_by)
  values (auth.uid(), friend_profile.id, owner_person_id, 'pending', auth.uid(), now(), null, null)
  on conflict (owner_id, friend_id)
  do update set
    owner_person_id = excluded.owner_person_id,
    status = case when public.micham_friend_links.status = 'connected' then 'connected' else 'pending' end,
    requested_by = auth.uid(),
    requested_at = now(),
    responded_at = null,
    blocked_by = null,
    updated_at = now();

  insert into public.micham_friend_links(owner_id, friend_id, status, requested_by, requested_at, responded_at, blocked_by)
  values (friend_profile.id, auth.uid(), 'pending', auth.uid(), now(), null, null)
  on conflict (owner_id, friend_id)
  do update set
    status = case when public.micham_friend_links.status = 'connected' then 'connected' else 'pending' end,
    requested_by = auth.uid(),
    requested_at = now(),
    responded_at = null,
    blocked_by = null,
    updated_at = now();

  return friend_profile;
end;
$$;
