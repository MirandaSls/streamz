/**
 * Cofre de contas do aparelho — a parte pura de "Mudar de conta".
 *
 * O Discord guarda várias contas logadas no mesmo dispositivo e troca entre
 * elas com um clique, sem pedir senha. O que torna isso possível aqui é o
 * desenho da sessão: o par de tokens **não** é um cookie httpOnly, é um par de
 * strings que o cliente manda no `Authorization` (access) e no corpo do
 * `/auth/refresh` (refresh). Como o cliente é dono dos tokens, ele pode ser
 * dono de *vários* — um por conta — e a API não precisa saber de nada: cada
 * login abre uma linha nova em `RefreshToken`, e uma não derruba a outra.
 *
 * Este arquivo é o cofre e mais nada: um `localStorage` versionado com as
 * contas conhecidas e qual está ativa. Não fala com a rede, não conhece store
 * nem componente, e todas as transições são funções puras `Cofre -> Cofre` —
 * é por isso que a troca inteira pode ser testada sem navegador.
 *
 * **Sobre guardar refresh tokens aqui**: o refresh da sessão ativa já morava em
 * `localStorage` (`session.ts`), no mesmo domínio e com a mesma exposição. O
 * cofre não abre uma classe nova de risco — só multiplica por N o que já havia
 * por 1. O que ele exige em troca é disciplina de rotação: a API **rotaciona**
 * o refresh a cada uso, então o token guardado aqui precisa ser atualizado
 * junto (ver `session.ts`), senão a conta volta como "Sessão expirada" na
 * próxima troca.
 */
import type { PublicUser } from "@streamz/shared";

/** Chave versionada: mudar o formato é subir o número e ignorar o anterior. */
export const CHAVE_COFRE = "streamz.contas.v1";

/**
 * Teto de contas simultâneas, como no Discord. Existe por dois motivos, e
 * nenhum é técnico: o modal vira uma lista rolável sem cara de "trocar rápido",
 * e cada conta parada aqui é um refresh token vivo a mais no aparelho.
 */
export const LIMITE_DE_CONTAS = 5;

export interface ContaGuardada {
  /** Retrato do perfil no último login/troca — o que o modal desenha. */
  user: PublicUser;
  /**
   * `null` = o refresh caducou ou foi revogado (outra sessão saiu por nós, a
   * senha mudou, passaram 7 dias). A conta continua na lista, marcada como
   * "Sessão expirada", e trocar para ela pede a senha.
   */
  refreshToken: string | null;
}

export interface Cofre {
  versao: 1;
  /** `id` da conta ativa, ou `null` quando não há nenhuma. */
  ativa: string | null;
  contas: ContaGuardada[];
}

export function cofreVazio(): Cofre {
  return { versao: 1, ativa: null, contas: [] };
}

/**
 * Lê o cofre de uma string crua, tolerando qualquer lixo.
 *
 * Tolerar é a decisão importante: este JSON sobrevive a versões do app, a
 * extensões que mexem no storage e a um `localStorage` cheio pela metade. Um
 * `throw` aqui deixaria a pessoa presa numa tela em branco por causa de uma
 * chave corrompida — melhor voltar ao cofre vazio e reconstruir no próximo
 * login. Entradas individuais quebradas são descartadas uma a uma.
 */
export function lerCofre(raw: string | null): Cofre {
  if (!raw) return cofreVazio();
  let bruto: unknown;
  try {
    bruto = JSON.parse(raw);
  } catch {
    return cofreVazio();
  }
  if (!bruto || typeof bruto !== "object") return cofreVazio();
  const obj = bruto as Partial<Cofre>;
  if (obj.versao !== 1 || !Array.isArray(obj.contas)) return cofreVazio();

  const contas: ContaGuardada[] = [];
  const vistos = new Set<string>();
  for (const item of obj.contas) {
    const conta = normalizarConta(item);
    // duplicata (dois logins da mesma conta antes desta versão): fica a primeira
    if (!conta || vistos.has(conta.user.id)) continue;
    vistos.add(conta.user.id);
    contas.push(conta);
  }
  const ativa = typeof obj.ativa === "string" && vistos.has(obj.ativa) ? obj.ativa : null;
  return { versao: 1, ativa, contas };
}

function normalizarConta(item: unknown): ContaGuardada | null {
  if (!item || typeof item !== "object") return null;
  const { user, refreshToken } = item as Partial<ContaGuardada>;
  if (!user || typeof user !== "object") return null;
  const u = user as Partial<PublicUser>;
  if (typeof u.id !== "string" || typeof u.username !== "string") return null;
  return {
    user: user as PublicUser,
    refreshToken: typeof refreshToken === "string" && refreshToken ? refreshToken : null,
  };
}

