-- ── j-bots ── comandos de barra e interações (migration 4)
--
-- `ApplicationCommand` (o que o `deploy-commands.js` registra) e `Interaction`
-- (uma execução de `/play` em voo, com o token de 15 minutos).
-- Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 e §10, e o `CONTRATO-F3.md`
-- em `src/modules/interactions/`.
--
-- **Aditiva pura: não há `ALTER TABLE "Message"` aqui, e é de propósito.** A
-- `Message` é a maior tabela do banco; a ligação com a interação mora do lado
-- da `Interaction` (`responseMessageId`, com índice único), e a `Message` só
-- ganha uma back-relation — que é virtual no Prisma e não existe no SQL. A
-- migration volta inteira com um `DROP TABLE`.
--
-- Três colunas que o §10 do documento não previu, e o porquê de cada uma:
--
--   * `commandName`   — o nome do comando, copiado na hora. O `PUT` do registro
--                       é sobrescrita em bloco (apaga a linha antiga), e sem
--                       esta cópia a faixa "usou /play" sumiria do histórico
--                       toda vez que o dono do bot rodasse o `deploy-commands`.
--                       É também por isso que `commandId` é `ON DELETE SET NULL`.
--   * `responseMessageId` UNIQUE — é o único que faz a back-relation da
--                       `Message` ser `Interaction?` e não `Interaction[]`, que
--                       é o que o `include` do `MessagesService` espera.
--   * FK para `User`  — a faixa precisa de quem digitou no mesmo `include`.
--
-- `ApplicationCommand_applicationId_guildId_name_key`: no Postgres, `NULL` é
-- distinto de `NULL` num índice único, então dois comandos **globais** de mesmo
-- nome passariam por ele. Quem garante a unicidade do global é o `PUT`
-- (sobrescrita em bloco, numa transação); o índice fica como o §10 o desenha.

-- CreateTable
CREATE TABLE "ApplicationCommand" (
    "id" TEXT NOT NULL,
    "snowflake" BIGINT NOT NULL DEFAULT streamz_snowflake(),
    "applicationId" TEXT NOT NULL,
    "guildId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB NOT NULL DEFAULT '[]',
    "defaultMemberPermissions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "snowflake" BIGINT NOT NULL DEFAULT streamz_snowflake(),
    "applicationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT,
    "commandId" TEXT,
    "commandName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "responseMessageId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCommand_snowflake_key" ON "ApplicationCommand"("snowflake");

-- CreateIndex
CREATE INDEX "ApplicationCommand_guildId_idx" ON "ApplicationCommand"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCommand_applicationId_guildId_name_key" ON "ApplicationCommand"("applicationId", "guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_snowflake_key" ON "Interaction"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_token_key" ON "Interaction"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_responseMessageId_key" ON "Interaction"("responseMessageId");

-- CreateIndex
CREATE INDEX "Interaction_expiresAt_idx" ON "Interaction"("expiresAt");

-- CreateIndex
CREATE INDEX "Interaction_applicationId_createdAt_idx" ON "Interaction"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ApplicationCommand" ADD CONSTRAINT "ApplicationCommand_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCommand" ADD CONSTRAINT "ApplicationCommand_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "ApplicationCommand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_responseMessageId_fkey" FOREIGN KEY ("responseMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

