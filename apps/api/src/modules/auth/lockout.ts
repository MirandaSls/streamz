import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILED_ATTEMPTS } from "@newdisc/shared";

/**
 * Bloqueio de conta por falhas de senha seguidas.
 *
 * O teto por IP do throttler não resolve este caso: um atacante distribuído
 * tenta a mesma conta de muitos IPs e cada um fica abaixo do limite. O contador
 * aqui é **por conta** — 5 falhas trancam por 15 minutos.
 *
 * É lógica pura de propósito (recebe o estado, devolve o próximo) para caber em
 * teste sem banco nem relógio real. Quem grava é o `AuthService`.
 *
 * Duas decisões que valem registro:
 *
 * - **O bloqueio não é dito ao cliente.** A resposta continua "Credenciais
 *   inválidas": avisar "esta conta está trancada" confirmaria que a conta
 *   existe, que é justamente o que o login genérico esconde.
 * - **Acerto zera o contador**, inclusive quando o bloqueio ainda estava de pé
 *   e acabou de vencer — senão a conta ficaria a uma falha de trancar para
 *   sempre.
 */

/** O que o banco guarda sobre as tentativas de uma conta. */
export interface EstadoDeBloqueio {
  failedLogins: number;
  lockedUntil: Date | null;
}

/** O que gravar depois de uma tentativa. */
export interface ProximoBloqueio {
  failedLogins: number;
  lockedUntil: Date | null;
}

/** true enquanto a conta está trancada no instante informado. */
export function estaBloqueada(estado: EstadoDeBloqueio, agora: Date): boolean {
  return !!estado.lockedUntil && estado.lockedUntil.getTime() > agora.getTime();
}

/** Quanto falta do bloqueio, em minutos arredondados para cima (0 = liberada). */
export function minutosRestantes(estado: EstadoDeBloqueio, agora: Date): number {
  if (!estaBloqueada(estado, agora)) return 0;
  const ms = (estado.lockedUntil as Date).getTime() - agora.getTime();
  return Math.ceil(ms / 60_000);
}

/**
 * Estado após uma senha errada. Ao atingir o teto, tranca e zera o contador —
 * assim a próxima rodada precisa das 5 falhas de novo em vez de trancar a cada
 * tentativa isolada depois do vencimento.
 */
export function aposFalha(
  estado: EstadoDeBloqueio,
  agora: Date,
  maxTentativas = LOGIN_MAX_FAILED_ATTEMPTS,
  minutos = LOGIN_LOCK_MINUTES,
): ProximoBloqueio {
  // já trancada: a tentativa nem chega a ser contada
  if (estaBloqueada(estado, agora)) {
    return { failedLogins: estado.failedLogins, lockedUntil: estado.lockedUntil };
  }
  const falhas = estado.failedLogins + 1;
  if (falhas >= maxTentativas) {
    return { failedLogins: 0, lockedUntil: new Date(agora.getTime() + minutos * 60_000) };
  }
  return { failedLogins: falhas, lockedUntil: null };
}

/** Estado após uma senha certa: contador e bloqueio zerados. */
export function aposAcerto(): ProximoBloqueio {
  return { failedLogins: 0, lockedUntil: null };
}

/**
 * true quando gravar não muda nada — evita um UPDATE por login bem-sucedido de
 * conta que nunca errou a senha (o caso comum).
 */
export function semMudanca(estado: EstadoDeBloqueio, proximo: ProximoBloqueio): boolean {
  const antes = estado.lockedUntil?.getTime() ?? null;
  const depois = proximo.lockedUntil?.getTime() ?? null;
  return estado.failedLogins === proximo.failedLogins && antes === depois;
}
