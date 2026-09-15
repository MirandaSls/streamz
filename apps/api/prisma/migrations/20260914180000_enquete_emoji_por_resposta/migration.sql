-- Emoji por resposta da enquete (rodada de correção da paridade, cartão
-- "enquetes").
--
-- As opções da enquete são `options TEXT[]` desde a origem — não há tabela de
-- opções. O emoji entra como um array paralelo, na mesma posição da opção, com
-- "" para a resposta sem emoji. Aditiva e com padrão: as enquetes que já existem
-- ficam com `{}` e aparecem sem emoji, sem nenhum backfill.
ALTER TABLE "Poll" ADD COLUMN "optionEmojis" TEXT[] DEFAULT ARRAY[]::TEXT[];