export function contaAtiva(cofre: Cofre): ContaGuardada | null {
  return cofre.contas.find((c) => c.user.id === cofre.ativa) ?? null;
}

export function contaDe(cofre: Cofre, userId: string): ContaGuardada | null {
  return cofre.contas.find((c) => c.user.id === userId) ?? null;
}

/** Cabe outra conta? Uma que já está no cofre sempre cabe (é atualização). */
export function cabeMaisUma(cofre: Cofre, userId?: string): boolean {
  if (userId && cofre.contas.some((c) => c.user.id === userId)) return true;
  return cofre.contas.length < LIMITE_DE_CONTAS;
}

/**
 * Registra (ou atualiza) uma conta e a torna a ativa — é o que todo login faz,
 * inclusive o login normal da tela de entrada.
 *
 * A ordem da lista é a de chegada e não muda no uso: no Discord as contas não
 * dançam a cada troca, e um alvo que se move é um alvo que se erra.
 */
export function guardarConta(cofre: Cofre, user: PublicUser, refreshToken: string): Cofre {
  const existente = cofre.contas.some((c) => c.user.id === user.id);
  if (!existente && !cabeMaisUma(cofre)) return { ...cofre, ativa: cofre.ativa };
  const contas = existente
    ? cofre.contas.map((c) => (c.user.id === user.id ? { user, refreshToken } : c))
    : [...cofre.contas, { user, refreshToken }];
  return { versao: 1, ativa: user.id, contas };
}

/** Atualiza só o retrato (trocou avatar, nome de exibição, status). */
export function atualizarPerfil(cofre: Cofre, user: PublicUser): Cofre {
  if (!cofre.contas.some((c) => c.user.id === user.id)) return cofre;
  return {
    ...cofre,
    contas: cofre.contas.map((c) => (c.user.id === user.id ? { ...c, user } : c)),
  };
}

/**
 * Guarda o refresh token rotacionado da conta indicada.
 *
 * Chamado a cada renovação da sessão ativa. Sem isto o cofre envelheceria: a
 * API troca o hash da linha a cada `/auth/refresh`, e o token que ficou aqui
 * deixaria de existir do lado de lá.
 */
export function atualizarRefresh(cofre: Cofre, userId: string, refreshToken: string): Cofre {
  if (!cofre.contas.some((c) => c.user.id === userId)) return cofre;
  return {
    ...cofre,
    contas: cofre.contas.map((c) => (c.user.id === userId ? { ...c, refreshToken } : c)),
  };
}

/** A conta continua na lista, mas sem token: aparece como "Sessão expirada". */
export function marcarExpirada(cofre: Cofre, userId: string): Cofre {
  if (!cofre.contas.some((c) => c.user.id === userId)) return cofre;
  return {
    ...cofre,
    contas: cofre.contas.map((c) => (c.user.id === userId ? { ...c, refreshToken: null } : c)),
  };
}

/**
 * Tira a conta do aparelho. Se era a ativa, a ativa passa a ser a primeira das
 * restantes — quem sai de uma conta com outra guardada cai nela, não no login.
 */
export function removerConta(cofre: Cofre, userId: string): Cofre {
  const contas = cofre.contas.filter((c) => c.user.id !== userId);
  if (contas.length === cofre.contas.length) return cofre;
  const ativa = cofre.ativa === userId ? (contas[0]?.user.id ?? null) : cofre.ativa;
  return { versao: 1, ativa, contas };
}

/** Marca qual conta está em uso. Ignora id que não está no cofre. */
export function ativarConta(cofre: Cofre, userId: string): Cofre {
  if (!cofre.contas.some((c) => c.user.id === userId)) return cofre;
  return { ...cofre, ativa: userId };
}

// ── o que encosta no `localStorage` ────────────────────────────

export function lerCofreDoDisco(): Cofre {
  if (typeof window === "undefined") return cofreVazio();
  try {
    return lerCofre(localStorage.getItem(CHAVE_COFRE));
  } catch {
    // storage bloqueado (aba privada com cookies de terceiro desligados)
    return cofreVazio();
  }
}

export function escreverCofre(cofre: Cofre): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHAVE_COFRE, JSON.stringify(cofre));
  } catch {
    // sem espaço ou storage bloqueado: a sessão ativa segue funcionando pelos
    // tokens de `session.ts`; só a multiconta é que não persiste
  }
}

/** Lê, aplica uma transição pura e grava. O jeito normal de mexer no cofre. */
export function mudarCofre(fn: (cofre: Cofre) => Cofre): Cofre {
  const novo = fn(lerCofreDoDisco());
  escreverCofre(novo);
  return novo;
}
