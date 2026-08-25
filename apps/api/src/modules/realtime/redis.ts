import { Logger } from "@nestjs/common";
import Redis from "ioredis";

/**
 * Redis é opcional: só entra quando `REDIS_URL` está definida. Com ele, a API
 * pode rodar em mais de uma instância — o Socket.IO propaga broadcasts entre
 * elas (adapter), a presença conta conexões de todas e o rate limit por IP é
 * compartilhado. Sem ele, tudo fica em memória do processo (single-process).
 */
export function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

let shared: Redis | null = null;

/** Cliente principal (comandos). Um por processo. */
export function redisClient(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  if (!shared) {
    shared = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    shared.on("error", (e) => Logger.warn(`Redis: ${e.message}`, "Redis"));
  }
  return shared;
}

/** Cliente dedicado a subscribe (o adapter do Socket.IO exige um separado). */
export function redisSubscriber(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  const sub = new Redis(url, { maxRetriesPerRequest: 2 });
  sub.on("error", (e) => Logger.warn(`Redis (sub): ${e.message}`, "Redis"));
  return sub;
}
