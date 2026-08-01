# Store listing copy (draft)

## App name

OpenReply

## Subtitle / short description (App Store: 30 chars, Play: 80 chars)

Instagram comment-to-DM automation

## Full description

Someone comments a keyword on your Instagram reel, and they get a DM with
your link a few seconds later. That's the whole idea.

OpenReply watches the comments on your Instagram posts, and when a comment
matches a keyword you set, it sends that person a private reply through the
official Meta API — no scraping, no browser automation, no Instagram
password required.

**Features**

- Keyword-to-DM automation, with a live preview as you build it
- Optional public reply posted under the comment
- Tracked links with click analytics per campaign
- Follow-gating: only reveal the link after someone follows you
- Multiple Instagram accounts under one workspace
- A real inbox — read and reply to Instagram DMs from the app
- Push notifications for new leads and failed sends
- Biometric app lock to protect customer conversations
- Offline-cached dashboard so your numbers are there even without signal

OpenReply runs on your own infrastructure. There are no seat limits and no
plan caps — connect as many Instagram accounts as you manage.

## Keywords (App Store, comma-separated, 100 char limit)

instagram,dm,automation,comment,reply,creator,agency,social media,leads,giveaway

## Category

Business / Productivity (primary), Social Networking (secondary)

## Privacy label summary (also in `mobile/REVIEWER_NOTES.md`)

**App Store privacy labels**

| Data type | Linked to identity | Purpose |
|---|---|---|
| Email address | Yes | App Functionality (sign-in) |
| User content (comments, DM text) | Yes | App Functionality only |
| Identifiers (push token) | Yes | App Functionality (notifications) |
| Diagnostics | No | App Functionality (troubleshooting) |

**Tracking**: No — this app does not track users across other companies' apps
or websites.

**Play Data Safety** (equivalent breakdown): Personal info (email) collected,
not shared with third parties, encrypted in transit, users can request
deletion in-app (Settings → Account → Delete Account).

## Screenshots needed (not generated here — no image tooling in this pass)

Take these from a **seeded demo workspace with realistic data**, not an empty
account — an empty-state screenshot reads as an unfinished app to both
reviewers and prospective users:

1. Dashboard — stat tiles + 7-day chart with real numbers
2. Campaigns list — 3-4 campaigns with different analytics
3. Campaign detail — performance + tracked link
4. Inbox — a conversation thread with a couple of exchanged messages
5. A push notification banner (capture via a real device, can't be
   simulated in a static screenshot tool)

Required sizes: iOS 6.7" and 6.5" displays (do not also claim iPad support
for v1 — `supportsTablet: false` is already set in `app.config.js`); Android
phone screenshots + a 1024×500 feature graphic.
