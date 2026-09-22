import { describe, expect, it } from "vitest";
import { saidaFoiIntencional } from "./saida-de-voz";

describe("saidaFoiIntencional", () => {
  it("fechar o app ou a aba sai na hora", () => {
    // é o que o Socket.IO manda quando o cliente chama `socket.disconnect()`
    expect(saidaFoiIntencional("client namespace disconnect")).toBe(true);
  });

  it("desconexão vinda do servidor também é intencional", () => {
    expect(saidaFoiIntencional("server namespace disconnect")).toBe(true);
  });

  it.each(["transport close", "transport error", "ping timeout", "parse error"])(
    "queda de conexão (%s) ganha a carência",
    (motivo) => {
      expect(saidaFoiIntencional(motivo)).toBe(false);
    },
  );

  it("motivo desconhecido erra para o lado seguro: carência", () => {
    // errar para "esperou 45 s à toa" incomoda; errar para "derrubou quem só
    // trocou de rede" perde a chamada
    expect(saidaFoiIntencional("motivo que o socket.io ainda não inventou")).toBe(false);
    expect(saidaFoiIntencional(undefined)).toBe(false);
  });
});
