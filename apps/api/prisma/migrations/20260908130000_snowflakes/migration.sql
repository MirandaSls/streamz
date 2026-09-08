-- ── j-bots ── snowflakes
--
-- Um segundo id, numérico, nas nove tabelas que aparecem num payload do
-- Discord. O `id` cuid continua sendo a chave primária e nada nas relações
-- muda: o snowflake existe só porque as bibliotecas de bot (discord.js,
-- discord.py, Lavalink) não tratam id como texto opaco — elas derivam a data
-- de criação dele e, com um cuid, viram `NaN`/`ValueError`. Ver
-- `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §4 (decisão D1).
--
-- Layout, idêntico ao do Discord:
--
--   63                    22 21   17 16   12 11         0
--  +------------------------+-------+-------+------------+
--  |  ms desde 2015-01-01   | worker| proc  | incremento |
--  |        42 bits         | 5 bits| 5 bits|  12 bits   |
--  +------------------------+-------+-------+------------+
--
-- O epoch é o **do Discord** (1420070400000), não um nosso: é o que faz o
-- `createdAt` que as libs calculam a partir do id bater com o `createdAt` real
-- da linha. Worker e processo ficam em 0 porque a fonte é única (um banco).
--
-- Gerado no banco, não na aplicação: um DEFAULT garante que *qualquer*
-- inserção — inclusive a que alguém esquecer de atualizar — tenha snowflake, e
-- o UNIQUE é do Postgres, não da nossa disciplina.

-- 4095 ids distintos por milissegundo. É o teto do incremento de 12 bits, e é
-- também o limite da monotonicidade: passar de 4095 inserções dentro do mesmo
-- milissegundo faria a sequência dar a volta e um snowflake sair menor que o
-- anterior. São 4 milhões de linhas por segundo — não é um regime deste banco.
CREATE SEQUENCE "streamz_snowflake_seq" CYCLE MAXVALUE 4095;

CREATE FUNCTION streamz_snowflake() RETURNS bigint
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  ms bigint;
BEGIN
  -- `floor`, não arredondamento: o cast direto de numeric para bigint arredonda
  -- para o mais próximo, e meio milissegundo de erro para cima faria a data
  -- derivada do id ficar à frente do `createdAt` da linha.
  ms := floor(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 1420070400000;
  RETURN (ms << 22) | nextval('streamz_snowflake_seq');
END;
$$;

COMMENT ON FUNCTION streamz_snowflake() IS
  'Snowflake no layout do Discord (epoch 1420070400000). Ver docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md §4.';

-- ── User ──
ALTER TABLE "User" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "User" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "User"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "User" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "User_snowflake_key" ON "User"("snowflake");

-- ── Guild ──
ALTER TABLE "Guild" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Guild" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Guild"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Guild" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Guild_snowflake_key" ON "Guild"("snowflake");

-- ── Channel ──
ALTER TABLE "Channel" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Channel" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Channel"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Channel" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Channel_snowflake_key" ON "Channel"("snowflake");

-- ── Category ──
ALTER TABLE "Category" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Category" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Category"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Category" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Category_snowflake_key" ON "Category"("snowflake");

-- ── Message ──
ALTER TABLE "Message" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Message" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Message"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Message" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Message_snowflake_key" ON "Message"("snowflake");

-- ── Role ──
ALTER TABLE "Role" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Role" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Role"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Role" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Role_snowflake_key" ON "Role"("snowflake");

-- ── CustomEmoji ──
ALTER TABLE "CustomEmoji" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "CustomEmoji" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "CustomEmoji"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "CustomEmoji" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "CustomEmoji_snowflake_key" ON "CustomEmoji"("snowflake");

-- ── Attachment ──
ALTER TABLE "Attachment" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Attachment" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Attachment"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Attachment" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Attachment_snowflake_key" ON "Attachment"("snowflake");

-- ── Sticker ──
ALTER TABLE "Sticker" ADD COLUMN "snowflake" BIGINT;

-- Backfill: o bloco de milissegundos vem do `createdAt` real da linha, e o
-- incremento desempata as que caíram no mesmo milissegundo. A janela precisa de
-- uma subconsulta: o Postgres não aceita função de janela dentro de UPDATE SET.
UPDATE "Sticker" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Sticker"
) AS calc
WHERE alvo."id" = calc."id";

ALTER TABLE "Sticker" ALTER COLUMN "snowflake" SET NOT NULL,
                  ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();

CREATE UNIQUE INDEX "Sticker_snowflake_key" ON "Sticker"("snowflake");
