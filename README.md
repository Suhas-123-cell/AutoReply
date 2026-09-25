<div align="center">

# AutoReply

Open-source Instagram + Telegram comment-to-DM automation with a native mobile operator app.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React_Native-0.81-black.svg)](https://reactnative.dev)

</div>

Someone comments `LINK` on your reel, and they get a DM with your link a second later. AutoReply watches the comments on your Instagram posts (and, separately, messages sent to your Telegram bot), and when a comment or message matches a keyword you set, it sends a private reply through the official Meta API or the Telegram Bot API. You can also post a public reply under the Instagram comment at the same time.

Campaign operations happen in the iOS/Android app in `mobile/`. The Next.js service provides the API, public product page, tracked redirects, billing return bridge, and required legal pages.

## Why this exists

Comment-to-DM is one feature, but every tool that offers it wants a recurring subscription for it. The actual work is a webhook, a keyword match, and one API call to Meta or Telegram. That does not need to cost anything to run for a single account — and it doesn't have to run through a web browser either.

AutoReply is built around Meta's official Instagram private replies and Telegram's official Bot API. It does not scrape, it does not automate a browser, and it never asks for an Instagram password. That keeps your account inside each platform's rules.

## Features

- Keyword to DM, on Instagram or Telegram. Match one or many keywords, whole-word or partial, with typo and plural tolerance.
- DM and Story-reply triggers. The same keywords also fire when someone DMs your account or replies to your Story (Instagram delivers Story replies as DMs), so "Reply LINK to this Story" works with no post involved. Turn it on per campaign, alone or alongside a post trigger. Subscribe to the `messages` webhook field in your Meta app.
- Optional follower check. When enabled, comments, DMs, and Story replies with unknown or negative follow status get a follow prompt; when disabled, the campaign delivers directly.
- Optional public reply on Instagram. Post a visible comment reply on top of the DM.
- Telegram bots, zero gate. Connect a `@BotFather` token and you're live in about two minutes — no Meta App Review wait.
- Tracked links. Swap a link for a tracked redirect and see clicks and CTR per campaign.
- Two link buttons. Send up to two tappable link buttons in one DM, each a separate tracked link with its own click stats.
- Follow gate. Optionally require a confirmed follow before handing over the link, checked against Meta's `is_user_follow_business` flag. Unknown status remains gated and can be rechecked from the prompt button.
- Personalization. Use `{username}` in your message to greet the commenter by name.
- Per-account rate limiting. Stays under Meta's documented cap of 750 private replies per hour, queuing the overflow instead of dropping it.
- Multiple accounts, Instagram and Telegram both. Connect several under one workspace, each with its own limits.
- Workspaces, roles, and per-account permissions. Owner, admin, editor, and viewer roles with explicit invite acceptance; managers can scope editors and viewers to specific client accounts.
- Campaign cloning. Reuse one client's automation setup on another without rebuilding it by hand.
- Campaign templates. Start with a goal, keywords, and DM copy for common creator, local-service, and agency workflows.
- Outcome tracking. Record qualified leads, bookings, and sales manually alongside delivered messages and link opens.
- Inbox. Read your Instagram DM conversations and reply from the app, inside Meta's 24-hour messaging window.
- Activity log. Every send, skip, and failure is logged with a reason and filterable status.
- Self-comment filtering. Your own comments never trigger a reply.
- Optional billing. Self-hosted deployments have no plan cap. Hosted deployments can enable Free (500 messages, one account), Starter (25,000 messages, two accounts), and Agency (250,000 messages, ten accounts). Store builds keep external checkout disabled until their native billing path or applicable program is approved.

## How it works

1. Someone comments on your Instagram post/reel, DMs you, replies to your Story, or messages your Telegram bot.
2. Meta or Telegram sends a webhook to your AutoReply backend.
3. The backend checks the message against your active campaigns.
4. On a keyword match, it queues a job.
5. A background worker sends the private reply (and the public reply on Instagram, if enabled).

The Next.js app receives webhooks, serves the mobile API and public product/legal pages, and records tracked-link opens. Set `LEGAL_OPERATOR_NAME` and `LEGAL_CONTACT_EMAIL` before deployment. A separate worker process sends replies so retries and rate limits survive web restarts. Both use the same Postgres and Redis services.

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
npm run dev               # API and product page on http://localhost:3000
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

- Next.js 16 and React 19 for the backend and public product/legal pages
- React Native 0.81 (bare workflow, no Expo) for iOS + Android
- Prisma 7 with PostgreSQL
- BullMQ on Redis for the send queue and the worker
- Google Sign-In, Instagram OAuth, and email one-time codes for mobile sign-in
- The official Instagram API (Instagram Login) and the Telegram Bot API
- Stripe (optional) for the hosted-billing tier

## Contributing

Issues and pull requests are welcome. If you hit a Meta or Telegram quirk that isn't in the setup guide, a PR that documents it is worth as much as a code fix. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Credits

AutoReply is a fork of [instagram-comment-to-dm](https://github.com/im-anishraj/instagram-comment-to-dm) by [Anish Raj](https://github.com/im-anishraj), MIT licensed. This fork rebuilt it around a mobile app instead of a web dashboard, added Telegram support, per-account permissions, and campaign cloning for agencies, and made billing an optional opt-in layer rather than removing it outright.

## License

MIT. See [LICENSE](LICENSE).
