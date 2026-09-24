/**
 * Abre uma janela solta para um tile da chamada ("Usuário em Nova Janela" /
 * "Transmissão em Nova Janela", paridade com o Discord).
 *
 * A janela nasce **vazia** (`about:blank`, mesma origem) e recebe o CSS da
 * janela principal; o conteúdo entra depois, por `createPortal` a partir de
 * `components/voice/JanelasDeVoz.tsx`, que lê `useJanelasDeVoz`. Não abrimos
 * uma rota do app na janela nova de propósito: seria um segundo boot, uma
 * segunda conexão ao gateway e ao LiveKit, e um segundo participante na sala.
 * Com o portal, o vídeo sai da mesma sala e do mesmo `MediaStream` que o palco
 * já tem.
 *
 * Duas formas, na ordem:
 *   1. **Document Picture-in-Picture** (Chrome/Edge 116+): janela sempre por
 *      cima das outras, que é o que o Discord faz. Só existe **uma** por aba —
 *      pedir outra fecharia a primeira —, então a segunda vira popup.
 *   2. **Popup** (`window.open`): funciona em qualquer navegador, mas fica atrás
 *      da janela que ganhar foco. No app desktop é a **única** forma (o porquê
 *      está em `abrirJanelaSolta`); quem deixa o popup nascer lá é o
 *      `on_new_window` da janela `main`, em `apps/desktop/src-tauri/src/lib.rs`.
 *
 * As duas APIs exigem **ativação transitória**: `abrirJanelaSolta` tem de ser
 * chamada de forma síncrona dentro do gesto (o `onSelect` do item de menu).
 * Nada de `await` antes dela — um `await` no caminho já basta para o navegador
 * considerar que o gesto acabou e bloquear a janela.
 */

import { ehAndroidNoTauri, ehMacNoTauri, isTauri } from "@/lib/desktop";
import {
  useJanelasDeVoz,
  type TipoDeJanelaDeVoz,
} from "@/stores/janelas-de-voz";
import { ui } from "@/stores/ui";

// ── tipos mínimos da Document Picture-in-Picture ──────────────────────────
// O `lib.dom` do TypeScript ainda não traz essa API. Declaramos só o que usamos
// e acessamos por um cast local (em vez de aumentar `Window` globalmente) para
// não colidir com a declaração oficial quando ela chegar.

type OpcoesDaJanelaPip = {
  width?: number;
  height?: number;
  /** Esconde o botão "voltar para a aba": o tile continua no palco de qualquer jeito. */
  disallowReturnToOpener?: boolean;
};

type DocumentPictureInPicture = EventTarget & {
  /** A janela PiP aberta por esta aba, ou `null`. */
  readonly window: Window | null;
  requestWindow(opcoes?: OpcoesDaJanelaPip): Promise<Window>;
};

function apiDePip(): DocumentPictureInPicture | null {
  if (typeof window === "undefined" || !("documentPictureInPicture" in window)) return null;
  const w = window as unknown as { documentPictureInPicture?: DocumentPictureInPicture };
  return w.documentPictureInPicture ?? null;
}

// ── estado do módulo ──────────────────────────────────────────────────────

/**
 * Chaves cujo `requestWindow` ainda não resolveu. Sem isso, um duplo clique
 * no item abriria duas janelas: o store só conhece a janela depois da promise.
 */
const pendentes = new Set<string>();

/**
 * Há um pedido de PiP em voo. `documentPictureInPicture.window` só fica não
 * nulo quando a promise resolve; um segundo pedido nesse intervalo fecharia o
 * primeiro, então ele cai para popup.
 */
let pipPendente = false;

/**
 * Janelas já preparadas. `window.open` com o mesmo nome devolve a janela que
 * já existe (caso o store a tenha perdido de vista); prepará-la de novo
 * duplicaria todo o CSS no `<head>` dela.
 */
const preparadas = new WeakSet<Window>();

let saidaRegistrada = false;

