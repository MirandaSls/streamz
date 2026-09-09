import { describe, expect, it } from "vitest";
import { DMsService } from "./dms.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { FriendsService } from "../friends/friends.service";
import type { MessagesService } from "../messages/messages.service";
import type { StorageService } from "../storage/storage.service";

/**
 * Fechar e reabrir uma conversa (`dMHidden`).
 *
 * `GET /dms` é a verdade da coluna "Mensagens diretas": o que não vem nela some
 * da tela no recarregamento seguinte. Fechar uma conversa a esconde até chegar
 * mensagem nova — e antes do `POST /dms/:id/show` os caminhos que abrem pelo
 * **id do canal** (rail, link para a mensagem, caixa de entrada, chamada
 * recebida) não tinham como desfazer isso: a conversa voltava para a tela e o
 * servidor seguia escondendo-a.
 *
 * O Prisma aqui é só o que estes caminhos tocam: a tabela de canais e a de
 * conversas fechadas, em memória.
 */

const ANA = "ana";
const BIA = "bia";

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

function canal(id: string, criadoEm: Date) {
  return {
    id,
    guildId: null,
    name: null,
    type: "DM",
    position: 0,
    private: false,
    readOnly: false,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    ownerId: null,
    iconKey: null,
    pairKey: `${ANA}:${BIA}`,
    createdAt: criadoEm,
    members: [
      { userId: ANA, user: usuario(ANA) },
      { userId: BIA, user: usuario(BIA) },
    ],
  };
}

/** Serviço com duas conversas da ana: uma com mensagem, outra recém-criada. */
function servico(ultimaMensagem: Record<string, Date | undefined> = {}) {
  const canais = [
    canal("com-mensagem", new Date("2026-09-01T10:00:00Z")),
    canal("sem-mensagem", new Date("2026-09-02T10:00:00Z")),
  ];
  const escondidas: { userId: string; channelId: string; hiddenAt: Date }[] = [];

  const prisma = {
    channel: {
      findMany: async () => canais,
      findFirst: async ({
        where,
      }: {
        where: { id: string; members: { some: { userId: string } } };
      }) =>
        canais.find(
          (c) => c.id === where.id && c.members.some((m) => m.userId === where.members.some.userId),
        ) ?? null,
    },
    // a prévia da última mensagem (`DISTINCT ON`) — aqui não há mensagem nenhuma
    $queryRaw: async () => [],
    attachment: { findMany: async () => [] },
    dMHidden: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        escondidas.filter((h) => h.userId === where.userId),
      upsert: async ({ where }: { where: { userId_channelId: { userId: string; channelId: string } } }) => {
        const { userId, channelId } = where.userId_channelId;
        const atual = escondidas.find((h) => h.userId === userId && h.channelId === channelId);
        if (atual) atual.hiddenAt = new Date();
        else escondidas.push({ userId, channelId, hiddenAt: new Date() });
      },
      deleteMany: async ({ where }: { where: { userId: string; channelId: string } }) => {
        const i = escondidas.findIndex(
          (h) => h.userId === where.userId && h.channelId === where.channelId,
        );
        if (i >= 0) escondidas.splice(i, 1);
      },
    },
  } as unknown as PrismaService;

  const readState = {
    async summaries(_userId: string, _username: string, ids: string[]) {
      return new Map(
        ids.map((id) => [
          id,
          {
            lastMessageAt: ultimaMensagem[id] ?? null,
            lastReadAt: null,
            mentionCount: 0,
            unreadCount: 0,
          },
        ]),
      );
    },
  } as unknown as ReadStateService;

  const service = new DMsService(
    prisma,
    // reabrir a conversa avisa as outras sessões da conta (`CHANNEL_UPDATED`)
    { emitToUser() {}, joinChannelRooms() {}, leaveChannelRooms() {} } as unknown as RealtimeService,
    readState,
    {} as FriendsService,
    {} as MessagesService,
    {} as StorageService,
  );
  return { service, escondidas };
}

describe("lista de conversas", () => {
  it("conversa sem nenhuma mensagem aparece na coluna (e no topo, pela criação)", async () => {
    const { service } = servico({ "com-mensagem": new Date("2026-09-01T11:00:00Z") });
    const lista = await service.list(ANA, ANA);
    expect(lista.map((c) => c.id)).toEqual(["sem-mensagem", "com-mensagem"]);
  });

  it("fechar tira da lista; mensagem depois do fechamento traz de volta", async () => {
    const { service } = servico({ "com-mensagem": new Date("2026-09-01T11:00:00Z") });
    await service.hide(ANA, "com-mensagem");
    expect((await service.list(ANA, ANA)).map((c) => c.id)).toEqual(["sem-mensagem"]);

    const { service: outro } = servico({ "com-mensagem": new Date("2100-01-01T00:00:00Z") });
    await outro.hide(ANA, "com-mensagem");
    expect((await outro.list(ANA, ANA)).map((c) => c.id)).toContain("com-mensagem");
  });

  it("fechar é só meu: a conversa continua na lista do outro", async () => {
    const { service } = servico();
    await service.hide(ANA, "sem-mensagem");
    expect((await service.list(BIA, BIA)).map((c) => c.id)).toContain("sem-mensagem");
  });
});

describe("reabrir a conversa (POST /dms/:id/show)", () => {
  it("desfaz o fechamento: ela volta para a lista mesmo sem mensagem nova", async () => {
    const { service } = servico();
    await service.hide(ANA, "sem-mensagem");
    expect((await service.list(ANA, ANA)).map((c) => c.id)).not.toContain("sem-mensagem");

    await service.mostrar(ANA, "sem-mensagem", ANA);
    expect((await service.list(ANA, ANA)).map((c) => c.id)).toContain("sem-mensagem");
  });

  it("é idempotente: reabrir o que não estava fechado não muda nada", async () => {
    const { service, escondidas } = servico();
    await service.mostrar(ANA, "com-mensagem", ANA);
    expect(escondidas).toHaveLength(0);
    expect((await service.list(ANA, ANA)).map((c) => c.id)).toContain("com-mensagem");
  });

  it("404 para quem não participa da conversa", async () => {
    const { service } = servico();
    await expect(service.mostrar("caio", "sem-mensagem", "caio")).rejects.toThrow();
  });

  it("devolve o estado de leitura, como a lista", async () => {
    const quando = new Date("2026-09-01T11:00:00Z");
    const { service } = servico({ "com-mensagem": quando });
    const dm = await service.mostrar(ANA, "com-mensagem", ANA);
    expect(dm.lastMessageAt).toBe(quando.toISOString());
  });
});
