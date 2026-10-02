-- Perfil do servidor e Engajamento (paridade das configurações do servidor com
-- o Discord).
--
-- Aditiva e com padrão em toda coluna obrigatória: os servidores que já existem
-- ficam sem características e sem jogos, com o perfil público, com todas as
-- mensagens de sistema ligadas (as chaves guardam "enviar", não "suprimir",
-- então ligado é o comportamento de antes), notificação padrão "Todas as
-- mensagens", sem canal AFK com 5 minutos de inatividade e sem widget. Nenhum
-- backfill.

-- CreateEnum
CREATE TYPE "GuildDefaultNotifications" AS ENUM ('ALL', 'MENTIONS');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "activityFeed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "afkChannelId" TEXT,
ADD COLUMN     "afkTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "defaultNotifications" "GuildDefaultNotifications" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "games" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "privateProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "systemBoostMessage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "systemTips" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "systemWelcomeMessage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "systemWelcomeSticker" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "traits" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "widgetEnabled" BOOLEAN NOT NULL DEFAULT false;