/**
 * Fechar a aba principal leva as janelas soltas junto: sem o React da aba
 * principal, elas seriam retângulos vazios. O PiP já fecha sozinho quando a
 * aba navega, mas o popup não. `pagehide` entra ao lado do `beforeunload`
 * porque no mobile e no bfcache o `beforeunload` nem sempre dispara.
 */
function registrarSaidaDaJanelaPrincipal(): void {
  if (saidaRegistrada) return;
  saidaRegistrada = true;
  const fecharTodas = () => useJanelasDeVoz.getState().fecharTodas();
  window.addEventListener("beforeunload", fecharTodas);
  window.addEventListener("pagehide", fecharTodas);
}

// ── API pública ───────────────────────────────────────────────────────────

/**
 * Estamos no app **de desktop** (Windows, macOS, Linux), e não no de celular.
 *
 * No desktop o `lib.rs` cria a janela `main` com um `on_new_window` que deixa
 * passar `window.open("about:blank")` — e só ele. Sem esse tratador o wry
 * responde `SetHandled(true)` a todo pedido e o `window.open` devolve `null`.
 * No Android/iOS o Tauri não tem `on_new_window` ("Not supported"), então lá o
 * item continua escondido.
 *
 * Pelo `userAgent`, como o resto de `lib/desktop.ts`: o WebView2 diz
 * `Windows NT`, o WKWebView do Mac passa por `ehMacNoTauri` (que já separa o
 * iPad) e o WebKitGTK diz `Linux` — que o Android também diz, daí a exclusão.
 */
function ehTauriDeDesktop(): boolean {
  if (!isTauri() || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua) || ehMacNoTauri()) return true;
  return /Linux/i.test(ua) && !ehAndroidNoTauri();
}

/**
 * No app de celular é `false`: o Tauri não abre `window.open` lá. O item de
 * menu some em vez de não fazer nada ao clicar.
 */
export function podeAbrirJanelaSolta(): boolean {
  if (typeof window === "undefined") return false;
  if (isTauri() && !ehTauriDeDesktop()) return false;
  return typeof window.open === "function";
}

export type OpcoesDaJanelaSolta = {
  /** Chave do tile: `${userId}` ou `${userId}:tela` (ver `chaveDaJanela`). */
  chave: string;
  titulo: string;
  largura: number;
  altura: number;
  tipo: TipoDeJanelaDeVoz;
  userId: string;
};

/**
 * Abre (ou foca, se já existir) a janela solta do tile. **Chamar de forma
 * síncrona dentro do gesto do usuário.** Nunca lança: janela bloqueada vira
 * um toast.
 */
export function abrirJanelaSolta(opts: OpcoesDaJanelaSolta): void {
  if (!podeAbrirJanelaSolta()) return;
  const store = useJanelasDeVoz.getState();

  // mesmo tile de novo: o Discord traz a janela existente para a frente
  if (store.jaAberta(opts.chave)) {
    store.focar(opts.chave);
    return;
  }
  if (pendentes.has(opts.chave)) return;

  registrarSaidaDaJanelaPrincipal();

  // No app, direto para o popup. O wry não desliga a Document PiP (os únicos
  // `--disable-features` dele são `msWebOOUI,msPdfOOUI,msSmartScreenProtection`),
  // mas nada garante que o WebView2 a implemente de ponta a ponta: a janela PiP
  // do Chromium é desenhada pela camada do navegador, que o WebView2 embute só
  // em parte. E se o `requestWindow` recusar depois, o gesto já foi gasto e o
  // popup não tem mais chance (ver `abrirComoPip`) — trocaríamos uma janela
  // que sempre abre por uma que talvez abra. O WKWebView do Mac nem tem a API.
  const pip = isTauri() ? null : apiDePip();
  if (pip && pip.window === null && !pipPendente) {
    abrirComoPip(pip, opts);
    return;
  }
  abrirComoPopup(opts);
}

// ── as duas formas ────────────────────────────────────────────────────────

