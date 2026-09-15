"use client";

import { useMemo, useState } from "react";
import { displayNameOf, type Embed, type Message } from "@streamz/shared";
import { horaCompleta } from "@/lib/format";
import { Markdown, parseInline, renderInline, type RenderOptions } from "@/lib/markdown";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { usePermissions } from "@/stores/permissions";
import { ui } from "@/stores/ui";
import {
  IMAGEM_MAXIMA,
  LARGURA_MAXIMA_DO_EMBED,
  THUMBNAIL_MAXIMA,
  colunasDosCampos,
  corDaBarra,
  hrefSeguro,
  tamanhoQueCabe,
} from "./embed-layout";

/** Sem cargos: referência estável, para o seletor do zustand não oscilar. */
const SEM_CARGOS: string[] = [];

/**
 * O corpo em markdown do embed (descrição e valor de campo) é 14px com linha
 * de 18px. O `Markdown` fixa 1rem/1.375rem na caixa raiz dele (é o corpo da
 * mensagem), então o embed sobrescreve **só essa caixa**, com `!` porque as
 * duas classes estão no mesmo elemento. Os blocos internos (título `#`, código,
 * citação) têm tamanho próprio e continuam como no Discord. O mesmo vale para o
 * `white-space`: a raiz do `Markdown` usa `break-spaces` (o corpo da mensagem),
 * e o embed é `pre-line` (`.embedDescription__623de`, `.embedFieldValue__623de`).
 *
 * 14px: print 1:1 `2026-09-02 173327.png`, "P" de "Perplexity is a free…" com
 * 10px de caixa-alta (y 160–169, x=472), que é a Noto Sans em 14px. Linha de
 * 18px: as três linhas da descrição do embed do Comet no mesmo print caem em
 * y=514, 532 e 550.
 */
const CORPO_DO_EMBED =
  "[&>span]:!text-[0.875rem] [&>span]:!leading-[1.125rem] [&>span]:![white-space:pre-line] text-text-default";

/** Anel de foco de teclado dos links e da imagem (o mesmo dos primitivos). */
const FOCO =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

