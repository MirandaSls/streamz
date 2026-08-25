/**
 * Sessão do cliente: guarda o par de tokens e mantém o access token válido.
 *
 * Mora fora de `lib/api.ts` e de `stores/auth.ts` porque os três consumidores
 * (cliente REST, socket e store) precisam do mesmo token *atual* — se cada um
 * lesse `localStorage` no seu momento, o socket ficaria autenticado com um token
 * já rotacionado. Nenhum módulo aqui importa a store, então não há ciclo.
 */
import type { AuthTokens } from "@newdisc/shared";
import { API_URL } from "./config";
import { ApiError } from "./api-error";

const CHAVE_ACCESS = "accessToken";
const CHAVE_REFRESH = "refreshToken";

/** Margem antes do `exp` em que já vale renovar (evita corrida com o servidor). */
const MARGEM_RENOVACAO_MS = 60_000;

/** Promessa compartilhada do refresh em voo — garante uma única requisição. */
let refreshEmVoo: Promise<AuthTokens> | null = null;

type Ouvinte = () => void;
const ouvintesExpiracao = new Set<Ouvinte>();

export function lerAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHAVE_ACCESS);
}

export function lerRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHAVE_REFRESH);
}

export function salvarTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAVE_ACCESS, tokens.accessToken);
  localStorage.setItem(CHAVE_REFRESH, tokens.refreshToken);
}

export function limparTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAVE_ACCESS);
  localStorage.removeItem(CHAVE_REFRESH);
}

/**
 * `exp` do JWT em milissegundos, ou `null` se o token não tiver um payload
 * legível. Decodifica sem verificar assinatura de propósito: o cliente só quer
 * saber *quando* renovar; quem valida o token é a API.
 */
export function expDoToken(token: string): number | null {
  const payloadB64 = token.split(".")[1];
  if (!payloadB64) return null;
  try {
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True quando o token já expirou ou expira dentro da margem de renovação. */
export function precisaRenovar(token: string, agora = Date.now()): boolean {
  const exp = expDoToken(token);
  // token sem `exp` legível: não dá para decidir pela validade — deixa a API dizer
  if (exp === null) return false;
  return exp - agora < MARGEM_RENOVACAO_MS;
}

/**
 * Renova o par de tokens. Chamadas concorrentes compartilham a mesma promessa
 * (single-flight): o refresh token é rotacionado a cada uso na API, então dois
 * refreshes em paralelo invalidariam a sessão do usuário.
 */
export function renovarTokens(): Promise<AuthTokens> {
  if (refreshEmVoo) return refreshEmVoo;
  refreshEmVoo = executarRefresh().finally(() => {
    refreshEmVoo = null;
  });
  return refreshEmVoo;
}

async function executarRefresh(): Promise<AuthTokens> {
  const refreshToken = lerRefreshToken();
  if (!refreshToken) {
    expirarSessao();
    throw new ApiError(401, "Sessão expirada. Entre novamente.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // falha de rede não invalida a sessão — o token pode voltar a servir
    throw new ApiError(0, "Sem conexão com o servidor.");
  }

  if (!res.ok) {
    // 401/403 = refresh token revogado ou expirado: a sessão acabou de fato
    if (res.status === 401 || res.status === 403) expirarSessao();
    throw new ApiError(res.status, "Sessão expirada. Entre novamente.");
  }

  const tokens = (await res.json()) as AuthTokens;
  salvarTokens(tokens);
  return tokens;
}

/**
 * Access token pronto para uso, renovado antes da hora quando falta menos que a
 * margem para o `exp`. Devolve `null` quando não há sessão.
 */
export async function getAccessToken(): Promise<string | null> {
  const token = lerAccessToken();
  if (!token) return null;
  if (!precisaRenovar(token)) return token;
  try {
    return (await renovarTokens()).accessToken;
  } catch {
    // renovação falhou: quem chamou segue sem token e recebe 401 da API/gateway
    return null;
  }
}

/**
 * Registra um ouvinte para o fim da sessão (refresh recusado). Devolve a função
 * que cancela o registro.
 */
export function aoExpirarSessao(ouvinte: Ouvinte): () => void {
  ouvintesExpiracao.add(ouvinte);
  return () => ouvintesExpiracao.delete(ouvinte);
}

/** Limpa os tokens, avisa os ouvintes e manda o usuário para o login. */
export function expirarSessao(): void {
  limparTokens();
  for (const ouvinte of ouvintesExpiracao) {
    try {
      ouvinte();
    } catch {
      // um ouvinte quebrado não pode impedir os outros nem o redirect
    }
  }
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}
