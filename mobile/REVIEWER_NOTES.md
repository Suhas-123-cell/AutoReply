# App Store / Play Store reviewer notes

## What this app requires to be functional

OpenReply mobile requires a **connected Instagram Business or Creator account**
to show real data. A reviewer signing into a brand-new account will see empty
screens. Before submitting:

1. Seed a demo workspace with a few realistic campaigns and DM log entries
   across different statuses (sent, failed, skipped).
2. Connect a real (or sandbox) Instagram professional account to that demo
   workspace so every screen — Dashboard, Inbox, Overview, Campaigns — has
   something to render.
3. Provide the demo account's sign-in email in the App Store Connect /
   Play Console review notes so the reviewer can sign in with the OTP flow.

## Why this qualifies as a native app (Apple Guideline 4.2)

This is not a thin wrapper around the web dashboard — it's a separate,
Bearer-token-authenticated client with distinct native capabilities the web
app does not have:

- **Push notifications** for new leads, failed sends, and worker/token issues
  — nothing on the web dashboard does this today.
- **Biometric app lock** (opt-in, Face ID / Touch ID / fingerprint) protecting
  customer PII (DM contents, comments).
- **Offline-cached dashboard/activity** via a persisted TanStack Query cache
  — the last-seen data renders instantly, even offline.
- **Native share** for campaign report links.
- **Native list interactions**: pull-to-refresh, swipe actions, haptics.
- No `WebView` anywhere — the one OAuth step (connecting Instagram) uses a
  system `ASWebAuthenticationSession` / Android Custom Tab, not an embedded
  browser.

## Apple Guideline 5.1.1(v) — account deletion

In-app account deletion is implemented: **Settings → Account → Delete
account**, calling `DELETE /api/mobile/account`. It requires explicit
confirmation and blocks (with an explanatory message) if the account owns a
workspace with other members, so a deletion can't silently destroy a team's
shared data — the user is asked to transfer ownership first in that case.

## Data safety / privacy label summary

- **Email address** — linked to identity, used for sign-in (App Functionality).
- **User content** — displayed Instagram comments and DM text (App
  Functionality only, not shared or sold).
- **Identifiers** — device push token (App Functionality: delivering
  notifications).
- **Diagnostics** — crash/ops data for the account's own workspace.
- **Tracking**: No. This app does not track users across other apps or
  websites.
- **Biometric data**: never leaves the device. The app receives only a
  pass/fail result from the OS; it never has access to raw biometric data.

See `app/privacy/page.tsx` (web) for the full policy, updated alongside this
mobile release.
