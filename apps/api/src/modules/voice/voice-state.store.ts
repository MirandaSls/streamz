import type Redis from "ioredis";
import type { VoiceFlags } from "@newdisc/shared";

/**
 * Quem está em cada sala de voz, e como (mudo, surdo, câmera, tela).
 *
 * É estado **efêmero**: existe enquanto o socket existe, então não vai ao
 * banco — sobreviver a um restart da API seria mentira (o cliente já caiu
 * junto). Em memória basta numa instância; com `REDIS_URL` o mapa é
 * compartilhado, senão duas instâncias mostrariam salas de voz diferentes.
 */
export interface VoiceMember extends VoiceFlags {
  userId: string;
}

export interface VoiceStateStore {
  /** Entra (ou atualiza) na sala. Devolve o estado gravado. */
  join(channelId: string, userId: string, flags: VoiceFlags): Promise<VoiceMember>;
  /** Atualiza as flags de quem já está. Devolve null se não estava na sala. */
  update(channelId: string, userId: string, flags: VoiceFlags): Promise<VoiceMember | null>;
  /** Sai da sala. Devolve true se realmente estava lá. */
  leave(channelId: string, userId: string): Promise<boolean>;
  /** Membros de uma sala. */
  members(channelId: string): Promise<VoiceMember[]>;
  /** Membros de várias salas de uma vez (canais de um servidor). */
  membersOf(channelIds: string[]): Promise<Map<string, VoiceMember[]>>;
}

function chave(channelId: string) {
  return `voice:${channelId}`;
}

/** Single-process: o mapa some junto com o processo, que é o tempo de vida certo. */
export class MemoryVoiceStateStore implements VoiceStateStore {
  private readonly salas = new Map<string, Map<string, VoiceMember>>();

  async join(channelId: string, userId: string, flags: VoiceFlags) {
    const sala = this.salas.get(channelId) ?? new Map<string, VoiceMember>();
    const membro: VoiceMember = { userId, ...flags };
    sala.set(userId, membro);
    this.salas.set(channelId, sala);
    return membro;
  }

  async update(channelId: string, userId: string, flags: VoiceFlags) {
    const sala = this.salas.get(channelId);
    if (!sala?.has(userId)) return null;
    const membro: VoiceMember = { userId, ...flags };
    sala.set(userId, membro);
    return membro;
  }

  async leave(channelId: string, userId: string) {
    const sala = this.salas.get(channelId);
    if (!sala?.delete(userId)) return false;
    if (sala.size === 0) this.salas.delete(channelId);
    return true;
  }

  async members(channelId: string) {
    return Array.from(this.salas.get(channelId)?.values() ?? []);
  }

  async membersOf(channelIds: string[]) {
    const out = new Map<string, VoiceMember[]>();
    for (const id of channelIds) {
      const membros = await this.members(id);
      if (membros.length > 0) out.set(id, membros);
    }
    return out;
  }
}

/** Compartilhada entre instâncias: um hash por canal, userId → flags em JSON. */
export class RedisVoiceStateStore implements VoiceStateStore {
  constructor(private readonly redis: Redis) {}

  async join(channelId: string, userId: string, flags: VoiceFlags) {
    const membro: VoiceMember = { userId, ...flags };
    await this.redis.hset(chave(channelId), userId, JSON.stringify(membro));
    return membro;
  }

  async update(channelId: string, userId: string, flags: VoiceFlags) {
    // só atualiza quem já estava: `hset` cru ressuscitaria quem saiu
    const existe = await this.redis.hexists(chave(channelId), userId);
    if (!existe) return null;
    return this.join(channelId, userId, flags);
  }

  async leave(channelId: string, userId: string) {
    return (await this.redis.hdel(chave(channelId), userId)) > 0;
  }

  async members(channelId: string) {
    const hash = await this.redis.hgetall(chave(channelId));
    return Object.values(hash)
      .map((raw) => parseMembro(raw))
      .filter((m): m is VoiceMember => m !== null);
  }

  async membersOf(channelIds: string[]) {
    const out = new Map<string, VoiceMember[]>();
    for (const id of channelIds) {
      const membros = await this.members(id);
      if (membros.length > 0) out.set(id, membros);
    }
    return out;
  }
}

/** JSON corrompido no Redis não derruba a sala inteira: aquele membro some. */
function parseMembro(raw: string): VoiceMember | null {
  try {
    const v = JSON.parse(raw) as VoiceMember;
    return typeof v?.userId === "string" ? v : null;
  } catch {
    return null;
  }
}
