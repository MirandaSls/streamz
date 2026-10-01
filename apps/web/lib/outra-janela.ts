"use client";

import { createContext, useContext } from "react";

/**
 * Peças para componente que pode ser desenhado **noutra janela** (a janela solta
 * da chamada, `components/voice/JanelaDaChamada.tsx`), pelo `createPortal` da
 * mesma árvore React.
 *
 * Duas armadilhas de realm motivam este arquivo:
 *
 * - **`instanceof` mente.** Um nó da janela solta é instância do `Node` *dela*,
 *   não do da principal: `alvo instanceof Node` dá `false` e um "clicou fora"
 *   fecharia o menu a cada clique dentro dele. A checagem é pelo `nodeType`.
 * - **Observador e relógio da janela errada.** O `ResizeObserver`,
 *   `IntersectionObserver` e `requestAnimationFrame` da principal não são
 *   garantidos para nó de outro documento — e o `rAF` dela para de bater quando
 *   a aba principal fica oculta, que é justamente o caso de quem abriu a janela
 *   solta. Cada um sai da janela **do nó** (`janelaDe`).
 */

type JanelaComGlobais = Window & typeof globalThis;

/** A janela dona do nó (ou do documento); a principal quando não há nó. */
export function janelaDe(no: Node | Document | null | undefined): JanelaComGlobais {
  const doc = !no ? null : no.nodeType === 9 ? (no as Document) : no.ownerDocument;
  return ((doc?.defaultView as JanelaComGlobais | null) ?? window) as JanelaComGlobais;
}

/** `x instanceof Node`, valendo para nó de qualquer janela. */
export function ehNo(x: unknown): x is Node {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { nodeType?: unknown }).nodeType === "number"
  );
}

/** `x instanceof HTMLElement`, valendo para elemento de qualquer janela. */
export function ehElementoHtml(x: unknown): x is HTMLElement {
  return ehNo(x) && x.nodeType === 1 && typeof (x as { focus?: unknown }).focus === "function";
}

/**
 * O documento onde o portal de uma camada flutuante (dica, menu, modal) deve
 * entrar. Quem desenha noutra janela fornece o `document` dela; sem provedor
 * vale o da principal.
 */
export const DocumentoDoPortal = createContext<Document | null>(null);

export function useDocumentoDoPortal(): Document | null {
  const doc = useContext(DocumentoDoPortal);
  if (doc) return doc;
  return typeof document === "undefined" ? null : document;
}
