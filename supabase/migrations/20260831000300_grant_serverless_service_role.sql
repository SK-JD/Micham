grant usage on schema public to service_role;

grant select, insert, update, delete on public.micham_app_users to service_role;
grant select, insert, update, delete on public.micham_email_tokens to service_role;
grant select, insert, update, delete on public.micham_user_sessions to service_role;
grant select, insert, update, delete on public.micham_rate_limits to service_role;
grant select, insert, update, delete on public.micham_export_jobs to service_role;

grant select, insert, update, delete on public.micham_profiles to service_role;
grant select, insert, update, delete on public.micham_entities to service_role;
grant select, insert, update, delete on public.micham_friend_links to service_role;
grant select, insert, update, delete on public.micham_app_config to service_role;

grant execute on function public.micham_take_rate_limit(text, integer, integer, timestamptz) to service_role;
