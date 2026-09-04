import { beforeEach, describe, expect, it } from "vitest";
import type { FriendRequest, PublicUser } from "@streamz/shared";
import { useFriends } from "./friends";

/**
 * Os tratadores de evento de `stores/friends` — a parte que o gateway aciona.
 *
 * Todos precisam ser **idempotentes**: o cliente que fez a ação já aplicou o
 * resultado de forma otimista, e o evento chega logo depois pela sala
 * `user:<id>` (é ela que carrega as duas sessões da mesma conta). Aplicar duas
 * vezes não pode duplicar linha nem devolver alguém a uma lista de onde saiu.
 */

function pessoa(id: string): PublicUser {
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

function pedido(id: string, de: string): FriendRequest {
  return {
    id,
    requesterId: de,
    addresseeId: "eu",
    user: pessoa(de),
    createdAt: "2026-09-03T12:00:00.000Z",
  };
}

beforeEach(() => {
  useFriends.setState({ friends: [], incoming: [], outgoing: [], blocked: [] });
});

describe("handleRequest", () => {
  it("o pedido que me mandaram entra em Pendentes", () => {
    useFriends.getState().handleRequest(pedido("f1", "bia"), "incoming");
    expect(useFriends.getState().incoming.map((r) => r.id)).toEqual(["f1"]);
    expect(useFriends.getState().outgoing).toEqual([]);
  });

  it("o pedido que EU mandei de outro aparelho entra em Enviados", () => {
    useFriends.getState().handleRequest(pedido("f1", "bia"), "outgoing");
    expect(useFriends.getState().outgoing.map((r) => r.id)).toEqual(["f1"]);
    expect(useFriends.getState().incoming).toEqual([]);
  });

  it("o mesmo pedido duas vezes não vira duas linhas", () => {
    useFriends.getState().handleRequest(pedido("f1", "bia"), "incoming");
    useFriends.getState().handleRequest(pedido("f1", "bia"), "incoming");
    expect(useFriends.getState().incoming).toHaveLength(1);
  });
});

describe("handleAccepted", () => {
  it("tira o pedido dos dois lados e põe o amigo, uma vez só", () => {
    useFriends.setState({ incoming: [pedido("f1", "bia")] });
    useFriends.getState().handleAccepted(pessoa("bia"));
    useFriends.getState().handleAccepted(pessoa("bia"));
    expect(useFriends.getState().friends.map((f) => f.id)).toEqual(["bia"]);
    expect(useFriends.getState().incoming).toEqual([]);
  });
});

describe("handleBlocked", () => {
  it("bloquear tira de amigos e pedidos e põe em Bloqueados", () => {
    useFriends.setState({
      friends: [pessoa("bia")],
      incoming: [pedido("f1", "bia")],
      outgoing: [pedido("f2", "bia")],
    });
    useFriends.getState().handleBlocked(pessoa("bia"), true);
    const s = useFriends.getState();
    expect(s.friends).toEqual([]);
    expect(s.incoming).toEqual([]);
    expect(s.outgoing).toEqual([]);
    expect(s.blocked.map((b) => b.id)).toEqual(["bia"]);
  });

  it("bloquear duas vezes não duplica a linha em Bloqueados", () => {
    useFriends.getState().handleBlocked(pessoa("bia"), true);
    useFriends.getState().handleBlocked(pessoa("bia"), true);
    expect(useFriends.getState().blocked).toHaveLength(1);
  });

  it("desbloquear tira da lista, e de novo não faz nada", () => {
    useFriends.setState({ blocked: [pessoa("bia")] });
    useFriends.getState().handleBlocked(pessoa("bia"), false);
    useFriends.getState().handleBlocked(pessoa("bia"), false);
    expect(useFriends.getState().blocked).toEqual([]);
  });
});

describe("handleRemoved", () => {
  it("some das três listas de relação, quantas vezes chegar", () => {
    useFriends.setState({
      friends: [pessoa("bia"), pessoa("caio")],
      incoming: [pedido("f1", "bia")],
      outgoing: [pedido("f2", "bia")],
    });
    useFriends.getState().handleRemoved("bia");
    useFriends.getState().handleRemoved("bia");
    const s = useFriends.getState();
    expect(s.friends.map((f) => f.id)).toEqual(["caio"]);
    expect(s.incoming).toEqual([]);
    expect(s.outgoing).toEqual([]);
  });
});
