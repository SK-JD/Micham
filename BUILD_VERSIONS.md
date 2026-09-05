# Micham Build Versions

## 0.1.7 - web-2026.09.05.7

Date: 2026-09-05

- Fixed Profile rows so long emails and values stay compact with ellipsis instead of awkward multiline wrapping.
- Reworked Import / Export / Logout into clearer settings action cards.
- Added the app credit line: Made with a red heart by SURIYAKANTH.
- Prepared a fresh debug APK from this source state.

## 0.1.6 - web-2026.09.05.6

Date: 2026-09-05

- Preserved local theme, sync, and AI preferences when cloud app configuration refreshes.
- Changed the default app theme preference from System to Light.
- Reworked splash shine into a full-screen sweep behind the logo and wordmark.
- Added profile edit flow with selectable currency.
- Kept the AI floating button hidden when AI is disabled and visible when AI Chat is enabled in Settings.
- Moved People record/settle workflows into modals for a more compact main Friends tab.
- Refined Add Transaction into an amount-first compact sheet layout.

## 0.1.5 - web-2026.09.05.5

Date: 2026-09-05

- Fixed splash logo/wordmark theme selection when the app follows the device theme.
- Added animated splash sheen using the app logo and wordmark assets.
- Rebuilt Insights into summary, daily spending, account balance, top categories, budgets, and filtered export sections.
- Reworked People so friend creation opens in a modal and the primary tab focuses on balance, friends, and open records.
- Refined Profile & Settings cards and wrapped long account values to prevent mobile overflow.

## 0.1.4 - web-2026.09.05.4

Date: 2026-09-05

- Expanded the screenshot-inspired UI pass to Calendar, Manage, Settings, AI Assistant, and shared transaction rows.
- Added System theme mode so the app can follow the device/browser preference.
- Added a copy icon action for the profile connection code.
- Reworked the available balance card shine into a moving sheen instead of a static diagonal shape.

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
