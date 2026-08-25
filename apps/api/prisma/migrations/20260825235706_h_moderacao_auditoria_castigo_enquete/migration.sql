-- CreateEnum
CREATE TYPE "MessageSystemType" AS ENUM ('SYSTEM_JOIN', 'SYSTEM_MOD_NOTICE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('MEMBER_KICK', 'MEMBER_BAN', 'MEMBER_UNBAN', 'MEMBER_TIMEOUT', 'MEMBER_TIMEOUT_REMOVE', 'MEMBER_ROLE_UPDATE', 'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'CHANNEL_DELETE', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'INVITE_CREATE', 'INVITE_REVOKE', 'MESSAGE_DELETE', 'MESSAGE_BULK_DELETE', 'GUILD_UPDATE', 'EMOJI_CREATE', 'STICKER_CREATE');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('USER', 'CHANNEL', 'ROLE', 'INVITE', 'MESSAGE', 'GUILD', 'EMOJI', 'STICKER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'HATE', 'VIOLENCE', 'NSFW', 'SELF_HARM', 'OTHER');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "description" TEXT,
ADD COLUMN     "discoverable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rulesChannelId" TEXT,
ADD COLUMN     "systemChannelId" TEXT,
ADD COLUMN     "welcomeChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "welcomeDescription" TEXT;

-- AlterTable
ALTER TABLE "GuildMember" ADD COLUMN     "acceptedRulesAt" TIMESTAMP(3),
ADD COLUMN     "timeoutUntil" TIMESTAMP(3),
ADD COLUMN     "welcomeSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "temporary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "systemType" "MessageSystemType";

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetId" TEXT,
    "targetType" "AuditTargetType",
    "targetName" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "multi" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "messageContent" TEXT,
    "reporterId" TEXT,
    "targetId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_guildId_createdAt_idx" ON "AuditLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_action_createdAt_idx" ON "AuditLog"("guildId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_actorId_createdAt_idx" ON "AuditLog"("guildId", "actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_messageId_key" ON "Poll"("messageId");

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "PollVote"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_optionIndex_key" ON "PollVote"("pollId", "userId", "optionIndex");

-- CreateIndex
CREATE INDEX "Report_guildId_resolved_createdAt_idx" ON "Report"("guildId", "resolved", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_messageId_reporterId_key" ON "Report"("messageId", "reporterId");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
