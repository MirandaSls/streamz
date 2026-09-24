/**
 * Ponte de notificações web ↔ desktop (Tauri 2).
 *
 * >>> PARA O AGENTE C (tela de chat) <<<
 * Hoje só o **canal ativo** notifica (`app/app/page.tsx`). Esta API já está
 * pronta para o resto: chame `notify(...)` também para **DMs** e para **canais
 * não ativos** — inclusive quando a mensagem chega por `dm.new`/`message.new`
 * de um canal que não é o aberto. O `onClick` existe justamente para levar o
 * usuário até lá:
 *
 *     import { notify } from "@/lib/desktop";
 *
 *     notify({
 *       title: `#${canal.name}`,
 *       body: `${msg.author.username}: ${msg.content}`,
 *       onClick: () => selecionarCanal(canal.id), // a janela já é focada aqui
 *     });
 *
 * Regra de bom senso do chamador (não é feita aqui): não notificar mensagem
 * própria, e notificar o canal ativo só quando a janela **não tem foco**
 * (`janelaTemFoco()`, abaixo). Visibilidade não serve de gate no desktop: uma
 * janela aberta atrás de outro app continua `visible` para o DOM, e é
 * justamente aí que o Discord avisa.
 *
 * Comportamento:
 *   - Dentro do Tauri: notificação nativa via `@tauri-apps/plugin-notification`;
 *     o clique foca a janela (`getCurrentWindow().setFocus()`) e roda `onClick`.
 *   - No navegador: Notification API; o clique foca a aba e roda `onClick`.
 *   - Sem suporte / permissão negada: **no-op**. Nunca lança — notificação é
 *     best-effort e não pode quebrar o fluxo de mensagens.
 *
 * A permissão é pedida **uma vez** por sessão (o resultado fica memoizado); se o
 * usuário negar, as chamadas seguintes saem em silêncio sem novo prompt. No
 * desktop ela é negociada no boot (`prepararNotificacoes`), e não na primeira
 * mensagem: no Windows o plugin só entrega o toast depois de
 * `isPermissionGranted`/`requestPermission`, e deixar isso para a hora da
 * mensagem é deixar a primeira notificação da sessão para trás.
 *
 * Os módulos do Tauri entram por `import()` dinâmico: fora do app desktop eles
 * nunca são carregados, e o bundle do browser não paga por eles.
 * (`withGlobalTauri` está desligado — não existe mais `window.__TAURI__`.)
 */

import type { FonteDeTela, PedidoDeTela } from "@/lib/seletor-de-tela";
import {
  SEM_OBSERVACAO,
  comSinal,
  temFoco,
  type EstadoDeFoco,
} from "@/lib/foco-da-janela";

export type NotificacaoOptions = {
  title: string;
  body?: string;
  /** Roda no clique da notificação, depois de focar a janela. */
  onClick?: () => void;
};

declare global {
  interface Window {
    /** Injetado pelo runtime do Tauri 2 em qualquer webview do app. */
    isTauri?: boolean;
    __TAURI_INTERNALS__?: unknown;
  }
}

/**
 * Bloqueia o menu de contexto NATIVO do WebView2 (Voltar, Recarregar,
 * Inspecionar…) no desktop. O Discord não mostra esse menu em lugar nenhum; os
 * menus do próprio app chamam `preventDefault` antes e continuam funcionando —
 * este ouvinte fica no `document`, em fase de borbulha, e só age quando
 * nenhum menu nosso reivindicou o clique. Copiar/colar seguem por atalho.
 * No site não faz nada: lá o menu do navegador é do usuário.
 */
export function bloquearMenuNativo(): () => void {
  if (!isTauri() || typeof document === "undefined") return () => {};
  const ouvinte = (e: MouseEvent) => {
    if (!e.defaultPrevented) e.preventDefault();
  };
  document.addEventListener("contextmenu", ouvinte);
  return () => document.removeEventListener("contextmenu", ouvinte);
}

/** True quando o código está executando dentro do app desktop (Tauri). */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.isTauri === true || typeof window.__TAURI_INTERNALS__ !== "undefined")
  );
}

/**
 * `true` só dentro do app de **macOS** — onde a janela tem os semáforos nativos
 * (`titleBarStyle: "Overlay"` no `tauri.macos.conf.json`) em vez dos três
 * controles desenhados pela barra de título.
 *
 * Síncrono de propósito, pelo `navigator.userAgent` e não pelo `plugin-os`
 * (motivo em `hooks/useEhMobile.ts`): o WKWebView do Mac diz `Macintosh; Intel
 * Mac OS X` — inclusive em Apple Silicon —, o WebView2 diz `Windows NT` e o
 * WebKitGTK diz `X11; Linux`. A exceção é o iPad, que também se diz
 * `Macintosh`. O desempate tem dois sinais, e basta um: o ponteiro grosso (o
 * mesmo do `useEhMobile`) e `navigator.maxTouchPoints > 0`. O ponteiro sozinho
 * não bastava — iPad com trackpad ou Magic Keyboard pode responder
 * `(pointer: fine)` —, mas a tela continua sendo de toque, e o WebKit do Mac
 * responde `maxTouchPoints = 0` (nenhum Mac tem tela de toque). Não importa o
 * `useEhMobile` porque ele importa este arquivo.
 */
