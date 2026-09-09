# Micham Auth And Sync Flow

## Cloud Account

1. User creates an account with email, 4-digit PIN, display name, and currency.
2. The server creates the account in `micham_app_users` with `email_verified = false`.
3. The server sends the verification link by the configured SMTP mailer.
4. User verifies the email, then logs in again.
5. After login, the app stores the server session token locally and syncs changes automatically while online.

## Local-Only Use

1. User chooses local use and enters only name and currency.
2. No server request is made.
3. Data remains in device storage.
4. Settings shows `Sync To Server`.
5. When the user chooses sync, the app asks for an email and 4-digit PIN, creates or connects the cloud account, requires email verification for new cloud accounts, then pushes the local data.

## Existing Email During Sync

If the email already exists on the server, sync must not create a duplicate account. The user logs in with the existing PIN, and local data is appended to that server account.

## Offline Cloud Use

Registered users can continue adding local transactions and shared-money records while offline. When network access returns, pending local changes are pushed with stable IDs so retries do not create duplicates.

Friend owe records created offline are queued locally. They become visible to the friend only after the creator's device reconnects, sync succeeds, and the friend refreshes/pulls the latest shared records.

## Receipt Storage

Receipts are compressed on the client and uploaded through authenticated server API routes. The browser never writes directly with storage admin keys.

Each user has a receipt quota. The server uses the per-user override from `micham_user_storage_limits` when present, otherwise it uses `receipt_storage_default_limit_bytes` from system settings. Settings shows current usage and allows date-range receipt cleanup.

## Friends

1. A connection code is used only to find a verified active account.
2. The sender sees the candidate name before sending.
3. The request stays pending until the other user accepts it.
4. Only accepted friends are selectable in shared flows.
5. Blocking prevents future selection and sharing, but does not delete historical transactions.

## Deletion

Account deletion removes the server account and cascades owned app data. The local profile data is then cleared and the user is logged out.
