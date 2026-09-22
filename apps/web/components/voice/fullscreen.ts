"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { definirTelaCheiaDaJanela, isTauri, janelaEmTelaCheia } from "@/lib/desktop";
import { useVoice } from "@/stores/voice";

/**
 * Tela cheia de um elemento — por dois caminhos, escolhidos pelo ambiente.
 *
 * O estado observável continua sendo o `telaCheia` da store; este módulo é
 * quem o mantém honesto, venha a saída do Esc, do botão, do gesto ou do
 * semáforo verde do sistema.
 *
 * ## No navegador: a Fullscreen API do DOM, que é melhor
 *
 * Fora do app desktop nada aqui é emulado. A tela cheia de verdade esconde a
 * barra do navegador **e** a do sistema, o compositor promove o elemento para a
 * camada de cima sem depender de `z-index` nenhum, e o Esc volta de graça. Onde
 * ela existe, é ela que usamos.
 *
 * ## No app desktop: emulação, porque a API do DOM **não funciona lá**
 *
 * Isto não é preferência, é o que as fontes do `wry 0.55.1` dizem:
 *
 *   - **Windows**: não há tratamento nenhum de tela cheia — `fullscreen` só
 *     aparece em código de macOS/iOS e nada escuta o
 *     `ContainsFullScreenElementChanged` do WebView2. `requestFullscreen()`
 *     promove o elemento dentro do **controle WebView2**, isto é, o interior da
 *     janela: o tile fica grande dentro de um app do mesmo tamanho de antes.
 *   - **macOS**: pior ainda. O WKWebView só habilita tela cheia de elemento com
 *     a chave privada `fullScreenEnabled`, que o `wry` liga atrás da feature
 *     `fullscreen` (`wry-0.55.1/Cargo.toml:56`, `wkwebview/mod.rs:386-388`) — e
 *     o `tauri-runtime-wry` pede o `wry` com `default-features = false` e só
 *     `["protocol", "os-webview", "linux-body"]`. A feature fica **desligada**:
 *     `requestFullscreen` não funciona no app de macOS, ponto. Consertar isso
 *     exigiria mexer nas dependências do Tauri.
 *
 * Foi essa a queixa, três vezes no mesmo botão: "a tela cheia do palco põe o
 * **aplicativo** em tela cheia, não a tela". O código anterior, no macOS, só
 * tinha a tela cheia da **janela** para oferecer — e janela em tela cheia com o
 * leiaute normal dentro é exatamente a queixa.
 *
 * Então, dentro do Tauri, "tela cheia deste elemento" passa a ser nossa:
 *
 *   1. a **janela** vai a tela cheia (`definirTelaCheiaDaJanela`), e
 *   2. o **elemento** é promovido por CSS nosso — `position: fixed; inset: 0`
 *      com `z-index` acima de tudo e fundo preto (`app/globals.css`, a regra do
 *      atributo `data-tela-cheia-emulada`).
 *
 * Juntas, as duas dão o que o olho chama de tela cheia: a transmissão ocupando
 * o monitor inteiro. E funcionam em qualquer ambiente, inclusive onde a API do
 * DOM não existe — não há o que o WebView possa recusar.
 *
 * ### Por que um **atributo**, e não uma classe
 *
 * Porque o `className` desses elementos é do React. O palco troca de classe ao
 * expandir, o tile troca a cada hover/fala — e a próxima renderização
 * reescreveria o atributo inteiro, levando junto a classe que tivéssemos
 * acrescentado por `classList`. O resultado seria o pior defeito possível: a
 * janela sem moldura e o leiaute normal de volta dentro dela, sem nada dizendo
 * como sair. Um atributo `data-*` que ninguém renderiza no JSX o React não
 * toca, e ele sobrevive às renderizações.
 *
 * ## Desfazer tem de valer por qualquer lado
 *
 * Nenhuma saída pode deixar a outra metade pendurada — janela sem moldura com o
 * leiaute normal, ou um elemento `fixed` cobrindo tudo sem jeito de sair, são
 * os dois piores resultados:
 *
 *   - **Esc**: no DOM é o navegador; na emulação é o ouvinte daqui
 *     (`ligarEscapeDaEmulada`), que tira as duas metades;
 *   - **o mesmo botão / o duplo clique**: `alternarTelaCheiaDe` no elemento que
 *     já é o dono é sempre "sair";
 *   - **F11 / semáforo verde**: saem só da janela, e nada disso passa por nós.
 *     O `onResized` do Tauri é o único sinal que sobra e desmarca o elemento;
 *   - **desmonte** de quem promoveu: `soltarTelaCheiaDe` (tile) e a limpeza de
 *     `useTelaCheia` (palco) — que é também o "sair da chamada".
 *
 * ## Estado por elemento, não um booleano de módulo
 *
 * A janela é uma só, mas quem a pôs em tela cheia é sempre **um elemento**.
 * Guardar só um `boolean` foi o que produziu um defeito anterior: bastava o
 * palco ter entrado uma vez para o clique no tile herdar o estado dele. Por
 * isso `emulada` guarda **o elemento dono**.
 */

