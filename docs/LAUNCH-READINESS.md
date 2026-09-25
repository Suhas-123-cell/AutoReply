# AutoReply launch readiness

Updated: 14 September 2026

## Release decision

Ship this as a **small private beta**, not as a paid public launch yet. The product is technically credible enough to put in the hands of real creators and small agencies. It still needs external approvals, device testing, and evidence that users will pay. Those items cannot be completed in source code.

The first release should recruit 5 to 10 hands-on pilot customers who already use Instagram comments to distribute a link, booking page, menu, guide, or lead magnet. Ask each pilot to run one real campaign for at least seven days. Do not buy ads until at least three pilots complete a campaign and one agrees to pay.

## Completed in the product

- Comment, DM, Story-reply, next-post, any-post, and specific-post campaign targeting.
- Shared deterministic jobs and polling reconciliation to reduce missed or duplicate comment processing.
- A 24-hour interaction-window guard for DM and postback replies and a seven-day private-reply guard for comments.
- Message-level and workspace-level usage controls, private-reply rate limiting, retries, and delivery deduplication.
- Honest delivery analytics that exclude opening and follow-prompt messages from delivered-offer counts.
- Link-preview filtering, tracked redirects that still work if analytics storage fails, and uncapped clicks-per-delivery reporting.
- Manual qualified-lead, booking, and sale outcomes plus native report sharing.
- Owner, admin, editor, and viewer roles with explicit invitations and per-account scopes.
- Safe campaign cloning and JSON import/export. Cross-account copies and all imports start paused.
- Campaign templates connected to the native creation wizard.
- Offline dashboard persistence without storing customer names, comments, or account handles in the query cache.
- Stripe checkout and webhook hardening for web/direct distribution, including duplicate-subscription and stale-event guards.
- Store builds default to external mobile checkout disabled.
- Public beta page, legal routes, account deletion, reviewer notes, and draft store listing.
- A direct in-app feedback action.

## Must be completed before store submission

- Replace every placeholder domain, operator name, contact address, OAuth client ID, Firebase key, Stripe key, and secret in the production environment.
- Publish the privacy, terms, data-deletion, and product URLs on the final HTTPS domain.
- Complete Meta App Review for every permission the app uses, subscribe the required webhook fields, and test with a non-admin Instagram professional account.
- Configure a real reviewer workspace and login. It must contain realistic campaigns and activity, and its connected Instagram account must remain available throughout review.
- Run the database migration in `prisma/migrations/20260913180000_launch_readiness/migration.sql` against staging, verify rollback/recovery from a backup, and then deploy it to production.
- Test comment, DM, Story reply, opening message, follower check, public reply, link click, invitation, account deletion, and expired-token recovery on physical iOS and Android devices.
- Exercise worker shutdown/restart and a Redis/Postgres interruption in staging. Confirm queued jobs recover without duplicate deliveries.
- Produce the final app icon, splash assets, phone screenshots, Android feature graphic, support URL, privacy answers, content rating, and review notes.
- Remove placeholder support addresses from both backend and mobile production builds.
- Decide how hosted subscriptions will be sold in each storefront. Do not enable `MOBILE_STORE_BILLING_ENABLED` until that path has passed store review.

## Billing rule that affects this app

AutoReply sells cloud software and unlocks app functionality. Apple says apps that unlock features or functionality must use In-App Purchase, while its free stand-alone companion exception applies only when the app contains no purchase flow or call to purchase elsewhere. Google Play similarly requires Play Billing for paid access to app features and cloud software unless the developer enrolls in an applicable alternative-billing or external-link program.

For the first store build, keep the app free and remove purchase calls to action inside the app. Existing paid web customers may sign in and use their plan. The current mobile billing gate implements that conservative release mode. If you want customers to upgrade inside the app, implement StoreKit and Google Play Billing with server-side entitlement synchronization, or enroll in and comply with a program that applies to every target country.

Official references:

- [Apple App Review Guidelines, sections 2.1 and 3.1](https://developer.apple.com/app-store/review/guidelines/)
- [Apple In-App Purchase](https://developer.apple.com/in-app-purchase/)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- [Google Play payments policy explanation](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)

## Developer account timing

Google Play registration is a reasonable next expense once the Android build passes the physical-device checklist; Google documents a US$25 registration fee. Use its internal or closed track for the pilot.

Apple enrollment costs US$99 per membership year. Enroll when the iOS build works on a physical device and at least a few target customers want iOS/TestFlight access. Paying earlier does not validate demand, and membership time starts before the product has proven it can retain anyone.

Official references:

- [Apple Developer Program](https://developer.apple.com/programs/)
- [Google Play developer account registration fee reference](https://support.google.com/googleplay/android-developer/answer/6230247?hl=en)

## Evidence required for a paid public launch

Use one funnel and record the numbers instead of relying on compliments:

1. Recruit 10 qualified pilots.
2. Get at least 7 to connect Instagram successfully.
3. Get at least 5 to activate a real campaign.
4. Get at least 3 to keep a campaign active for seven days.
5. Get at least 2 to report a qualified lead, booking, or sale.
6. Ask for payment. One or more customers paying $19 without a custom-development promise is the minimum useful signal.

If activation fails, improve onboarding and Meta setup. If campaigns run but create no outcomes, the targeting or customer segment is weak. If outcomes happen but nobody pays, the product is useful but the price, frequency, or target customer is wrong.

## Go/no-go gates

**Private beta:** Go after the deployment and device checklist is complete.

**Store submission:** Go after reviewer access, production legal/support details, Meta approval, physical-device tests, and the billing decision are complete.

**Paid public advertising:** Wait for at least one independent paying customer and three seven-day retained pilots.
