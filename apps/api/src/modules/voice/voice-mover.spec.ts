import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import {
  DEFAULT_PERMISSIONS,
  DM_PERMISSIONS,
  Permission,
  WS_EVENTS,
  hasPermission,
} from "@streamz/shared";
import { VoiceService } from "./voice.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * `POST /guilds/:id/voice/move`: arrastar alguém de um canal de voz para outro.
 *
 * O que este arquivo protege é a **ordem das recusas**. Mover é a única ação de
 * voz que um terceiro dispara sobre outra pessoa, então cada guard aqui é uma
 * porta que ficaria aberta se sumisse: permissão de quem arrasta, o destino ser
 * canal de voz deste servidor, o alvo estar mesmo em voz, e o alvo enxergar o
 * destino (canal privado não recebe gente empurrada).
 *
 * O `GuildsService` é substituído pelo mínimo que este caminho toca; o estado
 * de voz é o da store em memória do próprio service, como no `voice-states-dm`.
 */
const CANAIS: Record<string, { id: string; guildId: string | null; type: string; name: string }> = {
  "voz-1": { id: "voz-1", guildId: "g1", type: "VOICE", name: "Geral" },
  "voz-2": { id: "voz-2", guildId: "g1", type: "VOICE", name: "Reunião" },
  "voz-privada": { id: "voz-privada", guildId: "g1", type: "VOICE", name: "Diretoria" },
  texto: { id: "texto", guildId: "g1", type: "TEXT", name: "geral" },
  "voz-outro-servidor": { id: "voz-outro-servidor", guildId: "g2", type: "VOICE", name: "Lá" },
  dm1: { id: "dm1", guildId: null, type: "DM", name: "" },
};

function usuario(id: string) {
  return {
    id,
    username: id,
    displayName: null,
    avatarUrl: null,
    status: "ONLINE",
    customStatusText: null,
    customStatusEmoji: null,
    customStatusExpiresAt: null,
  };
}

function servico(permissoesDoAtor: number) {
  const emitToUser = vi.fn();
  const emitToGuild = vi.fn();
  const guilds = {
    async assertCanModerate(_actorId: string, _guildId: string, permission: number) {
      if (!hasPermission(permissoesDoAtor, permission)) {
        throw new ForbiddenException("Você não tem permissão para isso");
      }
      return { userId: _actorId };
    },
    async assertMember(userId: string, _guildId: string) {
      return { userId };
    },
    async assertCanViewChannel(userId: string, channelId: string) {
      const channel = CANAIS[channelId];
      if (!channel) throw new BadRequestException("Canal não encontrado");
      // "voz-privada" só a bia enxerga: é o caso de empurrar alguém para dentro
      if (channelId === "voz-privada" && userId !== "bia") {
        throw new ForbiddenException("Você não tem acesso a este canal");
      }
      // c-cargos: o `assertCanViewChannel` de verdade sempre devolve a permissão
      // efetiva do canal — o token e as flags de voz saem dela
      return {
        tipo: channel.guildId ? "guild" : "dm",
        channel,
        permissions: channel.guildId ? DEFAULT_PERMISSIONS : DM_PERMISSIONS,
      };
    },
  } as unknown as GuildsService;

  const prisma = {
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return where.id.in.map(usuario);
      },
      async findUnique({ where }: { where: { id: string } }) {
        return usuario(where.id);
      },
    },
    channel: {
      async findUnique({ where }: { where: { id: string } }) {
        return CANAIS[where.id] ?? null;
      },
      async findMany({ where }: { where: { guildId?: string; type?: string } }) {
        return Object.values(CANAIS).filter(
          (c) =>
            (where.guildId === undefined || c.guildId === where.guildId) &&
            (where.type === undefined || c.type === where.type),
        );
      },
    },
    channelMember: {
      async findMany() {
        return [];
      },
    },
  } as unknown as PrismaService;

  const realtime = { emitToGuild, emitToUsers() {}, emitToUser } as unknown as RealtimeService;
  return { voice: new VoiceService(guilds, prisma, realtime), emitToUser, emitToGuild };
}

describe("VoiceService.move", () => {
  it("move o alvo, leva as flags de mudo junto e avisa só quem foi movido", async () => {
    const { voice, emitToUser } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-1", { muted: true, deafened: false, video: true, screen: true });

    const r = await voice.move("dono", "g1", "ana", "voz-2");

    expect(r).toEqual({ moved: "ana", from: "voz-1", to: "voz-2" });
    expect(await voice.membrosDaSala("voz-1")).toEqual([]);
    expect(await voice.membrosDaSala("voz-2")).toEqual(["ana"]);

    const estados = await voice.statesForGuild("dono", "g1");
    const ana = estados.find((e) => e.user.id === "ana");
    expect(ana?.channelId).toBe("voz-2");
    // mudo viaja com a pessoa; câmera e tela não (as faixas ficaram na sala antiga)
    expect([ana?.muted, ana?.video, ana?.screen]).toEqual([true, false, false]);

    expect(emitToUser).toHaveBeenCalledTimes(1);
    const [destinatario, evento, payload] = emitToUser.mock.calls[0];
    expect([destinatario, evento]).toEqual(["ana", WS_EVENTS.VOICE_MOVED]);
    expect(payload).toMatchObject({
      guildId: "g1",
      channelId: "voz-2",
      channelName: "Reunião",
      deChannelId: "voz-1",
    });
    expect(payload.movedBy.id).toBe("dono");
  });

  it("sem MOVE_MEMBERS não move — e nem chega a mexer no estado", async () => {
    // MUTE_MEMBERS é vizinho na aba de permissões e não serve: mover é outro bit
    const { voice, emitToUser } = servico(Permission.MUTE_MEMBERS | Permission.MANAGE_CHANNELS);
    await voice.join("ana", "voz-1");

    await expect(voice.move("zé", "g1", "ana", "voz-2")).rejects.toBeInstanceOf(ForbiddenException);
    expect(await voice.membrosDaSala("voz-1")).toEqual(["ana"]);
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it("alvo fora da voz não é arrastado para dentro dela", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await expect(voice.move("dono", "g1", "ana", "voz-2")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await voice.membrosDaSala("voz-2")).toEqual([]);
  });

  it("estar em voz em OUTRO servidor não conta: aqui ele está fora", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-outro-servidor");
    await expect(voice.move("dono", "g1", "ana", "voz-2")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("soltar no mesmo canal em que a pessoa já está é recusado", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-1");
    await expect(voice.move("dono", "g1", "ana", "voz-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("destino tem de ser canal de voz do próprio servidor", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-1");
    for (const destino of ["texto", "voz-outro-servidor", "dm1", "nao-existe"]) {
      await expect(voice.move("dono", "g1", "ana", destino)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(await voice.membrosDaSala("voz-1")).toEqual(["ana"]);
  });

  it("não empurra ninguém para dentro de canal que ele não enxerga", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-1");
    // quem decide é o `assertCanViewChannel` do **movido**, não o de quem move
    await expect(voice.move("dono", "g1", "ana", "voz-privada")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await voice.join("bia", "voz-1");
    await expect(voice.move("dono", "g1", "bia", "voz-privada")).resolves.toMatchObject({
      to: "voz-privada",
    });
  });
});
