import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS, DM_PERMISSIONS, WS_EVENTS } from "@streamz/shared";
import { VoiceService } from "./voice.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * `expulsarDaVoz` / `desligarDoServidor` — a saída de quem **perdeu o acesso**.
 *
 * `leave` é a saída cooperativa: o cliente avisa que desligou. Estes dois são
 * a outra metade, a que ninguém pede — sair do grupo, ser removido, expulso ou
 * banido —, e o que este arquivo protege é que ela funcione **sem o LiveKit
 * configurado**. É o estado do dia a dia em dev e o que acontece em produção
 * quando o servidor de mídia está fora do ar: revogar a credencial falha, e a
 * expulsão não pode falhar junto.
 *
 * A revogação em si (o `RoomServiceClient`) não é exercitada aqui de
 * propósito: sem credencial ela nem chega a ser construída, e é exatamente
 * esse caminho que precisa ser silencioso.
 */
function servico() {
  const emitToGuild = vi.fn();
  const emitToUsers = vi.fn();

  const CANAIS: Record<string, { id: string; guildId: string | null; type: string }> = {
    "voz-1": { id: "voz-1", guildId: "g1", type: "VOICE" },
    "voz-2": { id: "voz-2", guildId: "g1", type: "VOICE" },
    dm1: { id: "dm1", guildId: null, type: "DM" },
  };

  const guilds = {
    async assertCanViewChannel(_userId: string, channelId: string) {
      const channel = CANAIS[channelId];
      return {
        tipo: channel.guildId ? "guild" : "dm",
        channel,
        permissions: channel.guildId ? DEFAULT_PERMISSIONS : DM_PERMISSIONS,
      };
    },
  } as unknown as GuildsService;

  const prisma = {
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        return { id: where.id, username: where.id, displayName: null, avatarUrl: null, status: "ONLINE", customStatusText: null, customStatusEmoji: null, customStatusExpiresAt: null };
      },
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return where.id.in.map((id) => ({ id, username: id, displayName: null, avatarUrl: null, status: "ONLINE", customStatusText: null, customStatusEmoji: null, customStatusExpiresAt: null }));
      },
    },
    channel: {
      async findUnique({ where }: { where: { id: string } }) {
        return CANAIS[where.id] ?? null;
      },
      async findMany({ where }: { where: { guildId?: string; type?: string } }) {
        // `desligarDoServidor` pergunta pelos canais de voz do servidor;
        // `canaisDeVozDoUsuario` (do `join`) pergunta com um `OR` — a
        // diferença aqui é só o `guildId`
        if (where?.guildId) {
          return Object.values(CANAIS).filter(
            (c) => c.guildId === where.guildId && c.type === where.type,
          );
        }
        return Object.values(CANAIS).map((c) => ({ id: c.id }));
      },
    },
    channelMember: {
      async findMany() {
        return [{ userId: "ana" }, { userId: "bia" }];
      },
    },
    // `join`/`broadcast` consultam a moderação de voz do servidor a cada
    // entrada; sem linha (null) = ninguém foi silenciado por um moderador
    guildMember: {
      async findUnique() {
        return null;
      },
      async findMany() {
        return [];
      },
    },
  } as unknown as PrismaService;

  const realtime = { emitToGuild, emitToUsers, emitToUser() {} } as unknown as RealtimeService;
  return { voice: new VoiceService(guilds, prisma, realtime), emitToGuild, emitToUsers };
}

