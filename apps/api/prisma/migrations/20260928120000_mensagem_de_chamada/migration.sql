-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'SYSTEM_CALL';

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "participantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Call_messageId_key" ON "Call"("messageId");

-- CreateIndex
CREATE INDEX "Call_endedAt_idx" ON "Call"("endedAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
