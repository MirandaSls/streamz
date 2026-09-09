import { describe, expect, it } from "vitest";
import { DMsService } from "./dms.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { FriendsService } from "../friends/friends.service";
import type { MessagesService } from "../messages/messages.service";
import type { StorageService } from "../storage/storage.service";

/**
 * A prévia da última mensagem em `GET /dms`, e o que não pode acontecer para
 * consegui-la: uma consulta por conversa.
 *
 * Duas armadilhas ficaram prendidas aqui, e as duas custaram uma medição no
 * log de queries do Prisma:
 *
 * 1. **N+1.** Um `findFirst` de mensagem dentro do `map` das conversas: com
 *    trinta conversas na coluna são trinta idas ao banco por carregamento.
 * 2. **O `include` com `take: 1`.** Parece resolver, e não resolve: com vários
 *    canais de uma vez o Prisma não empurra o `LIMIT` para o banco — ele emite
 *    `WHERE channelId IN (…) ORDER BY createdAt DESC` **sem LIMIT** e corta em
 *    memória. Medido: 30 conversas → 1 consulta, e o histórico inteiro de
 *    todas elas na resposta.
 *
 * O que sobrou é um `DISTINCT ON` só, com os anexos buscados apenas para as
 * mensagens sem texto. Este teste conta as consultas com 1 e com 30 conversas.
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

function canal(id: string) {
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
    pairKey: `${ANA}:${id}`,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    members: [
      { userId: ANA, user: usuario(ANA) },
      { userId: BIA, user: usuario(BIA) },
    ],
  };
}

function ultima(channelId: string, over: Record<string, unknown> = {}) {
  return {
    channelId,
    id: `m-${channelId}`,
    authorId: BIA,
    content: "bora hoje",
    createdAt: new Date("2026-09-09T10:00:00Z"),
    type: "DEFAULT",
    stickerId: null,
    ...over,
  };
}

function servico(
  canais: ReturnType<typeof canal>[],
  ultimas: ReturnType<typeof ultima>[] = [],
  anexos: { messageId: string; contentType: string }[] = [],
) {
  /** toda ida ao banco, na ordem — é a régua do "sem N+1". */
  const chamadas: string[] = [];
  let sqlDaPrevia = "";

  const proibido = (nome: string) => async () => {
    chamadas.push(nome);
    return [];
  };

  const prisma = {
    channel: {
      findMany: async () => {
        chamadas.push("channel.findMany");
        return canais;
      },
    },
    dMHidden: {
      findMany: async () => {
        chamadas.push("dMHidden.findMany");
        return [];
      },
    },
    attachment: {
      findMany: async () => {
        chamadas.push("attachment.findMany");
        return anexos;
      },
    },
    // se alguém trouxer de volta o `include` ou o N+1, ele passa por aqui
    message: {
      findFirst: proibido("message.findFirst"),
      findMany: proibido("message.findMany"),
    },
    $queryRaw: async (partes: TemplateStringsArray) => {
      chamadas.push("$queryRaw");
      sqlDaPrevia = partes.join(" ");
      return ultimas;
    },
  } as unknown as PrismaService;

  const readState = {
    async summaries(_userId: string, _username: string, ids: string[]) {
      chamadas.push("readState.summaries");
      return new Map(
        ids.map((id) => [
          id,
          {
            lastMessageAt: new Date("2026-09-09T10:00:00Z"),
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
    { emitToUser() {}, joinChannelRooms() {}, leaveChannelRooms() {} } as unknown as RealtimeService,
    readState,
    {} as FriendsService,
    {} as MessagesService,
    {} as StorageService,
  );
  return { service, chamadas, sql: () => sqlDaPrevia };
}

describe("prévia da última mensagem em GET /dms", () => {
  it("o número de consultas não cresce com o número de conversas", async () => {
    const uma = servico([canal("c0")], [ultima("c0")]);
    await uma.service.list(ANA, ANA);

    const muitas = servico(
      Array.from({ length: 30 }, (_, i) => canal(`c${i}`)),
      Array.from({ length: 30 }, (_, i) => ultima(`c${i}`)),
    );
    await muitas.service.list(ANA, ANA);

    expect(muitas.chamadas).toEqual(uma.chamadas);
    expect(muitas.chamadas.filter((c) => c === "$queryRaw")).toHaveLength(1);
    expect(muitas.chamadas.filter((c) => c === "channel.findMany")).toHaveLength(1);
    // nem `include`, nem uma volta ao banco por conversa
    expect(muitas.chamadas.filter((c) => c.startsWith("message."))).toEqual([]);
  });

  it("uma linha por canal: `DISTINCT ON` com a mais nova primeiro", async () => {
    const { service, sql } = servico([canal("c1")], [ultima("c1")]);
    await service.list(ANA, ANA);
    expect(sql()).toContain('DISTINCT ON (m."channelId")');
    expect(sql()).toContain('ORDER BY m."channelId", m."createdAt" DESC');
  });

  it("todo mundo escreveu algo: nem busca os anexos", async () => {
    const { service, chamadas } = servico([canal("c1")], [ultima("c1")]);
    await service.list(ANA, ANA);
    expect(chamadas).not.toContain("attachment.findMany");
  });

  it("preenche a prévia já aparada, com id, autor, instante e tipo", async () => {
    const { service } = servico([canal("c1")], [ultima("c1", { content: "**bora** hoje" })]);
    const [dm] = await service.list(ANA, ANA);

    expect(dm.ultimaMensagem).toEqual({
      id: "m-c1",
      authorId: BIA,
      content: "bora hoje",
      createdAt: "2026-09-09T10:00:00.000Z",
      tipo: "DEFAULT",
    });
  });

  it("mensagem sem texto vira a linha do anexo (GIF tem a sua)", async () => {
    const { service, chamadas } = servico(
      [canal("c1")],
      [ultima("c1", { content: "" })],
      [{ messageId: "m-c1", contentType: "image/gif" }],
    );
    const [dm] = await service.list(ANA, ANA);
    expect(chamadas).toContain("attachment.findMany");
    expect(dm.ultimaMensagem?.content).toBe("Enviou um GIF");
  });

  it("conversa sem mensagem nenhuma vem com prévia nula, não indefinida", async () => {
    const { service } = servico([canal("c1")], []);
    const [dm] = await service.list(ANA, ANA);
    expect(dm.ultimaMensagem).toBeNull();
  });
});
