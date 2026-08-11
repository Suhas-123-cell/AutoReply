-- Baseline schema, transcribed from `pg_dump --schema-only` of the live
-- Postgres after all 18 Prisma migrations were applied (through
-- 20260803120000_rename_push_token_to_fcm). Per the rewrite plan, the Rust
-- backend runs against the *same* database rather than a fresh one, so this
-- is a baseline of the existing schema, not a replay of the 18 historical
-- Prisma migrations. There are no data-backfill migrations in that history,
-- so collapsing them is safe.
--
-- Every statement is idempotent: against the existing database this is a
-- no-op, and against an empty one (CI, a test container) it builds the whole
-- schema. Primary and foreign keys are inlined into the CREATE TABLE
-- statements so `IF NOT EXISTS` covers them too — ALTER TABLE ADD CONSTRAINT
-- has no such guard. Tables are therefore ordered by dependency rather than
-- alphabetically as pg_dump emits them.
--
-- Types are `timestamp(3) without time zone` because that is what Prisma's
-- DateTime maps to; do not "fix" these to timestamptz without migrating the
-- data, the application treats them as UTC.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE public."DmStatus" AS ENUM (
        'PENDING',
        'SENT',
        'FAILED',
        'SKIPPED_DEDUP',
        'SKIPPED_RATE_LIMIT',
        'SKIPPED_PLAN_LIMIT',
        'SKIPPED_NO_MATCH'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public."OperationalEventLevel" AS ENUM (
        'INFO',
        'WARNING',
        'ERROR'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public."OperationalEventSource" AS ENUM (
        'WORKER',
        'TOKEN_REFRESH',
        'HEALTH',
        'SYSTEM'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public."WebhookStatus" AS ENUM (
        'PENDING',
        'PROCESSED',
        'FAILED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public."WorkspaceInvitationStatus" AS ENUM (
        'PENDING',
        'ACCEPTED',
        'REVOKED',
        'EXPIRED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public."WorkspaceRole" AS ENUM (
        'OWNER',
        'ADMIN',
        'MEMBER'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Auth.js tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."User" (
    id text NOT NULL,
    name text,
    email text,
    "emailVerified" timestamp(3) without time zone,
    image text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."Account" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text,
    CONSTRAINT "Account_pkey" PRIMARY KEY (id),
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Auth.js v5 database sessions: `sessionToken` is the raw cookie value, which
-- is what the Rust auth extractor looks up directly.
CREATE TABLE IF NOT EXISTS public."Session" (
    id text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY (id),
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- No primary key, matching Auth.js's own schema — the unique index on
-- (identifier, token) is the only key.
CREATE TABLE IF NOT EXISTS public."VerificationToken" (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."Workspace" (
    id text NOT NULL,
    name text NOT NULL,
    "ownerId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "usagePeriodStart" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dmsSentThisPeriod" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY (id),
    CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."WorkspaceMember" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "userId" text NOT NULL,
    role public."WorkspaceRole" DEFAULT 'OWNER'::public."WorkspaceRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY (id),
    CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."WorkspaceInvitation" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    email text NOT NULL,
    role public."WorkspaceRole" DEFAULT 'MEMBER'::public."WorkspaceRole" NOT NULL,
    token text NOT NULL,
    status public."WorkspaceInvitationStatus" DEFAULT 'PENDING'::public."WorkspaceInvitationStatus" NOT NULL,
    "invitedByUserId" text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY (id),
    CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "WorkspaceInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Instagram accounts and automations
-- ---------------------------------------------------------------------------

-- `accessToken` is AES-256-GCM ciphertext with a 16-byte nonce (see
-- crates/core/src/encryption.rs) — not the standard 12.
CREATE TABLE IF NOT EXISTS public."InstagramAccount" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "instagramId" text NOT NULL,
    username text NOT NULL,
    name text,
    "accessToken" text NOT NULL,
    "tokenExpiresAt" timestamp(3) without time zone,
    "webhookSubscribed" boolean DEFAULT false NOT NULL,
    "connectedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY (id),
    CONSTRAINT "InstagramAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."Automation" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "instagramAccountId" text NOT NULL,
    name text NOT NULL,
    "postId" text,
    "postUrl" text,
    keywords text[],
    "dmMessage" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "wholeWordMatch" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    goal text,
    "reportShareSlug" text,
    "reportShareEnabled" boolean DEFAULT true NOT NULL,
    "publicReplyEnabled" boolean DEFAULT false NOT NULL,
    "publicReplyMessage" text,
    "pendingNextReel" boolean DEFAULT false NOT NULL,
    "matchAnyPost" boolean DEFAULT false NOT NULL,
    "matchAnyWord" boolean DEFAULT false NOT NULL,
    "openingDmEnabled" boolean DEFAULT false NOT NULL,
    "openingDmMessage" text,
    "openingDmButtonLabel" text,
    "linkButtonLabel" text,
    "publicReplyMessages" text[] DEFAULT '{}'::text[] NOT NULL,
    "requireFollow" boolean DEFAULT false NOT NULL,
    "followPromptMessage" text,
    "followPromptButtonLabel" text,
    "followUpEnabled" boolean DEFAULT false NOT NULL,
    "followUpMessage" text,
    CONSTRAINT "Automation_pkey" PRIMARY KEY (id),
    CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "Automation_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId")
        REFERENCES public."InstagramAccount"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- The unique index on (automationId, commentId) is the DM pipeline's dedup
-- guarantee; the worker upserts on it.
CREATE TABLE IF NOT EXISTS public."DmLog" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "automationId" text NOT NULL,
    "instagramAccountId" text NOT NULL,
    "commenterId" text NOT NULL,
    "commenterName" text,
    "commentText" text NOT NULL,
    "commentId" text NOT NULL,
    "matchedKeyword" text,
    status public."DmStatus" DEFAULT 'PENDING'::public."DmStatus" NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "dmSentAt" timestamp(3) without time zone,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "publicReplyError" text,
    "publicReplySentAt" timestamp(3) without time zone,
    CONSTRAINT "DmLog_pkey" PRIMARY KEY (id),
    CONSTRAINT "DmLog_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "DmLog_automationId_fkey" FOREIGN KEY ("automationId")
        REFERENCES public."Automation"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "DmLog_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId")
        REFERENCES public."InstagramAccount"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."FollowerSnapshot" (
    id text NOT NULL,
    "instagramAccountId" text NOT NULL,
    date date NOT NULL,
    "followersCount" integer NOT NULL,
    backfilled boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FollowerSnapshot_pkey" PRIMARY KEY (id),
    CONSTRAINT "FollowerSnapshot_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId")
        REFERENCES public."InstagramAccount"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Tracked links
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."TrackedLink" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "automationId" text NOT NULL,
    slug text NOT NULL,
    label text,
    "destinationUrl" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY (id),
    CONSTRAINT "TrackedLink_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "TrackedLink_automationId_fkey" FOREIGN KEY ("automationId")
        REFERENCES public."Automation"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."LinkClick" (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "automationId" text NOT NULL,
    "instagramAccountId" text NOT NULL,
    "trackedLinkId" text NOT NULL,
    "ipHash" text,
    "userAgent" text,
    referrer text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "LinkClick_pkey" PRIMARY KEY (id),
    CONSTRAINT "LinkClick_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "LinkClick_automationId_fkey" FOREIGN KEY ("automationId")
        REFERENCES public."Automation"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "LinkClick_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId")
        REFERENCES public."InstagramAccount"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "LinkClick_trackedLinkId_fkey" FOREIGN KEY ("trackedLinkId")
        REFERENCES public."TrackedLink"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Webhooks, operations, reconciliation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."WebhookEvent" (
    id text NOT NULL,
    "workspaceId" text,
    object text,
    payload jsonb NOT NULL,
    status public."WebhookStatus" DEFAULT 'PENDING'::public."WebhookStatus" NOT NULL,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp(3) without time zone,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY (id),
    CONSTRAINT "WebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public."OperationalEvent" (
    id text NOT NULL,
    "workspaceId" text,
    source public."OperationalEventSource" NOT NULL,
    level public."OperationalEventLevel" DEFAULT 'INFO'::public."OperationalEventLevel" NOT NULL,
    message text NOT NULL,
    payload jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY (id),
    CONSTRAINT "OperationalEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId")
        REFERENCES public."Workspace"(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Dead code on the Node side (zero call sites) and deliberately carried over
-- unchanged rather than dropped as part of the rewrite. No foreign key on
-- `instagramAccountId` in the live schema — preserved as-is.
CREATE TABLE IF NOT EXISTS public."ProcessedComment" (
    id text NOT NULL,
    "instagramAccountId" text NOT NULL,
    "commentId" text NOT NULL,
    source text NOT NULL,
    "seenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProcessedComment_pkey" PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Mobile
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."PushDevice" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fcmToken" text NOT NULL,
    platform text NOT NULL,
    "appVersion" text,
    "deviceName" text,
    "leadAlerts" boolean DEFAULT true NOT NULL,
    "failureAlerts" boolean DEFAULT true NOT NULL,
    "disabledAt" timestamp(3) without time zone,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY (id),
    CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."MobileAuthCode" (
    id text NOT NULL,
    email text NOT NULL,
    "codeHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "consumedAt" timestamp(3) without time zone,
    "requestIp" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "MobileAuthCode_pkey" PRIMARY KEY (id)
);

-- `sessionId` points at Session.id but has no foreign key in the live schema —
-- preserved as-is.
CREATE TABLE IF NOT EXISTS public."MobileSessionMeta" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "deviceName" text,
    platform text NOT NULL,
    "appVersion" text,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "MobileSessionMeta_pkey" PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON public."User" USING btree (email);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON public."Account" USING btree (provider, "providerAccountId");
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON public."Account" USING btree ("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON public."Session" USING btree ("sessionToken");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON public."Session" USING btree ("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON public."VerificationToken" USING btree (identifier, token);

CREATE INDEX IF NOT EXISTS "Workspace_ownerId_idx" ON public."Workspace" USING btree ("ownerId");

CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON public."WorkspaceMember" USING btree ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON public."WorkspaceMember" USING btree ("workspaceId", "userId");

CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_email_idx" ON public."WorkspaceInvitation" USING btree (email);
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_status_idx" ON public."WorkspaceInvitation" USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_token_key" ON public."WorkspaceInvitation" USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_email_key" ON public."WorkspaceInvitation" USING btree ("workspaceId", email);
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_idx" ON public."WorkspaceInvitation" USING btree ("workspaceId");

CREATE UNIQUE INDEX IF NOT EXISTS "InstagramAccount_instagramId_key" ON public."InstagramAccount" USING btree ("instagramId");
CREATE INDEX IF NOT EXISTS "InstagramAccount_workspaceId_idx" ON public."InstagramAccount" USING btree ("workspaceId");

CREATE INDEX IF NOT EXISTS "Automation_instagramAccountId_idx" ON public."Automation" USING btree ("instagramAccountId");
CREATE INDEX IF NOT EXISTS "Automation_postId_idx" ON public."Automation" USING btree ("postId");
CREATE UNIQUE INDEX IF NOT EXISTS "Automation_reportShareSlug_key" ON public."Automation" USING btree ("reportShareSlug");
CREATE INDEX IF NOT EXISTS "Automation_workspaceId_idx" ON public."Automation" USING btree ("workspaceId");

CREATE UNIQUE INDEX IF NOT EXISTS "DmLog_automationId_commentId_key" ON public."DmLog" USING btree ("automationId", "commentId");
CREATE INDEX IF NOT EXISTS "DmLog_automationId_idx" ON public."DmLog" USING btree ("automationId");
CREATE INDEX IF NOT EXISTS "DmLog_instagramAccountId_idx" ON public."DmLog" USING btree ("instagramAccountId");
CREATE INDEX IF NOT EXISTS "DmLog_status_idx" ON public."DmLog" USING btree (status);
CREATE INDEX IF NOT EXISTS "DmLog_workspaceId_idx" ON public."DmLog" USING btree ("workspaceId");

CREATE INDEX IF NOT EXISTS "FollowerSnapshot_instagramAccountId_date_idx" ON public."FollowerSnapshot" USING btree ("instagramAccountId", date);
CREATE UNIQUE INDEX IF NOT EXISTS "FollowerSnapshot_instagramAccountId_date_key" ON public."FollowerSnapshot" USING btree ("instagramAccountId", date);

CREATE INDEX IF NOT EXISTS "TrackedLink_automationId_idx" ON public."TrackedLink" USING btree ("automationId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedLink_slug_key" ON public."TrackedLink" USING btree (slug);
CREATE INDEX IF NOT EXISTS "TrackedLink_workspaceId_idx" ON public."TrackedLink" USING btree ("workspaceId");

CREATE INDEX IF NOT EXISTS "LinkClick_automationId_idx" ON public."LinkClick" USING btree ("automationId");
CREATE INDEX IF NOT EXISTS "LinkClick_createdAt_idx" ON public."LinkClick" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "LinkClick_instagramAccountId_idx" ON public."LinkClick" USING btree ("instagramAccountId");
CREATE INDEX IF NOT EXISTS "LinkClick_trackedLinkId_idx" ON public."LinkClick" USING btree ("trackedLinkId");
CREATE INDEX IF NOT EXISTS "LinkClick_workspaceId_createdAt_idx" ON public."LinkClick" USING btree ("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "LinkClick_workspaceId_idx" ON public."LinkClick" USING btree ("workspaceId");

CREATE INDEX IF NOT EXISTS "WebhookEvent_status_idx" ON public."WebhookEvent" USING btree (status);
CREATE INDEX IF NOT EXISTS "WebhookEvent_workspaceId_idx" ON public."WebhookEvent" USING btree ("workspaceId");

CREATE INDEX IF NOT EXISTS "OperationalEvent_createdAt_idx" ON public."OperationalEvent" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "OperationalEvent_level_idx" ON public."OperationalEvent" USING btree (level);
CREATE INDEX IF NOT EXISTS "OperationalEvent_source_idx" ON public."OperationalEvent" USING btree (source);
CREATE INDEX IF NOT EXISTS "OperationalEvent_workspaceId_idx" ON public."OperationalEvent" USING btree ("workspaceId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedComment_commentId_key" ON public."ProcessedComment" USING btree ("commentId");
CREATE INDEX IF NOT EXISTS "ProcessedComment_instagramAccountId_idx" ON public."ProcessedComment" USING btree ("instagramAccountId");

CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_fcmToken_key" ON public."PushDevice" USING btree ("fcmToken");
CREATE INDEX IF NOT EXISTS "PushDevice_userId_idx" ON public."PushDevice" USING btree ("userId");

CREATE INDEX IF NOT EXISTS "MobileAuthCode_email_createdAt_idx" ON public."MobileAuthCode" USING btree (email, "createdAt");
CREATE INDEX IF NOT EXISTS "MobileAuthCode_expiresAt_idx" ON public."MobileAuthCode" USING btree ("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "MobileSessionMeta_sessionId_key" ON public."MobileSessionMeta" USING btree ("sessionId");
