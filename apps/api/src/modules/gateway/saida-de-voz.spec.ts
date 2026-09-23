import { describe, expect, it } from "vitest";
import { saidaFoiIntencional } from "./saida-de-voz";

describe("saidaFoiIntencional", () => {
  it("fechar o app sai na hora", () => {
    // é o que o Socket.IO manda quando o cliente chama `socket.disconnect()`
    expect(saidaFoiIntencional("client namespace disconnect")).toBe(true);
  });

  it.each(["server namespace disconnect", "forced close"])(
    "desconexão vinda do servidor (%s) também é intencional",
    (motivo) => {
      // quem foi desligado (conta desativada no meio, expulsão) não vai voltar:
      // a carência só o deixaria 45 s de fantasma na sala
      expect(saidaFoiIntencional(motivo)).toBe(true);
    },
  );

  it.each(["transport close", "transport error", "ping timeout", "parse error"])(
    "queda de conexão (%s) ganha a carência",
    (motivo) => {
      expect(saidaFoiIntencional(motivo)).toBe(false);
    },
  );

  it("instância caindo não é a pessoa saindo: a chamada sobrevive ao restart", () => {
    // no `server shutting down` quem sai é o processo, e o cliente reconecta —
    // é exatamente para isso que a carência existe
    expect(saidaFoiIntencional("server shutting down")).toBe(false);
  });

  it("motivo desconhecido erra para o lado seguro: carência", () => {
    // errar para "esperou 45 s à toa" incomoda; errar para "derrubou quem só
    // trocou de rede" perde a chamada
    expect(saidaFoiIntencional("motivo que o socket.io ainda não inventou")).toBe(false);
    expect(saidaFoiIntencional(undefined)).toBe(false);
  });
});
