-- ── j-bots ── a mensagem efêmera (migration 5)
--
-- `flags: 64` numa resposta de interação: a mensagem que **só quem invocou o
-- comando vê**, com o rodapé "Somente você pode ver isso · Dispensar mensagem",
-- e que some ao recarregar. Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9.
--
-- **Tabela nova, e não uma coluna `ephemeralFor` na `Message`.** É a decisão
-- inteira, e o motivo é o vazamento: a `Message` é lida por dezenas de
-- consultas — histórico, busca, fixadas, threads, não lidas, a
-- `GET channels/:id/messages` da compat — e bastaria **uma** esquecer o `where`
-- para uma mensagem privada aparecer para o canal inteiro. Numa tabela que
-- nenhuma delas lê, o vazamento não é improvável: é impossível. Aditiva pura,
-- como a migration 4: nenhum `ALTER TABLE` aqui, e o `DROP TABLE` a desfaz.
--
-- **Postgres, e não memória nem Redis.** O bot tem 15 minutos para o
-- `editReply()`, então a linha tem de sobreviver a um restart da API; e aqui o
-- Redis é **opcional** (`REDIS_URL`; sem ela tudo cai para a memória do
-- processo), o que faria a efêmera funcionar em algumas instalações e não em
-- outras. A janela e a faxina são as mesmas da `Interaction`: `expiresAt` com
-- índice, apagada pelo `MaintenanceService`.
--
-- Ela não é servida por rota nenhuma. Sai **uma vez**, pelo socket, para a sala
-- `user:<ephemeralFor>`; a linha existe só para o `@original` (editar, ler,
-- apagar) continuar funcionando durante os 15 minutos.

-- CreateTable
CREATE TABLE "EphemeralMessage" (
    "id" TEXT NOT NULL,
    "snowflake" BIGINT NOT NULL DEFAULT streamz_snowflake(),
    "interactionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ephemeralFor" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "original" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EphemeralMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EphemeralMessage_snowflake_key" ON "EphemeralMessage"("snowflake");

-- CreateIndex
CREATE INDEX "EphemeralMessage_expiresAt_idx" ON "EphemeralMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "EphemeralMessage_interactionId_original_idx" ON "EphemeralMessage"("interactionId", "original");

-- AddForeignKey
ALTER TABLE "EphemeralMessage" ADD CONSTRAINT "EphemeralMessage_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EphemeralMessage" ADD CONSTRAINT "EphemeralMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EphemeralMessage" ADD CONSTRAINT "EphemeralMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EphemeralMessage" ADD CONSTRAINT "EphemeralMessage_ephemeralFor_fkey" FOREIGN KEY ("ephemeralFor") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
