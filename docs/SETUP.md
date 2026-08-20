# Setup & API keys

Companion to the inline comments in [`.env.example`](../.env.example) and
[`mobile/.env.example`](../mobile/.env.example) — this is the "where do I
actually get this value" reference. Run steps are in the main
[README](../README.md#quick-start); this file is just the env vars.

## Backend — `.env`

| Variable | Required? | Source |
|---|---|---|
| `NEXTAUTH_URL` | Yes | Your backend's base URL (`http://localhost:3099` locally) |
| `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `MOBILE_OTP_SECRET` | Yes | Generate with `openssl rand -base64 32` |
| `DATABASE_URL` | Yes | Your Postgres connection string |
| `REDIS_URL` | Yes | Your Redis connection string |
| `RESEND_API_KEY`, `EMAIL_FROM` | Yes | [resend.com](https://resend.com) — email magic-links + mobile email codes |
| `META_GRAPH_API_VERSION`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN` | Yes | [Meta developer app](https://developers.facebook.com/apps) → App settings / Webhooks. `WEBHOOK_VERIFY_TOKEN` is any string you choose — set the same value in Meta's webhook config. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Firebase console → Project settings → Service accounts → Generate new private key (paste the whole JSON as one line) |
| `MOBILE_OTP_DEV_ECHO` | Dev only | `true` locally so sign-in codes echo back in the API response instead of needing real email delivery. **Must be unset in production.** |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` | For Google Sign-In | See [Google OAuth clients](#google-oauth-clients) below |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_AGENCY` | Optional | See [Stripe billing](#stripe-billing-optional) below — self-hosted works fine with none of these set |

## Mobile — `mobile/.env`

| Variable | Source |
|---|---|
| `API_BASE_URL` | Your backend's URL, reachable from the device/simulator (e.g. `http://localhost:3099` for a local iOS simulator; an emulator or real device needs your LAN IP or a tunnel) |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` | Same values as the backend's, see below — must match |

## Google OAuth clients

[Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials → Create Credentials → OAuth client ID**. Three separate clients, one per platform:

1. **Web application** → `GOOGLE_WEB_CLIENT_ID` (backend `.env` + `mobile/.env`). No redirect URI needed — used only to verify ID tokens server-side.
2. **iOS** → bundle ID `com.autoreply.app` → `GOOGLE_IOS_CLIENT_ID` (backend `.env` + `mobile/.env`).
3. **Android** → package `com.autoreply.app` + your debug keystore's SHA-1 (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`) → `GOOGLE_ANDROID_CLIENT_ID` (backend `.env` only). A release build signed with a different keystore needs its own client registered with that keystore's SHA-1.

## Stripe billing (optional)

Entirely opt-in — leave `STRIPE_SECRET_KEY` unset for a self-hosted deployment with no plan caps. To turn on billing:

1. [dashboard.stripe.com](https://dashboard.stripe.com) → toggle **Test mode** while developing.
2. **Developers → API keys** → Secret key → `STRIPE_SECRET_KEY`.
3. **Product catalog → Add product**, create two recurring monthly prices matching [`lib/billing/plans.ts`](../lib/billing/plans.ts) (Starter $19/mo, Agency $99/mo). Copy each **Price ID** (`price_...`, not the `prod_...` Product ID) → `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_AGENCY`.
4. Webhook secret — two different values depending on where you are:
   - Local dev: `stripe listen --forward-to localhost:3099/api/webhook/stripe` prints a `whsec_...`.
   - Production: **Developers → Webhooks → Add endpoint** (`https://your-domain/api/webhook/stripe`) gives a separate, persistent `whsec_...`.