/** Os nomes prefixados do WebKit, que não estão no `lib.dom`. */
type ElementoComWebkit = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type DocumentoComWebkit = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/**
 * O atributo que `app/globals.css` transforma em tela cheia emulada. Exportado
 * para o teste conferir o nome: se os dois lados divergirem, o clique deixa de
 * ter efeito visual nenhum e nada mais denuncia.
 */
export const ATRIBUTO_DE_TELA_CHEIA = "data-tela-cheia-emulada";

/** O elemento que está em tela cheia **do DOM** agora, pelos dois nomes. */
function elementoEmTelaCheia(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as DocumentoComWebkit;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * O **navegador** suporta tela cheia em elemento?
 *
 * São duas perguntas, e as duas precisam de "sim": o documento **permite**
 * (`fullscreenEnabled` é `false` num `<iframe>` sem `allow="fullscreen"` e
 * numa webview com o recurso desligado) e o elemento **implementa** algum dos
 * dois métodos. Chamar só a primeira deixava passar o Safari antigo, onde o
 * `requestFullscreen` sem prefixo nem existe e a chamada lança `TypeError`.
 */
function suportaTelaCheiaDoDOM(): boolean {
  if (typeof document === "undefined" || typeof Element === "undefined") return false;
  const doc = document as DocumentoComWebkit;
  const permitido = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const proto = Element.prototype as {
    requestFullscreen?: unknown;
    webkitRequestFullscreen?: unknown;
  };
  const implementado =
    typeof proto.requestFullscreen === "function" ||
    typeof proto.webkitRequestFullscreen === "function";
  return permitido && implementado;
}

/**
 * A intenção de quem pede tela cheia.
 *
 * `recuarParaAJanela` **não tem mais efeito** e é aceito só para não quebrar
 * quem chama (`TileDeVoz` passa `false`). Ele existia quando a única saída do
 * app desktop era pôr a **janela** em tela cheia e sair: o palco aceitava esse
 * consolo, o tile preferia não fazer nada. Com a emulação não há consolo nenhum
 * a escolher — dentro do Tauri o elemento é promovido de verdade, e o palco e o
 * tile recebem a mesma coisa.
 */
export type OpcoesDeTelaCheia = {
  /** @deprecated sem efeito: a emulação atende o palco e o tile igualmente. */
  recuarParaAJanela?: boolean;
};

/**
 * Por onde a tela cheia vai sair **neste ambiente**. É a única decisão de
 * plataforma do módulo, e por isso está separada: pura, sem DOM, testável.
 *
 *   - `emulado`: dentro do Tauri, **sempre**. Não pergunta ao DOM de propósito
 *     — a resposta dele não serve (ver o topo do arquivo): no Windows o
 *     elemento promovido fica preso ao interior da janela e no macOS o recurso
 *     nem está ligado. A emulação, por ser nossa, funciona nos dois;
 *   - `dom`: no navegador, onde a API existe e é melhor que qualquer emulação;
 *   - `nenhum`: navegador sem a API (`<iframe>` sem `allow`, WebKit antigo).
 *     Aí a UI esconde o botão em vez de oferecer um clique inerte.
 */
export type CaminhoDeTelaCheia = "emulado" | "dom" | "nenhum";

export function caminhoDeTelaCheia(ambiente: {
  tauri: boolean;
  domSuporta: boolean;
}): CaminhoDeTelaCheia {
  if (ambiente.tauri) return "emulado";
  return ambiente.domSuporta ? "dom" : "nenhum";
}

/** O caminho para o ambiente de agora. */
function caminhoDeAgora(): CaminhoDeTelaCheia {
  return caminhoDeTelaCheia({ tauri: isTauri(), domSuporta: suportaTelaCheiaDoDOM() });
}

/**
 * Dá para pôr **isto** em tela cheia aqui? Quem pergunta é a UI, para
 * **esconder** o botão onde ele seria inerte.
 *
 * Dentro do app desktop a resposta é sempre `true` — a emulação não depende de
 * nada que a webview possa recusar. No navegador quem responde é o DOM.
 */
export function suportaTelaCheia(_opcoes?: OpcoesDeTelaCheia): boolean {
  return caminhoDeAgora() !== "nenhum";
}

// ── Tela cheia emulada (app desktop) ────────────────────────────────────────

type Emulada = {
  /** quem está promovido; o dono, para o clique de sair e para o desmonte. */
  elemento: HTMLElement;
  /**
   * A janela já estava em tela cheia **antes** de nós (F11, semáforo verde)?
   * Então ela não é nossa: ao sair, desfazemos só a nossa metade. Tirar da tela
   * cheia uma janela que o usuário pôs à mão seria desfazer o que ele fez.
   */
  janelaEraDeles: boolean;
};

let emulada: Emulada | null = null;

function marcar(el: HTMLElement) {
  el.setAttribute(ATRIBUTO_DE_TELA_CHEIA, "");
}

function desmarcar(el: HTMLElement) {
  el.removeAttribute(ATRIBUTO_DE_TELA_CHEIA);
}

/** O ouvinte de Esc da emulação, enquanto ela está ligada. */
let escapeDaEmulada: ((e: KeyboardEvent) => void) | null = null;

/**
 * Liga o Esc da emulação. Aqui não há tela cheia do navegador para ele desfazer
 * sozinho: sem este ouvinte a única saída seria o botão — que some junto com a
 * moldura quando o ponteiro para, e não existe em tile nenhum do celular.
 *
 * Fase de borbulha e `defaultPrevented` respeitado de propósito: um modal
 * aberto por cima do palco também fecha no Esc, e ele tem de ganhar.
 */
function ligarEscapeDaEmulada() {
  if (typeof window === "undefined" || escapeDaEmulada) return;
  escapeDaEmulada = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    void sairDaEmulada();
  };
  window.addEventListener("keydown", escapeDaEmulada);
}