function abrirComoPip(pip: DocumentPictureInPicture, opts: OpcoesDaJanelaSolta): void {
  const { chave } = opts;
  pendentes.add(chave);
  pipPendente = true;

  let pedido: Promise<Window>;
  try {
    // o pedido sai aqui, ainda dentro do gesto; só a resposta é assíncrona
    pedido = pip.requestWindow({
      width: Math.round(opts.largura),
      height: Math.round(opts.altura),
      disallowReturnToOpener: true,
    });
  } catch {
    pendentes.delete(chave);
    pipPendente = false;
    // falhou de forma síncrona (p.ex. dentro de um iframe): ainda estamos no
    // gesto, então o popup tem chance
    abrirComoPopup(opts);
    return;
  }

  pedido.then(
    (win) => {
      pendentes.delete(chave);
      pipPendente = false;
      registrar(win, "pip", opts);
    },
    () => {
      pendentes.delete(chave);
      pipPendente = false;
      // aqui o gesto já foi consumido pelo `requestWindow`: um popup agora
      // seria bloqueado, então só avisamos
      ui.toast("Não foi possível abrir a janela. Tente de novo.", "error");
    },
  );
}

function abrirComoPopup(opts: OpcoesDaJanelaSolta): void {
  const largura = Math.round(opts.largura);
  const altura = Math.round(opts.altura);
  let win: Window | null = null;
  try {
    // `about:blank` herda a origem de quem abriu, e o documento fica acessível
    // de forma síncrona. Escrito por extenso (e não `""`, que dá no mesmo no
    // navegador) porque no app o `on_new_window` do `lib.rs` compara a URL com
    // `about:blank` — e o `tauri-runtime-wry` recusa, antes dele, a URL que
    // não consegue interpretar.
    // Sem `noopener`: precisamos da referência para desenhar lá dentro.
    win = window.open(
      "about:blank",
      `streamz-${opts.chave}`,
      `popup,width=${largura},height=${altura}`,
    );
  } catch {
    win = null;
  }
  if (!win) {
    ui.toast(
      "O navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.",
      "error",
    );
    return;
  }
  registrar(win, "popup", opts);
}

// ── preparação da janela ──────────────────────────────────────────────────

function registrar(win: Window, modo: "pip" | "popup", opts: OpcoesDaJanelaSolta): void {
  const { chave } = opts;
  try {
    prepararJanela(win, opts.titulo);
  } catch {
    // janela que não conseguimos preparar (fechou no meio, documento
    // inacessível) é janela vazia: fecha em vez de deixá-la aberta à toa
    try {
      win.close();
    } catch {
      /* nada a fazer */
    }
    return;
  }

  const registrou = useJanelasDeVoz.getState().abrir(chave, {
    win,
    tipo: opts.tipo,
    userId: opts.userId,
    modo,
  });
  if (!registrou) return; // o store focou a existente e fechou esta

  // `pagehide` cobre o X da janela, o "voltar para a aba" do PiP e o fechamento
  // da aba principal. `fechar` é idempotente, então a reentrada vinda do
  // próprio `fechar` → `close()` → `pagehide` é inofensiva.
  win.addEventListener(
    "pagehide",
    () => {
      const atual = useJanelasDeVoz.getState().janelas[chave];
      // só remove se a entrada ainda é desta janela (a chave pode ter sido
      // reaberta noutra janela nesse meio-tempo)
      if (atual?.win === win) useJanelasDeVoz.getState().fechar(chave);
    },
    { once: true },
  );
}

/**
 * Copia CSS, atributos do `<html>` (tema, zoom, fonte) e classes do `<body>`
 * para a janela nova, e mantém isso em sincronia enquanto ela existir — trocar
 * o tema com a janela aberta tem de refletir nela também.
 */
