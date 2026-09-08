import { describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { FriendsService } from "./friends.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * d-social: bloquear tira a conversa da coluna de quem bloqueou.
 *
 * Antes, `block()` apagava a `Friendship` e nada mais: a DM continuava na barra
 * lateral, e bastava uma mensagem do bloqueado para ela pular de volta ao topo
 * (`DMsService.list` reexibe conversa fechada com mensagem mais nova que o
 * fechamento). Agora ela sai junto com o bloqueio, e não volta — quem foi
 * bloqueado já não escreve nela (`MessagesService.assertDMNaoBloqueada`).
 *
 * A `Channel` da DM 1-a-1 usa a mesma chave canônica do par que a `Friendship`,
 * por isso achá-la é uma consulta só.
 */

const ANA = "ana";
const BIA = "bia";
const CANAL = "dm1";

function montar(temDM: boolean) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: BIA, username: BIA }) },
    channel: { findUnique: vi.fn().mockResolvedValue(temDM ? { id: CANAL } : null) },
    friendship: { deleteMany: vi.fn().mockReturnValue({ op: "friendship.deleteMany" }) },
    block: { upsert: vi.fn().mockReturnValue({ op: "block.upsert" }) },
    dMHidden: { upsert: vi.fn().mockReturnValue({ op: "dMHidden.upsert" }) },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
  return { service: new FriendsService(prisma, realtime), prisma, realtime };
}

describe("bloquear esconde a DM de quem bloqueou", () => {
  it("marca a conversa como fechada para quem bloqueou, na mesma transação", async () => {
    const { service, prisma } = montar(true);
    await service.block(ANA, BIA);

    expect(prisma.channel.findUnique).toHaveBeenCalledWith({
      where: { pairKey: `${ANA}:${BIA}` },
      select: { id: true },
    });
    expect(prisma.dMHidden.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_channelId: { userId: ANA, channelId: CANAL } },
      }),
    );
    // o esconder acompanha o bloqueio: ou os dois gravam, ou nenhum
    const operacoes = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as { op: string }[];
    expect(operacoes.map((o) => o.op)).toContain("dMHidden.upsert");
    expect(operacoes.map((o) => o.op)).toContain("block.upsert");
  });

  it("a conversa some das minhas conexões, e só das minhas", async () => {
    const { service, realtime } = montar(true);
    await service.block(ANA, BIA);
    expect(realtime.emitToUser).toHaveBeenCalledWith(ANA, WS_EVENTS.CHANNEL_DELETED, {
      channelId: CANAL,
      guildId: null,
    });
    // quem foi bloqueado não pode notar nada além da relação sumindo
    expect(realtime.emitToUser).not.toHaveBeenCalledWith(
      BIA,
      WS_EVENTS.CHANNEL_DELETED,
      expect.anything(),
    );
  });

  it("sem conversa aberta entre os dois, bloquear segue funcionando", async () => {
    const { service, prisma, realtime } = montar(false);
    await expect(service.block(ANA, BIA)).resolves.toMatchObject({ id: BIA });
    expect(prisma.dMHidden.upsert).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalledWith(
      ANA,
      WS_EVENTS.CHANNEL_DELETED,
      expect.anything(),
    );
  });
});