describe("expulsarDaVoz sem LiveKit configurado", () => {
  beforeEach(() => {
    // o ambiente pode ter credencial de verdade: sem isto o teste sairia para
    // a rede de alguém
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  });

  it("tira do estado e avisa a sala, sem levantar exceção", async () => {
    const { voice, emitToUsers } = servico();
    await voice.join("ana", "dm1");
    emitToUsers.mockClear();

    await expect(voice.expulsarDaVoz("ana", "dm1")).resolves.toBeUndefined();

    expect(await voice.membrosDaSala("dm1")).toEqual([]);
    const [destinatarios, evento, payload] = emitToUsers.mock.calls[0];
    expect([evento, payload.connected, payload.user.id]).toEqual([
      WS_EVENTS.VOICE_STATE,
      false,
      "ana",
    ]);
    // o próprio expulso está entre os destinatários: é por este evento que a
    // interface dele desliga. Por isso a chamada vem **antes** do delete do
    // `ChannelMember`, lá no `DMsService`.
    expect(destinatarios).toContain("ana");
  });

  it("quem nunca esteve na sala não vira um desligamento fantasma", async () => {
    const { voice, emitToUsers } = servico();
    await voice.expulsarDaVoz("caio", "dm1");
    expect(emitToUsers).not.toHaveBeenCalled();
  });

  it("canal já apagado (o último saiu do grupo) não quebra a expulsão", async () => {
    const { voice } = servico();
    await voice.join("ana", "dm1");
    // `canal()` devolvendo null é o grupo que morreu junto com a saída
    await expect(voice.expulsarDaVoz("ana", "sumiu")).resolves.toBeUndefined();
  });
});

/**
 * O aviso que a casca do Discord pluga (`registrarAvisoDeExpulsao`). Sem ele o
 * bot de música tirado da voz por um moderador, kick ou ban nunca recebia o
 * `VOICE_STATE_UPDATE` com `channel_id: null`: o player do Lavalink ficava
 * "conectado" e o `/tocar` seguinte não pedia para entrar de novo.
 */
describe("expulsarDaVoz — aviso de saída forçada", () => {
  beforeEach(() => {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  });

  it("depois de tirar do estado, avisa com usuário, canal e servidor", async () => {
    const { voice } = servico();
    const aviso = vi.fn();
    voice.registrarAvisoDeExpulsao(aviso);
    await voice.join("ana", "voz-1");

    await voice.expulsarDaVoz("ana", "voz-1");

    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith("ana", "voz-1", "g1");
    // o aviso vem depois do estado: quem o recebe já não vê a pessoa na sala
    expect(await voice.membrosDaSala("voz-1")).toEqual([]);
  });

  it("kick/ban (`desligarDoServidor`) passa pelo mesmo aviso", async () => {
    const { voice } = servico();
    const aviso = vi.fn();
    voice.registrarAvisoDeExpulsao(aviso);
    await voice.join("ana", "voz-2");

    await voice.desligarDoServidor("ana", "g1");

    expect(aviso).toHaveBeenCalledWith("ana", "voz-2", "g1");
  });

  it("quem já não estava no canal não é avisado — o player novo de outro canal ficaria de pé", async () => {
    const { voice } = servico();
    const aviso = vi.fn();
    voice.registrarAvisoDeExpulsao(aviso);

    await voice.expulsarDaVoz("caio", "voz-1");

    expect(aviso).not.toHaveBeenCalled();
  });

  it("aviso que lança não derruba a expulsão", async () => {
    const { voice } = servico();
    voice.registrarAvisoDeExpulsao(async () => {
      throw new Error("gateway compat fora");
    });
    await voice.join("ana", "voz-1");

    await expect(voice.expulsarDaVoz("ana", "voz-1")).resolves.toBeUndefined();
    expect(await voice.membrosDaSala("voz-1")).toEqual([]);
  });
});

describe("desligarDoServidor", () => {
  it("acha o canal de voz do servidor em que a pessoa está e a desliga", async () => {
    const { voice, emitToGuild } = servico();
    await voice.join("ana", "voz-2");
    emitToGuild.mockClear();

    await voice.desligarDoServidor("ana", "g1");

    expect(await voice.membrosDaSala("voz-2")).toEqual([]);
    const [guildId, evento, payload] = emitToGuild.mock.calls[0];
    expect([guildId, evento, payload.connected]).toEqual(["g1", WS_EVENTS.VOICE_STATE, false]);
  });

  it("não encosta em quem está na voz de outro servidor nem numa conversa", async () => {
    const { voice } = servico();
    await voice.join("bia", "dm1");
    await voice.desligarDoServidor("bia", "g1");
    expect(await voice.membrosDaSala("dm1")).toEqual(["bia"]);
  });

  it("ninguém em voz: sai sem emitir nada", async () => {
    const { voice, emitToGuild } = servico();
    await voice.desligarDoServidor("ana", "g1");
    expect(emitToGuild).not.toHaveBeenCalled();
  });
});
