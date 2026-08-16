-- CreateTable
CREATE TABLE "TelegramAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "botUsername" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAutomation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "wholeWordMatch" BOOLEAN NOT NULL DEFAULT true,
    "replyMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramMessageLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAccountId" TEXT NOT NULL,
    "automationId" TEXT,
    "chatId" TEXT NOT NULL,
    "senderUsername" TEXT,
    "messageText" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "status" "DmStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccount_botId_key" ON "TelegramAccount"("botId");

-- CreateIndex
CREATE INDEX "TelegramAccount_workspaceId_idx" ON "TelegramAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAutomation_workspaceId_idx" ON "TelegramAutomation"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramAutomation_telegramAccountId_idx" ON "TelegramAutomation"("telegramAccountId");

-- CreateIndex
CREATE INDEX "TelegramMessageLog_workspaceId_idx" ON "TelegramMessageLog"("workspaceId");

-- CreateIndex
CREATE INDEX "TelegramMessageLog_telegramAccountId_idx" ON "TelegramMessageLog"("telegramAccountId");

-- CreateIndex
CREATE INDEX "TelegramMessageLog_chatId_idx" ON "TelegramMessageLog"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramMessageLog_telegramAccountId_chatId_messageText_cre_key" ON "TelegramMessageLog"("telegramAccountId", "chatId", "messageText", "createdAt");

-- AddForeignKey
ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAutomation" ADD CONSTRAINT "TelegramAutomation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAutomation" ADD CONSTRAINT "TelegramAutomation_telegramAccountId_fkey" FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessageLog" ADD CONSTRAINT "TelegramMessageLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessageLog" ADD CONSTRAINT "TelegramMessageLog_telegramAccountId_fkey" FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessageLog" ADD CONSTRAINT "TelegramMessageLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "TelegramAutomation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
