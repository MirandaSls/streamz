import { describe, expect, it } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { RegistroDeChamadaService } from "./registro-de-chamada.service";
import type { MessagesService } from "../messages/messages.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * Histórico da chamada na conversa: a mensagem `SYSTEM_CALL` nasce com a
 * chamada, ganha participantes enquanto ela dura e é fechada uma vez só.
 *
 * O Prisma é um banco em memória com só o que o registro usa — a regra
 * testada é "quando cria, quando reemite e quando não faz nada".
 */
interface CallRow {
  id: string;
  messageId: string;
  channelId: string;
  endedAt: Date | null;
  participantIds: string[];
}

function servicos() {
  const mensagens: { id: string; channelId: string; authorId: string; type: string }[] = [];
  const calls: CallRow[] = [];
  const emitidos: { channelId: string; evento: string; dto: { id: string } }[] = [];
  let seq = 0;

  const prisma = {
    message: {
      async create({
        data,
      }: {
        data: {
          channelId: string;
          authorId: string;
          type: string;
          call: { create: { participantIds: string[] } };
        };
      }) {
        const id = `m${++seq}`;
        mensagens.push({ id, channelId: data.channelId, authorId: data.authorId, type: data.type });
        calls.push({
          id: `c${seq}`,
          messageId: id,
          channelId: data.channelId,
          endedAt: null,
          participantIds: [...data.call.create.participantIds],
        });
        return { id };
      },
    },
    call: {
      async findFirst({ where }: { where: { message: { channelId: string } } }) {
        const c = calls.find((x) => x.endedAt === null && x.channelId === where.message.channelId);
        return c ? { id: c.id, messageId: c.messageId, participantIds: [...c.participantIds] } : null;
      },
      async update({ where, data }: { where: { id: string }; data: { participantIds: { push: string } } }) {
        const c = calls.find((x) => x.id === where.id)!;
        c.participantIds.push(data.participantIds.push);
        return c;
      },
      async updateMany({ where, data }: { where: { id?: string }; data: { endedAt: Date } }) {
        const alvo = calls.filter(
          (x) => (where.id === undefined || x.id === where.id) && x.endedAt === null,
        );
        for (const c of alvo) c.endedAt = data.endedAt;
        return { count: alvo.length };
      },
    },
  } as unknown as PrismaService;
  const messages = {
    async getDTO(id: string) {
      return { id };
    },
  } as unknown as MessagesService;
  const realtime = {
    emitToChannel(channelId: string, evento: string, dto: { id: string }) {
      emitidos.push({ channelId, evento, dto });
    },
  } as unknown as RealtimeService;

  const registro = new RegistroDeChamadaService(prisma, messages, realtime);
  const eventos = (evento: string) => emitidos.filter((e) => e.evento === evento);
  return { registro, mensagens, calls, emitidos, eventos };
}

describe("registro de chamada em conversa direta", () => {
  it("abrir cria a mensagem SYSTEM_CALL com a Call e emite message.new", async () => {
    const { registro, mensagens, calls, eventos } = servicos();
    await registro.abrir("dm1", "ana");
    expect(mensagens).toEqual([{ id: "m1", channelId: "dm1", authorId: "ana", type: "SYSTEM_CALL" }]);
    expect(calls[0]).toMatchObject({ messageId: "m1", endedAt: null, participantIds: ["ana"] });
    expect(eventos(WS_EVENTS.MESSAGE_NEW)).toEqual([
      { channelId: "dm1", evento: WS_EVENTS.MESSAGE_NEW, dto: { id: "m1" } },
    ]);
  });

  it("abrir com chamada aberta no canal não cria outra, só inclui o autor", async () => {
    const { registro, mensagens, calls, eventos } = servicos();
    await registro.abrir("dm1", "ana");
    await registro.abrir("dm1", "ana");
    await registro.abrir("dm1", "bia");
    expect(mensagens).toHaveLength(1);
    expect(calls[0].participantIds).toEqual(["ana", "bia"]);
    expect(eventos(WS_EVENTS.MESSAGE_NEW)).toHaveLength(1);
    expect(eventos(WS_EVENTS.MESSAGE_UPDATED)).toHaveLength(1);
  });

  it("dois abrir em paralelo (a mesma chamada nascendo duas vezes) criam uma só", async () => {
    const { registro, mensagens } = servicos();
    await Promise.all([registro.abrir("dm1", "ana"), registro.abrir("dm1", "ana")]);
    expect(mensagens).toHaveLength(1);
  });

  it("participou adiciona uma vez só e emite message.updated", async () => {
    const { registro, calls, eventos } = servicos();
    await registro.abrir("dm1", "ana");
    await registro.participou("dm1", "bia");
    await registro.participou("dm1", "bia");
    await registro.participou("dm1", "ana");
    expect(calls[0].participantIds).toEqual(["ana", "bia"]);
    expect(eventos(WS_EVENTS.MESSAGE_UPDATED)).toEqual([
      { channelId: "dm1", evento: WS_EVENTS.MESSAGE_UPDATED, dto: { id: "m1" } },
    ]);
  });

  it("participou disparado junto com o abrir não se perde (fila por canal)", async () => {
    const { registro, calls } = servicos();
    // quem atende rápido: o `participou` sai antes do `abrir` terminar
    await Promise.all([registro.abrir("dm1", "ana"), registro.participou("dm1", "bia")]);
    expect(calls[0].participantIds).toEqual(["ana", "bia"]);
  });

  it("participou sem chamada aberta não faz nada", async () => {
    const { registro, calls, emitidos } = servicos();
    await registro.participou("dm1", "bia");
    expect(calls).toHaveLength(0);
    expect(emitidos).toHaveLength(0);
  });

  it("fechar grava endedAt e emite message.updated uma vez só", async () => {
    const { registro, calls, eventos } = servicos();
    await registro.abrir("dm1", "ana");
    await Promise.all([registro.fechar("dm1"), registro.fechar("dm1")]);
    await registro.fechar("dm1");
    expect(calls[0].endedAt).toBeInstanceOf(Date);
    expect(eventos(WS_EVENTS.MESSAGE_UPDATED)).toHaveLength(1);
  });

  it("fechar sem chamada aberta não emite", async () => {
    const { registro, emitidos } = servicos();
    await registro.fechar("dm1");
    expect(emitidos).toHaveLength(0);
  });

  it("depois de fechar, abrir cria uma chamada nova", async () => {
    const { registro, mensagens } = servicos();
    await registro.abrir("dm1", "ana");
    await registro.fechar("dm1");
    await registro.abrir("dm1", "bia");
    expect(mensagens.map((m) => m.authorId)).toEqual(["ana", "bia"]);
  });

  it("o boot fecha as chamadas abertas sem emitir nada", async () => {
    const { registro, calls, emitidos } = servicos();
    await registro.abrir("dm1", "ana");
    await registro.abrir("dm2", "bia");
    emitidos.length = 0;
    await registro.onApplicationBootstrap();
    expect(calls.every((c) => c.endedAt instanceof Date)).toBe(true);
    expect(emitidos).toHaveLength(0);
  });

  it("falha no banco é engolida: a promessa resolve e a fila segue", async () => {
    const { registro, mensagens } = servicos();
    const prisma = (registro as unknown as { prisma: { message: { create: unknown } } }).prisma;
    const original = prisma.message.create;
    prisma.message.create = async () => {
      throw new Error("banco fora");
    };
    await expect(registro.abrir("dm1", "ana")).resolves.toBeUndefined();
    prisma.message.create = original;
    await registro.abrir("dm1", "ana");
    expect(mensagens).toHaveLength(1);
  });
});