/**
 * Um embed rico de bot, como o Discord o desenha (`.embed__623de.embedFull__623de`
 * e filhos, `docs/referencias-discord/tokens/css-bruto/198496.7ea2af35bfe94977.css`).
 *
 * Caixa (`.embed`, `.embedFull`, `.gridContainer`, `.grid`):
 * - fundo `--background-surface-high`, borda 1px `--border-subtle` e, à
 *   esquerda, **4px** na cor do embed — sem cor, `--border-normal`. No print
 *   1:1 `173327.png` a barra de um embed sem cor mede `#3b3b41` (x 455–458), a
 *   borda `#323237` (y=464) e o fundo `#242429`: os três tokens.
 * - raio 4px; `display:grid` com `max-width:max-content` — a caixa encolhe até
 *   o conteúdo — e o miolo com teto de **516px** (`.gridContainer__623de`).
 * - padding do miolo: 2px em cima, 16 à direita, 16 embaixo, 12 à esquerda
 *   (`padding-block:.5rem 1rem; padding-inline:.75rem 1rem; padding-top:.125rem`,
 *   o último vence o primeiro). Com thumbnail a grade vira
 *   `minmax(0,1fr) min-content`.
 *
 * Peças, na ordem da grade (todas com `margin-top:8px`, `.embedMargin__623de`,
 * menos a mídia):
 * - **provedor**: 12px — print 173327, "P" de "Perplexity AI" com 8px de
 *   caixa-alta (y 106–113). Link em `--interactive-text-default`, hover
 *   `--interactive-text-hover`.
 * - **autor** (`.embedAuthor`): flex centralizado; ícone 24×24 redondo com 8px
 *   à direita (`.embedAuthorIcon`); nome `.875rem` semibold `--text-strong`,
 *   também quando é link (`.embed .embedAuthorNameLink`), sublinhado no hover.
 * - **título** (`.embedTitle`): 1rem semibold `--text-strong`; com `url`, cor de
 *   link (`--text-link`, `#4d96ee` no print). Linha de 22px: no print o "C" de
 *   "Comet Browser" ocupa y 131–141, centrado na linha que vai de 125 a 147.
 * - **descrição** (`.embedDescription`): `white-space:pre-line`, `--text-default`,
 *   markdown completo (ver `CORPO_DO_EMBED`).
 * - **campos** (`.embedFields`): grade com `gap` 8px e `margin-top` 8px; nome com
 *   `margin-bottom:2px` em `--text-strong` semibold; valor em `--text-default`,
 *   `pre-line`, markdown. Colunas: `colunasDosCampos` (até 3 inline por linha, 2
 *   com thumbnail). O tamanho do nome e do valor **não foi medido** à parte: é o
 *   mesmo corpo de 14/18 da descrição.
 * - **imagem** (`.embedMedia`): `margin-top:16px`, raio 4px, até 400px de largura
 *   (print: 471–869) e 300 de altura (não medido); com thumbnail ocupa as duas
 *   colunas.
 * - **thumbnail** (`.embedThumbnail`): coluna 2, linhas 1–8, `justify-self:end`,
 *   `margin-inline-start:16px`, `margin-top:8px`, raio 4px; teto de 80×80
 *   **não medido** (ver `THUMBNAIL_MAXIMA`).
 * - **rodapé** (`.embedFooter`): flex centralizado; ícone 20×20 redondo com 8px à
 *   direita (`.embedFooterIcon`); texto `--text-default`; separador "•" com 4px
 *   de cada lado, peso medium (`.embedFooterSeparator`); com thumbnail ocupa as
 *   duas colunas. O tamanho do texto (12px, medium) **não está no CSS atual nem
 *   num print 1:1**: é a proporção da imagem do blog
 *   `blog/imagens/2022-06-safety-using-modmail-bots/01-modmail-novo-ticket.png`,
 *   onde o rodapé é visivelmente menor que a descrição de 14px.
 *
 * O `color` do bot é **dado**, não estilo do app: vai em `style`. A data do
 * rodapé segue o formato da hora da mensagem ("Hoje às 15:30"), como o Discord
 * faz com o `timestamp` do embed.
 */
