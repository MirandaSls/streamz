import type { ApplicationCommandDataResolvable, Client } from "discord.js";
import { Events } from "discord.js";
import { acharComando, lerInvocacao } from "./argumentos";
import { contextoDaInteracao, contextoDaMensagem } from "./contexto";
import type { Bot, Comando, ContextoDoBot } from "./tipos";

/** O prefixo da alternativa ao `/`. Configurável, mas ninguém troca. */
export const PREFIXO = (process.env.BOTS_PREFIXO ?? "!").trim() || "!";

/**
 * Um `Comando` nosso no formato que o `PUT /applications/:id/commands` espera.
 *
 * Não usamos `SlashCommandBuilder`: ele valida com as regras do Discord (que
 * são as nossas) mas obriga um método por tipo de opção (`addStringOption`,
 * `addIntegerOption`, …), o que viraria um `switch` do mesmo tamanho deste
 * objeto — só que com uma dependência a mais entre o contrato e a lib.
 */
export function paraORegistro(comando: Comando): ApplicationCommandDataResolvable {
  return {
    name: comando.nome,
    description: comando.descricao,
    type: 1,
    options: (comando.opcoes ?? []).map((o) => ({
      name: o.nome,
      description: o.descricao,
      type: o.tipo,
      required: o.obrigatoria ?? false,
      ...(o.escolhas
        ? { choices: o.escolhas.map((e) => ({ name: e.nome, value: e.valor })) }
        : {}),
    })),
  } as ApplicationCommandDataResolvable;
}

/**
 * Registra os comandos de barra **globais** na subida.
 *
 * Globais e não por servidor: o bot oficial é instalado por muita gente, e
 * registrar por servidor exigiria um `PUT` a cada `GUILD_CREATE` — N chamadas
 * que se repetem a cada reconexão. O `PUT` global é **sobrescrita em bloco**:
 * o que sumiu do código some do servidor, que é justamente o que se quer de um
 * deploy.
 */
export async function registrarComandos(cliente: Client, bot: Bot, ctx: ContextoDoBot) {
  const aplicacao = cliente.application;
  if (!aplicacao) {
    // `client.application` vem do `READY` (`new ClientApplication(client,
    // data.application)`). Sem ele não há a quem registrar, e seguir em frente
    // deixaria um bot vivo sem nenhum `/` — melhor falhar alto.
    throw new Error("o READY não trouxe `application`; não dá para registrar os comandos");
  }
  const dados = bot.comandos.map(paraORegistro);
  const criados = await aplicacao.commands.set(dados);
  ctx.log.info("comandos de barra registrados", {
    quantidade: criados.size,
    comandos: bot.comandos.map((c) => c.nome),
  });
}

/**
 * Liga `interactionCreate` e `messageCreate` aos comandos do bot.
 *
 * As duas entradas caem no mesmo `executar(ctx)`; o que muda é só o adaptador
 * de contexto (ver `contexto.ts`).
 */
export function ligarComandos(cliente: Client, bot: Bot, ctx: ContextoDoBot) {
  cliente.on(Events.InteractionCreate, async (interacao) => {
    if (!interacao.isChatInputCommand()) return;
    const comando = acharComando(bot.comandos, interacao.commandName);
    if (!comando) {
      ctx.log.aviso("comando de barra desconhecido", { comando: interacao.commandName });
      return;
    }

    const contexto = contextoDaInteracao(ctx, interacao);
    try {
      await comando.executar(contexto);
    } catch (erro) {
      ctx.log.erro("comando de barra falhou", { comando: comando.nome, erro });
      // O usuário tem de saber que falhou. Se **isto** falhar também (a
      // interação expirou, a rede caiu), engolimos: um erro dentro do
      // tratamento de erro só polui o log.
      try {
        await contexto.responder({
          conteudo: "Deu erro aqui do meu lado. Tenta de novo?",
          efemera: true,
        });
      } catch {
        /* já era */
      }
    }
  });

  cliente.on(Events.MessageCreate, async (mensagem) => {
    // Bot não obedece bot: sem esta linha, dois bots oficiais no mesmo canal
    // com um `!` na resposta entrariam num laço.
    if (mensagem.author.bot) return;

    const invocacao = lerInvocacao(mensagem.content ?? "", PREFIXO);
    if (!invocacao) return;
    const comando = acharComando(bot.comandos, invocacao.nome);
    if (!comando) return;

    const contexto = contextoDaMensagem(ctx, comando, mensagem, invocacao.resto);
    try {
      await comando.executar(contexto);
    } catch (erro) {
      ctx.log.erro("comando de prefixo falhou", { comando: comando.nome, erro });
      try {
        await contexto.responder("Deu erro aqui do meu lado. Tenta de novo?");
      } catch {
        /* já era */
      }
    }
  });
}