function desligarEscapeDaEmulada() {
  if (typeof window === "undefined" || !escapeDaEmulada) return;
  window.removeEventListener("keydown", escapeDaEmulada);
  escapeDaEmulada = null;
}

/**
 * Já pedimos o `onResized` da janela? É um só e fica para sempre: o desligar
 * chega por `await`, e desfazê-lo a cada entrada/saída abriria uma corrida em
 * que o ouvinte antigo sobrevive ao pedido de parada. Ele não faz nada quando
 * não há emulação ligada, então deixar ligado não custa.
 */
let observandoAJanela = false;

/**
 * Enquanto a janela está em tela cheia, o usuário pode sair **por fora** — o
 * semáforo verde do macOS, o F11 do WebView2 — e nada disso passa por nós. O
 * `onResized` é o único sinal que sobra (o Tauri o emite no fim da transição de
 * tela cheia, ver `BarraDeTitulo.tsx`).
 */
async function observarSaidaPorFora(): Promise<void> {
  if (observandoAJanela) return;
  observandoAJanela = true;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().onResized(() => void reconciliarComAJanela());
  } catch {
    // sem o evento o estado só se corrige no próximo clique, que relê a janela
    observandoAJanela = false;
  }
}

/**
 * A janela saiu da tela cheia sem nos avisar? Então a nossa metade também tem
 * de cair — senão sobraria um elemento `fixed` cobrindo uma janela normal, com
 * o botão de sair fora da tela.
 */
async function reconciliarComAJanela(): Promise<void> {
  if (!emulada || emulada.janelaEraDeles) return;
  if (await janelaEmTelaCheia()) return;
  await sairDaEmulada({ janelaJaSaiu: true });
}

/**
 * Entra na tela cheia emulada. O elemento é marcado **antes** de qualquer
 * `await`: a ida ao Rust custa um quadro ou mais, e promover depois faria a
 * janela crescer com o leiaute antigo à vista no meio do caminho.
 */
