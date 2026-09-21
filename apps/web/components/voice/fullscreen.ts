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
 * ## No app desktop, "tela cheia" são DUAS coisas, e sozinha cada uma mente
 *
 * No navegador a Fullscreen API do DOM basta: o elemento promovido cobre a
 * tela e ponto. No app (Tauri + WebView2) não — e a razão está nas fontes do
 * `wry 0.55.1`, que **não têm tratamento nenhum de tela cheia no Windows**:
 * `fullscreen` só aparece em código de macOS/iOS, e não existe nada ligado ao
 * `ContainsFullScreenElementChanged` do WebView2. Consequência prática:
 *
 *   - `requestFullscreen()` faz o elemento preencher **a área do controle
 *     WebView2**, isto é, o interior da janela. A janela não cresce, e o
 *     resultado é um tile grande dentro de um app do mesmo tamanho de antes;
 *   - `setFullscreen(true)` na janela faz o contrário: o app cobre a tela com
 *     o **leiaute normal** dentro dele, ninguém promove elemento nenhum. Foi
 *     essa a queixa contra a 1.3.0 — "o botão não põe a transmissão em tela
 *     cheia, põe o aplicativo".
 *
 * Então, dentro do Tauri, entrar em tela cheia é **as duas ao mesmo tempo**:
 * promove o elemento *e* põe a janela em tela cheia. Fora do Tauri nada disso
 * existe e segue valendo só a API do DOM.
 *
 * ## No macOS o elemento simplesmente não é promovível, e não é escolha nossa
 *
 * O WKWebView só habilita tela cheia de elemento quando alguém liga o
 * `fullScreenEnabled` — uma chave privada do `WKPreferences`. O `wry` faz isso,
 * mas atrás da feature `fullscreen` (`wry-0.55.1/Cargo.toml:56`,
 * `wkwebview/mod.rs:386-388`), e o `tauri-runtime-wry` pede o `wry` com
 * `default-features = false` e só `["protocol", "os-webview", "linux-body"]`.
 * Ou seja: **a feature fica desligada**, e nenhum `requestFullscreen` funciona
 * no app de macOS. Não adianta procurar o erro no nosso código — para mudar
 * isso seria preciso alterar as dependências do Tauri.
 *
 * É por isso que ali o palco ainda recorre à tela cheia da **janela** (que
 * funciona) e o tile esconde o botão em vez de oferecer um clique inerte.
 *
 * ## A ordem importa, e ela não é livre
 *
 * `requestFullscreen` exige gesto do usuário, e **qualquer** `await` antes dele
 * já basta para o navegador considerar o clique gasto. Por isso o pedido ao
 * elemento é a primeira coisa que acontece, sempre síncrono; a janela só entra
 * depois, no `await` da promessa. Inverter isto não é detalhe de estilo: é o
 * botão parar de funcionar.
 *
 * E a janela só vai junto **se o elemento tiver sido promovido**. Se o pedido
 * do DOM for recusado, pôr a janela em tela cheia sozinha seria justamente
 * reproduzir o defeito de origem — o app sem moldura e a transmissão do mesmo
 * tamanho. Nesse caso o clique falha com aviso no console (ver `aceitaRecuo`
 * para a única exceção, que é de quem pediu o **palco**).
 *
 * ## Desfazer tem de valer por qualquer lado
 *
 * São quatro saídas e nenhuma pode deixar a outra metade pendurada — uma janela
 * sem moldura e sem botão para desfazer é pior que o defeito original:
 *
 *   - **Esc do navegador**: sai só do elemento. O `fullscreenchange` (ouvido
 *     aqui no módulo, não só no hook) tira a janela em seguida;
 *   - **F11 / semáforo verde**: sai só da janela. O `onResized` do Tauri é o
 *     único sinal que sobra, e ele tira o elemento;
 *   - **desmonte** de quem promoveu: `soltarTelaCheiaDe` (tile) e a limpeza de
 *     `useTelaCheia` (palco);
 *   - **sair da chamada**: é o desmonte do palco, acima.
 *
 * ## Estado por elemento, não um booleano de módulo
 *
 * A janela é uma só, mas quem a pôs em tela cheia é sempre **um elemento**, e
 * guardar só um `boolean` foi o que produziu o defeito anterior: bastava o
 * palco ter usado o caminho da janela uma vez para o clique no tile ir direto
 * para lá. `janelaNossa` guarda o modo **e o elemento dono**.
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
 * A intenção de quem pede tela cheia — hoje só uma pergunta, e ela é de
 * produto, não de plataforma.
 */
