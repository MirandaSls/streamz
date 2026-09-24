import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { DEFAULT_PERMISSIONS, identidadeDeTela } from "@streamz/shared";

/**
 * Webhook do LiveKit (`POST /voice/livekit/webhook`) + `VoiceService.aoEntrarNoLivekit`.
 *
 * O que este arquivo protege: o webhook só aceita corpo com assinatura HMAC
 * válida do LiveKit (senão é `UnauthorizedException`, nunca um corpo confiado
 * às cegas) e só dispara `aoEntrarNoLivekit` para `participant_joined`. E
 * `aoEntrarNoLivekit` é a rede que fecha o buraco do token de 1h não
 * revogável: reaplica mute/deafen do banco em quem entra de verdade na sala,
 * ignora identidade de tela e de bot (não assinam nada), sala de DM (sem
 * moderador) e nunca lança — quem perdeu acesso ao canal é removido da sala em
 * vez de derrubar o webhook.
 *
 * `RoomServiceClient` do `livekit-server-sdk` é mockado como em
 * `voice-moderar.spec.ts`: function comum (não arrow) porque `roomService()`
 * chama `new RoomServiceClient(...)`.
 */
const { updateParticipantMock, removeParticipantMock, roomServiceClientMock } = vi.hoisted(() => {
  const updateParticipantMock = vi.fn().mockResolvedValue(undefined);
  const removeParticipantMock = vi.fn().mockResolvedValue(undefined);
  const roomServiceClientMock = vi.fn().mockImplementation(function () {
    return {
      updateParticipant: updateParticipantMock,
      removeParticipant: removeParticipantMock,
    };
  });
  return { updateParticipantMock, removeParticipantMock, roomServiceClientMock };
});

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("livekit-server-sdk")>();
  return { ...real, RoomServiceClient: roomServiceClientMock };
});

import { AccessToken, TrackSource } from "livekit-server-sdk";
import { LivekitWebhookController } from "./livekit-webhook.controller";
import { VoiceService } from "./voice.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

const CANAIS: Record<string, { id: string; guildId: string | null; type: string }> = {
  "voz-1": { id: "voz-1", guildId: "g1", type: "VOICE" },
};

/** Constrói o controller com um `VoiceService` falso — os testes do controller
 * só precisam saber se `aoEntrarNoLivekit` foi chamado, não do que ele faz. */
function controllerComVoiceFake(opts: { configurado?: boolean } = {}) {
  const aoEntrarNoLivekitMock = vi.fn().mockResolvedValue(undefined);
  const voice = {
    isConfigured: () => opts.configurado ?? true,
    aoEntrarNoLivekit: aoEntrarNoLivekitMock,
  } as unknown as VoiceService;
  return { controller: new LivekitWebhookController(voice), aoEntrarNoLivekitMock };
}

/** Assina um corpo com as credenciais do ambiente, do jeito que o LiveKit faz:
 * `sha256` do grant é o hash do corpo, e o header é o JWT puro (sem "Bearer"). */
async function assinar(corpo: string): Promise<string> {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  at.sha256 = createHash("sha256").update(corpo).digest("base64");
  return at.toJwt();
}

// Mesmo tipo estrutural mínimo que o controller usa (`{ rawBody?: Buffer }`):
// express não é dependência direta da api.
function requisicaoCom(corpo: string): { rawBody?: Buffer } {
  return { rawBody: Buffer.from(corpo, "utf8") };
}

/** Constrói o `VoiceService` de verdade para os testes de `aoEntrarNoLivekit`. */
function servico(opts: { semAcesso?: boolean } = {}) {
  const guildMemberRows = new Map<string, { voiceMuted: boolean; voiceDeafened: boolean }>();

  const guilds = {
    async assertCanViewChannel(_userId: string, channelId: string) {
      if (opts.semAcesso) {
        throw new ForbiddenException("Você não tem mais acesso a este canal");
      }
      const channel = CANAIS[channelId];
      if (!channel) throw new BadRequestException("Canal não encontrado");
      return { tipo: "guild", channel, permissions: DEFAULT_PERMISSIONS };
    },
  } as unknown as GuildsService;

  const prisma = {
    channel: {
      async findUnique({ where }: { where: { id: string } }) {
        return CANAIS[where.id] ?? null;
      },
    },
    guildMember: {
      async findUnique({
        where,
      }: {
        where: { userId_guildId: { userId: string; guildId: string } };
      }) {
        const linha = guildMemberRows.get(where.userId_guildId.userId);
        return linha ? { ...linha } : null;
      },
    },
  } as unknown as PrismaService;

  const realtime = { emitToGuild() {}, emitToUsers() {}, emitToUser() {} } as unknown as RealtimeService;

  return { voice: new VoiceService(guilds, prisma, realtime), guildMemberRows };
}

