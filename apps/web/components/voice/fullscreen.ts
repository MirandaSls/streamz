"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { definirTelaCheiaDaJanela, isTauri, janelaEmTelaCheia } from "@/lib/desktop";
import { useVoice } from "@/stores/voice";

/**
 * Tela cheia de verdade, não um `position: fixed`.
 *
 * A diferença não é cosmética: só a tela cheia de verdade esconde a barra do
 * navegador e a do sistema e devolve o Esc como saída — um `fixed inset-0`
 * continua dentro da janela, com a aba à vista.
 *
 * O estado observável continua sendo o `telaCheia` da store; este módulo é
 * quem o mantém honesto quando o usuário sai pelo Esc ou pelo botão do sistema.
 *
 * ## São dois caminhos, nesta ordem
 *
 * 1. **Fullscreen API do DOM** (`requestFullscreen`). É a boa: promove só o
 *    palco, entra no modo de baixa latência do compositor, o Esc devolve
 *    sozinho e o `fullscreenchange` conta o que aconteceu.
 * 2. **Tela cheia da janela do Tauri** (`setFullscreen`), quando a primeira não
 *    existe ou é recusada. Não é a mesma coisa — ninguém promove elemento
 *    nenhum, a janela inteira é que perde a moldura —, mas é o que existe onde
 *    o WKWebView nasce com o *element fullscreen* desligado (ver
 *    `TelaCheiaDeVideo.tsx`). E é exatamente o app desktop, de onde veio a
 *    queixa de "o botão de tela cheia não funciona". Esconder o botão ali seria
 *    desistir do único caminho que sobrou.
 *
 * No caminho 2 **nada avisa de volta**: não há `fullscreenchange` para a janela
 * nativa. Então o `telaCheia` da store é mantido pela nossa própria chamada, o
 * Esc é ouvido por nós e o desmonte do palco desfaz a tela cheia — senão a
 * janela ficaria sem moldura depois de a call acabar.
 *
 * ## Por que nada disso é silencioso
 *
 * O `catch` daqui já foi mudo, e foi ele que escondeu o defeito de "o botão de
 * tela cheia não faz nada": a Fullscreen API **falha de três jeitos diferentes
 * que se parecem na tela** — o método não existe (WebKit antigo só tem
 * `webkitRequestFullscreen`), o pedido é recusado por falta de gesto do
 * usuário, ou o elemento ainda não está no DOM. Nos três casos o clique "não
 * fazia nada" e não sobrava rastro nenhum. Agora cada um deles escreve o motivo
 * no console **e cai para o caminho 2** quando há um.
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

/** O elemento que está em tela cheia agora, pelos dois nomes. */
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
 * Dá para pôr o palco em tela cheia aqui? Quem pergunta é a UI, para **esconder**
 * o botão onde ele seria inerte.
 *
 * No app desktop a resposta é sempre `true`: mesmo que o DOM recuse, sobra a
 * tela cheia da janela. Responder pelo DOM ali escondia o botão justamente onde
 * o caminho 2 funciona — que é o defeito relatado.
 */
export function suportaTelaCheia(): boolean {
  if (isTauri()) return true;
  return suportaTelaCheiaDoDOM();
}

/**
 * Estamos em tela cheia **pela janela** (caminho 2)?
 *
 * Precisa ser estado nosso, em módulo: não existe evento `fullscreenchange`
 * para a janela nativa, e `alternarTelaCheiaDe` é chamado de fora de qualquer
 * componente (tile, atalho). Fica em módulo porque a janela é uma só.
 */
let janelaEmTelaCheiaPorNos = false;

/** O ouvinte de Esc do caminho 2, enquanto ele está ligado. */
let escapeDaJanela: ((e: KeyboardEvent) => void) | null = null;

/**
 * Liga o Esc do caminho 2. No caminho do DOM quem faz isto é o navegador; aqui
 * não há ninguém, e sem o ouvinte a única saída seria o botão — que em tela
 * cheia de janela some junto com a moldura em algumas plataformas.
 *
 * Fase de borbulha e `defaultPrevented` respeitado de propósito: um modal
 * aberto por cima do palco também fecha no Esc, e ele tem de ganhar.
 */
function ligarEscapeDaJanela() {
  if (typeof window === "undefined" || escapeDaJanela) return;
  escapeDaJanela = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    void definirTelaCheiaDaJanelaEAnotar(false);
  };
  window.addEventListener("keydown", escapeDaJanela);
}

function desligarEscapeDaJanela() {
  if (typeof window === "undefined" || !escapeDaJanela) return;
  window.removeEventListener("keydown", escapeDaJanela);
  escapeDaJanela = null;
}

/**
 * Põe (ou tira) a janela em tela cheia e **anota** — flag do módulo, `telaCheia`
 * da store e ouvinte de Esc. Só anota quando a chamada deu certo: anotar antes
 * deixaria o botão dizendo "sair da tela cheia" com a janela normal.
 */
async function definirTelaCheiaDaJanelaEAnotar(valor: boolean): Promise<boolean> {
  const ok = await definirTelaCheiaDaJanela(valor);
  if (!ok) return false;
  janelaEmTelaCheiaPorNos = valor;
  useVoice.getState().setTelaCheia(valor);
  if (valor) {
    ligarEscapeDaJanela();
    void observarSaidaPorFora();
  } else {
    desligarEscapeDaJanela();
  }
  return true;
}

/**
 * Já pedimos o `onResized` da janela? É um só e fica para sempre: o desligar
 * chega por `await`, e desfazê-lo a cada entrada/saída abriria uma corrida em
 * que o ouvinte antigo sobrevive ao pedido de parada. Ele não faz nada quando
 * não estamos no caminho 2, então deixar ligado não custa.
 */
