import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS } from "@streamz/shared";
import { GuildsService } from "./guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { StorageService } from "../storage/storage.service";
import type { AuditService } from "../audit/audit.service";

/**
 * Expulsar e banir têm de **derrubar a chamada de voz** do ex-membro.
 *
 * `detachFromGuildRooms` sempre tirou os sockets das salas do Socket.IO, e só:
 * quem era expulso no meio de uma chamada continuava com áudio e vídeo no ar,
 * porque o estado de voz mora fora do banco e a credencial do LiveKit não era
 * revogada por ninguém. O desligamento entra pelo plugue
 * `registrarDesligamentoDeVoz` — a seta entre os módulos aponta de voz para
 * servidores, e é a voz que se pluga no boot (ver `VoiceModule`).
 *
 * O que este arquivo trava:
 *  - kick e ban chamam o desligamento, com `(userId, guildId)` na ordem certa;
 *  - ele acontece **antes** de os sockets saírem das salas — o `voice.state`
 *    do desligamento vai para a sala do servidor, e quem já saiu dela não
 *    receberia o próprio desligamento;
 *  - o desligamento falhando **não** desfaz a moderação;
 *  - sem ninguém plugado (o `VoiceModule` ausente num teste) nada quebra.
 */
function servico(opcoes: { falha?: boolean; semPlugue?: boolean } = {}) {
  const ordem: string[] = [];

  const membros = [
    { userId: "dono", guildId: "g1", role: "OWNER", timeoutUntil: null },
    { userId: "ana", guildId: "g1", role: "MEMBER", timeoutUntil: null },
  ];

  const prisma = {
    guild: {
      async findUnique() {
        return { ownerId: "dono" };
      },
    },
    guildMember: {
      async findUnique({ where }: { where: { userId_guildId: { userId: string; guildId: string } } }) {
        return (
          membros.find(
            (m) =>
              m.userId === where.userId_guildId.userId &&
              m.guildId === where.userId_guildId.guildId,
          ) ?? null
        );
      },
      async delete() {
        ordem.push("guildMember.delete");
        return {};
      },
      async deleteMany() {
        ordem.push("guildMember.delete");
        return { count: 1 };
      },
    },
    guildMemberRole: {
      async findMany() {
        return [];
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
    role: {
      async findMany() {
        return [
          {
            id: "everyone",
            guildId: "g1",
            name: "@everyone",
            color: null,
            position: 0,
            permissions: DEFAULT_PERMISSIONS,
            hoist: false,
            mentionable: false,
            isDefault: true,
          },
        ];
      },
    },
    ban: {
      async upsert() {
        ordem.push("ban.upsert");
        return {};
      },
    },
    user: {
      async findUnique() {
        return { username: "ana" };
      },
    },
    channel: {
      async findMany() {
        return [{ id: "c1" }, { id: "voz-1" }];
      },
    },
    async $transaction(ops: unknown[]) {
      return Promise.all(ops as Promise<unknown>[]);
    },
  } as unknown as PrismaService;

  const realtime = {
    emitToGuild() {},
    emitToUser() {},
    leaveChannelRooms: vi.fn(() => {
      ordem.push("leaveChannelRooms");
    }),
    leaveGuildRoom: vi.fn(() => {
      ordem.push("leaveGuildRoom");
    }),
  } as unknown as RealtimeService;

  const audit = { async log() {} } as unknown as AuditService;

  const s = new GuildsService(
    prisma,
    realtime,
    {} as unknown as ReadStateService,
    {} as unknown as StorageService,
    audit,
  );
  const desligamento = vi.fn(async (_userId: string, _guildId: string) => {
    ordem.push("desligarDaVoz");
    if (opcoes.falha) throw new Error("livekit fora do ar");
  });
  // `semPlugue` é o app sem `VoiceModule` — um teste que monta só este service
  if (!opcoes.semPlugue) s.registrarDesligamentoDeVoz(desligamento);
  return { s, ordem, desligamento };
}

describe("kick", () => {
  it("desliga o expulso da voz do servidor", async () => {
    const { s, desligamento } = servico();
    await expect(s.kick("dono", "g1", "ana")).resolves.toEqual({ kicked: "ana" });
    expect(desligamento).toHaveBeenCalledWith("ana", "g1");
  });

  it("desliga antes de tirar os sockets das salas", async () => {
    const { s, ordem } = servico();
    await s.kick("dono", "g1", "ana");
    expect(ordem.indexOf("desligarDaVoz")).toBeLessThan(ordem.indexOf("leaveChannelRooms"));
    expect(ordem.indexOf("desligarDaVoz")).toBeLessThan(ordem.indexOf("leaveGuildRoom"));
  });

  it("o desligamento falhando não desfaz a expulsão", async () => {
    const { s, ordem } = servico({ falha: true });
    await expect(s.kick("dono", "g1", "ana")).resolves.toEqual({ kicked: "ana" });
    expect(ordem).toContain("guildMember.delete");
    expect(ordem).toContain("leaveGuildRoom");
  });

  it("quem não pode expulsar não desliga a voz de ninguém", async () => {
    const { s, desligamento } = servico();
    // ana é MEMBER com o @everyone padrão: sem KICK_MEMBERS
    await expect(s.kick("ana", "g1", "dono")).rejects.toThrow();
    expect(desligamento).not.toHaveBeenCalled();
  });
});

describe("ban", () => {
  it("desliga o banido da voz, e antes das salas", async () => {
    const { s, ordem, desligamento } = servico();
    await expect(s.ban("dono", "g1", "ana", "motivo")).resolves.toEqual({ banned: "ana" });
    expect(desligamento).toHaveBeenCalledWith("ana", "g1");
    // o ban grava primeiro (a reentrada fica barrada mesmo se a voz falhar)
    expect(ordem.indexOf("ban.upsert")).toBeLessThan(ordem.indexOf("desligarDaVoz"));
    expect(ordem.indexOf("desligarDaVoz")).toBeLessThan(ordem.indexOf("leaveChannelRooms"));
  });
});

describe("sem módulo de voz plugado", () => {
  it("kick segue funcionando — o plugue é opcional", async () => {
    const { s, ordem } = servico({ semPlugue: true });
    await expect(s.kick("dono", "g1", "ana")).resolves.toEqual({ kicked: "ana" });
    expect(ordem).not.toContain("desligarDaVoz");
  });
});
