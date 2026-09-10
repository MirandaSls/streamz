-- Aplicativo oficial da instância (os bots de `apps/bots/`).
--
-- Aditiva e reversível: uma coluna booleana com DEFAULT false. Nenhuma linha
-- existente muda de comportamento — o diretório continua ordenando por data
-- para todo mundo, e só passa a pôr os oficiais na frente quando alguém marcar
-- um (o que só o administrador da instância consegue fazer).
ALTER TABLE "Application" ADD COLUMN "oficial" BOOLEAN NOT NULL DEFAULT false;

-- O índice é para a ordenação do diretório (`ORDER BY oficial DESC, ...`), que
-- é a única consulta que lê a coluna. Parcial de propósito: os oficiais são
-- meia dúzia e o índice não precisa carregar as outras linhas todas.
CREATE INDEX "Application_oficial_idx" ON "Application"("oficial") WHERE "oficial";
