# Micham Supabase Optimization and Hardening Notes

Updated: 2026-09-03

## Current Architecture

```text
React / Capacitor
-> IndexedDB / Dexie
-> Durable syncQueue
-> Serverless API
-> Custom Auth
-> Supabase PostgreSQL
```

Supabase is used as managed PostgreSQL. Micham does not use Supabase Auth for application login.

## Changes Made

### API

- Added request IDs to API responses.
- Added safe structured errors with `error`, `code`, `requestId`, and `retryable`.
- Stopped unexpected database/environment errors from being returned directly to the frontend.
- Added request body size checks.
- Added rate limits for sync, friends, settlements, exports, transaction update, and account deletion.
- Added lightweight expired rate-limit cleanup.

### Sync

- Replaced client full-snapshot upload with queued mutation upload.
- Added `clientMutationId` to queued local sync operations.
- Added retry metadata on failed queue pushes.
- Added cursor-based pull support.
- Added profile-level/localStorage sync cursor tracking.
- Replaced fixed 12-second polling with a guarded sync coordinator using visibility, online status, one-at-a-time execution, and exponential backoff.

### Friends and Settlements

- Restricted friend mirror endpoint to shared settlement/repayment entities.
- Added payload validation for shared settlement/repayment writes.
- Changed friend removal to a `removed` state instead of hard-delete.
- Friend rejection now records `removed`; explicit blocking still records `blocked`.
- Added settlement event idempotency through `client_mutation_id`.
- Settlement responses now update only pending events.

### Export and Data Lifecycle

- Export requests now create and update `micham_export_jobs`.
- Export success/failure is tracked instead of being invisible.
- Added cleanup indexes and a service-role cleanup function for stale operational data.
- Removed main-app browser `alert()`/`confirm()` usage for normal flows.
- Added a repeatable hardening scan script.
- Added a migration to drop obsolete Supabase Auth helper RPCs from the active database.

## Database Changes

Added migrations:

- `20260903000100_incremental_sync_indexes.sql`
  - `micham_entities(owner_id, updated_at)`
  - `micham_entities(owner_id, entity_type, updated_at)`

- `20260903000200_friend_settlement_consistency.sql`
  - Adds `removed` friend-link status.
  - Adds `micham_settlement_events.client_mutation_id`.
  - Adds unique idempotency index for requested settlement events.

- `20260903000300_retention_cleanup_and_indexes.sql`
  - Adds cleanup indexes for tokens, sessions, rate limits, and export jobs.
  - Adds `micham_cleanup_stale_operational_data()`.

- `20260903000400_drop_legacy_supabase_auth_rpcs.sql`
  - Drops old Supabase Auth RPC helpers no longer used by the custom-auth API.

## Sync Protocol

1. Local changes keep working offline.
2. Cloud-relevant local records with `syncState !== "synced"` are written into `syncQueue`.
3. The client sends up to 200 queued mutations per push.
4. The server validates entity type, entity ID, action, payload size, and authenticated user.
5. On success, queue entries are removed and local entities become `synced`.
6. On failure, queue entries remain with retry details.
7. Pull requests use a server `updated_at` cursor and return changed/tombstoned rows only.

## Security Model

- Passwords are hashed server-side with bcrypt.
- Session tokens are signed JWTs; only token hashes are stored in the database.
- Email verification/reset tokens are stored as hashes.
- The service-role key is used only by serverless API routes.
- Frontend direct Supabase access is limited to public app config.
- Serverless APIs are the primary authorization boundary.

## Error Model

Expected validation/auth/rate-limit failures return safe messages. Unexpected server failures return:

```json
{
  "error": "Server request failed.",
  "code": "INTERNAL_ERROR",
  "requestId": "...",
  "retryable": true
}
```

Frontend `ApiClientError` now preserves:

- HTTP status
- error code
- request ID
- retryable flag

## Rate Limits

| Area | Limit |
| --- | --- |
| Register | 5/hour per email |
| Login | 12/15 minutes per email |
| Password reset | 5/hour per email |
| Sync push | 120/hour per user |
| Sync pull | 300/hour per user |
| Friend verify | 60/hour per user |
| Friend request | 30/hour per user |
| Friend/list actions | 120-300/hour per user depending on endpoint |
| Settlement actions | 120/hour per user |
| Transaction update | 240/hour per user |
| Export email | 3/day per user |
| Delete account | 3/day per user |

## Remaining Limitations

- Sync conflict handling is still mostly last-write-wins.
- Sync idempotency is stored in payloads for entities; only settlement events have a database uniqueness constraint.
- Friend debt sharing still uses mirrored entity records, not a canonical shared-debt table.
- Export generation is tracked but still synchronous.
- The automated hardening check is a static safety scan, not a full unit/integration test suite.
- Historical migrations and `supabase/schema.sql` still show legacy `auth.uid()` references because migration history is preserved.
- Bundle size remains above Vite's default warning threshold.

## Database Reset

No database truncation was performed as part of this hardening pass. Truncating user data is destructive and is not required for these fixes. For a clean test environment, use a separate Supabase project or run an explicit truncate script only after confirming the data can be discarded.