export function ehMacNoTauri(): boolean {
  if (!isTauri() || typeof navigator === "undefined") return false;
  if (!/Macintosh|Mac OS X/i.test(navigator.userAgent)) return false;
  const ponteiroGrosso =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const telaDeToque = navigator.maxTouchPoints > 0;
  return !ponteiroGrosso && !telaDeToque;
}

/**
 * Dispara uma notificação nativa.
 * Aceita `notify({ title, body, onClick })` ou a forma curta `notify(title, body)`.
 */
export async function notify(options: NotificacaoOptions): Promise<void>;
export async function notify(title: string, body?: string): Promise<void>;
export async function notify(
  entrada: NotificacaoOptions | string,
  body?: string,
): Promise<void> {
  const options: NotificacaoOptions =
    typeof entrada === "string" ? { title: entrada, body } : entrada;
  try {
    if (isTauri()) {
      await notificarViaTauri(options);
      return;
    }
    await notificarViaBrowser(options);
  } catch {
    // Best-effort: qualquer falha (permissão, plugin ausente, SSR) é silenciada.
  }
}

// ── Identificação do cliente ───────────────────────────────────────────────

/**
 * Versão do app, quando já foi lida do Tauri. Fica em módulo porque o
 * `getVersion()` é assíncrono e o cabeçalho é montado no meio de um `fetch`.
 */
let versaoDoApp: string | null = null;
/** Evita disparar a leitura da versão a cada requisição. */
let versaoPedida = false;

/**
 * Como este cliente se apresenta no cabeçalho `X-Streamz-Client` — ou `null`
 * no navegador, que não tem nada a declarar.
 *
 * Existe porque o `User-Agent` do desktop **é** o do Edge: o Tauri 2 no Windows
 * roda em WebView2, e a aba "Dispositivos" listava o app instalado como se
 * fosse mais um navegador. A API classifica a sessão por este cabeçalho no
 * login e no refresh.
 *
 * A primeira chamada devolve `"desktop"` sem versão e dispara a leitura em
 * segundo plano (o login não pode esperar por ela); as seguintes já saem
 * `"desktop/0.0.14"`. A classificação só depende do que vem antes da barra, e
 * por isso a corrida não muda o resultado.
 */
export function identificacaoDoCliente(): string | null {
  if (!isTauri()) return null;
  if (!versaoPedida) {
    versaoPedida = true;
    void lerVersaoDoApp();
  }
  return versaoDoApp ? `desktop/${versaoDoApp}` : "desktop";
}

async function lerVersaoDoApp(): Promise<void> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    versaoDoApp = await getVersion();
  } catch {
    // sem a versão o cabeçalho continua valendo: o tipo é o que importa
  }
}

// ── Foco da janela ─────────────────────────────────────────────────────────

/**
 * Foco da janela do desktop. A regra (e o porquê) estão em
 * `lib/foco-da-janela.ts`; aqui fica só o estado e a ligação com o ambiente.
 */
let focoDaJanela: EstadoDeFoco = SEM_OBSERVACAO;

/**
 * A janela está na frente e com foco? É o gate de notificação do Discord: com
 * foco, só menção e DM avisam; sem foco (outro app na frente, minimizada, na
 * bandeja), tudo avisa. E é também o gate de **marcar como lido**: a conversa
 * aberta numa janela em foco lê o que chega. Sem DOM (SSR) responde `true` —
 * nada a notificar.
 */
export function janelaTemFoco(): boolean {
  if (typeof document === "undefined") return true;
  return temFoco(focoDaJanela, document.hasFocus());
}

/**
 * Avisa quando a janela ganha ou perde foco. No navegador são os eventos
 * `focus`/`blur` do `window`; no Tauri entra também o `onFocusChanged` da
 * janela nativa, que é quem sabe quando o usuário clicou em outro app com a
 * nossa barra de título (região de arrasto) no meio. Os dois podem disparar
 * para a mesma troca; quem ouve tem que aguentar repetição.
 *
 * **As duas fontes alimentam o estado**, e não só a do Tauri. No desktop a
 * janela `main` nasce escondida (a janelinha de abertura é quem a mostra), o
 * primeiro `document.hasFocus()` é `false`, e o ouvinte nativo só fica pronto
 * depois de um `import()` assíncrono: se o foco chegava nesse meio-tempo,
 * ninguém desmentia o `false` e a conversa aberta parava de ser marcada como
 * lida pelo resto da sessão. O `focus` do DOM, que já estava registrado,
 * fecha essa janela de corrida — e uma releitura logo depois do ouvinte nativo
 * entrar cobre o caso em que nem esse evento veio.
 */
