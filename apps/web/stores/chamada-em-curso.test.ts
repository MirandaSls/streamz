import { describe, expect, it } from "vitest";
import {
  botaoDeChamadaBloqueado,
  jaNaChamada,
  type ConexaoDeChamada,
} from "@/stores/chamada-em-curso";

const REPOUSO: ConexaoDeChamada = {
  channelId: null,
  status: "idle",
  fase: "idle",
  canalDaChamada: null,
};

/** Estado logo depois do clique no telefone (antes de o `POST` voltar). */
const LIGANDO: ConexaoDeChamada = {
  channelId: "dm1",
  status: "connecting",
  fase: "outgoing",
  canalDaChamada: "dm1",
};

describe("jaNaChamada", () => {
  it("em repouso, ligar é permitido", () => {
    expect(jaNaChamada(REPOUSO, "dm1")).toBe(false);
  });

  it("o segundo clique durante o `connecting` é ignorado", () => {
    expect(jaNaChamada(LIGANDO, "dm1")).toBe(true);
  });

  it("já conectado nesta conversa, ligar de novo não faz nada", () => {
    expect(
      jaNaChamada({ channelId: "dm1", status: "connected", fase: "active", canalDaChamada: "dm1" }, "dm1"),
    ).toBe(true);
  });

  it("a fase `outgoing` sozinha já basta: o `status` ainda pode não ter virado", () => {
    expect(
      jaNaChamada({ channelId: null, status: "idle", fase: "outgoing", canalDaChamada: "dm1" }, "dm1"),
    ).toBe(true);
  });

  it("estar em OUTRA conversa não impede ligar nesta", () => {
    expect(jaNaChamada(LIGANDO, "dm2")).toBe(false);
  });

  it("falha de mídia libera o clique: é o `tentar de novo`", () => {
    expect(
      jaNaChamada({ channelId: "dm1", status: "error", fase: "idle", canalDaChamada: null }, "dm1"),
    ).toBe(false);
  });

  it("chamada encerrada libera o clique", () => {
    expect(
      jaNaChamada({ channelId: null, status: "idle", fase: "ended", canalDaChamada: "dm1" }, "dm1"),
    ).toBe(false);
  });
});

describe("botaoDeChamadaBloqueado", () => {
  it("fica cinza enquanto a chamada sai e enquanto ela dura", () => {
    expect(botaoDeChamadaBloqueado(LIGANDO, "dm1")).toBe(true);
    expect(
      botaoDeChamadaBloqueado(
        { channelId: "dm1", status: "connected", fase: "active", canalDaChamada: "dm1" },
        "dm1",
      ),
    ).toBe(true);
  });

  it("fica cinza com o telefone tocando nesta conversa (atender, não ligar de volta)", () => {
    expect(
      botaoDeChamadaBloqueado(
        { channelId: null, status: "idle", fase: "incoming", canalDaChamada: "dm1" },
        "dm1",
      ),
    ).toBe(true);
  });

  it("um toque de OUTRA conversa não apaga o botão desta", () => {
    expect(
      botaoDeChamadaBloqueado(
        { channelId: null, status: "idle", fase: "incoming", canalDaChamada: "dm2" },
        "dm1",
      ),
    ).toBe(false);
  });

  it("em repouso o botão está vivo", () => {
    expect(botaoDeChamadaBloqueado(REPOUSO, "dm1")).toBe(false);
  });
});
