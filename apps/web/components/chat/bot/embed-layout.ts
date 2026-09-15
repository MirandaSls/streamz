/**
 * ── onda 3 ── As contas puras do embed rico e da mensagem de bot, fora do
 * componente para terem teste (`embed-layout.test.ts`) sem DOM.
 *
 * Nada aqui escolhe cor ou tamanho de interface: são as regras de **dado** do
 * Discord (quantos campos por linha, que flag esconde o quê, qual anexo o
 * embed já mostra). As medidas visuais moram no cabeçalho de `EmbedDeBot.tsx`.
 */

import {
  FLAGS_DE_MENSAGEM,
  temFlag,
  type Attachment,
  type CampoDeEmbed,
  type Embed,
  type Message,
} from "@streamz/shared";

// ── medidas que viram conta ─────────────────────────────────

/** `.gridContainer__623de{max-width:516px}` (`css-bruto/198496.7ea2af35bfe94977.css`). */
export const LARGURA_MAXIMA_DO_EMBED = 516;

/**
 * Teto da imagem grande. A largura saiu do print 1:1 `2026-09-02 173327.png`
 * (imagem do embed em x 471–869, 399px, na linha y=580: 400 com o
 * antisserrilhado da borda). A altura **não foi medida** — é o mesmo teto de
 * 300px que o `LinkEmbedCard` já usa, para uma imagem em pé não ocupar a tela.
 */
export const IMAGEM_MAXIMA = { largura: 400, altura: 300 } as const;

/**
 * Teto da thumbnail. **Não medido**: nem o CSS bruto (`.embedThumbnail__623de`
 * só dá posição e margem) nem os prints 1:1 têm um embed com thumbnail, e a
 * imagem de documentação não tem escala. 80×80 é **provisório**, registrado
 * como pendência de medida no retorno do cartão 3b: quem tiver um print 1:1 de
 * embed com thumbnail troca o número aqui.
 */
export const THUMBNAIL_MAXIMA = { largura: 80, altura: 80 } as const;

// ── campos ──────────────────────────────────────────────────

/**
 * A coluna de cada campo, no formato `grid-column` do Discord (`"1 / 13"`,
 * `"1 / 7"`, `"7 / 13"`, `"1 / 5"`…): a grade tem 12 trilhas; um campo não
 * inline ocupa a linha inteira, e campos `inline` seguidos dividem a linha em
 * até **3** (ou **2**, quando o embed tem thumbnail — a thumbnail come a coluna
 * da direita). É o que o cliente do Discord escreve em `style` em cada
 * `.embedField__623de`; o CSS (`.embedFields__623de{display:grid;grid-gap:8px}`)
 * não declara as trilhas, e é por isso que elas ficam implícitas.
 */
export function colunasDosCampos(
  campos: readonly Pick<CampoDeEmbed, "inline">[],
  temThumbnail: boolean,
): string[] {
  const porLinha = temThumbnail ? 2 : 3;
  const linhas: number[][] = [];
  let atual: number[] = [];
  campos.forEach((campo, i) => {
    if (campo.inline) {
      if (atual.length === porLinha) {
        linhas.push(atual);
        atual = [];
      }
      atual.push(i);
      return;
    }
    if (atual.length > 0) linhas.push(atual);
    atual = [];
    linhas.push([i]);
  });
  if (atual.length > 0) linhas.push(atual);

  const colunas = new Array<string>(campos.length);
  for (const linha of linhas) {
    const passo = 12 / linha.length;
    linha.forEach((indice, posicao) => {
      colunas[indice] = `${1 + posicao * passo} / ${1 + (posicao + 1) * passo}`;
    });
  }
  return colunas;
}

// ── cor ─────────────────────────────────────────────────────

/**
 * `color` do embed (inteiro RGB) → `#rrggbb`, ou `null` quando o bot não mandou
 * cor — aí a barra usa o token `--border-normal`, que é o padrão do
 * `.embedFull__623de{border-inline-start:4px solid var(--border-normal)}`.
 * `0` é preto de verdade (o bot pediu), não "sem cor".
 */
