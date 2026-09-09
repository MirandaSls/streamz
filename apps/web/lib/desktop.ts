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
  /** Há backend nativo — hoje, só no Windows. */
  nativo: boolean;
  /** `wgc` (Windows 11, janela isolada) ou `dxgi` (Windows 10, recorte do monitor). */
  backend: "wgc" | "dxgi" | null;
  /** Compartilhar uma janela mostra o que estiver por cima dela (DXGI). */
  janelaRecortada: boolean;
}

const SEM_CAPTURA: CapacidadesDeTela = { nativo: false, backend: null, janelaRecortada: false };

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
 * salva imagem (Downloads, Imagens, Área de Trabalho, Documentos); é também
 * onde o diálogo abre. Salvar fora dali é recusado pela permissão, e quem
 * chamou mostra o erro.
 */
export async function salvarArquivoNativo(
  nomeSugerido: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const extensao = nomeSugerido.split(".").pop() ?? "png";
  const caminho = await save({
    defaultPath: nomeSugerido,
    filters: [{ name: "Imagem", extensions: [extensao] }],
  });
  if (!caminho) return null;
  await writeFile(caminho, bytes);
  return caminho;
}
