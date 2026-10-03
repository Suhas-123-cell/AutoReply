# Setup & API keys

For the complete production sequence, exact callback URLs, native Firebase
files, and safe server update commands, see
[`PRODUCTION_ENV_SETUP.md`](./PRODUCTION_ENV_SETUP.md).

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
| `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL` | For App Review / store listing | Shown on `/privacy`, `/terms`, `/data-deletion`. Paste those three URLs into Meta's App Review form and the App Store / Play Console privacy fields. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Firebase console → Project settings → Service accounts → Generate new private key (paste the whole JSON as one line) |
| `MOBILE_OTP_DEV_ECHO` | Dev only | `true` locally so sign-in codes echo back in the API response instead of needing real email delivery. **Must be unset in production.** |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` | For Google Sign-In | See [Google OAuth clients](#google-oauth-clients) below |
| `APPLE_BUNDLE_ID` | For iOS Sign in with Apple | Set to the registered bundle ID `com.autoreply.app` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_AGENCY` | Optional | See [Stripe billing](#stripe-billing-optional) below — self-hosted works fine with none of these set |

## Meta webhook fields

In the Meta app dashboard → **Webhooks → Instagram**, subscribe to both `comments` and `messages`. `comments` drives post/reel campaigns; `messages` drives DM and Story-reply triggers plus the button taps used by opening DMs and follow gates. The backend subscribes each connected account to both fields automatically, but the app-level subscription has to exist first or Meta never delivers them.

## Mobile — `mobile/.env`

| Variable | Source |
|---|---|
| `API_BASE_URL` | Your backend's URL, reachable from the device/simulator (e.g. `http://localhost:3099` for a local iOS simulator; an emulator or real device needs your LAN IP or a tunnel) |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` | Same values as the backend's, see below — must match |

## Native Firebase configuration

Register Android package `com.autoreply.app` and iOS bundle ID
`com.autoreply.app` in the Firebase console. Download the actual Android
`google-services.json` to `mobile/android/app/google-services.json` and the
iOS `GoogleService-Info.plist` to `mobile/ios/AutoReply/GoogleService-Info.plist`.
The checked-in `.example` files only show the expected shape; do not rename
them into production configuration. Add the iOS plist to the AutoReply Xcode
target's Copy Bundle Resources phase. These real config files are gitignored.

For iOS push delivery, upload an APNs authentication key in Firebase Console
under Project settings → Cloud Messaging. Test registration and a delivered
notification on physical iOS and Android devices after configuring Firebase.

## Required phone verification

Every account must verify a phone number before it can access workspaces,
campaigns, integrations, or notifications. Email, Google, Apple, and Instagram
sign-ins create a pending account until this step is complete. Each verified
number belongs to one AutoReply account; using another email cannot claim the
same number. Later sign-ins to that account do not request another SMS.

Firebase Authentication delivers and validates the SMS code. Enable the
**Phone** provider in Firebase Console → Authentication → Sign-in method,
configure billing and permitted SMS regions for your users, and keep the
backend service account and both native configuration files in the same
Firebase project. Resend continues to deliver email codes.

For Android, register the debug, upload, and Play App Signing SHA-1 and SHA-256
fingerprints in Firebase and download the updated `google-services.json`.
Firebase uses Play Integrity with a reCAPTCHA fallback to verify the app.

For iOS, enable Push Notifications and Background Modes (background fetch
and remote notifications), upload the APNs key, and set the AutoReply target's
`FIREBASE_RECAPTCHA_URL_SCHEME` build setting in **both Debug and Release** to
the **Encoded App ID** shown in Firebase Console → Project settings → your
iOS app. Its checked-in value is an explicit placeholder. The Info.plist URL
type and AppDelegate already route Firebase's reCAPTCHA callback. Confirm the
Firebase API key allows the project's `firebaseapp.com` auth domain.

Run `cd mobile/ios && pod install` after installing dependencies. Test SMS on
physical Android and iOS devices, including the iOS reCAPTCHA fallback with
Background App Refresh disabled. Test that a new email is blocked until its
phone is verified, and that an existing phone cannot verify a second account.
Existing accounts must complete verification on their next app launch. Run
`npm run db:migrate` when deploying: the migration clears unproven phone
numbers and verification marks from the previous flow, which had no SMS
provider. Users must enter their number and verify it with Firebase.

Firebase's [phone auth setup](https://rnfirebase.io/auth/phone-auth) and
[Apple platform configuration](https://firebase.google.com/docs/auth/ios/phone-auth)
describe the provider settings. Firebase fictional test numbers are for a
separate development project; never configure them in the production project
or set `FIREBASE_AUTH_EMULATOR_HOST` on the production backend.

## Android signing

For local debug builds, generate the gitignored keystore if it is absent:

```sh
keytool -genkeypair -v -storetype JKS -keystore mobile/android/app/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android \
  -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
```

For store releases, generate a separate upload key and keep it outside the
repository:

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore ~/.android/autoreply-upload.keystore \
  -alias autoreply-upload -keyalg RSA -keysize 2048 -validity 10000
```

Put these values in your private `~/.gradle/gradle.properties` (or set them as
environment variables):

```properties
MYAPP_UPLOAD_STORE_FILE=/absolute/path/to/autoreply-upload.keystore
MYAPP_UPLOAD_STORE_PASSWORD=REPLACE_WITH_STORE_PASSWORD
MYAPP_UPLOAD_KEY_ALIAS=autoreply-upload
MYAPP_UPLOAD_KEY_PASSWORD=REPLACE_WITH_KEY_PASSWORD
```

Release builds use this key only when all four values are present; they never
fall back to the debug key. Register the upload certificate's SHA-1 as a new
Google Android OAuth client for `com.autoreply.app`. Also register the Google
Play App Signing certificate SHA-1 from Play Console after enrollment.

## Sign in with Apple

Enable **Sign in with Apple** for the `com.autoreply.app` App ID in the Apple
Developer portal and in the AutoReply target's Xcode Signing & Capabilities.
The entitlement is checked in, but the Apple Developer capability and signing
profile must be configured by the account owner. Set `APPLE_BUNDLE_ID` on the
backend to the same bundle ID. Test first sign-in, a returning sign-in, and
Hide My Email on a signed physical iOS build.

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

## Running on a VM (EC2)

The three daily routes need a scheduler outside Vercel. Install
[`deploy/cron/crontab.example`](../deploy/cron/crontab.example) for a dedicated
service user and set `API_BASE_URL` and `CRON_SECRET` in that user's protected
crontab. The [wrapper](../deploy/cron/autoreply-cron.sh) sends the bearer secret
and fails on HTTP errors. Its schedule matches `vercel.json`: token refresh at
05:00, next-post attachment at 06:00, and follower snapshots at 07:00 UTC.

The checked-in `docker-compose.prod.yml` already runs these calls in its `cron`
container. Use one scheduler for a deployment so the same route is not called
twice each day.
