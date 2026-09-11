import { Fragment, type ReactNode } from "react";
import Emoji, { CLASSE_EMOJI_INLINE, CLASSE_EMOJI_JUMBO } from "@/components/ui/Emoji";
import { parseBlocks, soEmojis, type Inline } from "./markdown-core";
import { API_URL } from "./config";
import { separarEmojis, temEmoji } from "./twemoji";

export { parseBlocks, parseInline, plainText, soEmojis } from "./markdown-core";
export type { Block, Inline } from "./markdown-core";

// ── render ───────────────────────────────────────────────────

export interface RenderOptions {
  /** username de quem está lendo — a própria menção ganha destaque amarelo. */
  meUsername?: string;
  /** nomes de exibição por username, para mostrar @Nome em vez de @user. */
  displayNames?: Record<string, string>;
  /** cargos do servidor aberto, para desenhar `<@&id>` com nome e cor. */
  roles?: { id: string; name: string; color: string | null }[];
  /** cargos de quem está lendo — a menção ao meu cargo ganha o mesmo destaque. */
  myRoleIds?: readonly string[];
  /** mensagem só de emoji: renderiza grande, como no Discord. */
  jumbo?: boolean;
}

/**
 * Imagem de um emoji personalizado. A URL vem do id — a rota é pública e o
 * conteúdo de um id nunca muda —, então não precisamos consultar a store para
 * desenhar: um emoji de servidor que eu deixei não vira quadrado quebrado.
 * O `alt` guarda `:nome:`, que é o que a mensagem tinha antes do token.
 *
 * A caixa é a mesma do emoji Unicode (`CLASSE_EMOJI_*` de `components/ui/Emoji`):
 * no Discord os dois são o mesmo `img.emoji`, e um personalizado ao lado de um
 * 😀 na mesma linha tem de ter a mesma altura e a mesma base.
 */
