import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import {
  DEFAULT_PERMISSIONS,
  DM_PERMISSIONS,
  Permission,
  WS_EVENTS,
  hasPermission,
} from "@streamz/shared";

/**
 * `POST /guilds/:id/voice/moderar`: mutar/ensurdecer alguém no servidor.
 *
 * Espelha `voice-mover.spec.ts` na estrutura, mas o que este arquivo protege é
 * outra coisa: a ordem "banco → LiveKit" (o registro persiste mesmo se o
 * servidor de mídia estiver fora do ar ou o participante já tiver saído) e que
 * ligar a flag exige o alvo **em voz agora** — desligar não exige, porque
 * desfazer uma moderação de alguém que já saiu é sempre seguro.
 *
 * O `RoomServiceClient` do `livekit-server-sdk` é mockado (em vez de deixado
 * sem credencial, como em `expulsar-da-voz.spec.ts`) porque aqui o próprio
 * comportamento do `updateParticipant` — chamado e tolerando `not_found` — é
 * o que se quer garantir.
 */
const { updateParticipantMock, roomServiceClientMock } = vi.hoisted(() => {
  const updateParticipantMock = vi.fn().mockResolvedValue(undefined);
  // `roomService()` chama `new RoomServiceClient(...)`: a implementação
  // precisa ser uma function comum (não arrow) para aceitar `new` — uma arrow
  // function não é construtora e o `new` do serviço quebraria com
  // "is not a constructor"
  const roomServiceClientMock = vi.fn().mockImplementation(function () {
    return {
      updateParticipant: updateParticipantMock,
      removeParticipant: vi.fn(),
    };
  });
  return { updateParticipantMock, roomServiceClientMock };
});

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("livekit-server-sdk")>();
  return { ...real, RoomServiceClient: roomServiceClientMock };
});

import { TrackSource } from "livekit-server-sdk";
import { VoiceService, permissaoDoParticipante } from "./voice.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

const CANAIS: Record<string, { id: string; guildId: string | null; type: string; name: string }> = {
  "voz-1": { id: "voz-1", guildId: "g1", type: "VOICE", name: "Geral" },
  texto: { id: "texto", guildId: "g1", type: "TEXT", name: "geral" },
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
  const emitToGuild = vi.fn();
  const emitToUsers = vi.fn();
  // linha de `GuildMember` por usuário, como no banco: `voiceMuted`/
  // `voiceDeafened` nascem em `false` (default do schema) e o `update` só
  // mexe no campo que veio em `data` — o `select` da chamada real sempre
  // devolve os dois, por isso o mock também precisa devolver os dois
  const guildMemberRows = new Map<string, { voiceMuted: boolean; voiceDeafened: boolean }>();
  const guildMemberUpdate = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { userId_guildId: { userId: string; guildId: string } };
      data: Record<string, boolean>;
    }) => {
      const chave = where.userId_guildId.userId;
      const atual = guildMemberRows.get(chave) ?? { voiceMuted: false, voiceDeafened: false };
      const atualizado = { ...atual, ...data };
      guildMemberRows.set(chave, atualizado);
      return atualizado;
    },
  );
  const guildMemberFindUnique = vi.fn(
    async ({ where }: { where: { userId_guildId: { userId: string; guildId: string } } }) => {
      const chave = where.userId_guildId.userId;
      const linha = guildMemberRows.get(chave);
      return linha ? { ...linha } : null;
    },
  );

  const assertCanModerarVoz = vi.fn(
    async (
      _actorId: string,
      _guildId: string,
      _targetId: string,
      permission: number,
      _channelId: string | null,
    ) => {
      if (!hasPermission(permissoesDoAtor, permission)) {
        throw new ForbiddenException("Você não tem permissão para isso");
      }
    },
  );

  const guilds = {
    assertCanModerarVoz,
    async assertCanViewChannel(_userId: string, channelId: string) {
      const channel = CANAIS[channelId];
      if (!channel) throw new BadRequestException("Canal não encontrado");
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
    guildMember: {
      update: guildMemberUpdate,
      findUnique: guildMemberFindUnique,
      async findMany() {
        return [];
      },
    },
  } as unknown as PrismaService;

  const realtime = { emitToGuild, emitToUsers, emitToUser() {} } as unknown as RealtimeService;
  return {
    voice: new VoiceService(guilds, prisma, realtime),
    emitToGuild,
    guildMemberUpdate,
    assertCanModerarVoz,
  };
}

