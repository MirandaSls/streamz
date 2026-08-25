-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "description" TEXT,
ADD COLUMN     "iconKey" TEXT;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    "permissions" INTEGER NOT NULL DEFAULT 0,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMemberRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "GuildMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelOverride" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "roleId" TEXT,
    "userId" TEXT,
    "allow" INTEGER NOT NULL DEFAULT 0,
    "deny" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChannelOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_guildId_idx" ON "Role"("guildId");

-- CreateIndex
CREATE INDEX "GuildMemberRole_guildId_userId_idx" ON "GuildMemberRole"("guildId", "userId");

-- CreateIndex
CREATE INDEX "GuildMemberRole_roleId_idx" ON "GuildMemberRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMemberRole_userId_roleId_key" ON "GuildMemberRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "ChannelOverride_channelId_idx" ON "ChannelOverride"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelOverride_channelId_roleId_key" ON "ChannelOverride"("channelId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelOverride_channelId_userId_key" ON "ChannelOverride"("channelId", "userId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelOverride" ADD CONSTRAINT "ChannelOverride_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelOverride" ADD CONSTRAINT "ChannelOverride_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelOverride" ADD CONSTRAINT "ChannelOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── c-cargos: migração de dados ──────────────────────────────
-- Depois destes cinco passos, o conjunto de quem VÊ e de quem POSTA cada canal
-- é idêntico ao de antes — é a propriedade que esta migração tem de preservar.
-- Bitfield de `Permission` (@newdisc/shared): VIEW_CHANNEL=1, SEND_MESSAGES=2,
-- ADMINISTRATOR=262144; padrão do @everyone = 14083 (ver = 1, enviar = 2,
-- convidar = 256, anexar = 512, reagir = 1024, conectar = 4096, falar = 8192).
-- Os ids são derivados do id do servidor/canal para que os passos seguintes
-- possam juntar-se a eles sem uma segunda consulta.

-- 1. @everyone de cada servidor existente
INSERT INTO "Role" ("id", "guildId", "name", "color", "position", "permissions", "hoist", "mentionable", "isDefault", "createdAt")
SELECT 'role0' || g."id", g."id", '@everyone', NULL, 0, 14083, false, false, true, CURRENT_TIMESTAMP
FROM "Guild" g;

-- 2. cargo "Administrador" — o destino do atalho GuildMember.role = ADMIN
INSERT INTO "Role" ("id", "guildId", "name", "color", "position", "permissions", "hoist", "mentionable", "isDefault", "createdAt")
SELECT 'role1' || g."id", g."id", 'Administrador', NULL, 1, 262144, true, false, false, CURRENT_TIMESTAMP
FROM "Guild" g;

-- 3. quem já era ADMIN recebe o cargo (as duas representações nascem juntas)
INSERT INTO "GuildMemberRole" ("id", "guildId", "userId", "roleId")
SELECT 'gmr' || m."id", m."guildId", m."userId", 'role1' || m."guildId"
FROM "GuildMember" m
WHERE m."role" = 'ADMIN';

-- 4. canal privado → deny VIEW_CHANNEL no @everyone;
--    canal somente-leitura → deny SEND_MESSAGES (mesma linha quando os dois valem)
INSERT INTO "ChannelOverride" ("id", "channelId", "roleId", "userId", "allow", "deny")
SELECT 'ovr0' || c."id", c."id", 'role0' || c."guildId", NULL, 0,
       (CASE WHEN c."private" THEN 1 ELSE 0 END) | (CASE WHEN c."readOnly" THEN 2 ELSE 0 END)
FROM "Channel" c
WHERE c."guildId" IS NOT NULL AND (c."private" OR c."readOnly");

-- 5. allowlist de canal privado (ChannelMember) → allow VIEW_CHANNEL do usuário.
--    Só canais DE SERVIDOR: em DM/grupo a mesma tabela significa participante,
--    e lá não há cargo nem override.
INSERT INTO "ChannelOverride" ("id", "channelId", "roleId", "userId", "allow", "deny")
SELECT 'ovru' || cm."id", cm."channelId", NULL, cm."userId", 1, 0
FROM "ChannelMember" cm
JOIN "Channel" c ON c."id" = cm."channelId"
WHERE c."guildId" IS NOT NULL;