export function observarFoco(ouvinte: (foco: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const anotar = (foco: boolean) => {
    focoDaJanela = comSinal(focoDaJanela, foco);
    ouvinte(foco);
  };
  const ganhou = () => anotar(true);
  const perdeu = () => anotar(false);
  window.addEventListener("focus", ganhou);
  window.addEventListener("blur", perdeu);
  let pararTauri: (() => void) | null = null;
  let cancelado = false;
  if (isTauri()) {
    focoDaJanela = comSinal(focoDaJanela, document.hasFocus());
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const parar = await getCurrentWindow().onFocusChanged(({ payload }) => anotar(payload));
        if (cancelado) {
          parar();
          return;
        }
        pararTauri = parar;
        // o que aconteceu enquanto o `import()` corria não gerou evento aqui:
        // relê o DOM agora que o ouvinte existe
        if (document.hasFocus()) anotar(true);
      } catch {
        // sem o evento nativo, fica o `hasFocus()` do DOM
        focoDaJanela = SEM_OBSERVACAO;
      }
    })();
  }
  return () => {
    cancelado = true;
    window.removeEventListener("focus", ganhou);
    window.removeEventListener("blur", perdeu);
    pararTauri?.();
    focoDaJanela = SEM_OBSERVACAO;
  };
}

/**
 * Negocia a permissão e liga o ouvinte de clique no boot do app desktop, para
 * a primeira notificação da sessão já sair. No navegador não faz nada: pedir
 * permissão sem gesto do usuário é negado e o resultado ficaria memoizado.
 */
export async function prepararNotificacoes(): Promise<void> {
  if (!isTauri()) return;
  try {
    const plugin = await import("@tauri-apps/plugin-notification");
    const permitido = await garantirPermissao(
      () => plugin.isPermissionGranted(),
      async () => (await plugin.requestPermission()) === "granted",
    );
    if (permitido) await registrarOuvinteDeClique(plugin);
  } catch {
    // best-effort, como o resto: a próxima `notify` tenta de novo
  }
}

/**
 * Traz a janela do app para frente. No Tauri desfaz o minimizado — o app some
 * para a bandeja ao fechar, então `show()` antes de `setFocus()` é obrigatório.
 * No navegador, `window.focus()` (que o browser pode ignorar).
 */
export async function focarJanela(): Promise<void> {
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const janela = getCurrentWindow();
      await janela.show();
      await janela.unminimize();
      await janela.setFocus();
      return;
    }
    if (typeof window !== "undefined") window.focus();
  } catch {
    // Idem: focar é conveniência, não pode derrubar o clique.
  }
}

// ── Tela cheia da janela ───────────────────────────────────────────────────

/**
 * Tela cheia da **janela**, que não é a tela cheia do DOM.
 *
 * São duas coisas diferentes com o mesmo nome. A Fullscreen API do navegador
 * *promove um elemento*: o palco vira o conteúdo da tela, o compositor entra no
 * modo de baixa latência e o Esc devolve. O `setFullscreen` do Tauri tira a
 * moldura da **janela inteira**, com o app do jeito que está dentro dela.
 *
 * Existe porque a primeira nem sempre está disponível no app desktop — o
 * WKWebView do macOS nasce com o *element fullscreen* desligado, e aí o botão
 * de tela cheia do palco simplesmente não fazia nada. Quando a do DOM falta ou
 * é recusada, quem pediu o **palco** em tela cheia aceita a segunda: é pior
 * (ninguém promove elemento nenhum), mas a chamada ocupa a tela.
 *
 * **Só o palco.** Isto aqui não é um substituto genérico da Fullscreen API, e
 * chamar daqui para ampliar um elemento qualquer é trocar a ação do usuário
 * por outra — foi assim que a 1.3.0 saiu com o botão de tela cheia da tela
 * compartilhada pondo o *aplicativo* em tela cheia em vez da transmissão. Quem
 * escolhe é `components/voice/fullscreen.ts`: dentro do app a tela cheia é
 * **as duas juntas** — esta janela mais o elemento promovido por CSS nosso —,
 * porque a Fullscreen API do DOM não cobre a tela no Tauri. Chamador novo
 * passa por lá, nunca chama esta função sozinha.
 *
 * As permissões são `core:window:allow-set-fullscreen` e
 * `core:window:allow-is-fullscreen`, em `capabilities/default.json` — sem a
 * primeira a ACL do Tauri recusa a chamada e estas funções respondem como se
 * não houvesse desktop. No celular não existe nada disto (ver `mobile.json`).
 */
export async function janelaEmTelaCheia(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return await getCurrentWindow().isFullscreen();
  } catch {
    // sem a ponte (ou sem a permissão) a resposta honesta é "não está"
    return false;
  }
}

/**
 * Põe (ou tira) a janela do app em tela cheia. Devolve `true` só quando a
 * chamada foi mesmo feita — `false` fora do Tauri e quando a ACL ou a ponte
 * recusaram. Quem chama precisa dessa diferença para não marcar "em tela
 * cheia" com a janela do mesmo tamanho de antes.
 */
export async function definirTelaCheiaDaJanela(valor: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(valor);
    return true;
  } catch {
    return false;
  }
}

// ── Tauri ──────────────────────────────────────────────────────────────────

/** Handlers de clique pendentes, indexados pelo id da notificação. */
const cliquesPendentes = new Map<number, () => void>();
/** Ids do Tauri precisam ser inteiros de 32 bits; um contador basta. */
let proximoId = 1;
/** `onAction` é registrado uma única vez, na primeira notificação com onClick. */
let ouvinteDeCliqueRegistrado = false;