async function entrarNaEmulada(el: HTMLElement): Promise<void> {
  // trocar de dono (tile → palco, tile → tile) não mexe na janela: ela já está
  // em tela cheia por nós, só muda quem está promovido
  if (emulada) {
    if (emulada.elemento === el) return;
    desmarcar(emulada.elemento);
    marcar(el);
    emulada = { ...emulada, elemento: el };
    return;
  }

  marcar(el);
  emulada = { elemento: el, janelaEraDeles: false };
  ligarEscapeDaEmulada();
  useVoice.getState().setTelaCheia(true);
  void observarSaidaPorFora();

  const jaEstava = await janelaEmTelaCheia();
  // o Esc (ou o desmonte) pode ter chegado durante a ida ao Rust
  if (emulada?.elemento !== el) return;
  if (jaEstava) {
    emulada.janelaEraDeles = true;
    return;
  }

  const ok = await definirTelaCheiaDaJanela(true);
  if (!ok) {
    // o elemento continua promovido — ele cobre o interior da janela, que é o
    // melhor possível sem a permissão. O aviso diz onde procurar.
    console.warn(
      "[tela cheia] a janela do app recusou a tela cheia — falta `core:window:allow-set-fullscreen`? " +
        "O elemento está promovido, mas só até a borda da janela.",
    );
    // não entramos na janela, então não saímos dela: um `setFullscreen(false)`
    // na saída mexeria numa janela que ninguém pôs em tela cheia
    emulada.janelaEraDeles = true;
  }
}

/**
 * Sai da tela cheia emulada. Idempotente de propósito: as saídas podem chegar
 * em qualquer ordem, e a segunda não pode desfazer o que a primeira arrumou.
 *
 * `janelaJaSaiu` é o caminho do `onResized`: a janela já voltou ao normal por
 * fora, e mandá-la sair de novo seria uma ida ao Rust sem efeito.
 */
async function sairDaEmulada(opcoes?: { janelaJaSaiu?: boolean }): Promise<void> {
  const era = emulada;
  if (!era) return;
  emulada = null;
  desmarcar(era.elemento);
  desligarEscapeDaEmulada();
  useVoice.getState().setTelaCheia(false);
  if (!era.janelaEraDeles && !opcoes?.janelaJaSaiu) await definirTelaCheiaDaJanela(false);
}

// ── Tela cheia do DOM (navegador) ───────────────────────────────────────────

/** Sai da tela cheia do elemento, pelos dois nomes. */
async function sairDoElemento(): Promise<void> {
  const doc = document as DocumentoComWebkit;
  const sair: (() => Promise<void> | void) | undefined =
    typeof doc.exitFullscreen === "function"
      ? () => doc.exitFullscreen()
      : typeof doc.webkitExitFullscreen === "function"
        ? () => doc.webkitExitFullscreen?.()
        : undefined;
  if (!sair) {
    console.warn("[tela cheia] este navegador não implementa `exitFullscreen`");
    return;
  }
  try {
    await sair();
  } catch (erro) {
    console.warn("[tela cheia] o navegador recusou a saída:", erro);
  }
}

/**
 * Pede a tela cheia do elemento **agora**, sem `await` nenhum antes da chamada:
 * `requestFullscreen` exige gesto do usuário, e qualquer `await` anterior já
 * basta para o navegador considerar o clique gasto.
 *
 * Devolve a promessa do pedido, ou `null` quando este navegador não tem a
 * Fullscreen API de elemento.
 */
