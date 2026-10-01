-- ── username minúsculo + pedido de amizade com mensagem ──
--
-- Duas mudanças que chegam juntas porque o "Adicionar amigo" depende das duas:
--
-- 1. `Friendship.mensagem`: o texto de apresentação que acompanha o pedido.
--    Aditiva; o teto de 120 caracteres mora no contrato (`friendRequestSchema`).
--
-- 2. `User.username` passa a seguir a regra do Discord (`usernameSchema` em
--    `packages/shared/src/auth.ts`): minúsculas, só `[a-z0-9_.]`, de 2 a 32
--    caracteres, sem `..`. Até aqui o nome aceitava maiúscula e hífen, e o
--    índice único era sensível a caixa — "Fulano" e "fulano" podiam ser duas
--    contas. Agora que o nome é comparado sempre normalizado, toda linha
--    precisa já estar na forma normal, senão a conta antiga fica inalcançável
--    (ninguém consegue digitar "Fulano" e chegar nela).
--
-- Por que o desempate é assim:
--
-- * Normalizar pode juntar nomes que eram distintos ("Fulano", "fulano",
--   "fu-lano" e "fu_lano" viram dois grupos de dois). Em cada grupo a conta
--   **mais antiga** (createdAt, depois id) fica com o nome; as outras ganham
--   `_2`, `_3`… na ordem de criação. Antiguidade é o critério que não depende
--   de quem por acaso já tinha a grafia "certa".
-- * O sufixo pode cair num nome que já é de outra pessoa ("fulano_2" pode
--   existir). As vagas ocupadas são puladas: o segundo "fulano" vira
--   "fulano_3".
-- * A base do sufixo é cortada em 27 caracteres para qualquer tamanho de
--   sufixo: 27 + `_` + até 4 dígitos = 32. Cortar "o quanto couber" (30 para
--   `_2`, 29 para `_10`) faria duas bases longas diferentes virarem o mesmo
--   nome; com o corte fixo, dois nomes sufixados só são iguais se tiverem o
--   mesmo prefixo **e** o mesmo número, e a numeração é única por prefixo.
--
-- Por que em duas passadas: o índice único `User_username_key` não é
-- adiável, e o Postgres o confere linha a linha, não no fim do UPDATE. Trocar
-- nomes entre contas num UPDATE só (a mais antiga "Fulano" pega "fulano" de
-- uma mais nova, que vira "fulano_2") falharia ou não conforme a ordem física
-- das linhas. Por isso a primeira passada põe cada nome novo atrás de um `~`
-- (caractere que a regra antiga já recusava, então não colide com nome
-- existente; se colidisse, o próprio índice abortaria tudo) e a segunda tira
-- o `~` — quando todo mundo que muda já saiu do caminho. O índice fica de pé o
-- tempo todo.
--
-- Atomicidade: o Prisma envia este arquivo numa query simples, que o Postgres
-- executa como uma transação implícita — se qualquer passo falhar (inclusive a
-- conferência do fim), nenhum nome muda.
--
-- Reexecutar não muda nada: nome que já está na forma normal e é único
-- normaliza para ele mesmo, cai num grupo de um e fica onde está.

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN IF NOT EXISTS "mensagem" TEXT;

-- ── passada 1: calcula o nome novo de cada conta e o grava atrás de `~` ──
WITH base AS (
    SELECT
        "id",
        "createdAt",
        "username",
        -- minúsculas; `-` vira `_`; o resto fora do conjunto vira `_`;
        -- pontos seguidos viram um só; corta em 32
        left(
            regexp_replace(
                regexp_replace(
                    replace(lower("username"), '-', '_'),
                    '[^a-z0-9_.]', '_', 'g'
                ),
                '[.]{2,}', '.', 'g'
            ),
            32
        ) AS "nome"
    FROM "User"
),
normalizado AS (
    -- só sobra menos de 2 caracteres de um nome feito de pontos ("..." → "."):
    -- completa com `_` + começo do id, que é da própria conta
    SELECT
        "id",
        "createdAt",
        "username",
        CASE
            WHEN length("nome") >= 2 THEN "nome"
            ELSE left("nome" || '_' || regexp_replace(lower(left("id", 8)), '[^a-z0-9]', '_', 'g'), 32)
        END AS "nome"
    FROM base
),
ordenado AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY "nome" ORDER BY "createdAt", "id") AS "posicao"
    FROM normalizado
),
-- o nome de cada grupo fica com a conta mais antiga; nenhum sufixo pode cair aqui
ocupado AS (
    SELECT "nome" FROM ordenado WHERE "posicao" = 1
),
-- as demais contas de cada grupo, numeradas por prefixo (o corte em 27 pode
-- juntar grupos de base longa numa família só, e a numeração é da família)
excedente AS (
    SELECT
        "id",
        left("nome", 27) AS "prefixo",
        row_number() OVER (PARTITION BY left("nome", 27) ORDER BY "createdAt", "id") AS "vez"
    FROM ordenado
    WHERE "posicao" > 1
),
-- teto da série de sufixos: um por conta da família, mais um para cada nome
-- ocupado que comece com o prefixo + `_` (o máximo de vagas que podem estar
-- tomadas) — garante vaga livre para todo mundo
familia AS (
    SELECT
        e."prefixo",
        count(*) + 1 + (
            SELECT count(*)
            FROM ocupado o
            WHERE left(o."nome", length(e."prefixo") + 1) = e."prefixo" || '_'
        ) AS "teto"
    FROM excedente e
    GROUP BY e."prefixo"
),
vaga AS (
    SELECT
        f."prefixo",
        f."prefixo" || '_' || s."sufixo" AS "nome",
        row_number() OVER (PARTITION BY f."prefixo" ORDER BY s."sufixo") AS "vez"
    FROM familia f
    CROSS JOIN LATERAL generate_series(2, f."teto") AS s("sufixo")
    WHERE NOT EXISTS (
        SELECT 1 FROM ocupado o WHERE o."nome" = f."prefixo" || '_' || s."sufixo"
    )
),
destino AS (
    SELECT "id", "nome" AS "novo" FROM ordenado WHERE "posicao" = 1
    UNION ALL
    SELECT e."id", v."nome" AS "novo"
    FROM excedente e
    JOIN vaga v ON v."prefixo" = e."prefixo" AND v."vez" = e."vez"
)
UPDATE "User" AS u
SET "username" = '~' || d."novo"
FROM destino d
WHERE u."id" = d."id"
  AND u."username" <> d."novo";

-- ── passada 2: tira o `~` (só quem mudou tem; a regra antiga não aceitava `~`) ──
UPDATE "User"
SET "username" = substr("username", 2)
WHERE "username" LIKE '~%';

-- ── conferência: qualquer nome fora da regra desfaz a migration inteira ──
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM "User"
        WHERE "username" !~ '^[a-z0-9_.]{2,32}$'
           OR "username" ~ '[.]{2}'
    ) THEN
        RAISE EXCEPTION 'username fora da regra nova depois da normalização';
    END IF;
END $$;
