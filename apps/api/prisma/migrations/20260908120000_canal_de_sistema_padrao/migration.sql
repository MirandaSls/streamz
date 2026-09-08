-- Canal de sistema padrão nos servidores que já existem.
--
-- Correção de **dado**, não de esquema: nenhuma coluna muda. `Guild.systemChannelId`
-- já existe (migration h-moderacao) e é onde entram as mensagens "X entrou no
-- servidor". Só que a criação de servidor nunca o preenchia, então `announceJoin`
-- voltava cedo e servidor nenhum anunciava quem entrava até o dono escolher o
-- canal à mão em Configurações → Visão geral. A criação passou a apontar para o
-- #geral; aqui os servidores antigos ganham o mesmo.
--
-- Critério: o canal de TEXTO mais antigo do servidor (o #geral, em quem nasceu
-- com o par padrão). `position` empata entre canais de categorias diferentes,
-- por isso `createdAt` vem primeiro; o `id` no fim só desempata para o
-- resultado ser sempre o mesmo.
--
-- Servidor com o campo já preenchido não é tocado, e servidor sem nenhum canal
-- de texto continua com NULL. Quem tiver desligado o anúncio de propósito
-- (limpando o campo) volta a tê-lo ligado uma vez — NULL não distingue "nunca
-- teve" de "desligou", e até hoje todo NULL é do primeiro caso, porque nada
-- preenchia esse campo na criação.

UPDATE "Guild" AS g
SET "systemChannelId" = (
  SELECT c."id"
  FROM "Channel" AS c
  WHERE c."guildId" = g."id"
    AND c."type" = 'TEXT'
  ORDER BY c."createdAt" ASC, c."position" ASC, c."id" ASC
  LIMIT 1
)
WHERE g."systemChannelId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "Channel" AS c
    WHERE c."guildId" = g."id"
      AND c."type" = 'TEXT'
  );
