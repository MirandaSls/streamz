import type { ReactNode } from "react";
import { parseBlocks, type Inline } from "./markdown-core";

export { parseBlocks, parseInline, plainText } from "./markdown-core";
export type { Block, Inline } from "./markdown-core";

// ── render ───────────────────────────────────────────────────

export interface RenderOptions {
  /** username de quem está lendo — a própria menção ganha destaque amarelo. */
  meUsername?: string;
  /** nomes de exibição por username, para mostrar @Nome em vez de @user. */
  displayNames?: Record<string, string>;
}

function Spoiler({ children }: { children: ReactNode }) {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label="Spoiler — clique para revelar"
      className="group/sp rounded bg-[#1e1f22] px-0.5 text-transparent focus:text-txt-normal [&.open]:text-txt-normal"
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
          <code key={i} className="rounded-[3px] bg-[#1e1f22] px-1 py-0.5 font-mono text-[0.85em]">
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
      case "mention": {
        const me = opts.meUsername && n.username.toLowerCase() === opts.meUsername.toLowerCase();
        const nome = opts.displayNames?.[n.username.toLowerCase()] ?? n.username;
        return (
          <span
            key={i}
            className={`rounded-[3px] px-0.5 font-medium ${
              me ? "bg-yellow/30 text-txt-primary" : "bg-accent/30 text-[#c9cdfb] hover:bg-accent hover:text-white"
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
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            // linha vazia vira só a quebra
            return b.c.length === 0 ? <br key={i} /> : <div key={i}>{renderInline(b.c, opts)}</div>;
          case "quote":
            return (
              <div key={i} className="my-0.5 border-l-4 border-[#4e5058] pl-3">
                {renderInline(b.c, opts)}
              </div>
            );
          case "h":
            return (
              <div key={i} className={H_CLASS[b.level]}>
                {renderInline(b.c, opts)}
              </div>
            );
          case "codeblock":
            return (
              <pre
                key={i}
                className="my-1 max-w-[90%] overflow-x-auto rounded border border-[#1e1f22] bg-[#2b2d31] p-2 font-mono text-[0.875em] text-txt-normal"
              >
                {b.v}
              </pre>
            );
        }
      })}
    </>
  );
}
