# Production credentials and environment setup

This guide maps the placeholders in [`.env.example`](../.env.example) and
[`mobile/.env.example`](../mobile/.env.example) to their sources. Never paste a
real credential into a ticket, chat, screenshot, Git commit, or mobile app.

## 1. Use the final domain first

Buy or use a domain you control and create an `A` record pointing at the
server's Elastic IP. A typical layout is:

```dotenv
DOMAIN=app.example.com
```

`DOMAIN` contains only the hostname: no `https://`, path, or trailing slash.
The production Compose file derives `NEXTAUTH_URL`, `DATABASE_URL`, and
`REDIS_URL`, so their localhost values in `.env.example` are not production
values to copy manually.

The domain determines these provider settings:

- Instagram OAuth redirect: `https://app.example.com/api/instagram/callback`
- Instagram webhook callback: `https://app.example.com/api/webhook`
- Stripe webhook endpoint: `https://app.example.com/api/webhook/stripe`
- Mobile `API_BASE_URL`: `https://app.example.com`

## 2. Server-generated secrets

These values do not come from a provider. Generate each independently and
keep the values already deployed unless a rotation is planned. Changing
`ENCRYPTION_KEY` makes stored Instagram access tokens unreadable; changing
database or Redis passwords only in `.env` will break access to the existing
services.

```sh
openssl rand -hex 32
```

Run that command separately for `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `WEBHOOK_VERIFY_TOKEN`, and
`MOBILE_OTP_SECRET`. A 32-byte hex result is 64 characters and is valid for
`ENCRYPTION_KEY`.

## 3. Resend email

1. Create a Resend account and open **Domains**.
2. Add a sending subdomain such as `mail.example.com`.
3. Add the SPF and DKIM records Resend shows to the domain's DNS provider.
4. Wait until the domain is marked verified.
5. Open **API Keys**, create a production key with **Sending access**, and
   restrict it to the verified domain.
6. Store the resulting `re_...` token as `RESEND_API_KEY`. It is shown only
   once.
7. Set `EMAIL_FROM` to a sender on the verified domain.

```dotenv
RESEND_API_KEY=re_REPLACE_ME
EMAIL_FROM="AutoReply <login@mail.example.com>"
```

This one integration sends web magic links and mobile email sign-in codes.
Phone sign-in is not currently wired to an SMS provider and is intentionally
absent from the production mobile UI.

## 4. Meta and Instagram

1. Create a Meta developer app and add **API setup with Instagram login**.
2. In that Instagram setup, copy the Instagram App ID and Instagram App
   Secret to `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.
3. In **App settings > Basic**, copy the Meta app secret to
   `FACEBOOK_APP_SECRET`. If the dashboard exposes only one app secret for the
   chosen setup, use that same secret in both secret variables.
4. Add the exact OAuth redirect URI shown in section 1.
5. Configure the webhook callback from section 1 and enter the exact value you
   generated for `WEBHOOK_VERIFY_TOKEN`.
6. Subscribe the Instagram webhook to `comments` and `messages`.
7. Request Advanced Access/App Review for the permissions used by this app:
   `instagram_business_basic`, `instagram_business_manage_messages`,
   `instagram_business_manage_comments`, and
   `instagram_business_manage_insights`.
8. Complete Meta business verification and move the app to Live before
   onboarding customers who are not app testers.

```dotenv
META_GRAPH_API_VERSION=v25.0
INSTAGRAM_APP_ID=REPLACE_ME
INSTAGRAM_APP_SECRET=REPLACE_ME
FACEBOOK_APP_SECRET=REPLACE_ME
WEBHOOK_VERIFY_TOKEN=REPLACE_WITH_GENERATED_VALUE
```

Keep the Graph version supported by the app and selected in Meta. Test the
complete connect, comment trigger, and DM delivery flow using a professional
Instagram test account before submitting App Review.

## 5. Firebase push notifications

The backend credential and native mobile configuration are separate.

1. Create a Firebase project.
2. In **Project settings > Service accounts**, choose **Generate new private
   key**. Store the downloaded JSON securely.
3. Convert that entire JSON object to one line and store it as
   `FIREBASE_SERVICE_ACCOUNT_JSON`. Preserve the JSON `\n` escapes inside
   `private_key`.
4. Register an Android app with package `com.autoreply.app`; download
   `google-services.json` and place it at
   `mobile/android/app/google-services.json`.
