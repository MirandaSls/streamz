import { GatewayIntentBits } from "discord.js";
import { Permission } from "@streamz/shared";
import type { Bot, ContextoDoBot } from "../runtime/tipos";
import { COMANDOS } from "./comandos";
import { ServicoDeNiveis, definirServico, obterServico } from "./servico";

/**
 * **Streamz Níveis** — o bot oficial de XP e níveis da instância.
 *
 * Nome, arte e texto **próprios**. Os bots que fazem isto no Discord são
 * serviços fechados de outras empresas, que só falam com o `discord.com`: não
 * dá para instalá-los aqui, e usar o nome ou o visual deles seria se passar por
 * eles. Este roda neste servidor e o código está no repositório.
 *
 * ## O que ele faz
 *
 * Conta XP por mensagem (15–25 por vez, com **um minuto de carência** entre
 * ganhos, ignorando bots, comandos e canais marcados), sobe o nível pela curva
 * `5n² + 50n + 100` acumulada, anuncia a subida e entrega o cargo configurado
 * para aquele nível.
 *
 * ## O que ele **não** faz, e por quê
 *
 * 1. **Não entrega o cargo por nível ainda** — e é a única coisa que falta.
 *    Atribuir cargo é `PUT /guilds/:id/members/:usuario/roles/:cargo` no
 *    Discord, e a casca de compatibilidade só tem `GET`s de servidor, canal,
 *    cargo e membro (a escrita de membro é a F5). O bot guarda a configuração,
 *    tenta entregar, e **diz** que não conseguiu, com a rota que falta no log —
 *    ver `SEM_ROTA_DE_CARGOS` em `servico.ts`. No dia em que a rota existir,
 *    ele passa a entregar sem mudar uma linha.
 * 2. **Não conta XP de voz nem de reação.** Só mensagem. Contar tempo de call
 *    exigiria um relógio por pessoa por canal e um estado que sobrevive a
 *    reinício — é outro bot, não uma opção deste.
 * 3. **Não guarda nada no banco do Streamz.** O estado é um JSON por servidor
 *    num volume só dele; o porquê (e a migração) está no cabeçalho de
 *    `estado.ts`.
 */

const bot: Bot = {
  nome: "Streamz Níveis",

  // A descrição vai para "Descobrir aplicativos" e é contrato com quem
  // instala. `MAX_APP_DESCRIPTION` é **300** caracteres e a API recusa com um
  // 400 cru quem passar disso — a fundação já apanhou desse limite, e o
  // `identidade.spec.ts` existe para ninguém apanhar de novo.
  descricao:
    "Dá XP por mensagem e sobe o nível de quem conversa: ranking, cargos por " +
    "nível e anúncio de subida, por comando de barra ou pelo prefixo `!`. " +
    "Tem carência de 1 min entre ganhos, então flood não pontua. Não conta XP " +
    "de voz nem de reação.",

  comandos: COMANDOS,

  // **`GuildMembers` não é opcional aqui**, e custou uma execução da prova para
  // ficar claro: o `GUILD_CREATE` manda a lista de membros de então, mas
  // `GUILD_MEMBER_ADD` é filtrado por este intent — sem ele, quem entra no
  // servidor **depois** do bot nunca aparece em `guild.members.cache`, e todo
  // comando que resolve alguém por nome (`/nivel fulano`, `/dar-xp fulano`)
  // responde "não achei" para quem está ali do lado. No Streamz o intent não é
  // privilegiado (§7 do documento dos bots): a razão da restrição no Discord —
  // escala e privacidade de milhões — não existe numa instância própria.
  intents: [GatewayIntentBits.GuildMembers],


  // O que a tela de instalação sugere. `MANAGE_ROLES` está aí porque o bot
  // **vai** entregar cargo por nível assim que a API tiver a rota; pedir depois
  // obrigaria todo servidor a reinstalar o bot.
  permissoesPadrao:
    Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.MANAGE_ROLES,

  icone: "assets/niveis.png",

  async aoIniciar(ctx: ContextoDoBot) {
    const servico = new ServicoDeNiveis(ctx);
    definirServico(servico);
    servico.iniciar();
  },

  async aoDesligar() {
    // **A linha que faz a política de escrita fechar.** O estado vive em
    // memória e é gravado a cada 30 s ou 50 mudanças; sem este flush, um
    // `docker compose restart` custaria a todo mundo o XP do último meio
    // minuto. O runtime chama isto em SIGTERM/SIGINT.
    try {
      await obterServico().desligar();
    } finally {
      definirServico(null);
    }
  },
};

export default bot;
