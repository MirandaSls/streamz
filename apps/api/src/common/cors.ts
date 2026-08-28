/**
 * Política de CORS única para o HTTP (main.ts) e para o WebSocket (chat.gateway).
 *
 * O gateway caía em `origin: "*"` com `credentials: true` — combinação que os
 * browsers recusam e que, pior, sinalizava intenção de aceitar qualquer origem
 * num socket autenticado. Agora os dois lados leem a mesma `CORS_ORIGIN`.
 *
 * A origem é resolvida por função, e não por lista pronta, porque o decorator
 * `@WebSocketGateway` é avaliado no carregamento do módulo — antes de o
 * ConfigModule ler o `.env`. Uma lista montada ali congelaria valores vazios.
 */
type OriginCallback = (err: Error | null, allow?: boolean) => void;

const DEFAULT_ORIGIN = "http://localhost:3000";

/**
 * Origens do app de desktop, sempre permitidas.
 *
 * Não são configuração: são constantes do Tauri 2. O WebView2 (Windows) serve o
 * app de `http://tauri.localhost` e o WebKit (macOS/Linux) de
 * `tauri://localhost` — e, ao contrário do que este arquivo dizia, o webview
 * **manda** o header `Origin`. Deixá-las fora do padrão significa que todo
 * instalador novo esbarra em CORS no login, com o erro do lado do servidor e
 * uma tela de "não foi possível entrar" do lado de quem instalou.
 *
 * Não afrouxa nada para o browser: nenhuma página web consegue forjar estas
 * origens.
 */
const ORIGENS_DO_DESKTOP = ["http://tauri.localhost", "tauri://localhost"];

/** Origens permitidas: as do `CORS_ORIGIN` mais as do app de desktop. */
export function allowedOrigins(): string[] {
  const configuradas = (process.env.CORS_ORIGIN ?? DEFAULT_ORIGIN)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...configuradas, ...ORIGENS_DO_DESKTOP])];
}

/**
 * Requisição sem `Origin` (curl, health check) passa: CORS existe para conter o
 * browser, e ali o header é sempre enviado.
 */
export function checkOrigin(origin: string | undefined, cb: OriginCallback) {
  if (!origin || allowedOrigins().includes(origin)) return cb(null, true);
  cb(new Error(`Origem não permitida: ${origin}`));
}

export const CORS_OPTIONS = { origin: checkOrigin, credentials: true };
