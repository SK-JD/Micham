# Security Notes

This application is local-first. Supabase sync is optional and does not require a separate backend server.

## Implemented

- Local/admin login throttling: 5 failed attempts per login ID per 15 minutes.
- AI chat throttling: 10 requests per minute per browser profile.
- Local registration requires an 8 character minimum password.
- Import JSON is capped at 5 MB and must parse as JSON before merge preview.
- Uploaded app icons must be image files and are capped at 1 MB.
- Exported JSON omits the Groq API key.
- Normal financial data remains in IndexedDB and does not require cloud access.
- Supabase Auth is used for connected accounts when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
- Supabase Row Level Security policies are defined in `supabase/schema.sql`.
- Friend-linked owe/owed records are mirrored with controlled Supabase RPC functions instead of direct cross-user writes.

## Production Requirements

- Do not call Groq directly from the browser in production.
- Store Groq keys server-side and call Groq through a Supabase Edge Function or equivalent protected API.
- Enforce AI rate limits on the server per authenticated user and IP/device.
- Keep Supabase email confirmation enabled for production unless the onboarding copy is adjusted for immediate login.
- Add audit logging for admin configuration changes once multi-device admin exists.

Client-side rate limiting can be bypassed by a determined user. It is a UX and accidental-abuse guard, not a security boundary.
