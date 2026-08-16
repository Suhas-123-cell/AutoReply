-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneVerified" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MobilePhoneAuthCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobilePhoneAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobilePhoneAuthCode_phone_createdAt_idx" ON "MobilePhoneAuthCode"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "MobilePhoneAuthCode_expiresAt_idx" ON "MobilePhoneAuthCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
