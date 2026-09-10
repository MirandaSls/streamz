import { GatewayIntentBits } from "discord.js";
import { Permission } from "@streamz/shared";
import type { Bot, ContextoDoBot } from "../runtime/tipos";
import { COMANDOS } from "./comandos";
import { diretorio, drenar, esquecer } from "./estado";

/**
 * **Streamz Moderação** — o bot oficial de moderação da instância.
 *
 * O nome, o ícone e a descrição são próprios. Os bots que fazem isto no Discord
 * são serviços fechados de outras empresas, que só falam com o `discord.com`:
 * não dá para instalá-los aqui, e usar o nome, a arte ou o texto deles seria se
 * passar por eles. Este roda neste servidor e o código está no repositório.
 *
 * ## O que ele faz hoje, e o que depende da casca
 *
 * Funciona ponta a ponta, agora:
 *
 * - `/aviso`, `/avisos`, `/limpar-avisos` — a ficha de cada pessoa, guardada
 *   pelo próprio bot (ver `estado.ts`);
 * - `/limpar` — apaga de verdade, uma mensagem por vez, pelo
 *   `DELETE /channels/:id/messages/:mid` da casca;
 * - `/registro-de-moderacao` — o canal onde cada ação é publicada;
 * - **as regras de permissão e hierarquia de todos os comandos**, que é a parte
 *   que não pode errar (`hierarquia.ts`).
 *
 * Depende de rota que a casca de compatibilidade ainda não tem:
 * `/banir`, `/desbanir`, `/expulsar`, `/silenciar` e `/dessilenciar`. O bot
 * chama o caminho certo (`PUT /guilds/:id/bans/:uid`,
 * `DELETE /guilds/:id/members/:uid`, `PATCH /guilds/:id/members/:uid` — é o que
 * `member.ban()`, `member.kick()` e `member.timeout()` do discord.js emitem) e,
 * enquanto ela responder 404, **responde uma frase que diz isso** em vez de
 * pendurar ou cuspir uma pilha de erro. É a mesma postura do bot de música com
 * a ponte de voz, e pelo mesmo motivo: dependência declarada se comporta.
 *
 * O comportamento existe no Streamz — `apps/api/src/modules/moderation/` tem
 * banir, expulsar e silenciar —, mas as rotas de lá são do REST interno, atrás
 * do `JwtGuard`, cujo credencial é o token de uma **pessoa**. Um bot que
 * carregasse o JWT de um humano agiria com a identidade dele, que é o oposto do
 * que serve um registro de moderação. Ver `servico.ts` para a tabela completa.
 *
 * Quando as rotas entrarem na casca, **nada neste bot muda**.
 */

const bot: Bot = {
  nome: "Streamz Moderação",

  // Cabe em MAX_APP_DESCRIPTION (300) — há teste para isso, porque a fundação
  // quebrou uma vez por um caractere a mais. A descrição diz o que o bot
  // **não** faz: os avisos são dele, não do servidor.
  descricao:
    "Banir, expulsar, silenciar por tempo, limpar mensagens e guardar avisos — " +
    "por barra ou pelo prefixo `!`. Confere a permissão e a hierarquia de cargos " +
    "de quem chama, e publica cada ação num canal de registro. Os avisos ficam " +
    "guardados pelo bot, não no servidor.",

  comandos: COMANDOS,

  // `GuildMembers` para o bot receber `GUILD_MEMBER_UPDATE` — é o evento que
  // conta que um silenciamento acabou ou que alguém mudou de cargo, e sem ele o
  // cache de membros envelhece e a hierarquia passa a ser calculada sobre a
  // foto da subida.
  intents: [GatewayIntentBits.GuildMembers],

  // O que a tela de instalação sugere: as quatro de moderação, mais ver e
  // escrever no canal onde responde. Nada além.
  permissoesPadrao:
    Permission.VIEW_CHANNEL |
    Permission.SEND_MESSAGES |
    Permission.MANAGE_MESSAGES |
    Permission.KICK_MEMBERS |
    Permission.BAN_MEMBERS |
    Permission.MODERATE_MEMBERS,

  icone: "assets/moderacao.png",

  aoIniciar(ctx: ContextoDoBot) {
    // Nada para conectar: o estado é lido do disco sob demanda. O log da pasta
    // existe porque um volume não montado só aparece na primeira escrita, e aí
    // já é tarde — com esta linha, `docker logs` mostra onde ele **acha** que
    // está gravando desde o primeiro segundo.
    ctx.log.info("estado por servidor em arquivo JSON", { diretorio: diretorio() });
  },

  async aoDesligar(ctx: ContextoDoBot) {
    // Um `/aviso` cujo `rename` ainda não aconteceu quando o SIGTERM chega é um
    // aviso perdido. São milissegundos.
    await drenar();
    esquecer();
    ctx.log.info("estado gravado");
  },
};

export default bot;