async function notificarViaTauri(options: NotificacaoOptions): Promise<void> {
  const plugin = await import("@tauri-apps/plugin-notification");
  const permitido = await garantirPermissao(
    () => plugin.isPermissionGranted(),
    async () => (await plugin.requestPermission()) === "granted",
  );
  if (!permitido) return;

  const id = proximoId++;
  if (options.onClick) {
    cliquesPendentes.set(id, options.onClick);
    await registrarOuvinteDeClique(plugin);
  }
  plugin.sendNotification({ id, title: options.title, body: options.body });
}

async function registrarOuvinteDeClique(
  plugin: typeof import("@tauri-apps/plugin-notification"),
): Promise<void> {
  if (ouvinteDeCliqueRegistrado) return;
  ouvinteDeCliqueRegistrado = true;
  try {
    await plugin.onAction((notificacao) => {
      const handler =
        typeof notificacao.id === "number"
          ? cliquesPendentes.get(notificacao.id)
          : undefined;
      if (notificacao.id !== undefined) cliquesPendentes.delete(notificacao.id);
      void focarJanela();
      handler?.();
    });
  } catch {
    // Nem toda plataforma entrega o evento de clique; a notificação em si
    // continua funcionando, só o onClick fica inerte.
    ouvinteDeCliqueRegistrado = false;
  }
}

// ── Browser ────────────────────────────────────────────────────────────────

async function notificarViaBrowser(options: NotificacaoOptions): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  const permitido = await garantirPermissao(
    async () => Notification.permission === "granted",
    async () => (await Notification.requestPermission()) === "granted",
  );
  if (!permitido) return;

  const notificacao = new Notification(
    options.title,
    options.body ? { body: options.body } : undefined,
  );
  notificacao.onclick = () => {
    void focarJanela();
    options.onClick?.();
    notificacao.close();
  };
}

// ── Permissão (pedida uma vez) ─────────────────────────────────────────────

let permissao: Promise<boolean> | null = null;

/**
 * Memoiza a negociação de permissão: a primeira chamada consulta e, se preciso,
 * pede; as seguintes reaproveitam o resultado. Sem isso, cada mensagem nova
 * dispararia um prompt.
 */
function garantirPermissao(
  jaConcedida: () => Promise<boolean>,
  pedir: () => Promise<boolean>,
): Promise<boolean> {
  if (!permissao) {
    permissao = (async () => {
      if (await jaConcedida()) return true;
      return pedir();
    })().catch(() => false);
  }
  return permissao;
}

// ── e-configuracoes: contador no ícone do app ──────────────────────────────

/**
 * Escreve o contador de menções no ícone do app (o "badge" do Discord).
 *
 * No desktop usa `setBadgeCount` da janela do Tauri **quando existir** — a API
 * chegou no Tauri 2.1 e nem toda plataforma a implementa, então a chamada é
 * opcional e a falha é silenciosa. No navegador cai no Badging API
 * (`navigator.setAppBadge`), que só funciona em PWA instalado; onde não houver,
 * vira no-op.
 *
 * `0` limpa o contador — nunca mostramos "0" no ícone.
 */
export async function definirContadorNoIcone(total: number): Promise<void> {
  const valor = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const janela = getCurrentWindow() as unknown as {
        setBadgeCount?: (n?: number) => Promise<void>;
      };
      await janela.setBadgeCount?.(valor > 0 ? valor : undefined);
      return;
    }
    if (typeof navigator === "undefined") return;
    const badging = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (valor > 0) await badging.setAppBadge?.(valor);
    else await badging.clearAppBadge?.();
  } catch {
    // Contador é enfeite: plataforma sem suporte não pode derrubar nada.
  }
}

// ── Compartilhamento de tela nativo (só no app de desktop) ─────────────────

/** O que a captura nativa consegue nesta máquina (`capacidades_de_tela`). */
export interface CapacidadesDeTela {
  /** Há backend nativo — Windows e, agora, macOS (`sck`). */
  nativo: boolean;
  /**
   * `wgc` (Windows 11, janela isolada), `dxgi` (Windows 10, recorte do
   * monitor) ou `sck` (macOS, ScreenCaptureKit).
   */
  backend: "wgc" | "dxgi" | "sck" | null;
  /** Compartilhar uma janela mostra o que estiver por cima dela (DXGI). */
  janelaRecortada: boolean;
  /** Dá para levar o som do sistema junto (loopback do WASAPI no Windows)? */
  audioDoSistema: boolean;
  /**
   * O sistema exige autorização para capturar a tela, e ela está dada?
   * `"naoPrecisa"` no Windows, que não tem esse eixo (quem está na sessão
   * pode capturar a sessão) — ver `Permissao` em `tela/mod.rs`.
   */
  permissao: "naoPrecisa" | "concedida" | "faltando";
}

const SEM_CAPTURA: CapacidadesDeTela = {
  nativo: false,
  backend: null,
  janelaRecortada: false,
  audioDoSistema: false,
  permissao: "naoPrecisa",
};

/**
 * A captura nativa existe aqui? Fora do Tauri (ou num desktop sem Windows) a
 * resposta é `nativo: false`, e o seletor fica no `getDisplayMedia`. Nunca
 * lança: falha na ponte é o mesmo que não ter captura.
 */