function EmojiPersonalizado({ name, id, jumbo }: { name: string; id: string; jumbo?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API_URL}/api/emojis/${id}/image`}
      alt={`:${name}:`}
      title={`:${name}:`}
      draggable={false}
      loading="lazy"
      className={jumbo ? CLASSE_EMOJI_JUMBO : CLASSE_EMOJI_INLINE}
    />
  );
}

/**
 * Texto corrido com os emoji Unicode trocados pelo Twemoji. Sem emoji, devolve
 * a string como está — é o caso comum, e não vale criar um fragmento por linha.
 */
function textoComEmoji(texto: string, jumbo: boolean | undefined, chave: number): ReactNode {
  if (!temEmoji(texto)) return texto;
  return (
    <Fragment key={chave}>
      {separarEmojis(texto).map((parte, j) =>
        parte.tipo === "texto" ? (
          parte.valor
        ) : (
          <Emoji key={j} emoji={parte.valor} tamanho={jumbo ? "jumbo" : "inline"} />
        ),
      )}
    </Fragment>
  );
}

/**
 * `text-transparent` esconde texto, não imagem: com o emoji virando `<img>`
 * (Twemoji e personalizado), ele apareceria através do spoiler fechado. Por
 * isso as imagens de dentro ficam `invisible` — ocupando o lugar, para o
 * spoiler não mudar de largura ao abrir — até ele abrir ou ganhar foco.
 */
function Spoiler({ children }: { children: ReactNode }) {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label="Spoiler — clique para revelar"
      className="group/sp rounded bg-spoiler-hidden-background px-0.5 text-transparent focus:text-text-default [&.open]:text-text-default [&:not(.open):not(:focus)_img]:invisible"
      onClick={(e) => e.currentTarget.classList.add("open")}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.classList.add("open")}
    >
      {children}
    </span>
  );
}

export function renderInline(nodes: Inline[], opts: RenderOptions = {}): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        // só aqui: `code` e `link` continuam texto puro — o Discord não troca
        // emoji dentro de código, e a URL tem de sair como foi escrita
        return textoComEmoji(n.v, opts.jumbo, i);
      case "bold":
        return <strong key={i} className="font-bold">{renderInline(n.c, opts)}</strong>;
      case "italic":
        return <em key={i}>{renderInline(n.c, opts)}</em>;
      case "underline":
        return <u key={i}>{renderInline(n.c, opts)}</u>;
      case "strike":
        return <s key={i}>{renderInline(n.c, opts)}</s>;
      case "code":
        return (
          <code key={i} className="rounded-[3px] bg-background-code px-1 py-0.5 font-mono text-[0.85em]">
            {n.v}
          </code>
        );
      case "spoiler":
        return <Spoiler key={i}>{renderInline(n.c, opts)}</Spoiler>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
            {n.href}
          </a>
        );
      case "emoji":
        return <EmojiPersonalizado key={i} name={n.name} id={n.id} jumbo={opts.jumbo} />;
      case "roleMention": {
        // cargo apagado (ou de outro servidor) vira "@cargo": o texto guarda o
        // id, então não há nome a mostrar — e sumir com a marcação seria pior
        const role = opts.roles?.find((r) => r.id === n.roleId);
        const meu = opts.myRoleIds?.includes(n.roleId);
        return (
          <span
            key={i}
            style={role?.color ? { color: role.color } : undefined}
            className={`rounded-[3px] px-0.5 font-medium ${
              meu ? "bg-status-warning/30 text-text-strong" : "bg-brand-500/25 text-mention-foreground"
            }`}
          >
            @{role?.name ?? "cargo"}
          </span>
        );
      }
      case "mention": {
        const me = opts.meUsername && n.username.toLowerCase() === opts.meUsername.toLowerCase();
        const nome = opts.displayNames?.[n.username.toLowerCase()] ?? n.username;
        return (
          <span
            key={i}
            className={`rounded-[3px] px-0.5 font-medium ${
              me ? "bg-status-warning/30 text-text-strong" : "bg-brand-500/25 text-mention-foreground hover:bg-brand-500 hover:text-control-primary-text-default"
            }`}
          >
            @{nome}
          </span>
        );
      }
    }
  });
}

const H_CLASS = { 1: "text-2xl font-bold mt-4 mb-2", 2: "text-xl font-bold mt-4 mb-2", 3: "text-base font-bold mt-4 mb-2" } as const;

/** Mensagem inteira renderizada. */
export function Markdown({ text, ...opts }: { text: string } & RenderOptions) {
  const blocks = parseBlocks(text);
  // "jumbo" é decidido aqui, sobre a mensagem inteira: um emoji sozinho numa
  // frase continua do tamanho da linha (ver soEmojis)
  const render = { ...opts, jumbo: opts.jumbo ?? soEmojis(blocks) };
  // O jumbo não mexe mais na fonte do contêiner: com o Twemoji o emoji Unicode
  // é imagem de 3rem, como o personalizado, e a linha fica com a altura dela.
  // No Discord o texto em volta segue em 1rem com linha de 1.375rem
  // (`.markup__75297`, css-bruto/606633.*.css): o espaço entre dois emoji jumbo
  // é o espaço de 1rem, estreito, e não o de uma fonte de 44px.
  return (
    <span className={render.jumbo ? "block" : "contents"}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            // linha vazia vira só a quebra
            return b.c.length === 0 ? <br key={i} /> : <div key={i}>{renderInline(b.c, render)}</div>;
          case "quote":
            return (
              <div key={i} className="my-0.5 border-l-4 border-border-normal pl-3">
                {renderInline(b.c, render)}
              </div>
            );
          case "h":
            return (
              <div key={i} className={H_CLASS[b.level]}>
                {renderInline(b.c, render)}
              </div>
            );
          case "codeblock":
            return (
              <pre
                key={i}
                className="my-1 max-w-[90%] overflow-x-auto rounded border border-border-subtle bg-background-code p-2 font-mono text-[0.875em] text-text-default"
              >
                {b.v}
              </pre>
            );
        }
      })}
    </span>
  );
}
