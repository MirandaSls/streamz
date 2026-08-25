-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "manualStatus" "UserStatus";

-- CreateTable
CREATE TABLE "ReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadState_channelId_idx" ON "ReadState"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadState_userId_channelId_key" ON "ReadState"("userId", "channelId");

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

