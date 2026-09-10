import { GatewayIntentBits } from "discord.js";
import { Permission } from "@streamz/shared";
import type { Bot, ContextoDoBot } from "../runtime/tipos";
import { COMANDOS } from "./comandos";
import { ServicoDeCargos, definirServico, obterServico } from "./servico";

/**
 * **Streamz Cargos** — o bot oficial de cargos por reação.
 *
 * Quem administra publica um painel (uma mensagem com uma lista de emojis);
 * quem lê reage e ganha o cargo; tira a reação e perde. É o padrão que todo
 * servidor grande usa para deixar as pessoas escolherem sozinhas o que querem
 * ver — e o que faz este bot possível aqui é a F5 da compatibilidade: desde o
 * PR #196 a reação chega ao bot como `MESSAGE_REACTION_ADD` de verdade, com
 * `user_id` e emoji, e não mais como um `MESSAGE_UPDATE` da mensagem inteira
 * (§7 e §12 F5 do `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`).
 *
 * O nome é próprio. Os bots que fazem isto no Discord são serviços fechados de
 * terceiros que só falam com o `discord.com`; usar o nome, a arte ou a
 * descrição de qualquer um deles seria se passar por eles.
 *
 * ## Onde mora o estado
 *
 * Num arquivo JSON por servidor, em volume próprio (`/dados/<guildId>.json`),
 * com escrita atômica — **nada no banco do Streamz**. O porquê está em
 * `estado.ts`.
 *
 * ## O que ele precisa do servidor
 *
 * `Gerenciar cargos`, e o **cargo dele acima** dos cargos que distribui: a
 * regra do Streamz é a mesma para gente e para bot, ninguém mexe em cargo igual
 * ou acima do seu (`hierarquia.ts`). `Gerenciar mensagens` é opcional e só
 * serve para o modo `único` conseguir tirar a reação anterior de quem trocou de
 * cargo — sem ela a troca acontece igual, o painel é que fica mostrando duas
 * marcações.
 */

const bot: Bot = {
  nome: "Streamz Cargos",

  // ≤ 300 caracteres (`MAX_APP_DESCRIPTION`), conferido no `identidade.spec.ts`.
  // Diz o que ele **precisa** — o cargo acima — porque é a causa de quase toda
  // reclamação de bot de cargo por reação que existe.
  descricao:
    "Cargos por reação: publique um painel, ligue cada emoji a um cargo e quem reagir ganha o " +
    "cargo — tirar a reação devolve. Modos normal, único, só adicionar e travado. Só quem " +
    "gerencia cargos configura, e o cargo do bot precisa estar acima dos que ele distribui.",

  comandos: COMANDOS,

  // Sem este intent a API não manda `MESSAGE_REACTION_ADD`/`_REMOVE` para a
  // sessão (o filtro é por intent, §7), e o bot fica mudo sem nenhum erro.
  intents: [GatewayIntentBits.GuildMessageReactions],

  // O que a tela de instalação sugere. `MANAGE_ROLES` é o bot inteiro;
  // `ADD_REACTIONS` é como ele oferece as opções no painel; `MANAGE_MESSAGES`
  // é só para tirar a reação anterior no modo `único` (ver o cabeçalho).
  permissoesPadrao:
    Permission.VIEW_CHANNEL |
    Permission.SEND_MESSAGES |
    Permission.ADD_REACTIONS |
    Permission.MANAGE_ROLES |
    Permission.MANAGE_MESSAGES,

  icone: "assets/cargos.png",

  async aoIniciar(ctx: ContextoDoBot) {
    const servico = new ServicoDeCargos(ctx);
    definirServico(servico);
    await servico.iniciar();
  },

  async aoDesligar() {
    // Não há conexão a fechar nem call de que sair: o estado já está no disco a
    // cada escrita (é o ponto da escrita atômica). Só solta o singleton para o
    // processo não segurar o cliente.
    try {
      obterServico();
    } finally {
      definirServico(null);
    }
  },
};

export default bot;