describe("LivekitWebhookController", () => {
  beforeEach(() => {
    process.env.LIVEKIT_API_KEY = "key-de-teste";
    process.env.LIVEKIT_API_SECRET = "segredo-de-teste";
    process.env.LIVEKIT_URL = "wss://livekit.teste";
    roomServiceClientMock.mockClear();
    updateParticipantMock.mockReset().mockResolvedValue(undefined);
    removeParticipantMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  });

  it("assinatura inválida rejeita com 401 e não chama aoEntrarNoLivekit", async () => {
    const { controller, aoEntrarNoLivekitMock } = controllerComVoiceFake();
    const req = requisicaoCom('{"event":"participant_joined","room":{"name":"voice:voz-1"}}');

    await expect(controller.webhook(req, "Bearer lixo")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(aoEntrarNoLivekitMock).not.toHaveBeenCalled();
  });

  it("header de autorização ausente também rejeita com 401", async () => {
    const { controller, aoEntrarNoLivekitMock } = controllerComVoiceFake();
    const req = requisicaoCom('{"event":"participant_joined","room":{"name":"voice:voz-1"}}');

    await expect(controller.webhook(req, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(aoEntrarNoLivekitMock).not.toHaveBeenCalled();
  });

  it("sem LiveKit configurado responde 503 antes de olhar a assinatura", async () => {
    const { controller, aoEntrarNoLivekitMock } = controllerComVoiceFake({ configurado: false });
    const req = requisicaoCom("{}");

    await expect(controller.webhook(req, undefined)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(aoEntrarNoLivekitMock).not.toHaveBeenCalled();
  });

  it("assinatura válida com participant_joined chama aoEntrarNoLivekit(sala, identidade)", async () => {
    const { controller, aoEntrarNoLivekitMock } = controllerComVoiceFake();
    const corpo = JSON.stringify({
      event: "participant_joined",
      room: { name: "voice:voz-1" },
      participant: { identity: "ana" },
      id: "x",
      createdAt: "0",
    });
    const header = await assinar(corpo);

    const resposta = await controller.webhook(requisicaoCom(corpo), header);

    expect(resposta).toEqual({ ok: true });
    expect(aoEntrarNoLivekitMock).toHaveBeenCalledWith("voice:voz-1", "ana");
  });

  it("outro evento (track_published) não chama aoEntrarNoLivekit", async () => {
    const { controller, aoEntrarNoLivekitMock } = controllerComVoiceFake();
    const corpo = JSON.stringify({
      event: "track_published",
      room: { name: "voice:voz-1" },
      participant: { identity: "ana" },
      id: "y",
      createdAt: "0",
    });
    const header = await assinar(corpo);

    const resposta = await controller.webhook(requisicaoCom(corpo), header);

    expect(resposta).toEqual({ ok: true });
    expect(aoEntrarNoLivekitMock).not.toHaveBeenCalled();
  });
});

describe("VoiceService.aoEntrarNoLivekit", () => {
  beforeEach(() => {
    process.env.LIVEKIT_API_KEY = "key-de-teste";
    process.env.LIVEKIT_API_SECRET = "segredo-de-teste";
    process.env.LIVEKIT_URL = "wss://livekit.teste";
    roomServiceClientMock.mockClear();
    updateParticipantMock.mockReset().mockResolvedValue(undefined);
    removeParticipantMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  });

  it("membro silenciado pelo servidor (voiceMuted) entra sem microfone no LiveKit", async () => {
    const { voice, guildMemberRows } = servico();
    guildMemberRows.set("ana", { voiceMuted: true, voiceDeafened: false });

    await voice.aoEntrarNoLivekit("voice:voz-1", "ana");

    expect(updateParticipantMock).toHaveBeenCalledTimes(1);
    const [sala, identity, options] = updateParticipantMock.mock.calls[0];
    expect(sala).toBe("voice:voz-1");
    expect(identity).toBe("ana");
    expect(options.permission.canPublishSources).not.toContain(TrackSource.MICROPHONE);
  });

  it("membro liberado (voiceMuted e voiceDeafened false) entra com microfone", async () => {
    const { voice, guildMemberRows } = servico();
    guildMemberRows.set("ana", { voiceMuted: false, voiceDeafened: false });

    await voice.aoEntrarNoLivekit("voice:voz-1", "ana");

    expect(updateParticipantMock).toHaveBeenCalledTimes(1);
    const [, , options] = updateParticipantMock.mock.calls[0];
    expect(options.permission.canPublishSources).toContain(TrackSource.MICROPHONE);
  });

  it("voiceDeafened tira canSubscribe no LiveKit", async () => {
    const { voice, guildMemberRows } = servico();
    guildMemberRows.set("ana", { voiceMuted: false, voiceDeafened: true });

    await voice.aoEntrarNoLivekit("voice:voz-1", "ana");

    expect(updateParticipantMock).toHaveBeenCalledTimes(1);
    const [, , options] = updateParticipantMock.mock.calls[0];
    expect(options.permission.canSubscribe).toBe(false);
  });

  it("sala de conversa direta (dm:) não tem moderador — updateParticipant nunca é chamado", async () => {
    const { voice } = servico();

    await voice.aoEntrarNoLivekit("dm:dm1", "ana");

    expect(updateParticipantMock).not.toHaveBeenCalled();
  });

  it("identidade de tela do desktop não sofre moderação", async () => {
    const { voice } = servico();

    await voice.aoEntrarNoLivekit("voice:voz-1", identidadeDeTela("ana"));

    expect(updateParticipantMock).not.toHaveBeenCalled();
  });

  it("identidade da ponte de bots (bot:<id>) não sofre moderação", async () => {
    const { voice } = servico();

    await voice.aoEntrarNoLivekit("voice:voz-1", "bot:123");

    expect(updateParticipantMock).not.toHaveBeenCalled();
  });

  it("perdeu acesso ao canal entre o token e a entrada real — é removido da sala, não moderado", async () => {
    const { voice } = servico({ semAcesso: true });

    await voice.aoEntrarNoLivekit("voice:voz-1", "ana");

    expect(removeParticipantMock).toHaveBeenCalledWith("voice:voz-1", "ana");
    expect(updateParticipantMock).not.toHaveBeenCalled();
  });

  it("LiveKit ainda não conhece o participante (not_found) — não lança", async () => {
    const { voice, guildMemberRows } = servico();
    guildMemberRows.set("ana", { voiceMuted: false, voiceDeafened: false });
    updateParticipantMock.mockRejectedValueOnce({ code: "not_found", message: "sumiu" });

    await expect(voice.aoEntrarNoLivekit("voice:voz-1", "ana")).resolves.toBeUndefined();
  });
});