export type OpcoesDeTelaCheia = {
  /**
   * Quando o DOM **não** promover o elemento, a tela cheia só da **janela**
   * ainda atende o pedido?
   *
   * Atenção ao que mudou: isto já foi o caminho normal do app desktop e agora
   * é só a **saída de emergência**. O caminho normal é a combinação (elemento
   * + janela), e ela não é opcional — dentro do Tauri o elemento sozinho não
   * cobre a tela. Este `recuarParaAJanela` só decide o que fazer quando a
   * promoção do elemento falha ou nem existe:
   *
   *   - `true` (o padrão, e o comportamento histórico) para o **palco**, onde
   *     "tela cheia" significa "a chamada ocupa a tela": a janela sem moldura
   *     entrega isso mesmo sem elemento promovido, e é o que salva o WKWebView
   *     do macOS, que nasce com o *element fullscreen* desligado;
   *   - `false` para um **tile**: ali a janela em tela cheia não é uma versão
   *     pior do que foi pedido, é outra coisa — a transmissão continuaria do
   *     mesmo tamanho no meio da grade. Melhor falhar com aviso.
   */
  recuarParaAJanela?: boolean;
};

/** O padrão do recuo em um só lugar, para os dois pontos de entrada concordarem. */
function aceitaRecuo(opcoes: OpcoesDeTelaCheia | undefined): boolean {
  return opcoes?.recuarParaAJanela ?? true;
}

/**
 * Dá para pôr **isto** em tela cheia aqui? Quem pergunta é a UI, para
 * **esconder** o botão onde ele seria inerte.
 *
 * Com o recuo aceito (o palco), no app desktop a resposta é sempre `true`:
 * mesmo que o DOM recuse, sobra a tela cheia da janela.
 *
 * Sem o recuo (um tile), quem responde é o DOM e só ele. Dentro do app com
 * WebView2 isso hoje é "sim" — o Chromium implementa a Fullscreen API e a
 * combinação com a janela faz o resto —, e é por isso que o botão do tile
 * voltou a aparecer no desktop. Continua sendo "não" no WKWebView do macOS,
 * onde o *element fullscreen* nasce desligado e o tile recusa o recuo. Note
 * que este `true` é **permissão**, não promessa: o pedido ainda pode ser
 * recusado na hora, e é por isso que a recusa sem recuo falha com aviso em vez
 * de virar outra ação.
 */
export function suportaTelaCheia(opcoes?: OpcoesDeTelaCheia): boolean {
  if (aceitaRecuo(opcoes) && isTauri()) return true;
  return suportaTelaCheiaDoDOM();
}

/**
 * A tela cheia de **janela** que nós pedimos — e por causa de quê.
 *
 * `combinada` é o caminho normal do app desktop: a janela acompanha um
 * elemento promovido, e as duas saem juntas. `sozinha` é o recuo, onde não há
 * elemento nenhum promovido e a janela é tudo o que há.
 *
 * Fica em módulo porque a janela é uma só, mas **carrega o elemento dono**: um
 * booleano de módulo foi exatamente o defeito anterior (o palco recuava uma vez
 * e o clique do tile herdava esse estado).
 */
type TelaCheiaDaJanela =
  | { modo: "combinada"; elemento: HTMLElement }
  | { modo: "sozinha" };

let janelaNossa: TelaCheiaDaJanela | null = null;

/** O ouvinte de Esc do recuo, enquanto ele está ligado. */
let escapeDaJanela: ((e: KeyboardEvent) => void) | null = null;

/**
 * Liga o Esc do **recuo**. No caminho combinado quem faz isto é o navegador (o
 * Esc sai do elemento e o `fullscreenchange` leva a janela junto); no recuo não
 * há elemento promovido, ninguém ouve, e sem isto a única saída seria o botão —
 * que em tela cheia de janela some junto com a moldura em algumas plataformas.
 *
 * Fase de borbulha e `defaultPrevented` respeitado de propósito: um modal
 * aberto por cima do palco também fecha no Esc, e ele tem de ganhar.
 */
function ligarEscapeDaJanela() {
  if (typeof window === "undefined" || escapeDaJanela) return;
  escapeDaJanela = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    void tirarAJanelaDaTelaCheia();
  };
  window.addEventListener("keydown", escapeDaJanela);
}

function desligarEscapeDaJanela() {
  if (typeof window === "undefined" || !escapeDaJanela) return;
  window.removeEventListener("keydown", escapeDaJanela);
  escapeDaJanela = null;
}

