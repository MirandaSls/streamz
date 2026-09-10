import { GatewayIntentBits } from "discord.js";
import { Permission } from "@streamz/shared";
import type { Bot, ContextoDoBot } from "../runtime/tipos";
import { COMANDOS } from "./comandos";
import { ServicoDeBoasVindas, definirServico } from "./servico";

/**
 * **Streamz Boas-vindas** — recebe quem chega no servidor.
 *
 * O nome e a arte são próprios. Os bots que fazem isto no Discord são serviços
 * de terceiros, de código fechado, que só falam com o `discord.com`: não dá
 * para instalá-los aqui, e usar o nome, o ícone ou a descrição deles seria se
 * passar por eles (§2 do `CONTRATO.md`).
 *
 * ## O que ele faz
 *
 * Um `guildMemberAdd` e um `guildMemberRemove`, e nada mais. Quando alguém
 * entra: publica a mensagem configurada no canal configurado (com `{usuario}`,
 * `{nome}`, `{servidor}` e `{contagem}`), manda a mesma coisa por DM se
 * pedirem, e dá um cargo se pedirem. Quando alguém sai, publica a mensagem de
 * saída, se houver.
 *
 * ## Nasce mudo
 *
 * **Tudo desligado por padrão.** Instalar o bot não faz ele escrever nada em
 * lugar nenhum; a primeira mensagem só sai depois de um `/boas-vindas canal`.
 * É a diferença entre um bot que se apresenta e um bot que já chega escrevendo
 * num canal que ninguém escolheu.
 *
 * ## O estado
 *
 * Um JSON por servidor em `/dados/<guildId>.json`, com escrita atômica, num
 * volume só dele — **nenhuma tabela no banco do Streamz**. O porquê está em
 * `armazem.ts`; o formato, em `configuracao.ts`.
 *
 * ## O que ele ainda não consegue nesta instância
 *
 * O cargo automático e a DM chamam as rotas padrão do discord.js
 * (`PUT /guilds/:id/members/:uid/roles/:rid` e `POST /users/@me/channels`), e a
 * casca de compatibilidade ainda não tem nenhuma das duas (as rotas de bot
 * estão em `apps/api/src/modules/discord-compat/rest/`; DM com bot é F5 pelo §9
 * do documento). O bot chama assim mesmo e, quando leva 404, **diz qual rota
 * falta** em vez de fingir que deu certo — no log e na resposta de quem
 * configurou. No dia em que a rota existir, ele passa a funcionar sem uma linha
 * de mudança aqui. Ver `SEM_ROTA_DE_CARGO` e `SEM_ROTA_DE_DM` em `servico.ts`.
 */

const bot: Bot = {
  nome: "Streamz Boas-vindas",

  // A descrição vai para o diretório e é contrato com quem instala: ela diz que
  // o bot nasce desligado e que cargo e DM dependem da instância — as duas
  // coisas que gerariam "instalei e não fez nada".
  descricao:
    "Recebe quem chega: mensagem no canal que você escolher, com {usuario}, " +
    "{nome}, {servidor} e {contagem}. Também mensagem de saída, cargo automático " +
    "e boas-vindas por DM. Nasce desligado: nada acontece antes de você " +
    "configurar. Cargo e DM dependem de rotas que a instância ainda não abre.",

  comandos: COMANDOS,

  // **Obrigatório**: `GUILD_MEMBER_ADD` é filtrado por este intent (§7 do
  // documento). Sem ele o bot sobe, conecta, registra os comandos — e nunca
  // recebe uma entrada. É o defeito mais caro que este bot poderia ter, porque
  // parece que tudo está no ar.
  intents: [GatewayIntentBits.GuildMembers],

  // O que a tela de instalação sugere. `MANAGE_ROLES` é do cargo automático;
  // sem ele o `/autorole` fica configurado e o cargo nunca sai.
  permissoesPadrao: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.MANAGE_ROLES,

  icone: "assets/boas-vindas.png",

  aoIniciar(ctx: ContextoDoBot) {
    const servico = new ServicoDeBoasVindas(ctx);
    definirServico(servico);
    servico.iniciar();
  },

  aoDesligar() {
    // Não há conexão para fechar: os ouvintes morrem com o `client.destroy()`
    // do runtime, e o estado já está no disco a cada escrita.
    definirServico(null);
  },
};

export default bot;
