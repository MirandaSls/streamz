import { describe, expect, it } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import type { MemberRole } from "@streamz/shared";
import { OnboardingService } from "./onboarding.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { AuditService } from "../audit/audit.service";

/**
 * `PATCH /guilds/:guildId/membership` — menus de contexto, itens 5 e 6 do
 * contrato (`docs/CONTRATO-MENUS.md`). O que se quer garantir aqui não
 * aparece no typecheck: apelido vazio apaga, valor igual ao atual não
 * reemite nada, `member.updated` vai só para a sala do servidor e
 * `guild.settingsUpdated` (sem `onboarding`) vai só para mim quando a
 * privacidade muda — nunca os dois misturados.
 */

interface Membro {
  userId: string;
  guildId: string;
  role: MemberRole;
  nickname: string | null;
  permitirDmsDoServidor: boolean;
  acceptedRulesAt: Date | null;
  timeoutUntil: Date | null;
  welcomeSeenAt: Date | null;
}

interface Evento {
  alvo: string;
  evento: string;
  payload: unknown;
}

function servicoCom(membroInicial: Membro): { s: OnboardingService; eventos: Evento[] } {
  let membro = { ...membroInicial };
  const guildRow = {
    systemChannelId: null,
    rulesChannelId: null,
    welcomeDescription: null,
    welcomeChannelIds: [] as string[],
    discoverable: false,
    description: null,
  };
  const eventos: Evento[] = [];

  const prisma = {
    guild: {
      findUnique: async () => guildRow,
    },
    guildMember: {
      update: async ({ data }: { data: Partial<Membro> }) => {
        membro = { ...membro, ...data };
        return membro;
      },
    },
  };
  const guilds = {
    assertMember: async () => membro,
  };
  const realtime = {
    emitToGuild: (guildId: string, event: string, payload: unknown) => {
      eventos.push({ alvo: `guild:${guildId}`, evento: event, payload });
    },
    emitToUser: (userId: string, event: string, payload: unknown) => {
      eventos.push({ alvo: `user:${userId}`, evento: event, payload });
    },
  };
  const naoUsado = null as never;
  const s = new OnboardingService(
    prisma as unknown as PrismaService,
    guilds as unknown as GuildsService,
    realtime as unknown as RealtimeService,
    naoUsado as unknown as AuditService,
  );
  return { s, eventos };
}

const BASE: Membro = {
  userId: "ana",
  guildId: "g1",
  role: "MEMBER",
  nickname: null,
  permitirDmsDoServidor: true,
  acceptedRulesAt: null,
  timeoutUntil: null,
  welcomeSeenAt: null,
};

describe("OnboardingService.editMembership", () => {
  it("grava o apelido e emite member.updated para a sala do servidor", async () => {
    const { s, eventos } = servicoCom(BASE);
    const dto = await s.editMembership("ana", "g1", { nickname: "Aninha" });
    expect(dto.nickname).toBe("Aninha");
    expect(eventos).toEqual([
      {
        alvo: "guild:g1",
        evento: WS_EVENTS.MEMBER_UPDATED,
        payload: { guildId: "g1", userId: "ana", role: "MEMBER", nickname: "Aninha" },
      },
    ]);
  });

  it("nickname vazio (só espaço) apaga o apelido", async () => {
    const { s, eventos } = servicoCom({ ...BASE, nickname: "Velho" });
    const dto = await s.editMembership("ana", "g1", { nickname: "   " });
    expect(dto.nickname).toBeNull();
    expect(eventos).toEqual([
      {
        alvo: "guild:g1",
        evento: WS_EVENTS.MEMBER_UPDATED,
        payload: { guildId: "g1", userId: "ana", role: "MEMBER", nickname: null },
      },
    ]);
  });

  it("apelido igual ao atual não emite nada", async () => {
    const { s, eventos } = servicoCom({ ...BASE, nickname: "Aninha" });
    const dto = await s.editMembership("ana", "g1", { nickname: "Aninha" });
    expect(dto.nickname).toBe("Aninha");
    expect(eventos).toEqual([]);
  });

  it("muda a privacidade: emite guild.settingsUpdated (sem onboarding) só para mim", async () => {
    const { s, eventos } = servicoCom(BASE);
    const dto = await s.editMembership("ana", "g1", { permitirDmsDoServidor: false });
    expect(dto.permitirDmsDoServidor).toBe(false);
    expect(eventos).toEqual([
      { alvo: "user:ana", evento: WS_EVENTS.GUILD_SETTINGS_UPDATED, payload: { guildId: "g1" } },
    ]);
  });

  it("privacidade igual à atual não emite nada", async () => {
    const { s, eventos } = servicoCom(BASE);
    await s.editMembership("ana", "g1", { permitirDmsDoServidor: true });
    expect(eventos).toEqual([]);
  });

  it("os dois campos num PATCH só: grava os dois e emite os dois eventos cabíveis", async () => {
    const { s, eventos } = servicoCom(BASE);
    const dto = await s.editMembership("ana", "g1", {
      nickname: "Aninha",
      permitirDmsDoServidor: false,
    });
    expect(dto.nickname).toBe("Aninha");
    expect(dto.permitirDmsDoServidor).toBe(false);
    expect(eventos).toHaveLength(2);
    expect(eventos).toContainEqual({
      alvo: "guild:g1",
      evento: WS_EVENTS.MEMBER_UPDATED,
      payload: { guildId: "g1", userId: "ana", role: "MEMBER", nickname: "Aninha" },
    });
    expect(eventos).toContainEqual({
      alvo: "user:ana",
      evento: WS_EVENTS.GUILD_SETTINGS_UPDATED,
      payload: { guildId: "g1" },
    });
  });
});
