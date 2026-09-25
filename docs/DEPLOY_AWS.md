# Deploy AutoReply on AWS EC2

The initial production deployment runs the API, worker, PostgreSQL, Redis,
Caddy, scheduled jobs, and local database dumps on one EC2 instance through
[`docker-compose.prod.yml`](../docker-compose.prod.yml). This is suitable for
the first paying customers. Move PostgreSQL to RDS when availability or load
requires separating the database from the application host.

## AWS resources

- Region: `ap-south-1` (Mumbai)
- Ubuntu Server 24.04 LTS, x86-64
- Testing: `t3.small`; paying production: `t3.medium`
- 30 GB encrypted `gp3` root volume
- Elastic IP attached to the instance
- IMDSv2 required
- T3 CPU credits set to `standard` to prevent surplus-credit charges
- Security group ingress:
  - TCP 22 from the developer's current public IP only
  - TCP 80 and 443 from `0.0.0.0/0`
  - Never expose PostgreSQL 5432 or Redis 6379

The first-boot configuration is in
[`infra/aws/ec2-user-data.sh`](../infra/aws/ec2-user-data.sh). It installs
Docker, Docker Compose, Git, a persistent 2 GB swap file, and creates
`/opt/autoreply`.

## Required environment

Copy `.env.example` to `/opt/autoreply/.env`, set mode `0600`, and replace
every placeholder needed by the enabled features. At minimum set:

- `DOMAIN`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `ENCRYPTION_KEY`
- Meta/Instagram application credentials
- `RESEND_API_KEY` and a verified `EMAIL_FROM` before customer login
- Stripe live-mode keys, webhook secret, and live Price IDs before charging
  customers

Use separate Stripe test and live credentials. Keep
`MOBILE_OTP_DEV_ECHO=false` and `MOBILE_STORE_BILLING_ENABLED=false` for store
builds until native purchases are approved.

## Deploy

Create a release archive from the repository root. The packaging script keeps
the server's `app/api/mobile` routes while excluding the separate React Native
application and all local secrets:

```bash
./scripts/package-server-release.sh /tmp/autoreply-server-release.tgz
```

From `/opt/autoreply`:

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl --fail --silent --show-error "https://${DOMAIN}/api/health"
```

The public health response must report `ok` for the database, Redis, queue, and
worker. The API is not considered ready until that endpoint succeeds.

## Backups and restore

The `cron` service writes a compressed PostgreSQL dump to `./backups` at
03:00 UTC every day and retains seven days. These local dumps cover operator
mistakes but not loss of the EC2 volume. Enable daily EBS snapshots or copy the
dumps to a private, versioned S3 bucket using an EC2 instance role.

Create and validate a manual dump:

```bash
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U autoreply autoreply | gzip > "backups/autoreply-$(date -u +%F-%H%M%S).sql.gz"
gzip -t backups/autoreply-*.sql.gz
```

Test a restore without touching production data:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  createdb -U autoreply autoreply_restore_test
gunzip -c backups/BACKUP.sql.gz | docker compose -f docker-compose.prod.yml \
  exec -T postgres psql -U autoreply autoreply_restore_test
docker compose -f docker-compose.prod.yml exec -T postgres \
  dropdb -U autoreply autoreply_restore_test
```

Run a restore test after changing the schema and at least monthly afterward.

## Deploy an update and roll back

Before an update, create a database dump and an EBS snapshot. Keep the previous
source bundle or Git commit available. Then rebuild:

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl --fail --silent --show-error "https://${DOMAIN}/api/health"
```

If health fails, restore the previous source, rebuild, and inspect:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 api worker caddy migrate
```

Database migrations are forward-only. Restore the pre-deploy database dump or
volume snapshot if a migration must be reversed.

## Monitoring and scaling

Create CloudWatch alarms for:

- `StatusCheckFailed >= 1`
- CPU utilization above 80% for 10 minutes
- `CPUCreditBalance < 10`
- root-volume usage above 80% through the CloudWatch Agent

Resize or split services when memory remains above 80%, swap grows
continuously, the worker queue develops sustained delay, or API latency becomes
unacceptable. The first upgrade is normally `t3.medium` to `t3.large`; after
that, move PostgreSQL to RDS before adding multiple API/worker instances.

## Production URL

An `sslip.io` hostname is acceptable for infrastructure testing. Before public
marketing or accepting payments, use a domain you control so email links,
OAuth redirects, Meta webhooks, mobile deep links, and customer trust are not
dependent on a third-party development DNS service.
