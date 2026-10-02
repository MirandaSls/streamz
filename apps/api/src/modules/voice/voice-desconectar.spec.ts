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
 * `POST /guilds/:id/voice/desconectar`: moderador tira alguém da voz.
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
  const assertCanModerate = vi.fn(
    async (
      _actorId: string,
      _guildId: string,
      permission: number,
      _channelId?: string | null,
    ) => {
      if (!hasPermission(permissoesDoAtor, permission)) {
        throw new ForbiddenException("Você não tem permissão para isso");
      }
      return { userId: _actorId };
    },
  );
  const guilds = {
    assertCanModerate,
    // hierarquia: o espelho de `assertCanModerarVoz` — mesmo bit, e a checagem
    // de hierarquia (`assertCanActOn`) fica por conta de quem espiona este mock
    assertCanModerarVoz: vi.fn(
      async (actorId: string, guildId: string, _alvo: string, permission: number, channelId: string | null) => {
        await assertCanModerate(actorId, guildId, permission, channelId);
      },
    ),
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
    // `join`/`broadcast` (disparado pelo `move`) e `statesForGuild` consultam
    // a moderação de voz do servidor; sem linha (null) = ninguém foi
    // silenciado por um moderador
    guildMember: {
      async findUnique() {
        return null;
      },
      async findMany() {
        return [];
      },
    },
  } as unknown as PrismaService;

  const realtime = { emitToGuild, emitToUsers() {}, emitToUser } as unknown as RealtimeService;
  return {
    voice: new VoiceService(guilds, prisma, realtime),
    emitToUser,
    emitToGuild,
    assertCanModerate,
    guilds: guilds as unknown as { assertCanModerarVoz: ReturnType<typeof vi.fn> },
  };
}

describe("VoiceService.desconectar", () => {
  it("caminho feliz: tira o alvo da sala via expulsarDaVoz", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-1");
    const espia = vi.spyOn(voice, "expulsarDaVoz");

    const r = await voice.desconectar("dono", "g1", "ana");

    expect(r).toEqual({ disconnected: "ana", from: "voz-1" });
    expect(espia).toHaveBeenCalledWith("ana", "voz-1");
    expect(await voice.membrosDaSala("voz-1")).toEqual([]);
  });

  it("o \"Desconectar\" do menu avisa a casca do Discord — é assim que o bot de música sabe que saiu", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    const aviso = vi.fn();
    voice.registrarAvisoDeExpulsao(aviso);
    await voice.join("ana", "voz-1");

    await voice.desconectar("dono", "g1", "ana");

    expect(aviso).toHaveBeenCalledWith("ana", "voz-1", "g1");
  });

  it("sem MOVE_MEMBERS não desconecta — e não mexe no estado", async () => {
    const { voice } = servico(Permission.MUTE_MEMBERS);
    await voice.join("ana", "voz-1");
    const espia = vi.spyOn(voice, "expulsarDaVoz");

    await expect(voice.desconectar("zé", "g1", "ana")).rejects.toBeInstanceOf(ForbiddenException);
    expect(espia).not.toHaveBeenCalled();
    expect(await voice.membrosDaSala("voz-1")).toEqual(["ana"]);
  });

  it("alvo fora de voz (ou em voz de outro servidor) é 400", async () => {
    const { voice } = servico(Permission.MOVE_MEMBERS);
    await expect(voice.desconectar("dono", "g1", "ana")).rejects.toBeInstanceOf(BadRequestException);
    await voice.join("ana", "voz-outro-servidor");
    await expect(voice.desconectar("dono", "g1", "ana")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("checa o bit com o channelId da ORIGEM e passa pela hierarquia do alvo", async () => {
    const { voice, assertCanModerate, guilds } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-2");
    assertCanModerate.mockClear();

    await voice.desconectar("dono", "g1", "ana");

    expect(guilds.assertCanModerarVoz).toHaveBeenCalledWith(
      "dono",
      "g1",
      "ana",
      Permission.MOVE_MEMBERS,
      "voz-2",
    );
    expect(assertCanModerate).toHaveBeenCalledWith("dono", "g1", Permission.MOVE_MEMBERS, "voz-2");
  });

  it("override que nega o bit no canal de origem barra e não mexe no estado", async () => {
    const { voice, guilds } = servico(Permission.MOVE_MEMBERS);
    await voice.join("ana", "voz-1");
    guilds.assertCanModerarVoz = vi.fn(async () => {
      throw new ForbiddenException("sem bit na origem");
    });

    await expect(voice.desconectar("dono", "g1", "ana")).rejects.toBeInstanceOf(ForbiddenException);
    expect(await voice.membrosDaSala("voz-1")).toEqual(["ana"]);
  });
});