/**
 * Tira a janela da tela cheia, se ela for nossa, e apaga a anotação. Idempotente
 * de propósito: as quatro saídas podem chegar aqui em qualquer ordem, e a
 * segunda não pode desfazer o que a primeira já arrumou.
 */
async function tirarAJanelaDaTelaCheia(): Promise<void> {
  if (!janelaNossa) return;
  const era = janelaNossa;
  janelaNossa = null;
  desligarEscapeDaJanela();
  await definirTelaCheiaDaJanela(false);
  // no caminho combinado quem manda no `telaCheia` da store é o
  // `fullscreenchange` do elemento (o hook abaixo); só o recuo precisa contar
  if (era.modo === "sozinha") useVoice.getState().setTelaCheia(false);
}

/**
 * Já pedimos o `onResized` da janela? É um só e fica para sempre: o desligar
 * chega por `await`, e desfazê-lo a cada entrada/saída abriria uma corrida em
 * que o ouvinte antigo sobrevive ao pedido de parada. Ele não faz nada quando a
 * janela não é nossa, então deixar ligado não custa.
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
 * A janela saiu da tela cheia sem nos avisar? Então a nossa metade do DOM
 * também tem de cair — senão sobraria um elemento promovido preenchendo uma
 * janela normal, que é meia tela cheia e nenhum botão dizendo a verdade.
 */
async function reconciliarComAJanela(): Promise<void> {
  if (!janelaNossa) return;
  if (await janelaEmTelaCheia()) return;
  const era = janelaNossa;
  janelaNossa = null;
  desligarEscapeDaJanela();
  if (era.modo === "sozinha") {
    useVoice.getState().setTelaCheia(false);
    return;
  }
  if (elementoEmTelaCheia()) await sairDoElemento();
}

/**
 * O `fullscreenchange` do módulo — que **não** é o do hook.
 *
 * O hook só existe onde há palco; um tile promovido por `alternarTelaCheiaDe`
 * não tem ninguém escutando por ele, e é ele quem mais precisa: o Esc do
 * navegador sai do elemento e deixaria a janela sem moldura para sempre.
 *
 * Nunca é removido, pela mesma razão do `onResized`: é inerte enquanto a janela
 * não for nossa, e removê-lo abriria corrida com a próxima entrada.
 */
let reconciliadorLigado = false;

function ligarReconciliadorDoDOM() {
  if (typeof document === "undefined" || reconciliadorLigado) return;
  reconciliadorLigado = true;
  const aoTrocar = () => void reconciliarComODOM();
  document.addEventListener("fullscreenchange", aoTrocar);
  document.addEventListener("webkitfullscreenchange", aoTrocar);
}

/**
 * Saiu do elemento (Esc, ou o elemento desmontou)? A janela vai junto.
 *
 * A condição é "não há **nenhum** elemento em tela cheia", e não "não é mais
 * aquele": trocar a tela cheia de um tile para o palco (ou para outro tile) é
 * um `requestFullscreen` novo com o anterior saindo, e checar identidade aqui
 * faria a janela cair no meio da troca. Enquanto houver alguém promovido, a
 * combinação continua de pé — só muda o dono, anotado na entrada.
 */
async function reconciliarComODOM(): Promise<void> {
  if (janelaNossa?.modo !== "combinada") return;
  if (elementoEmTelaCheia()) return;
  await tirarAJanelaDaTelaCheia();
}

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
 * Pede a tela cheia do elemento **agora**, sem `await` nenhum antes da chamada.
 *
 * Devolve a promessa do pedido, ou `null` quando este navegador não tem a
 * Fullscreen API de elemento (WKWebView com o recurso desligado, `<iframe>` sem
 * `allow`) — que é caso de recuo, e não de recusa.
 */
function pedirTelaCheiaDoElemento(el: HTMLElement): Promise<void> | null {
  if (!suportaTelaCheiaDoDOM()) return null;
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
    // `TypeError` síncrono: vira recusa, não recuo
    return Promise.reject(erro);
  }
}

/**
 * A segunda metade da tela cheia do app desktop: a janela acompanha o elemento
 * que acabou de ser promovido.
 *
 * Só depois do `await` do pedido do DOM — antes dele não pode haver `await`
 * nenhum (gesto do usuário), e a janela não precisa de gesto.
 */
