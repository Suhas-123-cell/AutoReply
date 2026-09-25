ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'EDITOR';
ALTER TABLE "WorkspaceMember" ADD COLUMN "accountAccessRestricted" BOOLEAN NOT NULL DEFAULT false;
UPDATE "WorkspaceMember" SET "accountAccessRestricted" = true
WHERE EXISTS (SELECT 1 FROM "MemberAccountAccess" a WHERE a."workspaceMemberId" = "WorkspaceMember"."id");
ALTER TABLE "WorkspaceMember" ALTER COLUMN "accountAccessRestricted" SET DEFAULT true;
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
ALTER TABLE "DmLog" ADD COLUMN "messageStage" TEXT;

CREATE TABLE "CampaignOutcome" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "valueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignOutcome_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignOutcome_workspaceId_occurredAt_idx"
ON "CampaignOutcome"("workspaceId", "occurredAt");

CREATE INDEX "CampaignOutcome_automationId_occurredAt_idx"
ON "CampaignOutcome"("automationId", "occurredAt");

ALTER TABLE "CampaignOutcome"
ADD CONSTRAINT "CampaignOutcome_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignOutcome"
ADD CONSTRAINT "CampaignOutcome_automationId_fkey"
FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
