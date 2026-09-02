# Micham Modules And Flows

## Module Map

```text
src/main.tsx
  UI screens, navigation, local workflows, friend ledger, settings

src/lib/db.ts
  IndexedDB schema for local-first storage

src/lib/serverApi.ts
  Browser/mobile client for serverless API routes

api/auth/*
  Register, login, verify email, reset password, delete account

api/sync/*
  Push and pull local entities to Supabase storage

api/friends/*
  Verify friend codes, request/accept/block/remove, mirror friend entities

api/settlements/*
  Repayment promise request and acknowledgement events

api/export/email.ts
  Email full account export as an Excel-compatible workbook

api/email-templates/*
  Branded HTML email templates
```

## Local-Only Flow

```text
Use Locally
  -> ask name + email
  -> create IndexedDB profile only
  -> no server request
  -> user can add accounts, transactions, friends, budgets
  -> Settings > Sync To Server when ready
```

## Cloud Account Flow

```text
Create Account
  -> POST /api/auth/register
  -> create micham_app_users row
  -> create verify_email token
  -> send branded verification email
  -> user verifies email
  -> user logs in
  -> app stores server token locally
  -> sync runs while online
```

## Local To Cloud Sync

```text
Local profile
  -> Settings > Sync To Server
  -> if email does not exist: register + verify first
  -> if email exists: login with existing password
  -> push local entities to Supabase
  -> pull latest server entities
```

## Friend Request Flow

```text
Enter friend connection code
  -> verify active cloud user
  -> show verified name
  -> send request
  -> other user receives pending request
  -> accept creates connected state on both sides
  -> block prevents future shared selection
```

## Friend Debt Flow

```text
They owe me
  -> choose friend + account + category + amount
  -> local expense transaction is created
  -> local settlement is created
  -> mirrored settlement is written to friend's server data with reversed direction

I owe them
  -> choose friend + amount
  -> settlement is created
  -> mirrored settlement is written to friend's server data with reversed direction
```

## Repayment Acknowledgement Flow

```text
Sender marks repayment
  -> choose open record + account + amount
  -> pending repayment event is created
  -> sender sees "waiting for acknowledgement"

Receiver accepts
  -> chooses receiving/paying account
  -> repayment is added to receiver ledger
  -> settlement balance is reduced
  -> event becomes accepted
  -> sender sync applies the confirmed repayment locally

Receiver rejects
  -> event becomes rejected
  -> sender pending repayment becomes rejected
```

## Delete Account Flow

```text
Delete connected account
  -> confirmation modal
  -> email Excel-compatible export to account email
  -> delete server account and cascade app data
  -> clear local profile data
  -> logout

Delete local account
  -> confirmation modal
  -> clear local profile data
  -> logout
```