async function combinarComAJanela(el: HTMLElement): Promise<void> {
  if (!isTauri()) return;

  // trocar de elemento (tile → palco, tile → tile) não mexe na janela: ela já
  // está em tela cheia por nós, só muda o dono anotado
  if (janelaNossa?.modo === "combinada") {
    janelaNossa = { modo: "combinada", elemento: el };
    return;
  }

  // a janela pode já estar em tela cheia por fora (F11, semáforo verde). Não é
  // nossa: não anotamos e não a tiramos depois — desfazer o que o usuário fez
  // à mão seria pior que não fazer nada.
  if (await janelaEmTelaCheia()) return;

  // o Esc pode ter chegado durante as idas ao Rust acima; pôr a janela em tela
  // cheia agora deixaria o app sem moldura com nada promovido dentro
  if (elementoEmTelaCheia() !== el) return;

  const ok = await definirTelaCheiaDaJanela(true);
  if (!ok) {
    console.warn(
      "[tela cheia] o elemento foi promovido, mas a janela do app recusou a tela cheia — " +
        "falta `core:window:allow-set-fullscreen`? No WebView2 o elemento sozinho só preenche " +
        "o interior da janela.",
    );
    return;
  }
  janelaNossa = { modo: "combinada", elemento: el };
  ligarReconciliadorDoDOM();
  void observarSaidaPorFora();

  // e se ele saiu bem no meio disto, desfaz — a ordem das duas saídas é livre,
  // o que não pode é sobrar metade
  if (elementoEmTelaCheia() !== el) await tirarAJanelaDaTelaCheia();
}

/** Entra na tela cheia só da janela (o recuo), a partir do estado **real** dela. */
async function entrarSoNaJanela(): Promise<void> {
  if (!isTauri()) return;
  // A janela pode já estar em tela cheia sem nos avisar (semáforo verde do
  // macOS, F11 do WebView2). Perguntar custa uma ida ao Rust e evita o clique
  // que "não faz nada" porque a nossa anotação estava ao contrário.
  if (await janelaEmTelaCheia()) {
    await definirTelaCheiaDaJanela(false);
    return;
  }
  const ok = await definirTelaCheiaDaJanela(true);
  if (!ok) {
    console.warn(
      "[tela cheia] a janela do app recusou a tela cheia — falta `core:window:allow-set-fullscreen`?",
    );
    return;
  }
  janelaNossa = { modo: "sozinha" };
  useVoice.getState().setTelaCheia(true);
  ligarEscapeDaJanela();
  void observarSaidaPorFora();
}

/**
 * Entra/sai da tela cheia num elemento qualquer.
 *
 * Dentro do app desktop isto é **elemento + janela** (ver o topo do arquivo);
 * no navegador, só o elemento. `opcoes.recuarParaAJanela` só decide o que
 * acontece quando o DOM não promove — omitido, vale `true`, que é o
 * comportamento de sempre e o certo para o palco. `VoiceHotkeys` e
 * `useTelaCheia` chamam com o palco e continuam valendo sem tocar em nada.
 */
export async function alternarTelaCheiaDe(el: HTMLElement | null, opcoes?: OpcoesDeTelaCheia) {
  if (typeof document === "undefined") return;
  const recuo = aceitaRecuo(opcoes);

  // Estamos no recuo? Então, para quem aceita o recuo, este clique é o de sair.
  // Não há `fullscreenElement` para desmentir, e promover elemento aqui
  // empilharia as duas telas cheias uma na outra.
  //
  // **Sair, e não "alternar"**: se a janela já tivesse saído por fora com a
  // nossa anotação para trás, um "alternar" **entraria** de novo — o app inteiro
  // em tela cheia sem ninguém ter pedido. Quem **não** aceita o recuo não entra
  // aqui: mexer na janela do app (nem para sair) não é o que se pediu ao
  // ampliar um tile; segue para o DOM.
  if (janelaNossa?.modo === "sozinha" && recuo) {
    await tirarAJanelaDaTelaCheia();
    return;
  }

  if (!el) {
    // o `ref` ainda não foi pendurado (ou o elemento já desmontou): antes isto
    // era um `return` mudo, e um clique sem efeito nenhum
    console.warn("[tela cheia] o alvo não está no DOM — nada a promover");
    return;
  }

  // ── Sair ─────────────────────────────────────────────────────────────────
  // Pelo elemento primeiro, que é **a mesma saída que o Esc usa**: o
  // `fullscreenchange` cai no `reconciliarComODOM` e leva a janela junto. Ter
  // uma saída só para acertar vale mais que a simetria com a entrada; o
  // `await` abaixo é cinto e suspensório para o caso de o evento não vir.
  if (elementoEmTelaCheia() === el) {
    await sairDoElemento();
    if (janelaNossa?.modo === "combinada" && !elementoEmTelaCheia()) {
      await tirarAJanelaDaTelaCheia();
    }
    return;
  }

  // ── Entrar ───────────────────────────────────────────────────────────────
  // Tudo daqui até `pedirTelaCheiaDoElemento` é síncrono **de propósito**:
  // `requestFullscreen` exige gesto do usuário, e um `await` antes dele já
  // basta para o navegador considerar o clique gasto e recusar o pedido.
  const promocao = pedirTelaCheiaDoElemento(el);

  if (promocao) {
    try {
      await promocao;
    } catch (erro) {
      // recusa comum: sem gesto do usuário, tela cheia desabilitada na webview,
      // ou já havia uma transição em curso
      console.warn("[tela cheia] o navegador recusou o pedido:", erro);
      await recuarOuFalhar(recuo);
      return;
    }
    // Promovido. No app desktop isto ainda não cobre a tela — o elemento
    // preenche o interior da janela e mais nada —, então a janela vai junto.
    await combinarComAJanela(el);
    return;
  }

  console.warn("[tela cheia] este navegador não oferece tela cheia de elemento");
  await recuarOuFalhar(recuo);
}