export function corDaBarra(color: number | null | undefined): string | null {
  if (color === null || color === undefined || !Number.isInteger(color)) return null;
  if (color < 0 || color > 0xffffff) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}

// ── tamanho de mídia ────────────────────────────────────────

/**
 * Encaixa `largura × altura` dentro do teto sem esticar nem distorcer. Sem as
 * dimensões (bot mandou só a URL e o servidor não as preencheu) devolve `null`:
 * a tela deixa a imagem no tamanho natural limitada por `max-width/max-height`.
 */
export function tamanhoQueCabe(
  largura: number | null | undefined,
  altura: number | null | undefined,
  teto: { largura: number; altura: number },
): { largura: number; altura: number } | null {
  if (!largura || !altura || largura <= 0 || altura <= 0) return null;
  const escala = Math.min(1, teto.largura / largura, teto.altura / altura);
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

// ── o que a mensagem mostra ─────────────────────────────────

type MensagemDeBot = Pick<Message, "flags" | "suppressEmbeds" | "embeds" | "attachments">;

/** `IS_COMPONENTS_V2`: a mensagem é só componentes (sem `content` nem embeds). */
export function ehComponentsV2(m: Pick<Message, "flags">): boolean {
  return temFlag(m.flags, FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2);
}

/** `LOADING`: o "<bot> está pensando…" do callback 5 — o `content` é provisório. */
export function estaPensando(m: Pick<Message, "flags">): boolean {
  return temFlag(m.flags, FLAGS_DE_MENSAGEM.LOADING);
}

/**
 * `SUPPRESS_EMBEDS` desliga **todos** os embeds da mensagem: o rico do bot e a
 * prévia de link. A flag é a coluna `suppressEmbeds` refletida; olhar as duas
 * cobre o payload antigo (sem `flags`) e o evento que só traz uma delas.
 */
export function embedsSuprimidos(m: Pick<Message, "flags" | "suppressEmbeds">): boolean {
  return Boolean(m.suppressEmbeds) || temFlag(m.flags, FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS);
}

/** Os embeds ricos que a tela desenha (nenhum em v2, em "pensando" ou suprimidos). */
export function embedsVisiveis(m: Pick<Message, "flags" | "suppressEmbeds" | "embeds">): Embed[] {
  if (!m.embeds?.length) return [];
  if (ehComponentsV2(m) || estaPensando(m) || embedsSuprimidos(m)) return [];
  return m.embeds;
}

/**
 * Os anexos que aparecem soltos, abaixo do conteúdo.
 *
 * - **v2**: nenhum. "Attachments won't show up in the message unless they are
 *   referenced by a component" (`components/reference.mdx`) — e os citados já
 *   são desenhados pelo próprio componente (File, galeria, thumbnail).
 * - **legado com embed**: some o anexo que um embed usa por `attachment://`
 *   (imagem, thumbnail, ícone do autor ou do rodapé), como no Discord, onde a
 *   imagem enviada para o embed não aparece duas vezes. O DTO já trocou
 *   `attachment://<nome>` pela URL do anexo, então a comparação é pela URL; o
 *   nome cobre a referência que ficou sem resolver.
 *
 * Embed suprimido não esconde anexo: o anexo continua sendo da mensagem.
 */
export function anexosVisiveis(m: MensagemDeBot): Attachment[] {
  if (ehComponentsV2(m)) return [];
  const embeds = embedsVisiveis(m);
  if (embeds.length === 0) return m.attachments;
  const citados = new Set<string>();
  for (const e of embeds) {
    for (const url of [e.image?.url, e.thumbnail?.url, e.author?.icon_url, e.footer?.icon_url]) {
      if (url) citados.add(url);
    }
  }
  if (citados.size === 0) return m.attachments;
  return m.attachments.filter((a) => !citados.has(a.url) && !citados.has(`attachment://${a.filename}`));
}

// ── links ───────────────────────────────────────────────────

/**
 * O `url` do título, do autor e do provedor é **dado do bot** e vira `href`.
 * Só `http(s)` passa: `javascript:` ou `data:` num embed seria um clique que
 * executa código na página de quem lê. O Discord também só aceita http/https
 * nesses campos.
 */
export function hrefSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
