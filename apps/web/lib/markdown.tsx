import type { ReactNode } from "react";
import { parseBlocks, soEmojis, type Inline } from "./markdown-core";
import { API_URL } from "./config";

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

/** Lado do emoji personalizado dentro do texto e no modo "jumbo" (px). */
const EMOJI_PX = 22;
const EMOJI_PX_JUMBO = 48;

/**
 * Imagem de um emoji personalizado. A URL vem do id — a rota é pública e o
 * conteúdo de um id nunca muda —, então não precisamos consultar a store para
 * desenhar: um emoji de servidor que eu deixei não vira quadrado quebrado.
 * O `alt` guarda `:nome:`, que é o que a mensagem tinha antes do token.
 */
function EmojiPersonalizado({ name, id, jumbo }: { name: string; id: string; jumbo?: boolean }) {
  const lado = jumbo ? EMOJI_PX_JUMBO : EMOJI_PX;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API_URL}/api/emojis/${id}/image`}
      alt={`:${name}:`}
      title={`:${name}:`}
      width={lado}
      height={lado}
      loading="lazy"
      className="inline-block align-[-0.3em] object-contain"
      style={{ width: lado, height: lado }}
    />
  );
}

function Spoiler({ children }: { children: ReactNode }) {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label="Spoiler — clique para revelar"
      className="group/sp rounded bg-rail px-0.5 text-transparent focus:text-txt-normal [&.open]:text-txt-normal"
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
        return n.v;
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
          <code key={i} className="rounded-[3px] bg-rail px-1 py-0.5 font-mono text-[0.85em]">
            {n.v}
          </code>
        );
      case "spoiler":
        return <Spoiler key={i}>{renderInline(n.c, opts)}</Spoiler>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noreferrer" className="text-txt-link hover:underline">
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
              meu ? "bg-yellow/30 text-txt-primary" : "bg-accent/25 text-mention"
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
              me ? "bg-yellow/30 text-txt-primary" : "bg-accent/25 text-mention hover:bg-accent hover:text-accent-ink"
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
  // no jumbo o emoji unicode também cresce, e ele é texto: quem muda o tamanho
  // dele é a fonte do contêiner
  return (
    <span className={render.jumbo ? "block text-[2.75rem] leading-[1.25]" : "contents"}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            // linha vazia vira só a quebra
            return b.c.length === 0 ? <br key={i} /> : <div key={i}>{renderInline(b.c, render)}</div>;
          case "quote":
            return (
              <div key={i} className="my-0.5 border-l-4 border-border-strong pl-3">
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
                className="my-1 max-w-[90%] overflow-x-auto rounded border border-rail bg-panel p-2 font-mono text-[0.875em] text-txt-normal"
              >
                {b.v}
              </pre>
            );
        }
      })}
    </span>
  );
}
