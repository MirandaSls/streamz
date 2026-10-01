import {
  avaliarVersaoCliente,
  type ClientOutdatedPayload,
  type PoliticaVersaoCliente,
} from "@streamz/shared";

/**
 * Política vem do ambiente e é opcional: vazia (ou só espaços) = sem política,
 * e `avaliarVersaoCliente` já trata ausente/malformado como "ok". Por isso estas
 * variáveis não entram na validação obrigatória de `common/env.ts`.
 */
export function politicaDoAmbiente(env: NodeJS.ProcessEnv = process.env): PoliticaVersaoCliente {
  return {
    minima: env.MIN_CLIENT_VERSION?.trim() || undefined,
    aviso: env.WARN_CLIENT_VERSION?.trim() || undefined,
  };
}

/** Payload do `client.outdated`, ou `null` quando o cliente está em dia. */
export function avisoDeVersao(
  cliente: unknown,
  politica: PoliticaVersaoCliente,
): ClientOutdatedPayload | null {
  const r = avaliarVersaoCliente(typeof cliente === "string" ? cliente : null, politica);
  if (r.nivel === "ok" || !r.versaoAtual || !r.versaoMinima) return null;
  return { nivel: r.nivel, versaoAtual: r.versaoAtual, versaoMinima: r.versaoMinima };
}
