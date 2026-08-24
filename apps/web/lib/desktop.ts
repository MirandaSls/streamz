/**
 * Ponte de notificações web ↔ desktop (Tauri 2).
 *
 * Helper ISOLADO: detecta se a web está rodando dentro do app Tauri e, em caso
 * afirmativo, usa a API de notificação nativa do Tauri; fora do Tauri (navegador
 * normal), cai para a Notification API do browser.
 *
 * COMO PLUGAR (sem editar este arquivo):
 *   No handler do evento de mensagem em tempo real — hoje em `apps/web/lib/socket.ts`
 *   / na tela do chat (`apps/web/app/app/page.tsx`) — ao receber `message.new`,
 *   chame:
 *
 *     import { notify } from "@/lib/desktop";
 *     socket.on("message.new", (msg) => {
 *       // ...renderiza a mensagem...
 *       // notifica só quando a janela não está focada e não é mensagem própria:
 *       if (document.visibilityState !== "visible") {
 *         notify(`#${msg.channelName ?? "canal"}`, `${msg.author}: ${msg.content}`);
 *       }
 *     });
 *
 * Pré-requisitos do lado desktop (já configurados em apps/desktop):
 *   - `withGlobalTauri: true` em tauri.conf.json → expõe `window.__TAURI__`.
 *   - plugin `tauri-plugin-notification` registrado no main.rs.
 *   - permissão `notification:default` em capabilities/default.json.
 *
 * Nenhuma dependência npm nova é necessária: usamos a ponte global
 * `window.__TAURI__` em vez de importar `@tauri-apps/plugin-notification`.
 */

/** Formato mínimo da ponte global do Tauri que consumimos aqui. */
type TauriNotificationBridge = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<"granted" | "denied" | "default">;
  sendNotification: (options: { title: string; body?: string } | string) => void;
};

type TauriGlobal = {
  notification?: TauriNotificationBridge;
};

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    // Presente em builds do Tauri 2 mesmo sem withGlobalTauri; útil p/ detecção.
    __TAURI_INTERNALS__?: unknown;
  }
}

/** True quando o código está executando dentro do app desktop (Tauri). */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (typeof window.__TAURI__ !== "undefined" ||
      typeof window.__TAURI_INTERNALS__ !== "undefined")
  );
}

/**
 * Dispara uma notificação nativa.
 * - Dentro do Tauri: usa o plugin de notificação (pede permissão se preciso).
 * - No browser: usa a Notification API (pede permissão se preciso).
 * Nunca lança: qualquer falha é silenciada (é um "nice to have").
 */
export async function notify(title: string, body?: string): Promise<void> {
  try {
    if (isTauri()) {
      await notifyViaTauri(title, body);
      return;
    }
    await notifyViaBrowser(title, body);
  } catch {
    // Notificação é best-effort — nunca deve quebrar o fluxo de mensagens.
  }
}

async function notifyViaTauri(title: string, body?: string): Promise<void> {
  const bridge = window.__TAURI__?.notification;
  if (!bridge) {
    // withGlobalTauri desligado ou plugin ausente → tenta o fallback do browser.
    await notifyViaBrowser(title, body);
    return;
  }
  let granted = await bridge.isPermissionGranted();
  if (!granted) {
    granted = (await bridge.requestPermission()) === "granted";
  }
  if (granted) {
    bridge.sendNotification({ title, body });
  }
}

async function notifyViaBrowser(title: string, body?: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission === "granted") {
    // eslint-disable-next-line no-new
    new Notification(title, body ? { body } : undefined);
  }
}
