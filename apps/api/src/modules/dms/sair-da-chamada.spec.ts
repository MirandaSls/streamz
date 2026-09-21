import { describe, expect, it, vi } from "vitest";
import { DMsService } from "./dms.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { FriendsService } from "../friends/friends.service";
import type { MessagesService } from "../messages/messages.service";
import type { StorageService } from "../storage/storage.service";
import type { CallsService } from "../voice/calls.service";
import type { VoiceService } from "../voice/voice.service";

/**
 * Sair de um grupo (ou ser removido dele) **durante a chamada**.
 *
 * Até aqui os dois caminhos só chamavam `realtime.leaveChannelRooms`, que tira
 * o socket da sala do Socket.IO e não encosta no estado de voz nem no LiveKit:
 * quem saía continuava ouvindo e falando, e continuava no palco de todo mundo,
 * indefinidamente — ele já não era `ChannelMember`, então nem o `voice.state`
 * chegava mais nele para a interface desligar sozinha.
 *
 * Os dois testes de ordem são o coração do arquivo: o `voice.state` de uma
 * conversa vai para os **participantes** (não há sala de servidor a que
 * recorrer), então a saída da chamada tem de acontecer **antes** de o
 * `ChannelMember` sumir — senão o desligamento é emitido para todo mundo menos
 * para quem precisava recebê-lo.
 */
function servico(dono = "ana", vozQuebrada = false) {
  const ordem: string[] = [];

  const membros = [
    { userId: "ana", user: usuario("ana") },
    { userId: "bia", user: usuario("bia") },
    { userId: "caio", user: usuario("caio") },
  ];
  const grupo = {
    id: "g",
    guildId: null,
    name: "grupo",
    type: "GROUP",
    ownerId: dono,
    iconKey: null,
    position: 0,
    private: false,
    readOnly: false,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    lastMessageAt: null,
    members: membros,
  };

  const prisma = {
    channel: {
      async findUnique() {
        return { ...grupo, members: membros.map((m) => ({ userId: m.userId })) };
      },
      async findFirst() {
        return grupo;
      },
      async findUniqueOrThrow() {
        return grupo;
      },
      async delete() {
        ordem.push("channel.delete");
        return grupo;
      },
      async update() {
        return grupo;
      },
    },
    channelMember: {
      delete: vi.fn(async () => {
        ordem.push("channelMember.delete");
        return {};
      }),
    },
    // o `removeMember` apaga o DMPin junto com o vínculo, na mesma transação
    dMPin: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      // `publicar` monta a vista do grupo e lê o fixadaEm de cada participante
      findMany: vi.fn(async () => []),
    },
    message: {
      async create() {
        return { id: "m1" };
      },
    },
    async $transaction(ops: unknown[]) {
      ordem.push("transaction");
      return Promise.all(ops as Promise<unknown>[]);
    },
  } as unknown as PrismaService;

  const realtime = {
    emitToUser() {},
    emitToChannel() {},
    joinChannelRooms() {},
    leaveChannelRooms: vi.fn(() => {
      ordem.push("leaveChannelRooms");
    }),
  } as unknown as RealtimeService;

  const expulsarDaVoz = vi.fn(async () => {
    ordem.push("expulsarDaVoz");
    // o LiveKit fora do ar chega aqui como exceção: a saída do grupo tem de
    // acontecer assim mesmo
    if (vozQuebrada) throw new Error("livekit fora do ar");
  });
  const onDisconnect = vi.fn(async () => {
    ordem.push("onDisconnect");
  });

  const service = new DMsService(
    prisma,
    realtime,
    {} as unknown as ReadStateService,
    {} as unknown as FriendsService,
    { async getDTO() { return { id: "m1" }; } } as unknown as MessagesService,
    {} as unknown as StorageService,
    { expulsarDaVoz } as unknown as VoiceService,
    { onDisconnect } as unknown as CallsService,
  );
  return { service, ordem, expulsarDaVoz, onDisconnect };
}

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

describe("leaveGroup", () => {
  it("tira quem sai da chamada, não só da sala do Socket.IO", async () => {
    const { service, expulsarDaVoz, onDisconnect } = servico();
    await service.leaveGroup("bia", "g");
    expect(expulsarDaVoz).toHaveBeenCalledWith("bia", "g");
    expect(onDisconnect).toHaveBeenCalledWith("bia", "g");
  });

  it("a saída da chamada vem antes de o vínculo sumir", async () => {
    const { service, ordem } = servico();
    await service.leaveGroup("bia", "g");
    expect(ordem.indexOf("expulsarDaVoz")).toBeLessThan(ordem.indexOf("transaction"));
    expect(ordem.indexOf("expulsarDaVoz")).toBeLessThan(ordem.indexOf("leaveChannelRooms"));
  });

  it("recusa antes de encostar na voz: quem não participa não desliga ninguém", async () => {
    const { service, expulsarDaVoz } = servico();
    await expect(service.leaveGroup("zé", "g")).rejects.toThrow();
    expect(expulsarDaVoz).not.toHaveBeenCalled();
  });

  it("o LiveKit fora do ar não desfaz a saída do grupo", async () => {
    const { service, ordem, onDisconnect } = servico("ana", true);
    await expect(service.leaveGroup("bia", "g")).resolves.toMatchObject({
      channelId: "g",
      deleted: false,
    });
    expect(ordem).toContain("transaction");
    // a falha para o par inteiro: quem não saiu da voz não tem chamada a encerrar
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});

describe("removeMember", () => {
  it("tira o removido da chamada, não só da sala do Socket.IO", async () => {
    const { service, expulsarDaVoz, onDisconnect } = servico();
    await service.removeMember("ana", "g", "bia");
    expect(expulsarDaVoz).toHaveBeenCalledWith("bia", "g");
    expect(onDisconnect).toHaveBeenCalledWith("bia", "g");
  });

  it("a saída da chamada vem antes do delete do participante", async () => {
    const { service, ordem } = servico();
    await service.removeMember("ana", "g", "bia");
    expect(ordem.indexOf("expulsarDaVoz")).toBeLessThan(ordem.indexOf("channelMember.delete"));
  });

  it("quem não é dono do grupo não remove — e não desliga a voz de ninguém", async () => {
    const { service, expulsarDaVoz } = servico("caio");
    await expect(service.removeMember("ana", "g", "bia")).rejects.toThrow();
    expect(expulsarDaVoz).not.toHaveBeenCalled();
  });
});