5. Register an iOS app with bundle ID `com.autoreply.app`; download
   `GoogleService-Info.plist`, add it to the AutoReply target through Xcode,
   and ensure **Copy items if needed** is selected.
6. For iOS delivery, upload an APNs authentication key in Firebase
   **Project settings > Cloud Messaging**.

```dotenv
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

The service-account JSON is a server secret. The Android and iOS configuration
files belong in native build configuration, never in the server `.env`.

## 6. Google Sign-In

Use one Google Cloud project and configure its OAuth branding and audience.
Create three OAuth clients under **Google Auth Platform > Clients**:

1. **Web application**: copy the client ID to `GOOGLE_WEB_CLIENT_ID`. This is
   the server client ID used as the ID-token audience; no client secret is
   required by this project.
2. **iOS**: bundle ID `com.autoreply.app`; copy its ID to
   `GOOGLE_IOS_CLIENT_ID`.
3. **Android**: package `com.autoreply.app` plus the SHA-1 of the certificate
   signing that build; copy its ID to `GOOGLE_ANDROID_CLIENT_ID`. Production
   builds using Google Play App Signing must register the SHA-1 shown in Play
   Console under **App integrity**.

```dotenv
GOOGLE_WEB_CLIENT_ID=REPLACE_ME.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=REPLACE_ME.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=REPLACE_ME.apps.googleusercontent.com
```

The web and iOS client IDs must also be placed in `mobile/.env`. Publish the
Google OAuth consent configuration before allowing users outside its test-user
list.

## 7. Stripe subscriptions

Use Stripe test mode until the full billing flow passes, then repeat the
configuration in live mode. Test and live keys, products, prices, and webhook
secrets are different.

1. Finish Stripe account activation, business details, bank account, tax, and
   identity requirements.
2. Under **Product catalog**, create a recurring monthly Starter price at
   USD 19 and an Agency price at USD 99.
3. Copy the `price_...` IDs, not the `prod_...` product IDs.
4. Under **Developers > API keys**, copy the server secret key. Production
   uses `sk_live_...`; test mode uses `sk_test_...`.
5. Under **Developers > Webhooks**, add the endpoint from section 1 and select:
   `checkout.session.completed`, `customer.subscription.updated`, and
   `customer.subscription.deleted`.
6. Reveal that endpoint's signing secret and store the `whsec_...` value.

```dotenv
STRIPE_SECRET_KEY=sk_live_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_ID_STARTER=price_REPLACE_ME
STRIPE_PRICE_ID_AGENCY=price_REPLACE_ME
MOBILE_STORE_BILLING_ENABLED=false
```

Keep `MOBILE_STORE_BILLING_ENABLED=false` for App Store and Play Store builds
until native in-app subscriptions are implemented and approved. Stripe web
checkout can be tested separately.

## 8. Legal and mobile public configuration

These are public values, not keys:

```dotenv
LEGAL_OPERATOR_NAME="Your legal name or registered business"
LEGAL_CONTACT_EMAIL=support@example.com
MOBILE_OTP_DEV_ECHO=false
```

The mobile build needs its own gitignored `mobile/.env`:

```dotenv
API_BASE_URL=https://app.example.com
GOOGLE_WEB_CLIENT_ID=REPLACE_ME.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=REPLACE_ME.apps.googleusercontent.com
SUPPORT_EMAIL=support@example.com
```

## 9. Add values to the server without sharing them

SSH to the server, edit the existing file in place, and never paste its
contents into chat:

```sh
ssh -6 -i ~/.ssh/autoreply-ec2 ubuntu@64:ff9b::ffc:7008
cd /opt/autoreply
cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"
chmod 600 .env
nano .env
```

Save in nano with `Ctrl+O`, Enter, then `Ctrl+X`. Do not add spaces around
`=`. Keep the Firebase JSON on one physical line.

Apply provider-key changes without rebuilding the image:

```sh
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate api worker cron
docker compose -f docker-compose.prod.yml ps
curl -fsS https://app.example.com/api/health
```

If `DOMAIN` changed after its DNS record began resolving, also recreate Caddy:

```sh
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate caddy
```

Then test email sign-in, Google sign-in, Instagram OAuth and webhooks, push on
physical Android/iOS devices, and a complete Stripe test subscription and
cancellation before switching Stripe and Meta to live production access.
