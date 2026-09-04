/**
 * Sessão do cliente: guarda o par de tokens e mantém o access token válido.
 *
 * Mora fora de `lib/api.ts` e de `stores/auth.ts` porque os três consumidores
 * (cliente REST, socket e store) precisam do mesmo token *atual* — se cada um
 * lesse `localStorage` no seu momento, o socket ficaria autenticado com um token
 * já rotacionado. Nenhum módulo aqui importa a store, então não há ciclo.
 */
import type { AuthTokens } from "@streamz/shared";
import { API_URL } from "./config";
import { ApiError } from "./api-error";
import { cabecalhoDoCliente } from "./cliente";
import { atualizarRefresh, marcarExpirada, mudarCofre } from "./contas";

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
  // A API rotaciona o refresh a cada uso: o hash antigo deixa de existir na
  // hora. Sem espelhar a rotação no cofre, a conta que ficou de fundo guardaria
  // um token morto e voltaria como "Sessão expirada" na primeira troca — ainda
  // que ninguém tenha saído de nada. Ver `lib/contas.ts`.
  mudarCofre((cofre) =>
    cofre.ativa ? atualizarRefresh(cofre, cofre.ativa, tokens.refreshToken) : cofre,
  );
}

export function limparTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAVE_ACCESS);
  localStorage.removeItem(CHAVE_REFRESH);
}

/**
 * Payload do JWT sem verificar assinatura. É de propósito: o cliente só quer
 * saber *quando* renovar e *qual* sessão é a sua; quem valida o token é a API.
 */
function payloadDoToken(token: string): { exp?: unknown; sid?: unknown } | null {
  const payloadB64 = token.split(".")[1];
  if (!payloadB64) return null;
  try {
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { exp?: unknown; sid?: unknown };
  } catch {
    return null;
  }
}

/** `exp` do JWT em milissegundos, ou `null` sem payload legível. */
export function expDoToken(token: string): number | null {
  const exp = payloadDoToken(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/**
 * Id da linha de sessão (`sid`) deste access token, ou `null`.
 *
 * É o que deixa `sessions.revoked` saber se **esta** aba foi encerrada: o
 * evento chega a todas as conexões da conta com os ids revogados, e só quem se
 * reconhece cai para o login. A claim sobrevive à renovação do par de tokens
 * (a linha de sessão é a mesma), e falta nos tokens emitidos antes de ela
 * existir — nesse caso só o `all` derruba a aba.
 */
export function sidDoToken(token: string): string | null {
  const sid = payloadDoToken(token)?.sid;
  return typeof sid === "string" && sid ? sid : null;
}

/** `sid` da sessão desta aba, lido do access token guardado. */
export function sidDaSessaoAtual(): string | null {
  const token = lerAccessToken();
  return token ? sidDoToken(token) : null;
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
      // o refresh não passa por `lib/api.ts` (seria recursivo), então o
      // cabeçalho do cliente entra aqui à mão — é ele que reclassifica a
      // sessão de quem já estava logado quando esta versão subiu
      headers: { "Content-Type": "application/json", ...cabecalhoDoCliente() },
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
  // a conta não sai do cofre: quem teve a sessão recusada continua listado em
  // "Gerenciar contas", só que sem token — e voltar para ela pede a senha
  mudarCofre((cofre) => (cofre.ativa ? marcarExpirada(cofre, cofre.ativa) : cofre));
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
