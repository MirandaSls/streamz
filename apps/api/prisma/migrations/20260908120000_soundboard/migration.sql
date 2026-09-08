-- Painel de efeitos sonoros do servidor.
--
-- Mesma mecânica de storage do emoji e da figurinha: o arquivo vai para o
-- bucket e a linha guarda a `key`, o tipo e o tamanho. O `volume` é o fator de
-- referência do próprio som (os arquivos chegam em níveis diferentes), e
-- multiplica o volume de efeitos escolhido por quem ouve.
--
-- O nome NÃO é único no servidor, de propósito: ao contrário de `:nome:`, o
-- rótulo do card não é digitado em lugar nenhum.

-- CreateTable
CREATE TABLE "SoundboardSound" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundboardSound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoundboardSound_key_key" ON "SoundboardSound"("key");

-- CreateIndex
CREATE INDEX "SoundboardSound_guildId_idx" ON "SoundboardSound"("guildId");

-- AddForeignKey
ALTER TABLE "SoundboardSound" ADD CONSTRAINT "SoundboardSound_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundboardSound" ADD CONSTRAINT "SoundboardSound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
