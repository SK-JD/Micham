# Micham Deployment Readiness

## Vercel Target

The project is structured for Vercel:

- Vite frontend builds into `dist`.
- Serverless endpoints live under `api/**`.
- `vercel.json` sets API function duration.
- Supabase is used as database/storage through server-side API routes.

## Required Environment Variables

Set these in Vercel project settings before production use:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
SERVER_JWT_SECRET
APP_BASE_URL
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

For Vercel, `APP_BASE_URL` should be the production URL, for example `https://your-domain.vercel.app`.

## Multi-User Online Status

The app has the required pieces for multi-user online testing:

- account registration, verification, login, reset, delete
- local-first IndexedDB data
- server sync APIs
- friend requests and acknowledgement flows
- admin/runtime configuration
- email templates through SMTP

Before public release, run a hosted smoke test with two separate devices/accounts after setting Vercel environment variables.

## Export Types

- Settings export/import is JSON backup for restoring app data after uninstall/reinstall.
- Reports download is an Excel-compatible workbook generated from the active filters.