export default function EmbedDeBot({ embed, message }: { embed: Embed; message: Message }) {
  const opcoes = useOpcoesDoMarkdown();
  const cor = corDaBarra(embed.color);
  const temThumbnail = Boolean(embed.thumbnail?.url);
  const campos = embed.fields ?? [];
  const colunas = colunasDosCampos(campos, temThumbnail);

  const colunaLarga = temThumbnail ? "col-[1/3]" : "col-[1/1]";
  const hrefDoTitulo = hrefSeguro(embed.url);
  const hrefDoAutor = hrefSeguro(embed.author?.url);
  const hrefDoProvedor = hrefSeguro(embed.provider?.url);
  const temRodape = Boolean(embed.footer?.text || embed.timestamp);

  function abrirImagem(url: string) {
    ui.openModal({
      kind: "galeria",
      urls: [url],
      alts: [embed.title ?? "Imagem do embed"],
      indice: 0,
      messageId: message.efemera ? undefined : message.id,
    });
  }

  return (
    <article
      /* `border-l-border-normal` depois de `border-border-subtle`: no Tailwind 3
         a cor de um lado sai depois da cor das quatro bordas, então vence sem
         `!`. A cor do bot, quando existe, entra por cima em `style`.
         `[&_.align-bottom]:h-/w-[18px]`: `.embed__623de .emoji{height:18px;
         width:18px}`, mas `useOpcoesDoMarkdown` só manda `jumbo:false` — isso
         escolhe `CLASSE_EMOJI_INLINE` (1.375em, ~19px aqui) em vez do jumbo,
         não os 18px fixos do embed. `align-bottom` é a classe real de
         `CLASSE_EMOJI_INLINE`/`CLASSE_EMOJI_JUMBO` (`components/ui/Emoji.tsx`)
         que nenhuma outra imagem do embed usa (avatar de autor/rodapé e mídia
         usam `object-contain` sozinho) — sem precisar de `!`: duas classes no
         seletor (`.embed .align-bottom`) já têm mais especificidade que a
         classe única `w-[1.375em]`/`h-[1.375em]` do emoji, então ganha
         independente da ordem no CSS gerado. */
      className="relative box-border grid w-fit max-w-full rounded border border-l-4 border-border-subtle border-l-border-normal bg-background-surface-high [&_.align-bottom]:h-[18px] [&_.align-bottom]:w-[18px]"
      style={cor ? { borderLeftColor: cor } : undefined}
    >
      <div className="min-w-0" style={{ maxWidth: LARGURA_MAXIMA_DO_EMBED }}>
        <div
          className={`grid overflow-hidden pb-4 pl-3 pr-4 pt-0.5 ${
            temThumbnail ? "grid-cols-[minmax(0,1fr)_min-content]" : "grid-cols-[auto]"
          }`}
        >
          {embed.provider?.name && (
            <div className="mt-2 min-w-0 text-[0.75rem] leading-4 text-text-default col-[1/1]">
              {hrefDoProvedor ? (
                <a
                  href={hrefDoProvedor}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`text-interactive-text-default hover:text-interactive-text-hover hover:underline ${FOCO}`}
                >
                  {embed.provider.name}
                </a>
              ) : (
                embed.provider.name
              )}
            </div>
          )}

          {embed.author?.name && (
            <div className="mt-2 flex min-w-0 items-center col-[1/1]">
              {embed.author.icon_url && (
                <ImagemQueSome
                  src={embed.author.icon_url}
                  className="mr-2 h-6 w-6 flex-none rounded-full object-contain"
                />
              )}
              {hrefDoAutor ? (
                <a
                  href={hrefDoAutor}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`min-w-0 flex-1 break-words text-[0.875rem] font-semibold text-text-strong hover:underline ${FOCO}`}
                >
                  {embed.author.name}
                </a>
              ) : (
                <span className="min-w-0 flex-1 break-words text-[0.875rem] font-semibold text-text-strong">
                  {embed.author.name}
                </span>
              )}
            </div>
          )}

          {embed.title && (
            <div className="mt-2 inline-block min-w-0 break-words text-[1rem] font-semibold leading-[22px] text-text-strong col-[1/1]">
              {hrefDoTitulo ? (
                <a
                  href={hrefDoTitulo}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`text-text-link hover:underline ${FOCO}`}
                >
                  {/* dentro do link, markdown sem link: `<a>` dentro de `<a>` não existe */}
                  {renderInline(parseInline(embed.title, false), opcoes)}
                </a>
              ) : (
                renderInline(parseInline(embed.title), opcoes)
              )}
            </div>
          )}

          {embed.description && (
            <div className={`mt-2 min-w-0 break-words col-[1/1] ${CORPO_DO_EMBED}`}>
              <Markdown text={embed.description} {...opcoes} />
            </div>
          )}

          {campos.length > 0 && (
            <div className="mt-2 grid min-w-0 gap-2 col-[1/1]">
              {campos.map((campo, i) => (
                <div key={i} className="min-w-0" style={{ gridColumn: colunas[i] }}>
                  <div className="mb-[2px] min-w-0 break-words text-[0.875rem] font-semibold leading-[1.125rem] text-text-strong">
                    {renderInline(parseInline(campo.name, false), opcoes)}
                  </div>
                  <div className={`min-w-0 break-words ${CORPO_DO_EMBED}`}>
                    <Markdown text={campo.value} {...opcoes} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {embed.image?.url && (
            <MidiaDoEmbed
              url={embed.image.url}
              largura={embed.image.width}
              altura={embed.image.height}
              teto={IMAGEM_MAXIMA}
              rotulo={embed.title ? `Imagem de ${embed.title}` : "Imagem do embed"}
              onAbrir={abrirImagem}
              className={`mt-4 min-w-0 ${colunaLarga}`}
            />
          )}

          {embed.thumbnail?.url && (
            <MidiaDoEmbed
              url={embed.thumbnail.url}
              largura={embed.thumbnail.width}
              altura={embed.thumbnail.height}
              teto={THUMBNAIL_MAXIMA}
              encolheComAColuna={false}
              rotulo="Miniatura do embed"
              onAbrir={abrirImagem}
              className="ml-4 mt-2 shrink-0 justify-self-end col-[2/2] row-[1/8]"
            />
          )}

          {temRodape && (
            <div className={`mt-2 flex min-w-0 items-center ${colunaLarga}`}>
              {embed.footer?.icon_url && (
                <ImagemQueSome
                  src={embed.footer.icon_url}
                  className="mr-2 h-5 w-5 flex-none rounded-full object-contain"
                />
              )}
              <span className="min-w-0 break-words text-[0.75rem] font-medium leading-4 text-text-default">
                {embed.footer?.text}
                {embed.footer?.text && embed.timestamp && (
                  <span aria-hidden="true" className="mx-1 inline-block font-medium text-text-default">
                    •
                  </span>
                )}
                {embed.timestamp && <time dateTime={embed.timestamp}>{horaCompleta(embed.timestamp)}</time>}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Imagem grande ou thumbnail: clicável (abre o visualizador, como no Discord),
 * no tamanho que cabe no teto e sem distorcer. Com as dimensões conhecidas a
 * caixa já nasce do tamanho final (sem a mensagem pular quando a imagem chega);
 * sem elas, a imagem fica natural, limitada pelo teto. `max-width:100%` porque
 * no celular a coluna é mais estreita que 400px.
 */
function MidiaDoEmbed({
  url,
  largura,
  altura,
  teto,
  rotulo,
  onAbrir,
  className,
  encolheComAColuna = true,
}: {
  url: string;
  largura?: number | null;
  altura?: number | null;
  teto: { largura: number; altura: number };
  /**
   * `false` na thumbnail. Ela mora numa trilha `min-content` da grade, e ali o
   * `max-width` em porcentagem resolve sobre largura zero: sem `width`/`height`
   * do bot (quase nenhum manda), a miniatura colapsava para 0px (bancada,
   * 2026-09-14). O teto de 80px já basta para ela; só a imagem grande precisa
   * encolher com a coluna no celular.
   */
  encolheComAColuna?: boolean;
  rotulo: string;
  onAbrir: (url: string) => void;
  className: string;
}) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return null;
  const tamanho = tamanhoQueCabe(largura, altura, teto);
  return (
    <button
      type="button"
      onClick={() => onAbrir(url)}
      aria-label={rotulo}
      className={`block w-fit ${encolheComAColuna ? "max-w-full" : ""} cursor-zoom-in overflow-hidden rounded ${FOCO} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setQuebrou(true)}
        className={`block h-auto rounded object-contain ${encolheComAColuna ? "max-w-full" : ""}`}
        style={
          tamanho
            ? { width: tamanho.largura, aspectRatio: `${tamanho.largura} / ${tamanho.altura}` }
            : { maxWidth: encolheComAColuna ? `min(${teto.largura}px, 100%)` : teto.largura, maxHeight: teto.altura }
        }
      />
    </button>
  );
}

/** Ícone de autor/rodapé: se a URL do bot não carrega, some em vez de mostrar a imagem quebrada. */
function ImagemQueSome({ src, className }: { src: string; className: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" loading="lazy" onError={() => setQuebrou(true)} className={className} />;
}

/**
 * As mesmas opções de markdown que o corpo da mensagem usa (nomes de exibição
 * nas menções, cargos com cor). `jumbo: false`: emoji sozinho num embed não
 * cresce — `.embed__623de .emoji{height:18px;width:18px}`.
 */
function useOpcoesDoMarkdown(): RenderOptions {
  const me = useAuth((s) => s.user);
  const roles = usePermissions((s) => s.roles);
  const members = useGuilds((s) => s.members);
  const meusCargos = useGuilds((s) => s.members.find((m) => m.user.id === me?.id)?.roleIds ?? SEM_CARGOS);
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.user.username.toLowerCase()] = displayNameOf(m.user);
    return map;
  }, [members]);
  return useMemo(
    () => ({ meUsername: me?.username, displayNames, roles, myRoleIds: meusCargos, jumbo: false }),
    [me?.username, displayNames, roles, meusCargos],
  );
}