export async function capacidadesDeTela(): Promise<CapacidadesDeTela> {
  if (!isTauri()) return SEM_CAPTURA;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<CapacidadesDeTela>("capacidades_de_tela");
  } catch {
    return SEM_CAPTURA;
  }
}

/**
 * Pede ao macOS a permissão de "Gravação de Tela" (só existe lá — no Windows
 * `permissao` já vem `"naoPrecisa"`, ver `CapacidadesDeTela`).
 *
 * `true` quando a permissão já estava concedida; `false` quando o sistema
 * **acabou de abrir** os Ajustes (ou o próprio diálogo) — nesse caso só vale
 * depois de o usuário conceder ali **e reiniciar o app** (`reiniciarApp`),
 * porque o macOS só relê a permissão no boot do processo.
 *
 * Fora do desktop (ou se a ponte falhar) devolve `true`: não há permissão a
 * negociar, e um `false` aqui prenderia quem chama num aviso que nunca some.
 */
export async function pedirPermissaoDeTela(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("pedir_permissao_de_tela");
  } catch {
    return true;
  }
}

/**
 * Reinicia o app pelo `relaunch()` do `@tauri-apps/plugin-process` — o mesmo
 * caminho que o auto-update usa depois de instalar a versão nova
 * (`JanelaSplash.tsx`). Aqui serve para o macOS reler a permissão de
 * "Gravação de Tela" (`pedirPermissaoDeTela`), que só é conferida no boot.
 *
 * Fora do desktop é no-op. Best-effort: se a ponte falhar, o usuário reinicia
 * na mão.
 */
export async function reiniciarApp(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    // best-effort: o usuário reinicia na mão
  }
}

/** Janelas e monitores que dá para transmitir agora (`fontes_de_tela`). */
export async function fontesDeTela(): Promise<FonteDeTela[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<FonteDeTela[]>("fontes_de_tela");
  } catch {
    return [];
  }
}

/**
 * Miniaturas ao vivo das fontes, na mesma ordem, como data URLs JPEG; `null`
 * onde a captura não deu (janela minimizada, conteúdo protegido). Uma
 * varredura por chamada — quem quer "ao vivo" chama de novo quando esta volta.
 */
export async function miniaturasDeTela(ids: string[]): Promise<(string | null)[]> {
  if (!isTauri() || ids.length === 0) return ids.map(() => null);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<(string | null)[]>("miniaturas_de_tela", { ids });
  } catch {
    return ids.map(() => null);
  }
}

/**
 * Quanto custou cada etapa de ir ao ar (ver `Tempos` em `transmissao.rs`).
 * Serve para `console.debug`: é a única medida que existe da máquina de quem
 * reclama de demora, já que ninguém abre um depurador lá.
 */
export interface TemposDeTela {
  capturaMs: number;
  primeiroQuadroMs: number;
  conexaoMs: number;
  publicacaoMs: number;
  totalMs: number;
  reaproveitouSala: boolean;
  semPrimeiroQuadro: boolean;
}

/**
 * Entra na sala como `<userId>#tela` **sem publicar nada**, para o clique na
 * miniatura só ter de publicar (`preparar_tela`).
 *
 * O seletor chama isto ao abrir: o usuário paga o handshake do LiveKit
 * enquanto escolhe o que transmitir, em vez de pagar depois de escolher.
 * Nunca lança — falhar aqui só significa que `iniciarTelaNativa` conecta na
 * hora, como antes.
 */
export async function prepararTelaNativa(preparo: {
  url: string;
  token: string;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("preparar_tela", { preparo });
  } catch {
    // sem pré-conexão o caminho é o de sempre
  }
}

/** Desfaz a pré-conexão: o seletor fechou sem ninguém escolher fonte. */
export async function descartarTelaNativa(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("descartar_tela");
  } catch {
    // já descartada, ou a ponte caiu
  }
}

/**
 * Começa a transmitir pela captura nativa: o Rust entra na sala como o
 * participante do token (`<userId>#tela`) e publica a fonte. Lança com a
 * mensagem do Rust quando não dá (fonte sumiu, sala recusou) — aqui o erro
 * interessa a quem clicou.
 *
 * Devolve o tempo de cada etapa; ver `TemposDeTela`.
 */
export async function iniciarTelaNativa(pedido: PedidoDeTela): Promise<TemposDeTela> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<TemposDeTela>("iniciar_tela", { pedido });
}

/** Para a transmissão nativa, se houver. Best-effort: parar nunca falha para o usuário. */
export async function pararTelaNativa(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("parar_tela");
  } catch {
    // já parada, ou a ponte caiu: o estado da store é quem manda
  }
}

/** Por que a transmissão nativa acabou sem o usuário pedir (`tela:encerrada`). */
export type MotivoDeEncerramento = "fonteSumiu" | "desconectado" | "falha";

/**
 * Avisa quando a transmissão nativa acaba sozinha: a janela fechou, a sala
 * caiu, a captura falhou. Devolve a função que para de ouvir.
 */
