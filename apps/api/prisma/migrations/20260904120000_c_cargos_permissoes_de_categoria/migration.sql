-- Permissões por canal E por categoria, como no Discord.
--
-- O modelo de overrides por canal já existia (ADR-0002). O que falta é a
-- categoria: ela passa a ter as próprias regras, e um canal pode estar
-- "sincronizado" com a categoria dele — herdando as regras dela até a primeira
-- edição feita no próprio canal.
--
-- Idempotente de propósito (IF NOT EXISTS em tudo): a rotina de conversão do
-- que já existe roda no boot da API (`PermissoesLegadoService`) e esta
-- migration precisa poder ser reaplicada sem estragar nada.

-- ── regras de categoria ──
CREATE TABLE IF NOT EXISTS "CategoryOverride" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "roleId" TEXT,
    "userId" TEXT,
    "allow" INTEGER NOT NULL DEFAULT 0,
    "deny" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CategoryOverride_categoryId_roleId_key"
    ON "CategoryOverride"("categoryId", "roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryOverride_categoryId_userId_key"
    ON "CategoryOverride"("categoryId", "userId");
CREATE INDEX IF NOT EXISTS "CategoryOverride_categoryId_idx"
    ON "CategoryOverride"("categoryId");

DO $$ BEGIN
    ALTER TABLE "CategoryOverride" ADD CONSTRAINT "CategoryOverride_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CategoryOverride" ADD CONSTRAINT "CategoryOverride_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CategoryOverride" ADD CONSTRAINT "CategoryOverride_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── canal sincronizado com a categoria ──
-- Falso para todo canal que já existe: eles têm (ou não têm) regras próprias, e
-- ligar a herança agora reescreveria silenciosamente permissões que alguém
-- configurou. Canal novo criado dentro de uma categoria nasce sincronizado.
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "syncedWithCategory" BOOLEAN NOT NULL DEFAULT false;

-- ── bit novo: STREAM (1 << 20 = 1048576), o "Vídeo" do Discord ──
-- Câmera e compartilhamento de tela já funcionavam sem permissão nenhuma. O bit
-- passa a existir e a ser exigido; para que ninguém perca o que já fazia, o
-- @everyone de todo servidor existente ganha o bit — é o mesmo que
-- DEFAULT_PERMISSIONS dá aos servidores novos.
UPDATE "Role" SET "permissions" = "permissions" | 1048576 WHERE "isDefault" = true;
