import { Logger } from "@nestjs/common";

/**
 * Log de acesso só do que deu errado.
 *
 * Motivação: sem isso, quando alguém reclama de erro não sobra rastro de qual
 * rota respondeu 4xx/5xx para ele. Logar toda requisição inundaria o agregador,
 * então só entram as que falharam (status >= 400) ou foram lentas.
 *
 * Tudo vai dentro da própria mensagem (uma linha, sem `\n`): o
 * `StructuredLogger` trata argumento string com quebra de linha como stack e
 * as demais como contexto, então um segundo argumento aqui só confundiria.
 * O `reqId` já entra sozinho pelo `AsyncLocalStorage` do logger.
 */

const logger = new Logger("HTTP");

/** Acima disso a requisição é logada mesmo com sucesso. */
const LIMITE_LENTA_MS = 2000;

/** User-agent é entrada externa: corta para não inflar a linha. */
const MAX_UA = 160;

/** Ruído esperado: o cliente tenta renovar o token e recebe 401 o tempo todo. */
const REFRESH = "/api/auth/refresh";

function ignorado(caminho: string, status: number): boolean {
  if (caminho === "/api/metrics" || caminho.startsWith("/api/metrics/")) return true;
  if (caminho.startsWith("/api/health")) return true;
  // O /ready é a sonda de prontidão: 503 dele é ruído esperado durante o boot.
  if (caminho === "/api/ready") return true;
  return status === 401 && caminho === REFRESH;
}

/** Header pode chegar como lista; pega o primeiro valor e tira quebra de linha. */
function textoDoHeader(valor: unknown): string | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof bruto !== "string") return undefined;
  return bruto.replace(/[\r\n]+/g, " ").trim() || undefined;
}

/**
 * Middleware Express. Fica aqui (e não no `main.ts`) para o teste conseguir
 * exercitá-lo sem subir o Nest.
 */
export function logDeAcessoMiddleware(
  req: {
    method?: string;
    originalUrl?: string;
    url?: string;
    headers: Record<string, unknown>;
  },
  res: { statusCode: number; on(evento: string, fn: () => void): void },
  next: () => void,
) {
  const inicio = process.hrtime.bigint();
  res.on("finish", () => {
    const status = res.statusCode;
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    if (status < 400 && ms <= LIMITE_LENTA_MS) return;

    // `originalUrl` mantém o prefixo `/api` mesmo depois do roteamento do Nest.
    // Query string fora: pode carregar token (`?t=`) e não é o que identifica a rota.
    const caminho = (req.originalUrl ?? req.url ?? "").split("?")[0];
    if (ignorado(caminho, status)) return;

    const metodo = (req.method ?? "GET").toUpperCase();
    const cliente = textoDoHeader(req.headers["x-streamz-client"]) ?? "navegador";
    const ua = (textoDoHeader(req.headers["user-agent"]) ?? "").slice(0, MAX_UA);
    // Lido do `req` no finish (e não do contexto do logger): não depende de o
    // callback rodar dentro do mesmo AsyncLocalStorage.
    const usuario = (req as { user?: { sub?: string } }).user?.sub;

    const mensagem =
      `${metodo} ${caminho} → ${status} ${Math.round(ms)}ms` +
      ` cliente=${cliente} ua="${ua}"` +
      (usuario ? ` user=${usuario}` : "");

    if (status >= 500) logger.error(mensagem);
    else logger.warn(mensagem);
  });
  next();
}