export function ouvirTelaEncerrada(ouvinte: (motivo: MotivoDeEncerramento) => void): () => void {
  if (!isTauri()) return () => {};
  let parar: (() => void) | null = null;
  let cancelado = false;
  void (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const desligar = await listen<MotivoDeEncerramento>("tela:encerrada", ({ payload }) =>
        ouvinte(payload),
      );
      if (cancelado) desligar();
      else parar = desligar;
    } catch {
      // sem o evento, a transmissão que morrer sozinha só some no próximo
      // `parar`; é degradado, não quebrado
    }
  })();
  return () => {
    cancelado = true;
    parar?.();
  };
}

/**
 * O app está encerrando e deu meio segundo para nos despedirmos.
 *
 * Existe porque sair sem avisar deixava a conta **45 segundos na sala** para
 * todo mundo: o servidor não distingue, no fio, "fechei o programa" de "a rede
 * caiu", e por isso espera a carência de reconexão antes de tirar alguém da
 * voz (`VOICE_RECONNECT_GRACE_MS`). Quem clicou em "Sair" na bandeja não vai
 * voltar, e ficava lá, marcado como "reconectando", até o relógio zerar.
 *
 * O `ouvinte` faz a despedida (mandar `voice.leave`, fechar o socket **de
 * propósito**) e devolve; `pronto_para_sair` então libera o encerramento, que
 * de outro modo só aconteceria no fim do meio segundo. O Rust encerra sozinho
 * quando o tempo acaba, então falhar aqui atrasa a saída, não a impede.
 *
 * Fora do Tauri é no-op: no navegador quem faz esse papel é o `pagehide`
 * (`lib/socket.ts`), e lá não há processo para segurar.
 */
export function ouvirSaidaDoApp(ouvinte: () => void): () => void {
  if (!isTauri()) return () => {};
  let parar: (() => void) | null = null;
  let cancelado = false;
  void (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const desligar = await listen("app:saindo", () => {
        try {
          ouvinte();
        } finally {
          // sai da fila de eventos: o `invoke` não pode atrasar a despedida
          void import("@tauri-apps/api/core")
            .then(({ invoke }) => invoke("pronto_para_sair"))
            .catch(() => {
              // app antigo sem o comando: o teto de meio segundo resolve
            });
        }
      });
      if (cancelado) desligar();
      else parar = desligar;
    } catch {
      // sem o evento, a saída volta a custar a carência — degradado, não quebrado
    }
  })();
  return () => {
    cancelado = true;
    parar?.();
  };
}

// ── Atenuação de comunicação do Windows ────────────────────────────────────

// ── Chamada em segundo plano (Android) ─────────────────────────────────────

/**
 * `true` só dentro do app **Android**.
 *
 * A detecção é a mesma de `hooks/useEhMobile.ts` — `navigator.userAgent`, e não
 * o `platform()` do `@tauri-apps/plugin-os`. O motivo está escrito lá e vale
 * igual aqui: aquele plugin custaria um crate no `Cargo.toml` (que entraria
 * também no `.exe` do Windows), um pacote npm, uma permissão em cada
 * `capabilities/*.json` e uma inicialização no `lib.rs`, tudo para responder o
 * que o webview já responde de graça.
 *
 * Por que Android e não "celular": o serviço de primeiro plano é uma API do
 * Android. No iOS o papel equivalente é do `UIBackgroundModes: audio` do
 * `Info.ios.plist`, que não se liga nem se desliga em tempo de execução.
 */
export function ehAndroidNoTauri(): boolean {
  return isTauri() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/**
 * Liga o serviço de primeiro plano que segura a chamada com o app minimizado, e
 * escreve a notificação persistente. Chamar de novo com outro texto reescreve a
 * notificação sem derrubar o serviço.
 *
 * Best-effort: se a ponte falhar, a call continua — o que se perde é a
 * sobrevivência em segundo plano, não a chamada.
 */
export async function iniciarServicoDeChamada(titulo: string, texto: string): Promise<void> {
  if (!ehAndroidNoTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:chamada|iniciar_servico_de_chamada", { titulo, texto });
  } catch {
    // sem serviço, minimizar volta a derrubar o áudio: degradado, não quebrado
  }
}

/**
 * Enquanto houver call, o Windows **não** abaixa o volume dos outros apps.
 *
 * O microfone do WebView2 abre como stream de comunicações
 * (`AudioCategory_Communications`, decisão do Chromium e sem flag para
 * desligar), e o padrão do Windows é "reduzir o volume de outros sons em 80%"
 * quando isso acontece — o Discord e a música ficavam baixos ao entrar numa
 * call. O Rust troca a preferência para "não fazer nada" e a devolve em
 * `restaurarAtenuacaoDoWindows` (ver `src-tauri/src/atenuacao.rs`).
 *
 * Tem de vir **antes** do `getUserMedia`. Fora do Tauri é no-op; nos outros
 * sistemas o comando existe e não faz nada. Best-effort: falhar só mantém o
 * comportamento antigo.
 *
 * **Só volume.** A preferência escolhe *quanto* o Windows abaixa os outros
 * sons ("silenciar / 80% / 50% / não fazer nada"). Ela não tira o stream da
 * categoria de comunicações, e é a categoria — não a atenuação — que troca o
 * fone Bluetooth para mãos-livres e liga o perfil de comunicação de alguns
 * drivers. Se o relato for "abafado", e não "baixo", a resposta não está aqui
 * (ver `src-tauri/src/atenuacao.rs` e o aviso em `settings/VozTab.tsx`).
 */
/**
 * Quantos pedidos de suspensão estão de pé agora.
 *
 * O lado Rust guarda **um** valor (`atenuacao.rs`): `suspender` é idempotente e
 * `restaurar` desfaz de uma vez. Sem contar aqui, o primeiro a fechar a captura
 * devolveria o ducking a quem ainda está com a dele aberta — e isso acontece de
 * verdade: a sonda de dispositivos e o teste de microfone rodam **dentro** da
 * chamada, quando alguém abre as configurações de voz no meio dela.
 *
 * A contagem mora aqui, e não em quem chama, para que **todos** os caminhos
 * participem dela só por usar o par — inclusive o da chamada, em `stores/voice`.
 */
let pedidosDeSuspensao = 0;

export async function suspenderAtenuacaoDoWindows(): Promise<void> {
  if (!isTauri()) return;
  // só o primeiro pedido vai ao Rust; os outros só entram na contagem
  if (++pedidosDeSuspensao > 1) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("suspender_atenuacao_do_windows");
  } catch {
    // app antigo sem o comando, ou registro recusado: segue como antes
  }
}

