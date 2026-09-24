import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  DEFAULT_PERMISSIONS,
  DM_PERMISSIONS,
  donoDaIdentidade,
  ehIdentidadeDeTela,
  identidadeDeTela,
} from "@streamz/shared";
import { VoiceService } from "./voice.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * `POST /voice/channels/:id/tela-token`: a credencial do participante de tela
 * do app de desktop. O que importa aqui é o **conteúdo do JWT** — identidade
 * com sufixo, sala certa, e os grants que impedem esse participante de fazer
 * qualquer coisa além de publicar — e que a presença do Streamz não ganhe uma
 * pessoa a mais por causa dele.
 */
const ana = {
  id: "ana",
  username: "ana",
  displayName: null,
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
  customStatusExpiresAt: null,
};

function servico() {
  const guilds = {
    async assertMember() {},
    async assertCanViewChannel(userId: string, channelId: string) {
      if (channelId === "voz1") {
        // c-cargos: o `assertCanViewChannel` de verdade sempre devolve a permissão
      // efetiva do canal — o token e as flags de voz saem dela
      return {
          tipo: "guild",
          channel: { id: channelId, guildId: "g1", type: "VOICE" },
          permissions: DEFAULT_PERMISSIONS,
        };
      }
      if (channelId === "texto1") {
        return {
          tipo: "guild",
          channel: { id: channelId, guildId: "g1", type: "TEXT" },
          permissions: DEFAULT_PERMISSIONS,
        };
      }
      if (channelId === "dm1" && userId === "ana") {
        return {
          tipo: "dm",
          channel: { id: channelId, guildId: null, type: "DM" },
          permissions: DM_PERMISSIONS,
        };
      }
      throw new ForbiddenException("Sem acesso");
    },
  } as unknown as GuildsService;
  const prisma = {
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return where.id.in.filter((id) => id === "ana").map(() => ana);
      },
      async findUnique({ where }: { where: { id: string } }) {
        return where.id === "ana" ? ana : null;
      },
    },
    channel: {
      async findUnique({ where }: { where: { id: string } }) {
        return { id: where.id, guildId: "g1", type: "VOICE" };
      },
      async findMany() {
        return [{ id: "voz1" }];
      },
    },
    channelMember: {
      async findMany() {
        return [];
      },
    },
    // `join`/`broadcast` e `statesForGuild` consultam a moderação de voz do
    // servidor; sem linha (null) = ninguém foi silenciado por um moderador
    guildMember: {
      async findUnique() {
        return null;
      },
      async findMany() {
        return [];
      },
    },
  } as unknown as PrismaService;
  const realtime = { emitToGuild() {}, emitToUsers() {} } as unknown as RealtimeService;
  return new VoiceService(guilds, prisma, realtime);
}

/** O payload do JWT, sem verificar a assinatura: o teste é do conteúdo. */
function payload(token: string): Record<string, unknown> {
  const [, corpo] = token.split(".");
  return JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
}

describe("createScreenToken", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.LIVEKIT_API_KEY = "chave";
    process.env.LIVEKIT_API_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    process.env.LIVEKIT_URL = "wss://livekit.exemplo";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("assina o participante <userId>#tela na sala do canal, só com direito de publicar", async () => {
    const voice = servico();
    const resposta = await voice.createScreenToken("voz1", "ana", "Ana");

    expect(resposta.room).toBe("voice:voz1");
    expect(resposta.url).toBe("wss://livekit.exemplo");

    const jwt = payload(resposta.token);
    expect(jwt.sub).toBe("ana#tela");
    expect(jwt.name).toBe("Ana");
    expect(JSON.parse(jwt.metadata as string)).toEqual({ telaDe: "ana" });
    expect(jwt.video).toMatchObject({
      room: "voice:voz1",
      roomJoin: true,
      canPublish: true,
      canSubscribe: false,
      canPublishData: false,
    });
  });

  it("numa conversa direta a sala é a da chamada (dm:)", async () => {
    const voice = servico();
    const resposta = await voice.createScreenToken("dm1", "ana", "Ana");
    expect(resposta.room).toBe("dm:dm1");
    expect((payload(resposta.token).video as { room: string }).room).toBe("dm:dm1");
  });

  it("canal de texto não tem tela para transmitir", async () => {
    await expect(servico().createScreenToken("texto1", "ana", "Ana")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("quem não vê o canal não recebe token", async () => {
    await expect(servico().createScreenToken("dm1", "bia", "Bia")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("sem LiveKit configurado responde 503, como o token de voz", async () => {
    delete process.env.LIVEKIT_URL;
    await expect(servico().createScreenToken("voz1", "ana", "Ana")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("o participante de tela não entra na presença do Streamz", async () => {
    // A presença sai da store de estado de voz (por userId, via gateway), não
    // do LiveKit: pedir o token não põe uma segunda "pessoa" na sala.
    const voice = servico();
    await voice.join("ana", "voz1");
    await voice.createScreenToken("voz1", "ana", "Ana");
    const estados = await voice.statesForGuild("ana", "g1");
    expect(estados.map((e) => e.user.id)).toEqual(["ana"]);
  });
});

describe("identidade de tela", () => {
  it("monta e desmonta o sufixo", () => {
    expect(identidadeDeTela("ana")).toBe("ana#tela");
    expect(donoDaIdentidade("ana#tela")).toBe("ana");
    expect(donoDaIdentidade("ana")).toBe("ana");
    expect(ehIdentidadeDeTela("ana#tela")).toBe(true);
    expect(ehIdentidadeDeTela("ana")).toBe(false);
  });
});