function prepararJanela(win: Window, titulo: string): void {
  const doc = win.document;
  doc.title = titulo;
  if (preparadas.has(win)) return;
  preparadas.add(win);

  // estilo próprio da janela: vai por último no `<head>` para vencer o
  // `globals.css` (que dá ao `body` o `padding-top` da barra de título do
  // desktop, sem sentido aqui) e sobrevive à cópia do atributo `style` do
  // `<html>`, que sobrescreveria um estilo inline
  const proprio = doc.createElement("style");
  proprio.setAttribute("data-janela-solta", "");
  proprio.textContent = `
    html, body { height: 100%; margin: 0; padding: 0 !important; overflow: hidden; }
    html { color-scheme: dark; }
    body { background: var(--background-base-lowest, #121214); }
  `;
  doc.head.appendChild(proprio);

  const pararEstilos = espelharEstilos(doc, proprio);
  const pararAtributos = espelharAtributos(doc);

  win.addEventListener(
    "pagehide",
    () => {
      pararEstilos();
      pararAtributos();
    },
    { once: true },
  );
}

function ehFolhaDeEstilo(no: Node): no is HTMLLinkElement | HTMLStyleElement {
  if (no instanceof HTMLStyleElement) return true;
  return no instanceof HTMLLinkElement && no.rel.split(/\s+/).includes("stylesheet");
}

function clonarEstilo(original: HTMLLinkElement | HTMLStyleElement, doc: Document): Element {
  const copia = doc.importNode(original, true);
  // o `href` resolvido (absoluto): o `about:blank` herda a base da aba
  // principal na maioria dos navegadores, mas não vale apostar nisso. (O
  // `instanceof` só vale no original: a cópia é de outro realm.)
  if (original instanceof HTMLLinkElement) (copia as HTMLLinkElement).href = original.href;
  return copia;
}

/**
 * Copia todas as folhas de estilo do `<head>` principal e acompanha o que
 * mudar depois: CSS de chunk carregado sob demanda (um `<link>` novo quando um
 * componente com CSS próprio monta) e o HMR do dev, que troca `<style>`.
 */
function espelharEstilos(doc: Document, antesDe: Element): () => void {
  const copias = new Map<Node, Element>();

  const adicionar = (original: Node) => {
    if (!ehFolhaDeEstilo(original) || copias.has(original)) return;
    const copia = clonarEstilo(original, doc);
    copias.set(original, copia);
    doc.head.insertBefore(copia, antesDe);
  };

  for (const no of Array.from(document.head.children)) adicionar(no);

  const observador = new MutationObserver((mutacoes) => {
    if (doc.defaultView?.closed) return;
    for (const m of mutacoes) {
      if (m.type === "childList" && m.target === document.head) {
        m.addedNodes.forEach(adicionar);
        m.removedNodes.forEach((no) => {
          copias.get(no)?.remove();
          copias.delete(no);
        });
        continue;
      }
      // texto de um `<style>` mudou (HMR): refaz a cópia daquele `<style>`
      const estilo =
        m.target instanceof HTMLStyleElement ? m.target : m.target.parentNode;
      if (estilo instanceof HTMLStyleElement && estilo.parentNode === document.head) {
        const copia = copias.get(estilo);
        if (copia) copia.textContent = estilo.textContent;
      }
    }
  });
  observador.observe(document.head, { childList: true, subtree: true, characterData: true });
  return () => observador.disconnect();
}

function copiarAtributos(de: Element, para: Element): void {
  for (const attr of Array.from(para.attributes)) {
    if (!de.hasAttribute(attr.name)) para.removeAttribute(attr.name);
  }
  for (const attr of Array.from(de.attributes)) {
    if (para.getAttribute(attr.name) !== attr.value) para.setAttribute(attr.name, attr.value);
  }
}

/**
 * Tema (`data-tema`), `lang`, escala de fonte e as variáveis de
 * `applySettingsToDocument` vivem em atributos do `<html>`; copiamos todos, não
 * uma lista, para que preferência nova não precise lembrar desta janela. Do
 * `<body>` só a classe: o `style` dele é da janela principal.
 */
function espelharAtributos(doc: Document): () => void {
  const sincronizar = () => {
    if (doc.defaultView?.closed) return;
    copiarAtributos(document.documentElement, doc.documentElement);
    doc.body.className = document.body.className;
  };
  sincronizar();

  const observador = new MutationObserver(sincronizar);
  observador.observe(document.documentElement, { attributes: true });
  observador.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  return () => observador.disconnect();
}
