import { describe, expect, it } from "vitest";
import type { FriendLists, PublicUser } from "@newdisc/shared";
import { agruparBloqueadas } from "@/lib/timeline";
import { relationshipFrom } from "@/stores/friends";
import type { ChatMessage } from "@/stores/messages-core";

function user(id: string): PublicUser {
  return {
    id,
    username: id,
    displayName: null,
    avatarUrl: null,
    status: "ONLINE",
    customStatusText: null,
    customStatusEmoji: null,
  };
}

function msg(id: string, autorId: string): ChatMessage {
  return {
    id,
    channelId: "c1",
    guildId: null,
    author: user(autorId),
    content: id,
    createdAt: "2026-08-25T12:00:00.000Z",
    replyTo: null,
    replyMention: false,
    thread: null,
    pinned: false,
    editedAt: null,
    reactions: [],
    parentId: null,
    replyCount: 0,
    attachments: [],
    type: "DEFAULT",
  };
}

const vazio: FriendLists = { friends: [], incoming: [], outgoing: [], blocked: [] };

describe("relationshipFrom", () => {
  it("eu mesmo vence qualquer lista", () => {
    const lists = { ...vazio, blocked: [user("eu")] };
    expect(relationshipFrom(lists, "eu", "eu")).toBe("self");
  });

  it("bloqueio vence amizade (bloquear desfaz, mas a lista pode estar velha)", () => {
    const lists = { ...vazio, friends: [user("a")], blocked: [user("a")] };
    expect(relationshipFrom(lists, "a", "eu")).toBe("blocked");
  });

  it("distingue pedido recebido de enviado", () => {
    const pedido = (id: string) => ({
      id: `r-${id}`,
      requesterId: id,
      addresseeId: "eu",
      user: user(id),
      createdAt: "2026-08-25T12:00:00.000Z",
    });
    expect(relationshipFrom({ ...vazio, incoming: [pedido("a")] }, "a", "eu")).toBe("incoming");
    expect(relationshipFrom({ ...vazio, outgoing: [pedido("b")] }, "b", "eu")).toBe("outgoing");
  });

  it("desconhecido e id ausente viram none", () => {
    expect(relationshipFrom(vazio, "x", "eu")).toBe("none");
    expect(relationshipFrom(vazio, undefined, "eu")).toBe("none");
  });
});

describe("agruparBloqueadas", () => {
  const bloqueados = new Set(["mau"]);

  it("sem bloqueado, cada mensagem é um bloco", () => {
    const blocos = agruparBloqueadas([msg("m1", "a"), msg("m2", "b")], new Set());
    expect(blocos.map((b) => b.kind)).toEqual(["mensagem", "mensagem"]);
  });

  it("mensagens seguidas de bloqueado viram um bloco só", () => {
    const blocos = agruparBloqueadas(
      [msg("m1", "a"), msg("m2", "mau"), msg("m3", "mau"), msg("m4", "b")],
      bloqueados,
    );
    expect(blocos.map((b) => b.kind)).toEqual(["mensagem", "bloqueadas", "mensagem"]);
    const bloco = blocos[1];
    expect(bloco.kind === "bloqueadas" && bloco.items.map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("mensagem no meio quebra o bloco em dois", () => {
    const blocos = agruparBloqueadas(
      [msg("m1", "mau"), msg("m2", "a"), msg("m3", "mau")],
      bloqueados,
    );
    expect(blocos.map((b) => b.kind)).toEqual(["bloqueadas", "mensagem", "bloqueadas"]);
  });

  it("cada bloco carrega a mensagem anterior da timeline (divisor de data)", () => {
    const blocos = agruparBloqueadas([msg("m1", "a"), msg("m2", "mau")], bloqueados);
    expect(blocos[0].anterior).toBeUndefined();
    expect(blocos[1].anterior?.id).toBe("m1");
  });
});
