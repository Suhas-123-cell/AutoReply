# EC2 and Cloudflare deployment

Use the Nginx stack in [`deploy/`](../deploy/README.md) for a VM deployment.
The root `docker-compose.prod.yml` is a separate Caddy-based option; run only
one stack for a given domain.

1. Provision an EC2 VM with Docker Compose and Nginx. Keep Postgres and Redis
   private to the Compose network, allow HTTPS from Cloudflare, and keep SSH
   restricted. Back up the Postgres volume before updates.
2. Create a proxied Cloudflare A record for the public domain. Set SSL/TLS to
   **Full (strict)**, install a Cloudflare Origin Certificate on the VM, and
   bypass caching for `/api/*` and `/r/*`.
3. Install [`deploy/nginx/autoreply.conf`](../deploy/nginx/autoreply.conf),
   replace `REPLACE_WITH_DOMAIN`, and install the included
   [`cloudflare-real-ip.conf`](../deploy/nginx/cloudflare-real-ip.conf).
   Refresh its ranges from [Cloudflare's published IP list](https://www.cloudflare.com/ips/)
   when needed. Run `nginx -t` before reloading.
4. Copy `.env.example` to a protected `.env` on the VM. Set database, Redis,
   Auth.js, encryption, Meta, email, Firebase, and OAuth values as described
   in [setup](./SETUP.md). Set `NEXTAUTH_URL=https://<domain>` and register
   `https://<domain>/api/instagram/callback` with Meta. Set private
   `POSTGRES_PASSWORD` and `REDIS_PASSWORD` values for Compose. Never commit
   `.env` or native service configuration files.
5. From the repository root, start the API, migration job, worker, Postgres,
   and Redis:

   ```sh
   docker compose --env-file .env -f deploy/docker-compose.prod.yml up -d --build
   ```

6. Install [`deploy/cron/crontab.example`](../deploy/cron/crontab.example)
   for a dedicated service user, with `API_BASE_URL=https://<domain>` and
   `CRON_SECRET` kept in that user's protected crontab. The three jobs run at
   05:00, 06:00, and 07:00 UTC. Use a single scheduler.
7. Verify `https://<domain>/api/health`, the cron job responses, a real sign-in,
   a connected Instagram account, and a test DM. The health endpoint checks
   application dependencies; `/` is the public landing page.

For store review, set `DEMO_REVIEWER_EMAIL` to a dedicated inbox and run
`npm run db:seed-demo` against the review database. The seed creates sample
campaigns and DM activity, with paused connections. A real Instagram account
must be connected separately to demonstrate inbox and live delivery.

## Manual release items

- Download real `google-services.json` and `GoogleService-Info.plist` from
  Firebase, add the plist to the iOS target, and upload the APNs key to
  Firebase. Check push on physical devices.
- Generate and protect the Android upload keystore, configure the four
  `MYAPP_UPLOAD_*` signing values, and register release SHA-1 fingerprints
  for Google sign-in.
- Enable Sign in with Apple for `com.autoreply.app` in the Apple Developer
  portal and signing profile. Test it in a signed iOS build.
- Complete Meta App Review and configure the production webhook subscriptions
  and redirect URI.
- Prepare Play Console and App Store Connect listings, screenshots, privacy
  disclosures, and a review account with a working OTP inbox.

The native builds, push delivery, external OAuth, Meta review, and store
submissions require account credentials and physical devices outside this
repository. See [setup](./SETUP.md) for exact file locations and commands.
