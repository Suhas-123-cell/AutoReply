<div align="center">

# AutoReply

Open-source Instagram + Telegram comment-to-DM automation, for the mobile app only — no web dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React_Native-0.81-black.svg)](https://reactnative.dev)

</div>

Someone comments `LINK` on your reel, and they get a DM with your link a second later. AutoReply watches the comments on your Instagram posts (and, separately, messages sent to your Telegram bot), and when a comment or message matches a keyword you set, it sends a private reply through the official Meta API or the Telegram Bot API. You can also post a public reply under the Instagram comment at the same time.

There is no web dashboard. Everything — sign-in, campaigns, inbox, activity, team management — happens in the iOS/Android app in `mobile/`. The Next.js app in the repo root is an API-only backend the mobile app talks to; it has no pages of its own.

## Why this exists

Comment-to-DM is one feature, but every tool that offers it wants a recurring subscription for it. The actual work is a webhook, a keyword match, and one API call to Meta or Telegram. That does not need to cost anything to run for a single account — and it doesn't have to run through a web browser either.

AutoReply is built around Meta's official Instagram private replies and Telegram's official Bot API. It does not scrape, it does not automate a browser, and it never asks for an Instagram password. That keeps your account inside each platform's rules.

## Features

- Keyword to DM, on Instagram or Telegram. Match one or many keywords, whole-word or partial.
- Optional public reply on Instagram. Post a visible comment reply on top of the DM.
- Telegram bots, zero gate. Connect a `@BotFather` token and you're live in about two minutes — no Meta App Review wait.
- Tracked links. Swap a link for a tracked redirect and see clicks and CTR per campaign.
- Two link buttons. Send up to two tappable link buttons in one DM, each a separate tracked link with its own click stats.
- Follow gate (Instagram). Optionally require a follow before you hand over the link, checked against Meta's `is_user_follow_business` flag. Fails open (sends the link anyway) if Instagram doesn't return follow status, so a real follower is never trapped.
- Personalization. Use `{username}` in your message to greet the commenter by name.
- Per-account rate limiting. Stays under Meta's documented cap of 750 private replies per hour, queuing the overflow instead of dropping it.
- Multiple accounts, Instagram and Telegram both. Connect several under one workspace, each with its own limits.
- Workspaces, roles, and per-account permissions. Owner, admin, and member roles with invite links; an owner or admin can additionally scope a MEMBER to only the specific client accounts they're supposed to see — useful if you run this for an agency's multiple clients.
- Campaign cloning. Reuse one client's automation setup on another without rebuilding it by hand.
- Campaign templates. Start from a preset instead of a blank form.
- Inbox. Read your Instagram DM conversations and reply from the app, inside Meta's 24-hour messaging window.
- Activity log. Every send, skip, and failure is logged with a reason and filterable status.
- Self-comment filtering. Your own comments never trigger a reply.
- Optional billing. Self-hosted by default with no usage caps at all — set a few `STRIPE_*` env vars if you want to run this as a paid hosted product with Free/Starter/Agency plan tiers instead. See `lib/billing/plans.ts`.

## How it works

1. Someone comments on your Instagram post/reel, or messages your Telegram bot.
2. Meta or Telegram sends a webhook to your AutoReply backend.
3. The backend checks the message against your active campaigns.
4. On a keyword match, it queues a job.
5. A background worker sends the private reply (and the public reply on Instagram, if enabled).

The Next.js app receives the webhook and serves the API the mobile app calls — it has no dashboard, no login page, nothing a browser is meant to visit. A separate worker process does the sending, because it has to survive rate limits and retries. Both talk to the same Postgres and Redis.

## Quick start

You need a few free accounts before anything works: a Meta developer app (Instagram), and/or a Telegram bot from `@BotFather`, plus somewhere to host the backend and worker (Postgres + Redis required). Every variable, with comments on where to get it, is in [.env.example](.env.example) and [mobile/.env.example](mobile/.env.example).

### Run the backend locally

```bash
git clone https://github.com/Suhas-123-cell/AutoReply.git
cd AutoReply
npm install
cp .env.example .env      # then fill in the values — see the comments in that file
docker-compose up -d      # starts Postgres and Redis
npm run db:migrate
npm run dev               # API on http://localhost:3000 (no pages to visit)
npm run worker            # in a second terminal, this sends the DMs
```

Two processes, always. `npm run dev` receives webhooks and serves the API. `npm run worker` is what actually sends the messages. If comments come in and no DM ever arrives, the worker is the first thing to check.

### Run the mobile app

```bash
cd mobile
npm install
cp .env.example .env      # set API_BASE_URL to your backend above
npx react-native run-ios      # or run-android
```

See [.env.example](.env.example) and [mobile/.env.example](mobile/.env.example) for the full list of environment variables, with comments on where to get each one — or [docs/SETUP.md](docs/SETUP.md) for the same thing as a step-by-step reference (Google OAuth clients, Stripe products, etc.).

## Tech stack

- Next.js 16 and React 19 for the API-only backend
- React Native 0.81 (bare workflow, no Expo) for iOS + Android
- Prisma 7 with PostgreSQL
- BullMQ on Redis for the send queue and the worker
- Google Sign-In, Instagram OAuth, and email one-time codes for mobile sign-in
- The official Instagram API (Instagram Login) and the Telegram Bot API
- Stripe (optional) for the hosted-billing tier


## Contributing

Issues and pull requests are welcome. If you hit a Meta or Telegram quirk that isn't in the setup guide, a PR that documents it is worth as much as a code fix. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Credits

AutoReply (originally OpenReply) is a fork of [instagram-comment-to-dm](https://github.com/im-anishraj/instagram-comment-to-dm) by [Anish Raj](https://github.com/im-anishraj), MIT licensed. This fork rebuilt it around a mobile app instead of a web dashboard, added Telegram support, per-account permissions, and campaign cloning for agencies, and made billing an optional opt-in layer rather than removing it outright.

## License

MIT. See [LICENSE](LICENSE).
