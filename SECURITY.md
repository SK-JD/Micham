# Security Notes

This application is local-first. Current controls are meant to protect the local web app and reduce accidental abuse while the backend sync layer is still optional.

## Implemented

- Local/admin login throttling: 5 failed attempts per login ID per 15 minutes.
- AI chat throttling: 10 requests per minute per browser profile.
- Local registration requires an 8 character minimum password.
- Import JSON is capped at 5 MB and must parse as JSON before merge preview.
- Uploaded app icons must be image files and are capped at 1 MB.
- Exported JSON omits the Groq API key.
- Normal financial data remains in IndexedDB and does not require cloud access.

## Production Requirements

- Do not call Groq directly from the browser in production.
- Store Groq keys server-side and call Groq through a Supabase Edge Function or equivalent protected API.
- Enforce AI rate limits on the server per authenticated user and IP/device.
- Enforce Supabase Row Level Security for every syncable financial table.
- Keep sync writes scoped to the authenticated user ID.
- Replace local password hashing with Supabase Auth for connected accounts.
- Add audit logging for admin configuration changes once multi-device admin exists.

Client-side rate limiting can be bypassed by a determined user. It is a UX and accidental-abuse guard, not a security boundary.
