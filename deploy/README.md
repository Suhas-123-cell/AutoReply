# EC2 deployment with Cloudflare and Nginx

1. Point a **proxied** Cloudflare A record at the EC2 public IP. Keep the API
   container bound to `127.0.0.1:3000` as in `docker-compose.prod.yml`.
2. Set Cloudflare SSL mode to **Full (strict)**. Install a Cloudflare Origin
   Certificate and private key on the VM at `/etc/ssl/autoreply/origin.pem` and
   `/etc/ssl/autoreply/origin.key` with restricted permissions.
3. Copy `nginx/autoreply.conf` to `/etc/nginx/sites-available/autoreply.conf`,
   replace `REPLACE_WITH_DOMAIN`, and enable it. Copy
   `nginx/cloudflare-real-ip.conf` to `/etc/nginx/cloudflare-real-ip.conf`.
   Refresh its CIDRs from [Cloudflare's published list](https://www.cloudflare.com/ips/)
   when they change. Run `nginx -t` before reloading Nginx.
4. Create a protected `.env` from `.env.example`. Set `NEXTAUTH_URL` to the
   public `https://<domain>` URL. Register Meta's redirect URI as
   `https://<domain>/api/instagram/callback`.
5. Start the API, worker, Postgres, and Redis from the repository root:

   ```sh
   docker compose --env-file .env -f deploy/docker-compose.prod.yml up -d --build
   ```

6. Add a Cloudflare cache-bypass rule for `/api/*` and `/r/*`. Check
   `https://<domain>/api/health` for database, Redis, queue, and worker status;
   the landing page at `/` is not a health check. Install the cron schedule in
   `cron/crontab.example` once for this stack.

The older root `docker-compose.prod.yml` remains available for its Caddy-based
single-server setup. Use one stack and one scheduler per deployment.
