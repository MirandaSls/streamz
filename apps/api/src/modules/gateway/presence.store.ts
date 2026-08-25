import type Redis from "ioredis";

/**
 * Contagem de conexões abertas por usuário (várias abas/dispositivos).
 * 1ª conexão → fica online; última fechada → offline.
 */
export interface PresenceStore {
  /** registra uma conexão; devolve o total após registrar. */
  connect(userId: string): Promise<number>;
  /** remove uma conexão; devolve o total após remover (>= 0). */
  disconnect(userId: string): Promise<number>;
  /** true se não há nenhuma conexão registrada (nenhuma instância viva). */
  isEmpty(): Promise<boolean>;
  /** esquece tudo (só no boot, quando não há outra instância). */
  reset(): Promise<void>;
}

/** Single-process: some junto com o processo. */
export class MemoryPresenceStore implements PresenceStore {
  private readonly online = new Map<string, number>();

  async connect(userId: string) {
    const next = (this.online.get(userId) ?? 0) + 1;
    this.online.set(userId, next);
    return next;
  }

  async disconnect(userId: string) {
    const next = (this.online.get(userId) ?? 1) - 1;
    if (next <= 0) this.online.delete(userId);
    else this.online.set(userId, next);
    return Math.max(0, next);
  }

  async isEmpty() {
    return this.online.size === 0;
  }

  async reset() {
    this.online.clear();
  }
}

const KEY = "presence:connections";

/** Compartilhada entre instâncias: um hash userId → nº de conexões. */
export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: Redis) {}

  async connect(userId: string) {
    return this.redis.hincrby(KEY, userId, 1);
  }

  async disconnect(userId: string) {
    const next = await this.redis.hincrby(KEY, userId, -1);
    if (next <= 0) await this.redis.hdel(KEY, userId);
    return Math.max(0, next);
  }

  async isEmpty() {
    return (await this.redis.hlen(KEY)) === 0;
  }

  async reset() {
    await this.redis.del(KEY);
  }
}
