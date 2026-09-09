-- ── j-bots · F4 ── a instalação de um aplicativo num servidor
--
-- `GuildApplication` é o que autoriza um bot num servidor: existe a linha, o
-- bot está lá. Apagá-la é "remover o app do servidor" — o membro-bot sai, o
-- cargo gerenciado some e o bot conectado recebe `GUILD_DELETE`.
--
-- Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §10 e §11, e o `CONTRATO-F4.md`
-- em `apps/web/components/apps/` §2 e §3.3.
--
-- **Aditiva pura.** Uma tabela nova, duas FKs, dois índices; nenhum
-- `ALTER TABLE` em tabela existente. As back-relations em `Application` e em
-- `Guild` são virtuais no Prisma e não existem no SQL. Volta inteira com um
-- `DROP TABLE "GuildApplication"`.
--
-- Numeração: o §10 do documento chama esta de "migration 3" e a de comandos de
-- "4". A F3 entrou primeiro (`20260908140000_bots_comandos` já está na `main`),
-- então esta vem **depois**, por carimbo. As duas são aditivas puras e a ordem
-- não muda nada além do nome — a divergência está registrada no §8 do contrato.
--
-- Três decisões que o SQL mostra e o schema explica:
--
--   * `installedById` **sem FK para `User`**. O §10 não a declarou, e uma FK
--     com `ON DELETE CASCADE` faria a saída de quem instalou desinstalar o app
--     do servidor inteiro — quem instalou é um dado de auditoria, não um dono.
--     A leitura resolve o id à mão, e tolera o usuário apagado.
--   * `roleId` **sem FK** e anulável, pelo mesmo motivo prático: o cargo é
--     apagado dentro da mesma transação da remoção, e uma FK obrigaria a ordem
--     inversa da que o §3.3 pede. `NULL` é a instalação sem permissão nenhuma.
--   * `UNIQUE (guildId, applicationId)` é o que faz "instalar de novo" ser uma
--     **edição** das permissões, e não uma segunda instalação (é o que o
--     Discord faz — ver o `upsert` do `InstalacaoService`).

-- CreateTable
CREATE TABLE "GuildApplication" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "installedById" TEXT NOT NULL,
    "permissions" INTEGER NOT NULL DEFAULT 0,
    "roleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildApplication_guildId_applicationId_key" ON "GuildApplication"("guildId", "applicationId");

-- CreateIndex
CREATE INDEX "GuildApplication_applicationId_idx" ON "GuildApplication"("applicationId");

-- AddForeignKey
ALTER TABLE "GuildApplication" ADD CONSTRAINT "GuildApplication_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildApplication" ADD CONSTRAINT "GuildApplication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
