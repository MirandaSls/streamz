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

/** Origens permitidas (`CORS_ORIGIN`, separadas por vírgula). */
export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? DEFAULT_ORIGIN)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Requisição sem `Origin` (curl, app desktop, health check) passa: CORS existe
 * para conter o browser, e ali o header é sempre enviado.
 */
export function checkOrigin(origin: string | undefined, cb: OriginCallback) {
  if (!origin || allowedOrigins().includes(origin)) return cb(null, true);
  cb(new Error(`Origem não permitida: ${origin}`));
}

export const CORS_OPTIONS = { origin: checkOrigin, credentials: true };
