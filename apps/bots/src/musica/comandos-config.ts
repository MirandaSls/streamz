import type { Client, Guild } from "discord.js";
import type { Comando, Contexto } from "../runtime/tipos";
import { obterServico } from "./servico";

/** Volt Lime (`design.md`), a mesma cor dos outros embeds do bot. */
const COR = 0x9be31f;

/**
 * Só quem está no **mesmo canal de voz** do bot mexe nas configurações.
 * Sem player ativo não há canal a comparar, e então qualquer pessoa de um
 * servidor pode ligar/desligar (a configuração vale para a próxima sessão).
 *
 * Não há checagem de "gerenciar servidor" para o 24/7: o `Contexto` do runtime
 * não expõe permissões de quem chamou, e inventar uma regra aqui divergiria do
 * resto dos comandos.
 */
async function podeAlterar(ctx: Contexto): Promise<boolean> {
  if (!ctx.guildId) {
    await ctx.responder({ conteudo: "Só funciona dentro de um servidor.", efemera: true });
    return false;
  }
  const jogador = obterServico().jogador(ctx.guildId);
  if (!jogador?.voiceChannelId) return true;

  const cliente = ctx.bot.cliente as Client<true>;
  const servidor: Guild | undefined = cliente.guilds.cache.get(ctx.guildId);
  const membro =
    servidor?.members.cache.get(ctx.usuarioId) ??
    (await servidor?.members.fetch(ctx.usuarioId).catch(() => null));
  if (membro?.voice?.channelId === jogador.voiceChannelId) return true;

  await ctx.responder({
    conteudo: "Entra no canal de voz em que eu estou para mudar isso.",
    efemera: true,
  });
  return false;
}

async function alternar(
  ctx: Contexto,
  campo: "autoplay" | "vinte4Sete",
  rotulo: string,
): Promise<void> {
  if (!(await podeAlterar(ctx)) || !ctx.guildId) return;
  const { configuracao } = obterServico();
  const atual = await configuracao.ler(ctx.guildId);
  const nova = await configuracao.alterar(ctx.guildId, { [campo]: !atual[campo] });
  await ctx.responder({
    embeds: [{ color: COR, description: `${rotulo} ${nova[campo] ? "ligado" : "desligado"}` }],
  });
}

const autoplay: Comando = {
  nome: "autoplay",
  descricao: "Liga/desliga o autoplay: quando a fila acaba, toca faixas parecidas",
  apelidos: ["autop"],
  executar: (ctx) => alternar(ctx, "autoplay", "Autoplay"),
};

/**
 * O nome de slash só aceita `[a-z0-9-_]`: por isso `24-7`; `247` e `24/7`
 * valem só no prefixo `!`.
 */
const vinte4sete: Comando = {
  nome: "24-7",
  descricao: "Liga/desliga o modo 24/7: fico na call mesmo com a fila vazia",
  apelidos: ["247", "24/7"],
  executar: (ctx) => alternar(ctx, "vinte4Sete", "Modo 24/7"),
};

export const COMANDOS_DE_CONFIG: Comando[] = [autoplay, vinte4sete];
