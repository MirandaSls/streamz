"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes } from "react";
import type { GuildLayout } from "@streamz/shared";
import {
  localizarServidor,
  soltarEntreItens,
  soltarServidorSobrePasta,
  soltarServidorSobreServidor,
  tirarDaPasta,
} from "@/stores/guild-folder-logic";
import { useGuildLayout } from "@/stores/guild-layout";

/*
 * Arrastar servidores e pastas na barra de servidores, com o drag-and-drop
 * nativo do HTML5 — sem biblioteca: o Tauri roda com `dragDropEnabled: false`,
 * que é o que deixa o webview entregar esses eventos à página.
 *
 * Quem decide **o que muda** no layout é `stores/guild-folder-logic.ts`; aqui
 * só se traduz "onde o ponteiro está" em uma daquelas operações e se mostra o
 * que aconteceria se soltasse agora (realce verde ou linha de vão).
 *
 * O `dragover`/`drop` é **um só**, delegado no `<nav>`: cada item marca a si
 * mesmo com `data-rail-alvo` (`guild:<id>`, `folder:<id>`, `fim` ou `nada`) e
 * o alvo sai de `closest()`. Um ouvinte por item obrigaria cada `RailItem` a
 * saber de pastas, vãos e índices do topo.
 */

/** O que está sendo arrastado. */
export type OrigemDoArrasto = { tipo: "servidor"; guildId: string } | { tipo: "pasta"; pastaId: string };

/** Onde o arrasto soltaria se a pessoa largasse agora. */
export type AlvoDoArrasto =
  | { tipo: "servidor"; guildId: string }
  | { tipo: "pasta"; pastaId: string }
  /** vão `indice` da lista do topo, medido com o item arrastado ainda no lugar. */
  | { tipo: "vao"; indice: number }
  /** vão `indice` dentro da pasta aberta, idem. */
  | { tipo: "vaoNaPasta"; pastaId: string; indice: number };

/**
 * Tipo próprio no `dataTransfer`: o Firefox só começa o arrasto se houver algum
 * dado, e `text/plain` faria o ícone virar texto colado se fosse solto no
 * campo de mensagem.
 */
const TIPO_DO_ARRASTO = "application/x-streamz-rail";

/**
 * Fração da altura, em cima e em baixo, que vale como vão em vez de "sobre":
 * o quarto de cima e o de baixo põem antes/depois, a metade do meio junta.
 */
const BORDA = 0.25;

/**
 * Id da pasta que um arrasto pode criar. `crypto.randomUUID` só existe em
 * contexto seguro — o app servido por IP na rede local cairia sem ele —, por
 * isso o mesmo recurso do `newNonce` de `stores/messages.ts`.
 */
