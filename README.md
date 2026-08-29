# Micham

Local-first expense tracker with optional Supabase sync.

## Run Locally

```bash
npm install
npm run dev
```

## Supabase Setup

This app does not need a separate backend server. Supabase provides Auth, database storage, Row Level Security, RPC, and realtime.

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy the project URL and anon public key into `.env`.

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart the Vite dev server or rebuild the APK.

## Sync Behavior

- `Use Locally` keeps all data in IndexedDB on the device.
- `Create Account` uses Supabase Auth when env keys are configured.
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