let observandoAJanela = false;

/**
 * Enquanto a tela cheia é da janela, o usuário pode sair **por fora** — o
 * semáforo verde do macOS, o atalho do sistema — e nada disso passa por nós.
 * O `onResized` é o único sinal que sobra (o tao o emite no fim da transição de
 * tela cheia, ver `BarraDeTitulo.tsx`), e uma releitura ali devolve a verdade
 * ao botão em vez de deixá-lo dizendo "sair" com a janela já normal.
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

/** A janela saiu da tela cheia sem nos avisar? Então o caminho 2 acabou. */
async function reconciliarComAJanela(): Promise<void> {
  if (!janelaEmTelaCheiaPorNos) return;
  if (await janelaEmTelaCheia()) return;
  janelaEmTelaCheiaPorNos = false;
  useVoice.getState().setTelaCheia(false);
  desligarEscapeDaJanela();
}

/** Entra/sai da tela cheia da janela, a partir do estado **real** dela. */
async function alternarTelaCheiaDaJanela(): Promise<void> {
  if (!isTauri()) return;
  // A janela pode ter saído da tela cheia sem nos avisar (semáforo verde do
  // macOS, F11 do WebView2). Perguntar custa uma ida ao Rust e evita o clique
  // que "não faz nada" porque a nossa flag estava ao contrário.
  const agora = await janelaEmTelaCheia();
  const ok = await definirTelaCheiaDaJanelaEAnotar(!agora);
  if (!ok) {
    console.warn(
      "[tela cheia] a janela do app recusou a tela cheia — falta `core:window:allow-set-fullscreen`?",
    );
  }
}

/** Desfaz a tela cheia de janela, se for nossa. Usado no desmonte do palco. */
async function sairDaTelaCheiaDaJanela(): Promise<void> {
  if (!janelaEmTelaCheiaPorNos) return;
  await definirTelaCheiaDaJanelaEAnotar(false);
}

/** Entra/sai da tela cheia num elemento qualquer (usado também por tile). */
export async function alternarTelaCheiaDe(el: HTMLElement | null) {
  if (typeof document === "undefined") return;

  // Já estamos no caminho 2? Então este clique é o de sair. Não há
  // `fullscreenElement` para desmentir, e tentar promover elemento aqui
  // empilharia as duas telas cheias uma na outra.
  if (janelaEmTelaCheiaPorNos) {
    await alternarTelaCheiaDaJanela();
    return;
  }

  if (!el) {
    // o `ref` ainda não foi pendurado (ou o elemento já desmontou): antes isto
    // era um `return` mudo, e um clique sem efeito nenhum
    console.warn("[tela cheia] o alvo não está no DOM — nada a promover");
    return;
  }

  // ── Caminho 1: a Fullscreen API do DOM ───────────────────────────────────
  // Tudo daqui até a chamada é síncrono **de propósito**: `requestFullscreen`
  // exige gesto do usuário, e um `await` antes dele já basta para o navegador
  // considerar o clique gasto e recusar o pedido.
  const doc = document as DocumentoComWebkit;
  const comWebkit = el as ElementoComWebkit;

  if (elementoEmTelaCheia() === el) {
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
    return;
  }

  const entrar: (() => Promise<void> | void) | undefined =
    typeof el.requestFullscreen === "function"
      ? () => el.requestFullscreen()
      : typeof comWebkit.webkitRequestFullscreen === "function"
        ? () => comWebkit.webkitRequestFullscreen?.()
        : undefined;

  if (entrar) {
    try {
      // o caminho `webkit` devolve `undefined` em vez de promessa, e reporta erro
      // pelo evento `webkitfullscreenerror` — o `await` aceita os dois
      await entrar();
      return;
    } catch (erro) {
      // recusa comum: sem gesto do usuário, tela cheia desabilitada na webview,
      // ou já havia uma transição em curso
      console.warn("[tela cheia] o navegador recusou o pedido:", erro);
    }
  } else {
    console.warn("[tela cheia] este navegador não implementa `requestFullscreen` no elemento");
  }

  // ── Caminho 2: a tela cheia da janela ────────────────────────────────────
  // Fora do app desktop não há para onde cair, e o aviso acima já explicou.
  await alternarTelaCheiaDaJanela();
}

/**
 * Liga um palco à tela cheia e sincroniza o `telaCheia` da store com o que o
 * navegador (ou a janela) de fato está fazendo.
 *
 * `suportada` é resolvida num efeito, e não na primeira renderização: no HTML
 * gerado no servidor não há `document` — nem o `window.isTauri` que responde se
 * estamos no app —, e decidir ali deixaria a hidratação discordando da
 * marcação.
 */
export function useTelaCheia(alvo: RefObject<HTMLElement | null>) {
  const telaCheia = useVoice((s) => s.telaCheia);
  const setTelaCheia = useVoice((s) => s.setTelaCheia);
  const [suportada, setSuportada] = useState(false);

  useEffect(() => {
    setSuportada(suportaTelaCheia());
  }, []);

  useEffect(() => {
    const aoTrocar = () => {
      // no caminho 2 quem manda no estado é a nossa chamada: um
      // `fullscreenchange` de outro elemento não pode apagá-lo
      if (janelaEmTelaCheiaPorNos) return;
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
      // a janela do Tauri não sai sozinha: sem isto, sair da call deixaria o
      // app sem moldura e sem botão nenhum para desfazer
      void sairDaTelaCheiaDaJanela();
      // desmontar o palco em tela cheia deixaria a store mentindo
      setTelaCheia(false);
    };
  }, [setTelaCheia]);

  const alternar = useCallback(() => void alternarTelaCheiaDe(alvo.current), [alvo]);

  return { telaCheia, alternar, suportada };
}