/**
 * O que fazer quando o elemento **não** foi promovido: para o palco, a janela
 * sozinha ainda é "a chamada ocupa a tela"; para um tile, não fazer nada é
 * melhor que fazer outra coisa.
 */
async function recuarOuFalhar(recuo: boolean): Promise<void> {
  if (!recuo) {
    // Este `return` é a correção do defeito da 1.3.0. Quem pediu para ampliar
    // **um elemento** prefere não acontecer nada a ver o app inteiro perder a
    // moldura com a transmissão do mesmo tamanho.
    console.warn(
      "[tela cheia] o elemento não pôde ser promovido e o recuo para a janela não vale aqui: " +
        "nada foi feito, de propósito (pôr a janela em tela cheia seria fazer outra coisa)",
    );
    return;
  }
  // O recuo é uma troca de ação — elemento por janela inteira. Sem este rastro
  // ninguém descobre, pelo log, por que o app ficou sem moldura.
  console.warn(
    "[tela cheia] recuando para a tela cheia da JANELA: o elemento não foi promovido, " +
      "quem perde a moldura é o app inteiro",
  );
  await entrarSoNaJanela();
}

/**
 * Desfaz a tela cheia que **este** elemento ligou. Para o desmonte de quem
 * promove sem hook (o tile): o navegador solta a tela cheia do DOM sozinho
 * quando o elemento sai da página, mas a janela do Tauri não — e aí sobraria um
 * app sem moldura depois que a transmissão acabou.
 */
export function soltarTelaCheiaDe(el: HTMLElement | null): void {
  if (!el) return;
  if (janelaNossa?.modo !== "combinada" || janelaNossa.elemento !== el) return;
  void tirarAJanelaDaTelaCheia();
}

/** Desfaz qualquer tela cheia de janela nossa. Usado no desmonte do palco. */
async function sairDaTelaCheiaDaJanela(): Promise<void> {
  await tirarAJanelaDaTelaCheia();
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
export function useTelaCheia(alvo: RefObject<HTMLElement | null>, opcoes?: OpcoesDeTelaCheia) {
  const telaCheia = useVoice((s) => s.telaCheia);
  const setTelaCheia = useVoice((s) => s.setTelaCheia);
  const [suportada, setSuportada] = useState(false);
  // o hook de hoje é sempre do palco, então o padrão (recuo aceito) é o certo;
  // o parâmetro existe para quem vier depois não precisar de um hook novo
  const recuo = aceitaRecuo(opcoes);

  useEffect(() => {
    setSuportada(suportaTelaCheia({ recuarParaAJanela: recuo }));
  }, [recuo]);

  useEffect(() => {
    const aoTrocar = () => {
      // no recuo não há elemento promovido: quem manda no estado é a nossa
      // chamada, e um `fullscreenchange` de outro elemento não pode apagá-lo.
      // No caminho combinado é o contrário — o elemento é a verdade, e a janela
      // é consequência dele.
      if (janelaNossa?.modo === "sozinha") return;
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

  const alternar = useCallback(
    () => void alternarTelaCheiaDe(alvo.current, { recuarParaAJanela: recuo }),
    [alvo, recuo],
  );

  return { telaCheia, alternar, suportada };
}
