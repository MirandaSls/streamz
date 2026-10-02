-- CreateEnum
CREATE TYPE "ModerationNoticeAction" AS ENUM ('KICK', 'BAN');

-- CreateTable
CREATE TABLE "ModerationNotice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT,
    "guildName" TEXT NOT NULL,
    "action" "ModerationNoticeAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationNotice_userId_createdAt_idx" ON "ModerationNotice"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ModerationNotice" ADD CONSTRAINT "ModerationNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
