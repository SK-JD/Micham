create index if not exists micham_email_tokens_cleanup_idx
on public.micham_email_tokens(expires_at, used_at);

create index if not exists micham_user_sessions_cleanup_idx
on public.micham_user_sessions(expires_at, revoked_at);

create index if not exists micham_rate_limits_reset_idx
on public.micham_rate_limits(reset_at);

create index if not exists micham_export_jobs_status_created_idx
on public.micham_export_jobs(status, created_at);

create or replace function public.micham_cleanup_stale_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_tokens integer := 0;
  deleted_sessions integer := 0;
  deleted_rate_limits integer := 0;
  deleted_export_jobs integer := 0;
begin
  delete from public.micham_email_tokens
  where used_at is not null
     or expires_at < now() - interval '7 days';
  get diagnostics deleted_tokens = row_count;

  delete from public.micham_user_sessions
  where revoked_at is not null
     or expires_at < now() - interval '7 days';
  get diagnostics deleted_sessions = row_count;

  delete from public.micham_rate_limits
  where reset_at < now() - interval '1 day';
  get diagnostics deleted_rate_limits = row_count;

  delete from public.micham_export_jobs
  where created_at < now() - interval '30 days';
  get diagnostics deleted_export_jobs = row_count;

  return jsonb_build_object(
    'tokens', deleted_tokens,
    'sessions', deleted_sessions,
    'rateLimits', deleted_rate_limits,
    'exportJobs', deleted_export_jobs
  );
end;
$$;

grant execute on function public.micham_cleanup_stale_operational_data() to service_role;
