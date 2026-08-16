-- CreateTable
CREATE TABLE "MemberAccountAccess" (
    "id" TEXT NOT NULL,
    "workspaceMemberId" TEXT NOT NULL,
    "instagramAccountId" TEXT,
    "telegramAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberAccountAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberAccountAccess_workspaceMemberId_idx" ON "MemberAccountAccess"("workspaceMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAccountAccess_workspaceMemberId_instagramAccountId_key" ON "MemberAccountAccess"("workspaceMemberId", "instagramAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAccountAccess_workspaceMemberId_telegramAccountId_key" ON "MemberAccountAccess"("workspaceMemberId", "telegramAccountId");

-- AddForeignKey
ALTER TABLE "MemberAccountAccess" ADD CONSTRAINT "MemberAccountAccess_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAccountAccess" ADD CONSTRAINT "MemberAccountAccess_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAccountAccess" ADD CONSTRAINT "MemberAccountAccess_telegramAccountId_fkey" FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
