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
 * própria, e notificar o canal ativo só quando a janela não está visível
 * (`document.visibilityState !== "visible"`).
 *
 * Comportamento:
 *   - Dentro do Tauri: notificação nativa via `@tauri-apps/plugin-notification`;
 *     o clique foca a janela (`getCurrentWindow().setFocus()`) e roda `onClick`.
 *   - No navegador: Notification API; o clique foca a aba e roda `onClick`.
 *   - Sem suporte / permissão negada: **no-op**. Nunca lança — notificação é
 *     best-effort e não pode quebrar o fluxo de mensagens.
 *
 * A permissão é pedida **uma vez** por sessão (o resultado fica memoizado); se o
 * usuário negar, as chamadas seguintes saem em silêncio sem novo prompt.
 *
 * Os módulos do Tauri entram por `import()` dinâmico: fora do app desktop eles
 * nunca são carregados, e o bundle do browser não paga por eles.
 * (`withGlobalTauri` está desligado — não existe mais `window.__TAURI__`.)
 */

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
