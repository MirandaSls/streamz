import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { LoggerService, LogLevel } from "@nestjs/common";

/**
 * Log estruturado da API, sem dependência nova.
 *
 * Motivação: `console.log` colorido do Nest é ótimo no terminal e inútil num
 * agregador (Loki, CloudWatch, Datadog) — não dá para filtrar por nível, por
 * contexto nem correlacionar as linhas de uma mesma requisição. Aqui o mesmo
 * `Logger` do Nest passa a emitir **uma linha JSON por evento** em produção e
 * continua legível em dev.
 *
 * Formato (`LOG_FORMAT=json`, padrão fora de dev):
 *   {"ts":"2026-08-25T12:00:00.000Z","level":"error","ctx":"ChatGateway",
 *    "msg":"Falha em comando WS (socket abc)","reqId":"…","stack":"…"}
 *
 * O `reqId` vem do `AsyncLocalStorage` alimentado por `requestIdMiddleware`:
 * qualquer log disparado durante a requisição herda o id sem que o chamador
 * precise passá-lo adiante. Fora de uma requisição (boot, cron, WebSocket) o
 * campo simplesmente não aparece.
 */

/** Contexto propagado por requisição (hoje só o id). */
interface ContextoRequisicao {
  reqId: string;
}

const armazenamento = new AsyncLocalStorage<ContextoRequisicao>();

/** Id da requisição em andamento, se houver. */
export function requestId(): string | undefined {
  return armazenamento.getStore()?.reqId;
}

/**
 * Middleware Express: garante um id por requisição, propaga no
 * `AsyncLocalStorage` e devolve no header `X-Request-Id`.
 *
 * Reaproveita o `X-Request-Id` de entrada quando o proxy/cliente já mandou um
 * — é o que permite seguir um mesmo pedido do Caddy até o log da API. Valor
 * externo é saneado (só ASCII imprimível, no máximo 200 chars) para não virar
 * injeção de header nem cardinalidade infinita no agregador.
 */
export function requestIdMiddleware(
  req: { headers: Record<string, unknown> },
  res: { setHeader(nome: string, valor: string): void },
  next: () => void,
) {
  const recebido = req.headers["x-request-id"];
  const id = sanearId(typeof recebido === "string" ? recebido : undefined) ?? randomUUID();
  res.setHeader("X-Request-Id", id);
  armazenamento.run({ reqId: id }, next);
}

function sanearId(valor: string | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.replace(/[^\x20-\x7E]/g, "").slice(0, 200).trim();
  return limpo || null;
}

// ── Níveis ─────────────────────────────────────────────────────────────────

const ORDEM: LogLevel[] = ["verbose", "debug", "log", "warn", "error"];

/** `LOG_LEVEL` aceita tanto o vocabulário do Nest quanto o comum (info/trace). */
function nivelMinimo(): number {
  const bruto = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  const equivalente: Record<string, LogLevel> = {
    trace: "verbose",
    verbose: "verbose",
    debug: "debug",
    info: "log",
    log: "log",
    warn: "warn",
    warning: "warn",
    error: "error",
    fatal: "error",
  };
  const nivel = equivalente[bruto];
  if (nivel) return ORDEM.indexOf(nivel);
  return ORDEM.indexOf(process.env.NODE_ENV === "production" ? "log" : "debug");
}

/** JSON em produção; texto legível em dev. `LOG_FORMAT` força qualquer um dos dois. */
function usarJson(): boolean {
  const formato = (process.env.LOG_FORMAT ?? "").trim().toLowerCase();
  if (formato === "json") return true;
  if (formato === "pretty" || formato === "text") return false;
  return process.env.NODE_ENV === "production";
}

/** Nome padronizado do nível na saída JSON (o "log" do Nest é "info" no resto do mundo). */
const NOME_JSON: Record<LogLevel, string> = {
  verbose: "trace",
  debug: "debug",
  log: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal",
};

// ── Logger ─────────────────────────────────────────────────────────────────

export class StructuredLogger implements LoggerService {
  private readonly minimo = nivelMinimo();
  private readonly json = usarJson();
  private readonly service = process.env.LOG_SERVICE ?? "newdisc-api";

  log(mensagem: unknown, ...rest: unknown[]) {
    this.emitir("log", mensagem, rest);
  }
  error(mensagem: unknown, ...rest: unknown[]) {
    this.emitir("error", mensagem, rest);
  }
  warn(mensagem: unknown, ...rest: unknown[]) {
    this.emitir("warn", mensagem, rest);
  }
  debug(mensagem: unknown, ...rest: unknown[]) {
    this.emitir("debug", mensagem, rest);
  }
  verbose(mensagem: unknown, ...rest: unknown[]) {
    this.emitir("verbose", mensagem, rest);
  }
  fatal(mensagem: unknown, ...rest: unknown[]) {
    this.emitir("error", mensagem, rest);
  }

  /**
   * O Nest chama `logger.error(msg, stack, context)` — o penúltimo argumento é
   * a pilha e o último o contexto. Como nem todo chamador manda os dois,
   * separamos pelo formato: string com quebra de linha vira `stack`.
   */
  private emitir(nivel: LogLevel, mensagem: unknown, rest: unknown[]) {
    if (ORDEM.indexOf(nivel) < this.minimo) return;

    let contexto: string | undefined;
    let stack: string | undefined;
    const extras: unknown[] = [];

    for (const item of rest) {
      if (typeof item !== "string") {
        extras.push(item);
        continue;
      }
      if (item.includes("\n")) stack = item;
      else contexto = item;
    }

    const { texto, stack: stackDaMensagem } = descreve(mensagem);
    const linha = {
      ts: new Date().toISOString(),
      level: NOME_JSON[nivel],
      service: this.service,
      ctx: contexto,
      msg: texto,
      reqId: requestId(),
      stack: stack ?? stackDaMensagem,
      extra: extras.length ? extras.map((e) => descreve(e).texto) : undefined,
    };

    const destino = nivel === "error" || nivel === "warn" ? process.stderr : process.stdout;
    destino.write(this.json ? `${JSON.stringify(limpar(linha))}\n` : formatarTexto(linha));
  }
}

/** Erro vira mensagem + pilha; objeto vira JSON; o resto vira string. */
function descreve(valor: unknown): { texto: string; stack?: string } {
  if (valor instanceof Error) return { texto: valor.message, stack: valor.stack };
  if (typeof valor === "string") return { texto: valor };
  try {
    return { texto: JSON.stringify(valor) ?? String(valor) };
  } catch {
    return { texto: String(valor) };
  }
}

/** Remove as chaves indefinidas para a linha JSON não ficar poluída. */
function limpar<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor !== undefined) saida[chave] = valor;
  }
  return saida as Partial<T>;
}

function formatarTexto(linha: {
  ts: string;
  level: string;
  ctx?: string;
  msg: string;
  reqId?: string;
  stack?: string;
  extra?: string[];
}): string {
  const hora = linha.ts.slice(11, 23);
  const partes = [
    hora,
    linha.level.toUpperCase().padEnd(5),
    linha.ctx ? `[${linha.ctx}]` : "",
    linha.reqId ? `(${linha.reqId.slice(0, 8)})` : "",
    linha.msg,
  ].filter(Boolean);
  const extra = linha.extra?.length ? ` ${linha.extra.join(" ")}` : "";
  return `${partes.join(" ")}${extra}\n${linha.stack ? `${linha.stack}\n` : ""}`;
}