/** Fim da call: a preferência de comunicações do Windows volta ao que era. */
export async function restaurarAtenuacaoDoWindows(): Promise<void> {
  if (!isTauri()) return;
  // `max(0, …)`: há caminhos de saída que restauram sem ter suspendido (uma
  // entrada na sala que falha antes de publicar o microfone, por exemplo), e
  // deixar a conta ficar negativa travaria a próxima suspensão de verdade
  pedidosDeSuspensao = Math.max(0, pedidosDeSuspensao - 1);
  if (pedidosDeSuspensao > 0) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restaurar_atenuacao_do_windows");
  } catch {
    // idem
  }
}

/** Desliga o serviço e tira a notificação. Parar o que já parou não é erro. */
export async function pararServicoDeChamada(): Promise<void> {
  if (!ehAndroidNoTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:chamada|parar_servico_de_chamada");
  } catch {
    // idem: o estado da store é quem manda
  }
}

/**
 * Ouve o botão **"Sair da chamada"** da notificação.
 *
 * O caminho é um `Channel` do Tauri e não um `listen()` de evento global (como
 * o `tela:encerrada` logo acima) por uma razão de arquitetura do lado nativo: o
 * `Channel` que sai daqui é serializado como `"__CHANNEL__:<id>"`, atravessa o
 * Rust uma única vez, na hora do registro, e o Kotlin passa a escrever **direto
 * no IPC do webview**. Um evento global exigiria o caminho de volta
 * Kotlin → Rust, que o Tauri 2 não oferece pronto.
 *
 * Devolve a função que para de ouvir.
 */
export function ouvirSaidaPelaNotificacao(ouvinte: () => void): () => void {
  if (!ehAndroidNoTauri()) return () => {};
  let cancelado = false;
  void (async () => {
    try {
      const { Channel, invoke } = await import("@tauri-apps/api/core");
      const canal = new Channel<unknown>();
      canal.onmessage = () => {
        if (!cancelado) ouvinte();
      };
      await invoke("plugin:chamada|registrar_ouvinte_de_saida", { canal });
    } catch {
      // sem o canal, o botão da notificação some da conta — o usuário ainda
      // sai pelo app, que é o caminho normal
    }
  })();
  return () => {
    cancelado = true;
  };
}

// ── Atualização do app Android ─────────────────────────────────────────────

/** O andamento do download, como o Kotlin o manda. `total` é `-1` quando o
 *  servidor não declara `Content-Length`. */
export interface ProgressoDeDownload {
  baixados: number;
  total: number;
}

/**
 * Baixa o `.apk` da versão nova e devolve onde ele ficou no disco.
 *
 * **Lança** quando o download cai ou quando o sha256 não bate — e, nesse
 * segundo caso, o arquivo já foi apagado do outro lado. Este é o único ponto
 * desta ponte que não é best-effort: falhar em silêncio aqui significaria "não
 * atualizou e ninguém soube", e o chamador precisa poder cair no card manual.
 *
 * O arquivo **não** atravessa o IPC: o que volta é um caminho. Quem tem os
 * bytes é o Kotlin, e é lá que o digest é conferido, no mesmo laço da escrita
 * (ver `AtualizadorPlugin.kt`).
 */
export async function baixarAtualizacaoAndroid(
  url: string,
  sha256: string,
  aoProgredir?: (progresso: ProgressoDeDownload) => void,
): Promise<string> {
  if (!ehAndroidNoTauri()) throw new Error("só no app Android");
  const { Channel, invoke } = await import("@tauri-apps/api/core");
  const progresso = new Channel<ProgressoDeDownload>();
  progresso.onmessage = (mensagem) => aoProgredir?.(mensagem);
  const { caminho } = await invoke<{ caminho: string }>(
    "plugin:atualizador|baixar_atualizacao",
    { url, sha256, progresso },
  );
  return caminho;
}

