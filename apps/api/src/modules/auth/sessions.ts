import type { SessaoView } from "@streamz/shared";

/**
 * Uma sessão é um refresh token vivo. Este arquivo converte a linha do banco no
 * que a tela "Dispositivos" mostra — e o resumo do `User-Agent` é a parte que
 * merece teste: é heurística de string, o tipo de código que quebra em silêncio.
 *
 * Nada aqui toca o banco nem o Prisma; recebe a linha e devolve o DTO.
 */

/** A linha de `RefreshToken` que a listagem precisa. */
export interface LinhaDeSessao {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
}

/** Teto do que guardamos do `User-Agent` (a string do cliente é livre). */
export const MAX_USER_AGENT = 200;

/** Teto do que guardamos do IP (IPv6 com escopo cabe folgado). */
export const MAX_IP = 64;

/**
 * `SessaoView` da linha. `sessaoAtual` vem da claim `sid` do access token — é o
 * que marca **qual** linha é a sessão de quem perguntou, sem expor token nenhum.
 * A claim é estável porque a rotação do refresh reaproveita a mesma linha.
 */
export function toSessaoView(linha: LinhaDeSessao, sessaoAtual: string | null): SessaoView {
  return {
    id: linha.id,
    current: sessaoAtual !== null && linha.id === sessaoAtual,
    // ausente, nunca null: ver o comentário de `SessaoView` no contrato
    ...(linha.userAgent ? { userAgent: linha.userAgent } : {}),
    ...(linha.ip ? { ip: linha.ip } : {}),
    createdAt: linha.createdAt.toISOString(),
    ...(linha.lastUsedAt ? { lastUsedAt: linha.lastUsedAt.toISOString() } : {}),
    expiresAt: linha.expiresAt.toISOString(),
  };
}

/** Corta a string na largura que a coluna aceita; vazio vira null. */
export function normalizarUserAgent(valor: unknown): string | null {
  return recortar(valor, MAX_USER_AGENT);
}

/**
 * IP de quem fez a requisição. `x-forwarded-for` só é lido quando há proxy à
 * frente — o primeiro item da lista é o cliente; o resto são os saltos.
 */
export function normalizarIp(valor: unknown): string | null {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  const primeiro = typeof bruto === "string" ? bruto.split(",")[0] : bruto;
  // "::ffff:127.0.0.1" é o IPv4 mapeado que o Node entrega em socket dual-stack
  const limpo =
    typeof primeiro === "string" ? primeiro.trim().replace(/^::ffff:/, "") : primeiro;
  return recortar(limpo, MAX_IP);
}

function recortar(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, max) : null;
}

/**
 * O resumo legível do `User-Agent` mora no **contrato**, e não aqui: a tela de
 * dispositivos é quem o mostra, e um segundo cliente (o desktop) mostraria o
 * mesmo. Reexportado para os testes ficarem junto do resto da sessão.
 */
export { ehDispositivoMovel, resumoDoDispositivo } from "@streamz/shared";
