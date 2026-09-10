import type { APIEmbed } from "discord.js";
import { EXPLICACAO_DO_MODO } from "./modos";
import type { Painel } from "./estado";

/** Volt Lime (`design.md`): a cor de destaque do Streamz. */
export const COR = 0x9be31f;

/** Corta sem deixar a reticência estourar o limite. */
export function truncar(texto: string, limite: number): string {
  return texto.length <= limite ? texto : `${texto.slice(0, Math.max(0, limite - 1))}…`;
}

/**
 * A mensagem do painel: **um título em texto e o resto num embed**.
 *
 * O título vai no `content` e não dentro do embed por um motivo prático: o
 * `POST /channels/:id/messages` da casca ainda exige `content` (`50035
 * content[BASE_TYPE_REQUIRED]` numa mensagem só com `embeds`), então uma
 * mensagem sem texto nenhum simplesmente não sai. Em vez de mandar um `content`
 * de enfeite, o título — que toda mensagem de painel tem — mora nele: é o que
 * aparece na notificação e na prévia da conversa, onde embed não aparece.
 *
 * O cargo entra como **menção** (`<@&id>`) e não como nome copiado: menção
 * acompanha a renomeação do cargo e mostra a cor dele. O rótulo, quando existe,
 * vem antes — é a frase que explica *por que* alguém pegaria aquele cargo
 * ("Avisos de live"), e o nome do cargo sozinho raramente diz isso.
 *
 * Painel sem item nenhum diz que está vazio em vez de sair como um embed mudo:
 * é o estado logo depois do `/painel criar`, e quem acabou de criar precisa
 * saber qual é o próximo passo.
 */
export function mensagemDoPainel(painel: Painel): { content: string; embeds: APIEmbed[] } {
  return { content: `**${truncar(painel.titulo, 250)}**`, embeds: [embedDoPainel(painel)] };
}

/** Só o embed — o corpo do painel. Ver `mensagemDoPainel`. */
export function embedDoPainel(painel: Painel): APIEmbed {
  const itens = Object.values(painel.itens);
  const linhas = itens.map((i) =>
    i.rotulo.trim() === ""
      ? `${i.emoji} — <@&${i.cargoId}>`
      : `${i.emoji} — **${truncar(i.rotulo, 80)}** · <@&${i.cargoId}>`,
  );

  const corpo = [
    painel.descricao.trim(),
    linhas.length > 0
      ? linhas.join("\n")
      : "_Nenhum cargo ainda. Quem administra usa `/painel adicionar` para pôr o primeiro._",
    `-# Reaja para pegar o cargo · ${EXPLICACAO_DO_MODO[painel.modo]}`,
  ]
    .filter((p) => p !== "")
    .join("\n\n");

  // Sem `title`: ele é o `content` da mensagem (ver `mensagemDoPainel`), e
  // repeti-lo aqui mostraria o mesmo texto duas vezes, uma em cima da outra.
  return { color: COR, description: truncar(corpo, 4000) };
}

/** Uma linha do `/painel listar`. */
export function linhaDaLista(mensagemId: string, painel: Painel): string {
  const quantos = Object.keys(painel.itens).length;
  return (
    `• **${truncar(painel.titulo, 60)}** — \`${mensagemId}\` em <#${painel.canalId}> · ` +
    `modo **${painel.modo}** · ${quantos} ${quantos === 1 ? "cargo" : "cargos"}`
  );
}
