-- Cor da faixa do perfil do servidor ("Faixa", nas configurações).
-- Nullable e sem default: servidor que nunca escolheu continua sem faixa, e o
-- cartão de prévia cai no fundo neutro.
ALTER TABLE "Guild" ADD COLUMN "bannerColor" TEXT;
