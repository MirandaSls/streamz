/**
 * Token bucket em memória para os comandos do WebSocket.
 *
 * É **single-process**: o estado vive no próprio socket, então cada instância
 * da API limita só o que passa por ela. Serve para conter flood de um cliente
 * (o caso real aqui); um teto global de verdade, com várias instâncias, exigiria
 * store compartilhado (Redis) — fica para quando houver mais de um nó.
 */
export interface BucketLimit {
  /** rajada máxima acumulável. */
  capacity: number;
  /** tokens repostos por segundo (a taxa sustentada). */
  refillPerSecond: number;
}

export interface BucketState {
  tokens: number;
  updatedAt: number;
}

/**
 * Consome um token do balde, repondo o que o tempo decorrido rendeu.
 * Devolve `false` quando não há token — aí o comando é recusado.
 */
export function takeToken(
  state: BucketState,
  limit: BucketLimit,
  now: number,
): boolean {
  const elapsed = Math.max(0, now - state.updatedAt) / 1000;
  state.tokens = Math.min(
    limit.capacity,
    state.tokens + elapsed * limit.refillPerSecond,
  );
  state.updatedAt = now;
  if (state.tokens < 1) return false;
  state.tokens -= 1;
  return true;
}

export function newBucket(limit: BucketLimit, now: number): BucketState {
  return { tokens: limit.capacity, updatedAt: now };
}
