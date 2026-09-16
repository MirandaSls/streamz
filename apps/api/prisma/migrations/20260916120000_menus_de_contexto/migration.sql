-- Menus de clique direito (docs/CONTRATO-MENUS.md).
-- Só aditiva, exceto a troca do índice único de ApplicationCommand, que ganha
-- `type` na chave (afrouxa a regra: nenhuma linha existente passa a violar).

-- DropIndex
DROP INDEX "ApplicationCommand_applicationId_guildId_name_key";

-- AlterTable
ALTER TABLE "GuildMember" ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "permitirDmsDoServidor" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "targetId" TEXT;

-- CreateTable
CREATE TABLE "DMPin" (
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMPin_pkey" PRIMARY KEY ("userId","channelId")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "ownerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("ownerId","targetId")
);

-- CreateTable
CREATE TABLE "FriendNickname" (
    "ownerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendNickname_pkey" PRIMARY KEY ("ownerId","targetId")
);

-- CreateTable
CREATE TABLE "UserIgnore" (
    "ignorerId" TEXT NOT NULL,
    "ignoredId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIgnore_pkey" PRIMARY KEY ("ignorerId","ignoredId")
);

-- CreateIndex
CREATE INDEX "DMPin_channelId_idx" ON "DMPin"("channelId");

-- CreateIndex
CREATE INDEX "UserNote_targetId_idx" ON "UserNote"("targetId");

-- CreateIndex
CREATE INDEX "FriendNickname_targetId_idx" ON "FriendNickname"("targetId");

-- CreateIndex
CREATE INDEX "UserIgnore_ignoredId_idx" ON "UserIgnore"("ignoredId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCommand_applicationId_guildId_type_name_key" ON "ApplicationCommand"("applicationId", "guildId", "type", "name");

-- AddForeignKey
ALTER TABLE "DMPin" ADD CONSTRAINT "DMPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMPin" ADD CONSTRAINT "DMPin_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendNickname" ADD CONSTRAINT "FriendNickname_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendNickname" ADD CONSTRAINT "FriendNickname_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIgnore" ADD CONSTRAINT "UserIgnore_ignorerId_fkey" FOREIGN KEY ("ignorerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIgnore" ADD CONSTRAINT "UserIgnore_ignoredId_fkey" FOREIGN KEY ("ignoredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

