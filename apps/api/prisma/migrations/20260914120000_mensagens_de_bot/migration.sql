-- ── onda 3 ── mensagens de bot: embeds, componentes e interações de componente
--
-- Ver `docs/CONTRATO-ONDA-3.md` e `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9.
--
-- **Ainda não há `ALTER TABLE "Message"`, e continua sendo de propósito.** A
-- `Message` é a maior tabela do banco (a regra "j-bots" do `schema.prisma`).
-- Embeds, componentes e flags de mensagem normal vão para uma tabela 1:1 à
-- parte, `MessageBotPayload`, que só ganha linha quando a mensagem tem algo
-- disso — quase nenhuma tem. A leitura faz `include`.
--
-- Três mudanças, todas aditivas:
--
--   * `MessageBotPayload` — nova. `flatText` é o texto achatado de content +
--     embeds + text displays: é o que a busca procura e o que o trecho da
--     resposta citada mostra (uma mensagem só de embed tem `content` vazio).
--   * `EphemeralMessage` ganha `embeds`, `components` e `flags` direto nela: a
--     tabela é pequena e cada linha some em 15 minutos, então uma tabela 1:1 ali
--     seria custo sem ganho.
--   * `Interaction` deixa de supor comando de barra: `commandName` vira
--     anulável (clique em botão não tem comando) e entram o `type` da
--     interação, o `custom_id`, o tipo do componente, a mensagem de origem
--     (normal ou efêmera), o `nonce` do navegador e o modal aberto pelo
--     callback 9. As linhas antigas são todas comandos: `type` nasce 2.
--
-- As chaves estrangeiras novas são `ON DELETE SET NULL`: apagar a mensagem não
-- pode apagar o registro da interação que a teve como origem (a faxina do
-- `MaintenanceService` cuida da interação vencida).

-- CreateTable
CREATE TABLE "MessageBotPayload" (
    "messageId" TEXT NOT NULL,
    "embeds" JSONB NOT NULL DEFAULT '[]',
    "components" JSONB NOT NULL DEFAULT '[]',
    "flags" INTEGER NOT NULL DEFAULT 0,
    "flatText" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MessageBotPayload_pkey" PRIMARY KEY ("messageId")
);

-- AlterTable
ALTER TABLE "EphemeralMessage" ADD COLUMN     "components" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "embeds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "flags" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "componentType" INTEGER,
ADD COLUMN     "customId" TEXT,
ADD COLUMN     "ephemeralMessageId" TEXT,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "modal" JSONB,
ADD COLUMN     "nonce" TEXT,
ADD COLUMN     "type" INTEGER NOT NULL DEFAULT 2,
ALTER COLUMN "commandName" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Interaction_messageId_idx" ON "Interaction"("messageId");

-- CreateIndex
CREATE INDEX "Interaction_ephemeralMessageId_idx" ON "Interaction"("ephemeralMessageId");

-- AddForeignKey
ALTER TABLE "MessageBotPayload" ADD CONSTRAINT "MessageBotPayload_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_ephemeralMessageId_fkey" FOREIGN KEY ("ephemeralMessageId") REFERENCES "EphemeralMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
