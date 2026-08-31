# Micham

Local-first expense tracker with optional cloud sync.

## Run Locally

```bash
npm install
npm run dev
```

## Supabase Setup

Supabase is used as the database. App authentication, verification email, password reset, export email, and rate limits are handled by serverless API functions in this repo.

### Dashboard Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run every SQL file in `supabase/migrations/` in filename order.
4. Copy the project URL and publishable key.
5. For web/dev builds, put them into `.env`.

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

6. Restart the Vite dev server or rebuild the APK.

`VITE_SUPABASE_ANON_KEY` is also supported for older Supabase projects during the transition away from direct client sync.

## Serverless API

The backend lives in `api/` and can run on Vercel-style serverless functions. It uses the Supabase service role key only on the server, never in the mobile app.

Required server environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
SERVER_JWT_SECRET=use-a-long-random-secret
APP_BASE_URL=https://your-app-domain.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM="Micham <mailer@example.com>"
```

`SUPABASE_SERVICE_ROLE_KEY` is also supported for legacy Supabase projects. Prefer the newer `sb_secret_*` key for Vercel/Netlify serverless functions.

API endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-email`
- `POST /api/auth/request-reset`
- `POST /api/auth/confirm-reset`
- `POST /api/export/email`
- `POST /api/sync/push`
- `GET /api/sync/pull`
- `POST /api/friends/verify`
- `POST /api/friends/request`
- `POST /api/friends/connect`
- `POST /api/friends/respond`
- `POST /api/friends/block`
- `GET /api/friends/list`
- `POST /api/friends/mirror`
- `POST /api/settlements/request-repayment`
- `POST /api/settlements/respond-repayment`
- `GET /api/settlements/list`
- `POST /api/transactions/update`

Email templates are kept separately in `api/email-templates/`.

### CLI Migration Setup

If the Supabase CLI is installed and your project is linked, apply the migration with:

```bash
supabase db push
```

Or apply it directly with a database URL:

```bash
supabase db push --db-url "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
```

After the migration runs, the serverless API can create users, issue sessions, send SMTP emails, and read/write Supabase data with the service role key.

## Sync Behavior

- `Use Locally` keeps all data in IndexedDB on the device.
- `Create Account` is moving to the serverless auth API so Supabase Auth email limits do not affect the app.
- `Create Account & Sync Local Data` links the current local profile to Supabase.
- Accounts, categories, transactions, budgets, recurring records, friends, owe/owed records, and repayments are synced as cloud entities.
- Friend connection uses the friend's `MCH-...` connection code.
- Connected friend owe/owed and repayment records are mirrored through Supabase RPC and received through realtime.

## APK

Build a debug APK:

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```
