# Micham Build Versions

## 0.1.3 - web-2026.09.05.3

Date: 2026-09-05

- Corrected the responsive shell so desktop/web uses a wide workspace instead of a forced phone frame.
- Kept the mobile-first card language while allowing dashboard, reports, activity, add transaction, and friends sections to adapt by viewport.
- Fixed bottom navigation clipping for the raised Add action.
- Added an animated sheen to the available balance card.
- Added stronger overflow guards for report rows, account balances, and transaction content.

## 0.1.2 - web-2026.09.05.2

Date: 2026-09-05

- Updated primary navigation to Home, Activity, Add, Insights, and People.
- Moved AI Assistant out of bottom navigation into a floating action button.
- Added local chat history storage with a 10-message limit and Clear Chat cleanup.
- Moved split expense into Add Transaction as an optional disabled-by-default section with multi-person selection.
- Added mobile UI polish for split chips and the assistant screen.

## 0.1.1 - web-2026.09.05.1

Date: 2026-09-05

- Stabilized mobile safe-area layout for the fixed top bar and bottom navigation.
- Blocked horizontal page overflow from report charts, account usage rows, and transaction rows.
- Added visible in-app version/build metadata under Settings.
- Upgraded Reports download to a filtered Excel-compatible workbook.
- Improved app backup import/export for reinstall and future restore usage.
- Current deployment target: Vercel web/PWA with serverless API routes and Supabase storage.

## Local APK Artifacts

- `Micham-debug-apk-V4.apk` and `Micham-debug-apk-V5.apk` are local test artifacts only.
- APK files are intentionally not committed or pushed to the repository.