describe("permissaoDoParticipante", () => {
  it("sem flag de servidor, é a permissão do canal de sempre", () => {
    const p = permissaoDoParticipante({
      podeFalar: true,
      podeTransmitir: true,
      serverMute: false,
      serverDeaf: false,
    });
    expect(p.canPublishSources).toEqual(expect.arrayContaining([TrackSource.MICROPHONE]));
    expect(p.canSubscribe).toBe(true);
    expect(p.canPublishData).toBe(true);
  });

  it("serverMute tira o microfone mesmo com SPEAK — câmera/tela não são afetadas", () => {
    const p = permissaoDoParticipante({
      podeFalar: true,
      podeTransmitir: true,
      serverMute: true,
      serverDeaf: false,
    });
    expect(p.canPublishSources).not.toContain(TrackSource.MICROPHONE);
    expect(p.canPublishSources).toContain(TrackSource.CAMERA);
  });

  it("sem SPEAK o microfone já não entrava, com ou sem serverMute", () => {
    const p = permissaoDoParticipante({
      podeFalar: false,
      podeTransmitir: true,
      serverMute: false,
      serverDeaf: false,
    });
    expect(p.canPublishSources).not.toContain(TrackSource.MICROPHONE);
  });

  it("serverDeaf tira canSubscribe", () => {
    const p = permissaoDoParticipante({
      podeFalar: true,
      podeTransmitir: true,
      serverMute: false,
      serverDeaf: true,
    });
    expect(p.canSubscribe).toBe(false);
  });

  it("serverDeaf sem serverMute também tira o microfone — como no Discord, ensurdecer impede falar", () => {
    const p = permissaoDoParticipante({
      podeFalar: true,
      podeTransmitir: true,
      serverMute: false,
      serverDeaf: true,
    });
    expect(p.canPublishSources).not.toContain(TrackSource.MICROPHONE);
    expect(p.canSubscribe).toBe(false);
  });

  it("canPublishData continua true — moderação de voz não tira dado/reação", () => {
    const p = permissaoDoParticipante({
      podeFalar: false,
      podeTransmitir: false,
      serverMute: true,
      serverDeaf: true,
    });
    expect(p.canPublishData).toBe(true);
  });
});

