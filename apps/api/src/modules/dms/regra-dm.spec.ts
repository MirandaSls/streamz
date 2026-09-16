import { describe, expect, it } from "vitest";
import { ERRO_DM_NAO_PERMITIDA } from "@streamz/shared";
import { DMsService } from "./dms.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { FriendsService } from "../friends/friends.service";
import type { MessagesService } from "../messages/messages.service";
import type { StorageService } from "../storage/storage.service";

/**
 * Privacidade por servidor (item 6 do contrato de menus): `POST /dms` (via
 * `DMsService.openWith`) aplica `aceitaDmDeMembro` **só quando a conversa
 * ainda não existe** e quem abre não é amigo do destinatário — servidor em
 * comum onde o destinatário desligou "Permitir mensagens diretas de membros
 * do servidor" barra, a menos que outro servidor em comum tenha a opção
 * ligada (ou não haja nenhum em comum).
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

function servico(opcoes: {
  amigos: boolean;
  meusServidores?: string[];
  servidoresDoOutro?: { guildId: string; permitirDmsDoServidor: boolean }[];
  conversaJaExiste?: boolean;
}) {
  const meusServidores = opcoes.meusServidores ?? [];
  const servidoresDoOutro = opcoes.servidoresDoOutro ?? [];

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === ANA || where.id === BIA ? usuario(where.id) : null,
    },
    channel: {
      // conversa nova por padrão — só "já existe" quando o cenário pede
      findUnique: async () => (opcoes.conversaJaExiste ? { id: "canal-existente" } : null),
      upsert: async ({ where }: { where: { pairKey: string } }) => ({
        id: opcoes.conversaJaExiste ? "canal-existente" : "canal-novo",
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
        pairKey: where.pairKey,
        createdAt: new Date("2026-09-01T10:00:00Z"),
        members: [
          { userId: ANA, user: usuario(ANA) },
          { userId: BIA, user: usuario(BIA) },
        ],
      }),
    },
    dMHidden: { deleteMany: async () => ({ count: 0 }) },
    dMPin: { findUnique: async () => null },
    guildMember: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        where.userId === ANA
          ? meusServidores.map((guildId) => ({ guildId }))
          : where.userId === BIA
            ? servidoresDoOutro
            : [],
    },
  } as unknown as PrismaService;

  const friends = {
    async assertNotBlocked() {},
    async relationship() {
      return opcoes.amigos ? "friend" : "none";
    },
  } as unknown as FriendsService;

  const realtime = {
    emitToUser() {},
    joinChannelRooms() {},
    leaveChannelRooms() {},
  } as unknown as RealtimeService;

  return new DMsService(
    prisma,
    realtime,
    {} as ReadStateService,
    friends,
    {} as MessagesService,
    {} as StorageService,
  );
}

describe("regra de DM por servidor (POST /dms → DMsService.openWith)", () => {
  it("sem amizade e sem servidor em comum: permite (nada muda)", async () => {
    const service = servico({ amigos: false, meusServidores: ["g1"], servidoresDoOutro: [] });
    await expect(service.openWith(ANA, BIA)).resolves.toBeDefined();
  });

  it("sem amizade, com servidor em comum e a opção ligada: permite", async () => {
    const service = servico({
      amigos: false,
      meusServidores: ["g1"],
      servidoresDoOutro: [{ guildId: "g1", permitirDmsDoServidor: true }],
    });
    await expect(service.openWith(ANA, BIA)).resolves.toBeDefined();
  });

  it("sem amizade, todo servidor em comum com a opção desligada: 403 ERRO_DM_NAO_PERMITIDA", async () => {
    const service = servico({
      amigos: false,
      meusServidores: ["g1", "g2"],
      servidoresDoOutro: [
        { guildId: "g1", permitirDmsDoServidor: false },
        { guildId: "g2", permitirDmsDoServidor: false },
      ],
    });
    await expect(service.openWith(ANA, BIA)).rejects.toThrow(ERRO_DM_NAO_PERMITIDA);
  });

  it("basta um servidor em comum com a opção ligada entre vários: permite", async () => {
    const service = servico({
      amigos: false,
      meusServidores: ["g1", "g2"],
      servidoresDoOutro: [
        { guildId: "g1", permitirDmsDoServidor: false },
        { guildId: "g2", permitirDmsDoServidor: true },
      ],
    });
    await expect(service.openWith(ANA, BIA)).resolves.toBeDefined();
  });

  it("servidor do destinatário que eu não tenho em comum não conta", async () => {
    const service = servico({
      amigos: false,
      meusServidores: ["g1"],
      servidoresDoOutro: [{ guildId: "g-so-dele", permitirDmsDoServidor: false }],
    });
    await expect(service.openWith(ANA, BIA)).resolves.toBeDefined();
  });

  it("amigos: permite mesmo com a opção desligada em todo servidor em comum", async () => {
    const service = servico({
      amigos: true,
      meusServidores: ["g1"],
      servidoresDoOutro: [{ guildId: "g1", permitirDmsDoServidor: false }],
    });
    await expect(service.openWith(ANA, BIA)).resolves.toBeDefined();
  });

  it("conversa que já existe continua abrindo, mesmo que a regra bloquearia uma nova", async () => {
    const service = servico({
      amigos: false,
      meusServidores: ["g1"],
      servidoresDoOutro: [{ guildId: "g1", permitirDmsDoServidor: false }],
      conversaJaExiste: true,
    });
    await expect(service.openWith(ANA, BIA)).resolves.toBeDefined();
  });

  it("painel do administrador (ignorarBloqueio) não aplica a regra", async () => {
    const service = servico({
      amigos: false,
      meusServidores: ["g1"],
      servidoresDoOutro: [{ guildId: "g1", permitirDmsDoServidor: false }],
    });
    await expect(service.openWith(ANA, BIA, { ignorarBloqueio: true })).resolves.toBeDefined();
  });
});