/**
 * Abre o instalador do sistema para o pacote já baixado.
 *
 * Devolve `true` quando faltava a permissão de "origens desconhecidas": nesse
 * caso a tela de Ajustes **já foi aberta** pelo lado nativo e o instalador
 * não, e quem chamou tem de explicar o passo em vez de dizer que instalou.
 *
 * Quando devolve `false`, o instalador do sistema está na frente — com a tela
 * de confirmação que o Android sempre mostra fora da loja. Não existe caminho
 * em que este app instale sem esse toque.
 */
export async function instalarAtualizacaoAndroid(caminho: string): Promise<boolean> {
  if (!ehAndroidNoTauri()) throw new Error("só no app Android");
  const { invoke } = await import("@tauri-apps/api/core");
  const { permissaoNecessaria } = await invoke<{ permissaoNecessaria: boolean }>(
    "plugin:atualizador|instalar_atualizacao",
    { caminho },
  );
  return permissaoNecessaria;
}

/**
 * A versão do `.apk` instalado — não a do bundle da web, que é sempre a que
 * veio dentro dele. `null` fora do app (ou se a ponte falhar), e aí não há
 * atualização a checar.
 */
export async function versaoInstalada(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return null;
  }
}

// ── Imagem: abrir fora, copiar bitmap, salvar em disco ─────────────────────

/**
 * Abre um endereço no navegador **padrão do sistema** (plugin `opener`).
 *
 * Existe porque o WebView2 não tem abas: `window.open` e `target="_blank"`
 * morrem em silêncio dentro do app, e era esse o defeito do "Abrir no
 * navegador" do visualizador de imagem — o clique não fazia nada. No site esta
 * função não é usada (lá é `window.open` com `noopener`); a escolha entre os
 * dois caminhos é `comoAbrir` em `lib/imagem-acoes.ts`.
 *
 * Devolve `false` quando não deu, para quem chamou avisar em vez de fingir que
 * abriu. A permissão é `opener:allow-open-url`, restrita a `http`/`https` em
 * `capabilities/default.json`.
 */
export async function abrirNoSistema(url: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Põe um PNG na área de transferência pelo plugin nativo
 * (`clipboard-manager`), como segunda chance quando o
 * `navigator.clipboard.write` do WebView2 recusa — ele exige documento em
 * foco e pode negar sem dizer por quê.
 *
 * Recebe os bytes do PNG; o plugin decodifica (o `tauri` está com a feature
 * `image-png`) e escreve o bitmap. `false` quando não deu.
 */
export async function copiarImagemNativa(png: Uint8Array): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeImage(png);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Salvar como" de verdade: o diálogo do Windows (plugin `dialog`) escolhe o
 * caminho e o plugin `fs` escreve. Devolve o caminho salvo, ou `null` quando o
 * usuário cancelou — cancelar não é erro.
 *
 * O escopo do `fs` em `capabilities/default.json` cobre as pastas onde se
 * salva imagem (Downloads, Imagens, Área de Trabalho, Documentos). Salvar fora
 * dali é recusado pela permissão, e quem chamou mostra o erro — por isso o
 * diálogo **precisa** abrir dentro do escopo, o que é o papel de
 * `caminhoSugerido`.
 */
export async function salvarArquivoNativo(
  nomeSugerido: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const caminho = await save({
    defaultPath: await caminhoSugerido(nomeSugerido),
    filters: [{ name: "Imagem", extensions: [extensaoDoNome(nomeSugerido)] }],
  });
  if (!caminho) return null;
  await writeFile(caminho, bytes);
  return caminho;
}

/**
 * O caminho com que o "Salvar como" abre: **Downloads** mais o nome sugerido.
 *
 * Passar só o nome não basta. Um `defaultPath` sem pasta faz o diálogo abrir no
 * diretório de trabalho do processo — no Windows instalado, `C:\Program
 * Files\Streamz` —, que está **fora** do escopo do `fs` (`$DOWNLOAD`,
 * `$PICTURE`, `$DESKTOP`, `$DOCUMENT` em `capabilities/default.json`). Quem
 * apenas confirmasse o diálogo escolheria um caminho que a ACL recusa na hora
 * de escrever: os bytes na mão, o diálogo aberto, e ainda assim "não foi
 * possível salvar". Abrindo em Downloads o caminho padrão já é permitido, e é
 * também onde o Discord põe a imagem.
 *
 * `downloadDir` vem do `core:path:default` (dentro de `core:default`), então
 * não precisa de permissão nova. Se falhar, o nome cru ainda serve.
 */
async function caminhoSugerido(nome: string): Promise<string> {
  try {
    const { downloadDir, join } = await import("@tauri-apps/api/path");
    return await join(await downloadDir(), nome);
  } catch {
    return nome;
  }
}

/**
 * A extensão do nome sugerido, em minúsculas, para o filtro do diálogo.
 *
 * `split(".").pop()` devolvia o **nome inteiro** quando não havia ponto, e aí o
 * filtro do Windows virava `*.foto` — o arquivo saía com a extensão errada.
 */
function extensaoDoNome(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  const extensao = ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,5}$/.test(extensao) ? extensao : "png";
}
