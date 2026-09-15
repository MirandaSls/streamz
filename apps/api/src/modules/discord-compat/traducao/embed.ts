import {
  achatarEmbeds as achatarEmbedsDoContrato,
  conferirMensagemDeBot,
  validarPayloadDeBot,
  type ErroDePayloadDeBot,
  type EstadoDeMensagemDeBot,
  type PayloadDeBot,
} from "@streamz/shared";
import type { ErrosPorCampo } from "../erros";

/**
 * `embeds` e `components` do Discord → o que o Streamz guarda.
 *
 * ── Onda 3 ── **O achatamento saiu como forma de guardar.** Até a onda 3 o
 * embed virava texto (título, descrição, campos, rodapé) porque o Streamz não
 * tinha embed rico e uma mensagem só de embed chegava ao navegador como linha
 * em branco. Agora o objeto é **guardado** (`MessageBotPayload`, ou as colunas
 * da `EphemeralMessage`) e a web o desenha como o Discord.
 *
 * O texto achatado continua existindo, mas mora no contrato
 * (`achatarEmbeds`/`achatarPayloadDeBot` de `@streamz/shared`) e serve só aos
 * lugares sem renderizador: busca, trecho de resposta citada, prévia da lista
 * de conversas, notificação. A lista está em `docs/CONTRATO-ONDA-3.md`.
 *
 * Puro, sem dependência de Nest ou Prisma — testável como as outras traduções.
 */

/**
 * Reexportado para o teste antigo e para quem ainda precisa do texto
 * (tolerante: aceita `unknown[]`). **Não** use para gravar mensagem.
 */
export function achatarEmbeds(embeds: readonly unknown[]): string {
  return achatarEmbedsDoContrato(embeds);
}

/**
 * O corpo cru de um bot → `PayloadDeBot` validado e normalizado, ou os erros no
 * formato do `50035` do Discord.
 *
 * `estado`, quando vem, liga também as regras de conjunto
 * (`conferirMensagemDeBot`) — é o caso da criação, em que o corpo **é** o estado
 * final. Na edição o estado final depende do que está no banco, e quem confere
 * é o `MessagesService.editarComoBot`.
 */
export function lerPayloadDeBot(
  corpo: { content?: unknown; embeds?: unknown; components?: unknown; flags?: unknown },
  estado?: { temAnexos?: boolean },
): { ok: true; payload: PayloadDeBot } | { ok: false; erros: ErrosPorCampo } {
  const cru: Record<string, unknown> = {};
  // só o que veio: ausente é "não mexe" no PATCH, e o zod não pode inventar
  if (corpo.content !== undefined) cru.content = corpo.content;
  if (corpo.embeds !== undefined) cru.embeds = corpo.embeds;
  if (corpo.components !== undefined) cru.components = corpo.components;
  if (corpo.flags !== undefined) cru.flags = corpo.flags;

  const r = validarPayloadDeBot(cru);
  if (!r.ok) return { ok: false, erros: errosNoFormatoDoDiscord(r.erros) };

  if (estado) {
    const final: EstadoDeMensagemDeBot = {
      content: (r.payload.content ?? "").trim(),
      embeds: r.payload.embeds ?? [],
      components: r.payload.components ?? [],
      flags: r.payload.flags ?? 0,
      temAnexos: estado.temAnexos ?? false,
    };
    const erros = conferirMensagemDeBot(final);
    if (erros.length > 0) return { ok: false, erros: errosNoFormatoDoDiscord(erros) };
  }
  return { ok: true, payload: r.payload };
}

/**
 * `[{ caminho: ["embeds", 0, "title"], … }]` →
 * `{ embeds: { "0": { title: { _errors: [{ code, message }] } } } }`.
 *
 * É o aninhamento do `50035` do Discord, que o `DiscordAPIError` do
 * `@discordjs/rest` percorre para montar a mensagem de erro ("embeds[0].title:
 * Must be 256 or fewer in length"). O tipo `ErrosPorCampo` de `erros.ts` só
 * descreve o primeiro nível; o objeto real é mais fundo, daí o `as`.
 */
export function errosNoFormatoDoDiscord(erros: readonly ErroDePayloadDeBot[]): ErrosPorCampo {
  const raiz: Record<string, unknown> = {};
  for (const erro of erros) {
    let no = raiz;
    const caminho = erro.caminho.length > 0 ? erro.caminho.map(String) : ["_body"];
    for (const parte of caminho) {
      if (typeof no[parte] !== "object" || no[parte] === null) no[parte] = {};
      no = no[parte] as Record<string, unknown>;
    }
    if (!Array.isArray(no._errors)) no._errors = [];
    (no._errors as { code: string; message: string }[]).push({
      code: erro.codigo,
      message: erro.mensagem,
    });
  }
  return raiz as unknown as ErrosPorCampo;
}
