-- ── j-bots ── identidade
--
-- O registro de um bot (`Application`), o usuário-bot que o representa dentro
-- do Streamz (`User.isBot`) e o token com que ele se autentica (`BotToken`).
-- Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §10.
--
-- Aditiva pura: nada aqui altera linha existente. Volta com um DROP.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "snowflake" BIGINT NOT NULL DEFAULT streamz_snowflake(),
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "permissoesPadrao" INTEGER NOT NULL DEFAULT 0,
    "botUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotToken" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BotToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_snowflake_key" ON "Application"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "Application_botUserId_key" ON "Application"("botUserId");

-- CreateIndex
CREATE INDEX "Application_ownerId_idx" ON "Application"("ownerId");

-- CreateIndex
CREATE INDEX "Application_publico_idx" ON "Application"("publico");

-- CreateIndex
CREATE UNIQUE INDEX "BotToken_tokenHash_key" ON "BotToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BotToken_applicationId_idx" ON "BotToken"("applicationId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_botUserId_fkey" FOREIGN KEY ("botUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotToken" ADD CONSTRAINT "BotToken_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