describe("VoiceService.moderarVoz", () => {
  beforeEach(() => {
    process.env.LIVEKIT_API_KEY = "key-de-teste";
    process.env.LIVEKIT_API_SECRET = "segredo-de-teste";
    process.env.LIVEKIT_URL = "wss://livekit.teste";
    roomServiceClientMock.mockClear();
    updateParticipantMock.mockReset().mockResolvedValue(undefined);
  });

  it("sem MUTE_MEMBERS a recusa propaga e nem chega a escrever no banco", async () => {
    const { voice, guildMemberUpdate, assertCanModerarVoz } = servico(0);

    await expect(
      voice.moderarVoz("zé", "g1", { userId: "ana", mute: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // ana não está em voz aqui — chega `null` — e ainda assim é o 403 do
    // assert que vence, não o 400 de "não está em voz" (senão o reject acima
    // seria BadRequestException)
    expect(assertCanModerarVoz).toHaveBeenCalledWith(
      "zé",
      "g1",
      "ana",
      Permission.MUTE_MEMBERS,
      null,
    );
    expect(guildMemberUpdate).not.toHaveBeenCalled();
    expect(updateParticipantMock).not.toHaveBeenCalled();
  });

  it("alvo em voz: o canal dele (não null) chega ao assertCanModerarVoz", async () => {
    const { voice, assertCanModerarVoz } = servico(Permission.MUTE_MEMBERS);
    await voice.join("ana", "voz-1");
    assertCanModerarVoz.mockClear();

    await voice.moderarVoz("dono", "g1", { userId: "ana", mute: true });

    expect(assertCanModerarVoz).toHaveBeenCalledWith(
      "dono",
      "g1",
      "ana",
      Permission.MUTE_MEMBERS,
      "voz-1",
    );
  });

  it("sem DEAFEN_MEMBERS (só MUTE_MEMBERS) a recusa é a mesma para o campo deaf", async () => {
    const { voice, guildMemberUpdate } = servico(Permission.MUTE_MEMBERS);

    await expect(
      voice.moderarVoz("zé", "g1", { userId: "ana", deaf: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(guildMemberUpdate).not.toHaveBeenCalled();
  });

  it("ligar o mute com o alvo fora da voz é recusado — não é para arrastar ninguém para dentro", async () => {
    const { voice, guildMemberUpdate } = servico(Permission.MUTE_MEMBERS);

    await expect(
      voice.moderarVoz("dono", "g1", { userId: "ana", mute: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(guildMemberUpdate).not.toHaveBeenCalled();
  });

  it("ligar o deaf com o alvo fora da voz é recusado", async () => {
    const { voice } = servico(Permission.DEAFEN_MEMBERS);

    await expect(
      voice.moderarVoz("dono", "g1", { userId: "ana", deaf: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("desligar a flag fora da voz grava no banco (persiste para a próxima entrada) e não mexe no LiveKit", async () => {
    const { voice, guildMemberUpdate } = servico(Permission.MUTE_MEMBERS);

    await voice.moderarVoz("dono", "g1", { userId: "ana", mute: false });

    expect(guildMemberUpdate).toHaveBeenCalledTimes(1);
    expect(guildMemberUpdate.mock.calls[0][0].data).toMatchObject({ voiceMuted: false });
    expect(updateParticipantMock).not.toHaveBeenCalled();
  });

  it("join de quem não tem nenhuma moderação imposta também chama updateParticipant — libera o microfone", async () => {
    // `reaplicarModeracao` roda sempre no join, não só quando há mute/deaf
    // gravado: fecha a corrida de quem pegou o token antes de ser liberado.
    // Sem moderação nenhuma, o efeito é liberar (microfone continua entrando).
    const { voice } = servico(0);

    await voice.join("ana", "voz-1");

    await vi.waitFor(() => expect(updateParticipantMock).toHaveBeenCalledTimes(1));
    const [sala, identity, options] = updateParticipantMock.mock.calls[0];
    expect(sala).toBe("voice:voz-1");
    expect(identity).toBe("ana");
    expect(options.permission.canPublishSources).toContain(TrackSource.MICROPHONE);
  });

  it("alvo em voz: mutar grava no banco e tira o microfone no LiveKit", async () => {
    const { voice, guildMemberUpdate, emitToGuild } = servico(Permission.MUTE_MEMBERS);
    await voice.join("ana", "voz-1");
    // o join também reaplica moderação (dispara e esquece); espera essa
    // chamada assentar antes de zerar o mock, senão ela se mistura com a do
    // moderarVoz abaixo e a contagem de 1 chamada falha por acidente
    await vi.waitFor(() => expect(updateParticipantMock).toHaveBeenCalledTimes(1));
    updateParticipantMock.mockClear();
    emitToGuild.mockClear();

    await voice.moderarVoz("dono", "g1", { userId: "ana", mute: true });

    expect(guildMemberUpdate).toHaveBeenCalledTimes(1);
    expect(guildMemberUpdate.mock.calls[0][0].data).toMatchObject({ voiceMuted: true });

    expect(updateParticipantMock).toHaveBeenCalledTimes(1);
    const [sala, identity, options] = updateParticipantMock.mock.calls[0];
    expect(sala).toBe("voice:voz-1");
    expect(identity).toBe("ana");
    expect(options.permission.canPublishSources).not.toContain(TrackSource.MICROPHONE);

    // o resto do servidor (barra lateral) também precisa saber
    expect(emitToGuild).toHaveBeenCalled();
    const ultima = emitToGuild.mock.calls.at(-1)!;
    expect([ultima[0], ultima[1]]).toEqual(["g1", WS_EVENTS.VOICE_STATE]);
  });

  it("alvo em voz: ensurdecer tira canSubscribe no LiveKit", async () => {
    const { voice } = servico(Permission.DEAFEN_MEMBERS);
    await voice.join("ana", "voz-1");
    // mesmo motivo do teste de mutar: isola a chamada do moderarVoz da
    // reaplicação fire-and-forget que o próprio join dispara
    await vi.waitFor(() => expect(updateParticipantMock).toHaveBeenCalledTimes(1));
    updateParticipantMock.mockClear();

    await voice.moderarVoz("dono", "g1", { userId: "ana", deaf: true });

    expect(updateParticipantMock).toHaveBeenCalledTimes(1);
    const [, , options] = updateParticipantMock.mock.calls[0];
    expect(options.permission.canSubscribe).toBe(false);
  });

  it("LiveKit não achando o participante (not_found) não derruba a moderação — o banco já valeu", async () => {
    const { voice, guildMemberUpdate } = servico(Permission.MUTE_MEMBERS);
    await voice.join("ana", "voz-1");
    updateParticipantMock.mockRejectedValueOnce({ code: "not_found", message: "sumiu" });

    await expect(
      voice.moderarVoz("dono", "g1", { userId: "ana", mute: true }),
    ).resolves.toBeUndefined();
    expect(guildMemberUpdate).toHaveBeenCalledTimes(1);
  });
});