function novoIdDePasta(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function pastaNoLayout(layout: GuildLayout, pastaId: string) {
  const item = layout.items.find((i) => i.kind === "folder" && i.folder.id === pastaId);
  return item?.kind === "folder" ? item.folder : null;
}

/**
 * Põe o servidor no vão `indice` de dentro da pasta (com ele ainda no lugar).
 *
 * A lógica não tem "inserir na posição k" — tem "soltar sobre um servidor de
 * pasta", que põe logo **depois** dele. Então o vão k > 0 é soltar sobre o
 * servidor k−1; o vão 0 (antes do primeiro) é soltar sobre o primeiro e
 * depois trocar os dois, soltando o primeiro sobre o arrastado.
 */
function inserirNaPasta(
  layout: GuildLayout,
  guildId: string,
  pastaId: string,
  indice: number,
  novoIdPasta: string,
): GuildLayout {
  const pasta = pastaNoLayout(layout, pastaId);
  if (!pasta) return layout;
  const ids = pasta.guildIds;
  if (indice > 0) {
    const anterior = ids[Math.min(indice, ids.length) - 1];
    // vão logo depois de si mesmo: é onde já está
    if (anterior === guildId) return layout;
    return soltarServidorSobreServidor(layout, guildId, anterior, novoIdPasta);
  }
  const primeiro = ids[0];
  if (primeiro === guildId) return layout;
  const passo1 = soltarServidorSobreServidor(layout, guildId, primeiro, novoIdPasta);
  // inalterado sem já estar logo depois do primeiro = a lógica recusou (teto
  // da pasta); o segundo passo trocaria o primeiro de lugar à toa
  if (passo1 === layout && ids[1] !== guildId) return layout;
  return soltarServidorSobreServidor(passo1, primeiro, guildId, novoIdPasta);
}

/**
 * O layout depois de soltar `origem` em `alvo`. Devolve **o mesmo objeto**
 * quando nada muda, como as funções de `guild-folder-logic` — é isso que deixa
 * o rail esconder a linha/realce de um alvo que não faria nada.
 */
export function layoutAoSoltar(
  layout: GuildLayout,
  origem: OrigemDoArrasto,
  alvo: AlvoDoArrasto,
  novoIdPasta: string,
): GuildLayout {
  if (origem.tipo === "pasta") {
    // não existe pasta dentro de pasta: pasta só vai para um vão do topo
    return alvo.tipo === "vao" ? soltarEntreItens(layout, origem.pastaId, alvo.indice) : layout;
  }
  const guildId = origem.guildId;
  switch (alvo.tipo) {
    case "servidor":
      return soltarServidorSobreServidor(layout, guildId, alvo.guildId, novoIdPasta);
    case "pasta":
      return soltarServidorSobrePasta(layout, guildId, alvo.pastaId);
    case "vao":
      // `tirarDaPasta` e não `soltarEntreItens`: este procura pasta antes de
      // servidor, e um id de servidor igual ao de uma pasta moveria a pasta
      return tirarDaPasta(layout, guildId, alvo.indice);
    case "vaoNaPasta":
      return inserirNaPasta(layout, guildId, alvo.pastaId, alvo.indice, novoIdPasta);
  }
}

function fracaoVertical(el: Element, clientY: number): number {
  const r = el.getBoundingClientRect();
  return r.height > 0 ? (clientY - r.top) / r.height : 0.5;
}

/** A pasta inteira (cabeçalho + lista aberta) que contém `el`, ou o próprio `el`. */
function caixaDaPasta(el: Element): Element {
  return el.closest("[data-pasta-id]") ?? el;
}

/**
 * Traduz "o ponteiro está em `clientY` sobre o item `el`" num alvo, antes de
 * saber se ele mudaria alguma coisa.
 *
 * Pasta arrastada só aceita vão: metade de cima do item = antes, metade de
 * baixo = depois. Sobre uma pasta aberta a metade é medida na pasta inteira,
 * porque os servidores de dentro não são vãos do topo.
 *
 * Servidor arrastado: quarto de cima/de baixo = vão, meio = juntar. No
 * cabeçalho de uma pasta **aberta** o quarto de baixo é o vão antes do
 * primeiro servidor dela (é o que está logo abaixo, na tela).
 */
function alvoSob(
  origem: OrigemDoArrasto,
  el: HTMLElement,
  clientY: number,
  layout: GuildLayout,
  abertas: ReadonlySet<string>,
): AlvoDoArrasto | null {
  const chave = el.dataset.railAlvo ?? "";
  if (chave === "fim") return { tipo: "vao", indice: layout.items.length };

  if (chave.startsWith("guild:")) {
    const guildId = chave.slice("guild:".length);
    const pos = localizarServidor(layout, guildId);
    if (!pos) return null;
    const i = pos.indiceNoTopo;
    if (origem.tipo === "pasta") {
      const caixa = pos.pastaId === null ? el : caixaDaPasta(el);
      return { tipo: "vao", indice: fracaoVertical(caixa, clientY) < 0.5 ? i : i + 1 };
    }
    const fracao = fracaoVertical(el, clientY);
    if (fracao >= BORDA && fracao <= 1 - BORDA) return { tipo: "servidor", guildId };
    const depois = fracao > 1 - BORDA;
    if (pos.pastaId === null) return { tipo: "vao", indice: depois ? i + 1 : i };
    return { tipo: "vaoNaPasta", pastaId: pos.pastaId, indice: (pos.indiceNaPasta ?? 0) + (depois ? 1 : 0) };
  }

  if (chave.startsWith("folder:")) {
    const pastaId = chave.slice("folder:".length);
    const i = layout.items.findIndex((item) => item.kind === "folder" && item.folder.id === pastaId);
    if (i < 0) return null;
    if (origem.tipo === "pasta") {
      return { tipo: "vao", indice: fracaoVertical(caixaDaPasta(el), clientY) < 0.5 ? i : i + 1 };
    }
    const fracao = fracaoVertical(el, clientY);
    if (fracao < BORDA) return { tipo: "vao", indice: i };
    if (fracao > 1 - BORDA) {
      return abertas.has(pastaId) ? { tipo: "vaoNaPasta", pastaId, indice: 0 } : { tipo: "vao", indice: i + 1 };
    }
    return { tipo: "pasta", pastaId };
  }

  // "nada" (início, conversas em destaque) ou item sem marca
  return null;
}

function mesmoAlvo(a: AlvoDoArrasto | null, b: AlvoDoArrasto | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Onde desenhar a linha de vão para o item `i` do topo: em cima dele quando o
 * vão é o dele, embaixo só no último (o vão depois do último não tem item
 * abaixo para desenhar em cima).
 */
export function linhaNoTopo(alvo: AlvoDoArrasto | null, i: number, total: number): "antes" | "depois" | null {
  if (alvo?.tipo !== "vao") return null;
  if (alvo.indice === i) return "antes";
  return alvo.indice === total && i === total - 1 ? "depois" : null;
}

/** A mesma regra de `linhaNoTopo`, para o servidor `k` de dentro da pasta. */
export function linhaNaPasta(
  alvo: AlvoDoArrasto | null,
  pastaId: string,
  k: number,
  total: number,
): "antes" | "depois" | null {
  if (alvo?.tipo !== "vaoNaPasta" || alvo.pastaId !== pastaId) return null;
  if (alvo.indice === k) return "antes";
  return alvo.indice === total && k === total - 1 ? "depois" : null;
}

/**
 * Estado e ouvintes do arrasto do rail.
 *
 * `layout` é o layout **resolvido** (o que está desenhado). `ativo: false`
 * desliga tudo — no celular o rail é de toque, e o drag-and-drop do HTML5 por
 * toque é irregular entre navegadores; lá o rail continua só navegando.
 */
export function useArrastarRail({
  layout,
  abertas,
  ativo,
}: {
  layout: GuildLayout;
  abertas: readonly string[];
  ativo: boolean;
}) {
  // Refs para o que os eventos leem: `dragover` dispara dezenas de vezes por
  // segundo e precisa do valor de agora, não do último render.
  const origemRef = useRef<OrigemDoArrasto | null>(null);
  const alvoRef = useRef<AlvoDoArrasto | null>(null);
  const idDaNovaPastaRef = useRef("");
  const redeRef = useRef<((e: MouseEvent) => void) | null>(null);

  /** Chave do item arrastado, para o marcador tracejado no lugar dele. */
  const [arrastado, setArrastado] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<AlvoDoArrasto | null>(null);

  const definirAlvo = useCallback((novo: AlvoDoArrasto | null) => {
    if (mesmoAlvo(alvoRef.current, novo)) return;
    alvoRef.current = novo;
    setAlvo(novo);
  }, []);

  const tirarRede = useCallback(() => {
    if (redeRef.current) window.removeEventListener("mousemove", redeRef.current);
    redeRef.current = null;
  }, []);

  const encerrar = useCallback(() => {
    origemRef.current = null;
    alvoRef.current = null;
    setArrastado(null);
    setAlvo(null);
    tirarRede();
  }, [tirarRede]);

  useEffect(() => tirarRede, [tirarRede]);

  function iniciar(e: DragEvent<HTMLElement>, origem: OrigemDoArrasto, chave: string, imagem?: Element | null) {
    // a pasta aberta não contém os servidores no mesmo elemento arrastável,
    // mas um arrasto de dentro dela nunca deve virar arrasto de outra coisa
    e.stopPropagation();
    const dt = e.dataTransfer;
    // um <img> arrastado traz a URL dele por padrão; ela iria junto para quem
    // aceitasse o soltar fora do rail
    dt.clearData();
    dt.setData(TIPO_DO_ARRASTO, chave);
    dt.effectAllowed = "move";
    if (imagem) {
      const r = imagem.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
      const y = Math.max(0, Math.min(e.clientY - r.top, r.height));
      dt.setDragImage(imagem, x, y);
    }
    origemRef.current = origem;
    alvoRef.current = null;
    idDaNovaPastaRef.current = novoIdDePasta();
    // O marcador tracejado entra um tique depois: o navegador fotografa a
    // imagem do arrasto **depois** deste ouvinte, e um re-render síncrono
    // aqui faria a foto sair tracejada também.
    window.setTimeout(() => {
      if (origemRef.current === origem) setArrastado(chave);
    }, 0);
    // Rede de segurança: se o elemento de origem desmontar durante o arrasto
    // (o servidor saiu da pasta e remontou noutro pai), o `dragend` dele se
    // perde. Durante um arrasto não há `mousemove`; o primeiro que chega com
    // nenhum botão apertado quer dizer que o arrasto já acabou.
    tirarRede();
    const rede = (ev: MouseEvent) => {
      if (ev.buttons === 0) encerrar();
    };
    redeRef.current = rede;
    window.addEventListener("mousemove", rede);
  }

  function aoPassar(e: DragEvent<HTMLElement>) {
    const origem = origemRef.current;
    // arrasto que não começou no rail (arquivo, texto, outra aba): não é nosso
    if (!origem) return;
    const el = e.target instanceof Element ? (e.target.closest("[data-rail-alvo]") as HTMLElement | null) : null;
    let novo = alvoRef.current;
    if (el) {
      const candidato = alvoSob(origem, el, e.clientY, layout, new Set(abertas));
      // alvo que não mudaria nada não ganha linha nem realce
      novo =
        candidato && layoutAoSoltar(layout, origem, candidato, idDaNovaPastaRef.current) !== layout
          ? candidato
          : null;
      definirAlvo(novo);
    }
    // entre dois itens (o vão do `gap`) vale o último alvo: a linha não pisca
    // enquanto o ponteiro atravessa os 10px entre ícones
    if (novo) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function aoSair(e: DragEvent<HTMLElement>) {
    if (!origemRef.current) return;
    // `dragleave` dispara a cada filho que o ponteiro deixa; só conta quando
    // ele saiu do rail de verdade
    const r = e.currentTarget.getBoundingClientRect();
    const fora = e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom;
    if (fora) definirAlvo(null);
  }

  function aoSoltar(e: DragEvent<HTMLElement>) {
    const origem = origemRef.current;
    if (!origem) return;
    e.preventDefault();
    const destino = alvoRef.current;
    const novo = destino ? layoutAoSoltar(layout, origem, destino, idDaNovaPastaRef.current) : layout;
    // limpa aqui e não só no `dragend`: o item pode remontar noutro pai com
    // o layout novo e levar o `dragend` junto
    encerrar();
    if (novo !== layout) useGuildLayout.getState().aplicar(novo);
  }

  const propsDaNav: HTMLAttributes<HTMLElement> = ativo
    ? { onDragEnter: aoPassar, onDragOver: aoPassar, onDragLeave: aoSair, onDrop: aoSoltar }
    : {};

  /** Atributos da caixa de 40 do servidor; `undefined` com o arrasto desligado. */
  function arrastoDoServidor(guildId: string): HTMLAttributes<HTMLDivElement> | undefined {
    if (!ativo) return undefined;
    return {
      draggable: true,
      onDragStart: (e) => iniciar(e, { tipo: "servidor", guildId }, `guild:${guildId}`),
      onDragEnd: encerrar,
    };
  }

  /**
   * Atributos do cabeçalho da pasta. A marca `data-rail-alvo` vai sempre (é
   * só leitura do `closest`); o arrastável, só com o arrasto ligado. A imagem
   * do arrasto é o botão de 48, não o cabeçalho na largura do rail inteiro.
   */
  function arrastoDaPasta(pastaId: string): HTMLAttributes<HTMLDivElement> {
    const marca = { "data-rail-alvo": `folder:${pastaId}` } as HTMLAttributes<HTMLDivElement>;
    if (!ativo) return marca;
    return {
      ...marca,
      draggable: true,
      onDragStart: (e) =>
        iniciar(e, { tipo: "pasta", pastaId }, `folder:${pastaId}`, e.currentTarget.querySelector("button")),
      onDragEnd: encerrar,
    };
  }

  return { propsDaNav, arrastoDoServidor, arrastoDaPasta, arrastado, alvo };
}
