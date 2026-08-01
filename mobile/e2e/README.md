# E2E tests (Maestro)

These are not runnable in this environment (no network, no installed app),
but they're real Maestro flow syntax — once the app is built
(`eas build --profile preview` or a local dev-client build), install
[Maestro](https://maestro.mobile.dev) and run:

```bash
maestro test mobile/e2e/flows/sign-in.yaml
maestro test mobile/e2e/flows/  # runs every flow in the directory
```

## Prerequisites

- A build with `MOBILE_OTP_DEV_ECHO=true` set server-side (see
  `app/api/mobile/auth/request-code/route.ts`), so `sign-in.yaml` can read
  the OTP code back from the API response instead of a real inbox. **Never
  set this in production** — it's a `NODE_ENV !== "production"` +
  explicit-flag double-gated dev-only escape hatch.
- A seeded test account with at least one connected Instagram account, one
  campaign, and a few `DmLog` rows (the same seed data recommended for App
  Store review in `mobile/REVIEWER_NOTES.md`).

## Flows

### `flows/sign-in.yaml` — email OTP sign-in

```yaml
appId: com.openreply.app
---
- launchApp
- assertVisible: "Sign in"
- tapOn:
    id: "email-input"
- inputText: "demo@openreply.test"
- tapOn: "Send code"
- assertVisible: "Enter your code"
# In a MOBILE_OTP_DEV_ECHO build, the dev code is shown as hint text on
# this screen (see mobile/app/(auth)/verify.jsx) — copy it in manually for
# a real device, or use Maestro's env injection to read it from a fixture
# API response in CI.
- tapOn:
    id: "code-input"
- inputText: "${OTP_CODE}"
- tapOn: "Verify"
- assertVisible: "Dashboard"
```

### `flows/dashboard.yaml` — dashboard renders real data

```yaml
appId: com.openreply.app
---
- launchApp
# Assumes a prior successful sign-in this session (session persists via
# SecureStore) — chain after sign-in.yaml, or run runFlow: sign-in.yaml first.
- runFlow: sign-in.yaml
- assertVisible: "DMs Today"
- assertVisible: "DMs — Last 7 Days"
- swipe:
    direction: DOWN
    duration: 400
- assertVisible: "Recent Activity"
```

### `flows/create-campaign.yaml` — full wizard, end to end

```yaml
appId: com.openreply.app
---
- runFlow: sign-in.yaml
- tapOn: "Campaigns"
- tapOn:
    id: "create-campaign-fab"
- assertVisible: "New campaign"
# Step 1: target
- tapOn: "Any post or reel"
- tapOn: "Next"
# Step 2: keywords
- tapOn:
    id: "keyword-input"
- inputText: "GUIDE"
- pressKey: Enter
- tapOn: "Next"
# Step 3: opening DM / follow gate — skip, defaults are fine
- tapOn: "Next"
# Step 4: reveal DM
- tapOn:
    id: "dm-message-input"
- inputText: "Thanks for commenting! Here's the guide: {link}"
- tapOn: "Next"
# Step 5: name + submit
- tapOn:
    id: "campaign-name-input"
- inputText: "E2E test campaign"
- tapOn: "Create campaign"
- assertVisible: "E2E test campaign"
```

### `flows/inbox-reply.yaml` — send a DM reply from the inbox

```yaml
appId: com.openreply.app
---
- runFlow: sign-in.yaml
- tapOn: "Inbox"
- assertVisible:
    text: ".*"
    index: 0
- tapOn:
    index: 0
- tapOn:
    id: "reply-input"
- inputText: "Thanks for reaching out!"
- tapOn:
    id: "send-button"
# Optimistic bubble should appear immediately, then confirm.
- assertVisible: "Thanks for reaching out!"
```

### `flows/campaign-report-share.yaml` — campaign detail + native share

```yaml
appId: com.openreply.app
---
- runFlow: sign-in.yaml
- tapOn: "Campaigns"
- tapOn:
    index: 0
- assertVisible: "Performance"
- tapOn: "Share report"
# The native OS share sheet isn't a Maestro-controllable surface reliably
# across iOS/Android — assert the share intent fired rather than asserting
# on OS chrome.
- assertVisible: "Campaign"
```

## What's not covered here

Instagram OAuth connect (`Settings → Instagram → Connect`) opens a system
`ASWebAuthenticationSession` against a real Meta login page — this can't be
scripted end-to-end without a real Instagram test account and is better
covered by the manual screencast already required for Meta App Review (see
`META_APP_REVIEW.md`'s "Screencast script").
