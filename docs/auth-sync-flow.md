# Micham Auth And Sync Flow

## Cloud Account

1. User creates an account with email, password, display name, and currency.
2. The server creates the account in `micham_app_users` with `email_verified = false`.
3. The server sends the verification link by the configured SMTP mailer.
4. User verifies the email, then logs in again.
5. After login, the app stores the server session token locally and syncs changes automatically while online.

## Local-Only Use

1. User chooses local use and enters only name, email, and currency.
2. No server request is made.
3. Data remains in device storage.
4. Settings shows `Sync To Server`.
5. When the user chooses sync, the app asks for a password, creates or connects the cloud account, requires email verification, then pushes the local data.

## Existing Email During Sync

If the email already exists on the server, sync must not create a duplicate account. The user logs in with the existing password, and local data is appended to that server account.

## Friends

1. A connection code is used only to find a verified active account.
2. The sender sees the candidate name before sending.
3. The request stays pending until the other user accepts it.
4. Only accepted friends are selectable in shared flows.
5. Blocking prevents future selection and sharing, but does not delete historical transactions.

## Deletion

Account deletion removes the server account and cascades owned app data. The local profile data is then cleared and the user is logged out.
