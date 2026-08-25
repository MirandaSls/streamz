-- ADR-0001: unifica DM e grupo em Channel/Message.
-- DMChannel/DMParticipant/DMMessage viram Channel (type DM|GROUP, guildId null),
-- ChannelMember (participantes) e Message. Sem cópia de dados de propósito:
-- não há produção, e o Postgres não deixa usar um valor de enum recém-criado na
-- mesma transação que o criou. O SQL de cópia (para o dia em que houver dados
-- que não se pode perder) está registrado na ADR.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChannelType" ADD VALUE 'DM';
ALTER TYPE "ChannelType" ADD VALUE 'GROUP';

-- DropForeignKey
ALTER TABLE "DMParticipant" DROP CONSTRAINT "DMParticipant_dmChannelId_fkey";

-- DropForeignKey
ALTER TABLE "DMParticipant" DROP CONSTRAINT "DMParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "DMMessage" DROP CONSTRAINT "DMMessage_dmChannelId_fkey";

-- DropForeignKey
ALTER TABLE "DMMessage" DROP CONSTRAINT "DMMessage_authorId_fkey";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "pairKey" TEXT,
ALTER COLUMN "guildId" DROP NOT NULL,
ALTER COLUMN "name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ChannelMember" ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "DMChannel";

-- DropTable
DROP TABLE "DMParticipant";

-- DropTable
DROP TABLE "DMMessage";

-- CreateIndex
CREATE UNIQUE INDEX "Channel_pairKey_key" ON "Channel"("pairKey");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

