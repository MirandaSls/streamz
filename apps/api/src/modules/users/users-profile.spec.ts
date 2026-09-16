import { describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StorageService } from "../storage/storage.service";
import type { FriendsService } from "../friends/friends.service";

/**
 * Testes do perfil de usuário com guildId.
 * `GET /users/:id/profile?guildId=` preenche `nicknameNoServidor` com o
 * apelido do usuário-alvo naquele servidor (null se não for membro ou sem apelido).
 */

const EU = "ana";
const ALVO = "bia";
const GUILD_ID = "guild-123";

function montar(opts: { alvoExiste?: boolean; nickname?: string | null } = {}) {
  const { alvoExiste = true, nickname = null } = opts;
  const alvoData = alvoExiste
    ? {
        id: ALVO,
        status: "OFFLINE" as const,
        lastSeenAt: null,
        displayName: "Bia",
        username: "bia",
        aboutMe: null,
        pronouns: null,
        bannerColor: null,
        bannerKey: null,
        createdAt: new Date("2024-01-01"),
        customStatusText: null,
        customStatusEmoji: null,
        customStatusExpiresAt: null,
        manualStatus: null,
      }
    : null;

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(alvoData),
      findMany: vi.fn().mockResolvedValue([]),
    },
    guild: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    guildMember: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.userId_guildId.guildId === GUILD_ID) {
          return Promise.resolve(nickname !== undefined ? { nickname, role: "MEMBER" as const } : null);
        }
        return Promise.resolve(null);
      }),
    },
    userNote: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    friendNickname: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    userIgnore: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;

  const friends = {
    relationship: vi.fn().mockResolvedValue("none"),
    friendIds: vi.fn().mockResolvedValue([]),
  } as unknown as FriendsService;

  const realtime = {} as RealtimeService;
  const storage = {} as StorageService;

  const service = new UsersService(prisma, realtime, storage, friends);
  return { service, prisma, friends };
}

describe("GET /users/:id/profile com guildId", () => {
  it("com guildId, preenche nicknameNoServidor com o apelido", async () => {
    const { service } = montar({ nickname: "Bia da Turma" });
    const profile = await service.profile(EU, ALVO, GUILD_ID);
    expect(profile.nicknameNoServidor).toBe("Bia da Turma");
  });

  it("sem guildId, não preenche nicknameNoServidor", async () => {
    const { service } = montar({ nickname: "Bia da Turma" });
    const profile = await service.profile(EU, ALVO);
    expect(profile.nicknameNoServidor).toBeNull();
  });

  it("com guildId mas sem apelido, nicknameNoServidor é null", async () => {
    const { service } = montar({ nickname: null });
    const profile = await service.profile(EU, ALVO, GUILD_ID);
    expect(profile.nicknameNoServidor).toBeNull();
  });

  it("com guildId e membro sem apelido, nicknameNoServidor é null", async () => {
    const { service } = montar();
    const profile = await service.profile(EU, ALVO, GUILD_ID);
    expect(profile.nicknameNoServidor).toBeNull();
  });
});