function pedirTelaCheiaDoElemento(el: HTMLElement): Promise<void> | null {
  const comWebkit = el as ElementoComWebkit;
  const chamar: (() => Promise<void> | void) | null =
    typeof el.requestFullscreen === "function"
      ? () => el.requestFullscreen()
      : typeof comWebkit.webkitRequestFullscreen === "function"
        ? () => comWebkit.webkitRequestFullscreen?.()
        : null;
  if (!chamar) return null;
  try {
    // o caminho `webkit` devolve `undefined` em vez de promessa, e reporta erro
    // pelo evento `webkitfullscreenerror` — o `Promise.resolve` aceita os dois
    return Promise.resolve(chamar());
  } catch (erro) {
    return Promise.reject(erro);
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Entra/sai da tela cheia num elemento qualquer — pelo caminho do ambiente
 * (ver `caminhoDeTelaCheia`). `opcoes` é aceito por compatibilidade e não muda
 * nada hoje.
 */
export async function alternarTelaCheiaDe(el: HTMLElement | null, _opcoes?: OpcoesDeTelaCheia) {
  if (typeof document === "undefined") return;

  if (caminhoDeAgora() === "emulado") {
    // Sair vale também com `el` nulo: o elemento pode ter desmontado entre o
    // clique e aqui, e ficar preso em tela cheia é pior que sair sem pedir.
    if (emulada && (!el || emulada.elemento === el)) {
      await sairDaEmulada();
      return;
    }
    if (!el) {
      console.warn("[tela cheia] o alvo não está no DOM — nada a promover");
      return;
    }
    await entrarNaEmulada(el);
    return;
  }

  if (!el) {
    // antes isto era um `return` mudo, e um clique sem efeito nenhum
    console.warn("[tela cheia] o alvo não está no DOM — nada a promover");
    return;
  }

  // ── Sair ─────────────────────────────────────────────────────────────────
  if (elementoEmTelaCheia() === el) {
    await sairDoElemento();
    return;
  }

  // ── Entrar ───────────────────────────────────────────────────────────────
  // Síncrono até o pedido, **de propósito**: ver `pedirTelaCheiaDoElemento`.
  const promocao = pedirTelaCheiaDoElemento(el);
  if (!promocao) {
    console.warn("[tela cheia] este navegador não oferece tela cheia de elemento");
    return;
  }
  try {
    await promocao;
  } catch (erro) {
    // recusa comum: sem gesto do usuário, tela cheia desabilitada na webview,
    // ou já havia uma transição em curso
    console.warn("[tela cheia] o navegador recusou o pedido:", erro);
  }
}

/**
 * Desfaz a tela cheia que **este** elemento ligou. Para o desmonte de quem
 * promove sem hook (o tile): no navegador o próprio browser solta a tela cheia
 * quando o elemento sai da página, mas a emulação é nossa — sem isto sobrariam
 * a janela sem moldura e um atributo em elemento que já morreu.
 */
export function soltarTelaCheiaDe(el: HTMLElement | null): void {
  if (!el || emulada?.elemento !== el) return;
  void sairDaEmulada();
}

/**
 * Liga um palco à tela cheia e sincroniza o `telaCheia` da store com o que o
 * navegador (ou a emulação) de fato está fazendo.
 *
 * `suportada` é resolvida num efeito, e não na primeira renderização: no HTML
 * gerado no servidor não há `document` — nem o `window.isTauri` que responde se
 * estamos no app —, e decidir ali deixaria a hidratação discordando da
 * marcação.
 */
export function useTelaCheia(alvo: RefObject<HTMLElement | null>, _opcoes?: OpcoesDeTelaCheia) {
  const telaCheia = useVoice((s) => s.telaCheia);
  const setTelaCheia = useVoice((s) => s.setTelaCheia);
  const [suportada, setSuportada] = useState(false);

  useEffect(() => {
    setSuportada(suportaTelaCheia());
  }, []);

  useEffect(() => {
    const aoTrocar = () => {
      // na emulação não há evento nenhum do DOM: quem manda no estado são
      // `entrarNaEmulada`/`sairDaEmulada`, e um `fullscreenchange` que chegasse
      // de outro lugar não pode apagá-lo
      if (emulada) return;
      setTelaCheia(!!elementoEmTelaCheia());
    };
    // o pedido pode falhar **depois** da promessa no caminho prefixado: sem
    // este ouvinte a falha do WebKit continuaria invisível
    const aoFalhar = () =>
      console.warn("[tela cheia] o navegador rejeitou a entrada em tela cheia");
    document.addEventListener("fullscreenchange", aoTrocar);
    document.addEventListener("webkitfullscreenchange", aoTrocar);
    document.addEventListener("fullscreenerror", aoFalhar);
    document.addEventListener("webkitfullscreenerror", aoFalhar);
    return () => {
      document.removeEventListener("fullscreenchange", aoTrocar);
      document.removeEventListener("webkitfullscreenchange", aoTrocar);
      document.removeEventListener("fullscreenerror", aoFalhar);
      document.removeEventListener("webkitfullscreenerror", aoFalhar);
      // a emulação não se desfaz sozinha: sem isto, sair da chamada deixaria o
      // app sem moldura e sem botão nenhum para desfazer
      void sairDaEmulada();
      // desmontar o palco em tela cheia deixaria a store mentindo
      setTelaCheia(false);
    };
  }, [setTelaCheia]);

  // sem `opcoes` na dependência de propósito: ela não tem efeito, e como chega
  // como objeto literal a cada renderização, dependê-la trocaria a identidade
  // de `alternar` em toda renderização do palco
  const alternar = useCallback(() => void alternarTelaCheiaDe(alvo.current), [alvo]);

  return { telaCheia, alternar, suportada };
}
