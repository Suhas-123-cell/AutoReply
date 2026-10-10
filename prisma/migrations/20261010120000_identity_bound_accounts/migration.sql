-- Accounts are bound to verified identities (phone number, mailbox) so one
-- person cannot farm free workspaces under different names.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "canonicalEmail" TEXT;

-- Must match canonicalizeEmail() in lib/auth/identity.ts.
UPDATE "User"
SET "canonicalEmail" = CASE
  WHEN split_part(lower(trim("email")), '@', 2) IN ('gmail.com', 'googlemail.com')
    AND replace(split_part(split_part(lower(trim("email")), '@', 1), '+', 1), '.', '') <> ''
    THEN replace(split_part(split_part(lower(trim("email")), '@', 1), '+', 1), '.', '') || '@gmail.com'
  WHEN split_part(lower(trim("email")), '@', 2) IN (
      'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
      'icloud.com', 'me.com', 'mac.com',
      'protonmail.com', 'proton.me', 'pm.me', 'fastmail.com'
    )
    AND split_part(split_part(lower(trim("email")), '@', 1), '+', 1) <> ''
    THEN split_part(split_part(lower(trim("email")), '@', 1), '+', 1) || '@' || split_part(lower(trim("email")), '@', 2)
  ELSE lower(trim("email"))
END
WHERE "email" IS NOT NULL;

-- CreateIndex
CREATE INDEX "User_canonicalEmail_idx" ON "User"("canonicalEmail");

-- "Sign in with Instagram" now signs in only the user linked to that
-- Instagram identity. Link legacy Instagram-only sign-ups (no email, no
-- other provider) to the account they signed up with: the earliest account
-- in their workspace, connected when the workspace was created.
INSERT INTO "Account" ("id", "userId", "type", "provider", "providerAccountId")
SELECT 'iglink_' || ia."id", w."ownerId", 'oauth', 'instagram', ia."instagramId"
FROM "InstagramAccount" ia
JOIN "Workspace" w ON w."id" = ia."workspaceId"
JOIN "User" u ON u."id" = w."ownerId"
WHERE u."email" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."userId" = u."id")
  AND ia."connectedAt" <= w."createdAt" + INTERVAL '5 minutes'
  AND ia."connectedAt" = (
    SELECT min(i2."connectedAt") FROM "InstagramAccount" i2
    WHERE i2."workspaceId" = ia."workspaceId"
  )
ON CONFLICT ("provider", "providerAccountId") DO NOTHING;

-- ProcessedComment was never read or written; DmLog is the dedup record.
DROP TABLE IF EXISTS "ProcessedComment";

-- CreateTable
CREATE TABLE "IdentityUsageClaim" (
    "id" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "usagePeriodStart" TIMESTAMP(3) NOT NULL,
    "dmsSentThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityUsageClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityUsageClaim_identityHash_key" ON "IdentityUsageClaim"("identityHash");
