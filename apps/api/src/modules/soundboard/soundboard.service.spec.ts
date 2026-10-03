import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Permission, WS_EVENTS } from "@streamz/shared";
import { SoundboardService } from "./soundboard.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StorageService } from "../storage/storage.service";
import type { VoiceService } from "../voice/voice.service";

/**
 * Tocar som em qualquer call: canal de voz de servidor e conversa direta.
 *
 * O 400 de produção vinha de `resolverSom` recusar `guildId` nulo (DM). A regra
 * agora é uma só: o som tem de ser de um servidor do qual quem toca é membro.
 */
function servico(opts: {
  guildDoCanal: string | null;
  naSala?: string[];
  somDoServidor?: string;
  membroDe?: string[];
}) {
  const { guildDoCanal, naSala = ["ana"], somDoServidor = "g-som", membroDe = [] } = opts;
  const emitToUsers = vi.fn();
  const prisma = {
    soundboardSound: {
      findUnique: vi.fn(async () => ({
        id: "s1",
        guildId: somDoServidor,
        name: "buzina",
        emoji: "",
        volume: 1,
        key: "soundboard/x.mp3",
        contentType: "audio/mpeg",
        size: 10,
        createdById: "bia",
        createdAt: new Date("2026-09-01T10:00:00Z"),
      })),
    },
    guildMember: {
      findUnique: vi.fn(async (args: { where: { userId_guildId: { guildId: string } } }) =>
        membroDe.includes(args.where.userId_guildId.guildId) ? { userId: "ana" } : null,
      ),
    },
    user: {
      findUnique: vi.fn(async () => ({
        id: "ana",
        username: "ana",
        displayName: "Ana",
        avatarUrl: null,
        status: "ONLINE",
      })),
    },
  };
  const guilds = {
    assertCanViewChannel: vi.fn(async () => ({
      channel: { id: "c1", guildId: guildDoCanal, type: guildDoCanal ? "VOICE" : "DM" },
      permissions: Permission.SPEAK,
    })),
  };
  const voice = { membrosDaSala: vi.fn(async () => naSala) };
  const realtime = { emitToUsers };
  const svc = new SoundboardService(
    prisma as unknown as PrismaService,
    guilds as unknown as GuildsService,
    {} as unknown as StorageService,
    realtime as unknown as RealtimeService,
    voice as unknown as VoiceService,
  );
  return { svc, emitToUsers, prisma };
}

describe("SoundboardService.play", () => {
  it("DM + som de servidor onde é membro: emite o evento para a sala", async () => {
    const { svc, emitToUsers } = servico({
      guildDoCanal: null,
      naSala: ["ana", "bia"],
      membroDe: ["g-som"],
    });
    const ev = await svc.play("ana", "c1", "s1");
    expect(ev.guildId).toBeNull();
    expect(ev.sound.id).toBe("s1");
    expect(emitToUsers).toHaveBeenCalledWith(["ana", "bia"], WS_EVENTS.SOUNDBOARD_PLAY, ev);
  });

  it("DM + som de servidor onde não é membro: NotFound e nada é emitido", async () => {
    const { svc, emitToUsers } = servico({ guildDoCanal: null, membroDe: [] });
    await expect(svc.play("ana", "c1", "s1")).rejects.toBeInstanceOf(NotFoundException);
    expect(emitToUsers).not.toHaveBeenCalled();
  });

  it("canal de servidor + som de outro servidor onde é membro: ok", async () => {
    const { svc, emitToUsers } = servico({
      guildDoCanal: "g-call",
      somDoServidor: "g-outro",
      membroDe: ["g-outro"],
    });
    const ev = await svc.play("ana", "c1", "s1");
    expect(ev.guildId).toBe("g-call");
    expect(emitToUsers).toHaveBeenCalledTimes(1);
  });

  it("som do próprio servidor da call: não consulta associação", async () => {
    const { svc, prisma } = servico({ guildDoCanal: "g-som" });
    await svc.play("ana", "c1", "s1");
    expect(prisma.guildMember.findUnique).not.toHaveBeenCalled();
  });

  it("não está na sala: Forbidden", async () => {
    const { svc, emitToUsers } = servico({
      guildDoCanal: null,
      naSala: ["bia"],
      membroDe: ["g-som"],
    });
    await expect(svc.play("ana", "c1", "s1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(emitToUsers).not.toHaveBeenCalled();
  });
});
