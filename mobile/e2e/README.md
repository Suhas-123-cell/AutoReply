# Mobile end-to-end checks

This repository does not currently contain runnable Maestro flows. The native
app is built with React Native CLI. Build and install it with
`cd mobile && npm run ios` or `cd mobile && npm run android` after completing
the native configuration in `docs/SETUP.md`.

Before store submission, check these paths on physical devices:

1. Sign in with email OTP, Google, and Sign in with Apple on iOS.
2. Open a workspace seeded with `DEMO_REVIEWER_EMAIL=... npm run db:seed-demo`
   and confirm the dashboard, campaigns, and activity show sample data.
3. Connect a real Instagram professional account and confirm inbox messages,
   campaign delivery, and push notifications against that account.
4. Create a campaign, open its report, and use the native share action.

The demo seed does not create a live Instagram connection or inbox messages.
`MOBILE_OTP_DEV_ECHO` may help local development, but must stay unset in
production and reviewer builds.
