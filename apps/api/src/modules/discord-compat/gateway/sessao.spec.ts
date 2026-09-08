import { describe, expect, it, vi } from "vitest";
import {
  ABERTO,
  RegistroDeSessoes,
  SessaoWs,
  TETO_DO_BUFFER,
  type SoqueteDeSaida,
} from "./sessao";

/** Um socket de mentira que só anota o que foi escrito. */
function soqueteFalso(readyState = ABERTO) {
  const escritos: string[] = [];
  const fechamentos: { codigo?: number; razao?: string }[] = [];
  const soquete: SoqueteDeSaida & { escritos: string[]; fechamentos: typeof fechamentos } = {
    readyState,
    send: (dado: string) => void escritos.push(dado),
    close: (codigo?: number, razao?: string) => void fechamentos.push({ codigo, razao }),
    escritos,
    fechamentos,
  };
  return soquete;
}

function novaSessao(aoEncerrar?: (s: SessaoWs) => void) {
  return new SessaoWs({
    id: "sessao-1",
    botUserId: "bot-cuid",
    applicationId: "app-cuid",
    intents: 33_281,
    aoEncerrar,
  });
}

describe("SessaoWs.despachar", () => {
  it("numera os dispatches a partir de 1 e escreve no socket", () => {
    const soquete = soqueteFalso();
    const sessao = novaSessao();
    sessao.atender(soquete);

    sessao.despachar("READY", { v: 10 });
    sessao.despachar("MESSAGE_CREATE", { id: "1" });

    expect(soquete.escritos.map((q) => JSON.parse(q))).toEqual([
      { op: 0, d: { v: 10 }, s: 1, t: "READY" },
      { op: 0, d: { id: "1" }, s: 2, t: "MESSAGE_CREATE" },
    ]);
    expect(sessao.sequenciaAtual).toBe(2);
  });

  it("ignora em silêncio depois de fechada — o fan-out não pode quebrar", () => {
    const soquete = soqueteFalso();
    const sessao = novaSessao();
    sessao.atender(soquete);
    sessao.fechar(4000, "tchau");

    expect(() => sessao.despachar("MESSAGE_CREATE", { id: "1" })).not.toThrow();
    expect(soquete.escritos).toHaveLength(0);
  });

  it("acumula no buffer quando não há socket (a janela do RESUME)", () => {
    const sessao = novaSessao();
    sessao.atender(soqueteFalso());
    sessao.despachar("READY", {});
    sessao.desatar();

    sessao.despachar("MESSAGE_CREATE", { id: "1" });
    expect(sessao.sequenciaAtual).toBe(2);
    expect(sessao.morta).toBe(false);
  });

  it("um bigint no payload quebra alto, e sem furar a sequência", () => {
    const sessao = novaSessao();
    sessao.atender(soqueteFalso());
    sessao.despachar("READY", {});

    expect(() => sessao.despachar("MESSAGE_CREATE", { id: 7n })).toThrow(TypeError);
    expect(sessao.sequenciaAtual).toBe(1);
  });

  it("o buffer tem teto e descarta o mais antigo", () => {
    const sessao = novaSessao();
    sessao.atender(soqueteFalso());
    for (let i = 0; i < TETO_DO_BUFFER + 10; i += 1) sessao.despachar("MESSAGE_CREATE", { i });

    // o começo saiu do buffer: retomar de zero é impossível…
    expect(sessao.podeReproduzir(0)).toBe(false);
    // …mas de um ponto que ainda está lá, não.
    expect(sessao.podeReproduzir(TETO_DO_BUFFER + 5)).toBe(true);
  });
});

describe("SessaoWs no RESUME", () => {
  it("reproduz só o que veio depois do seq apresentado", () => {
    const primeiro = soqueteFalso();
    const sessao = novaSessao();
    sessao.atender(primeiro);
    sessao.despachar("READY", {});
    sessao.despachar("GUILD_CREATE", {});
    sessao.desatar();
    sessao.despachar("MESSAGE_CREATE", { id: "1" });

    const segundo = soqueteFalso();
    expect(sessao.podeReproduzir(2)).toBe(true);
    sessao.atender(segundo);
    expect(sessao.reproduzir(2)).toBe(1);

    expect(segundo.escritos.map((q) => JSON.parse(q))).toEqual([
      { op: 0, d: { id: "1" }, s: 3, t: "MESSAGE_CREATE" },
    ]);
  });

  it("recusa um seq do futuro (não é a nossa sessão)", () => {
    const sessao = novaSessao();
    sessao.atender(soqueteFalso());
    sessao.despachar("READY", {});
    expect(sessao.podeReproduzir(99)).toBe(false);
  });

  it("avisa o dono quando morre, para sair do registro", () => {
    const aoEncerrar = vi.fn();
    const sessao = novaSessao(aoEncerrar);
    sessao.atender(soqueteFalso());
    sessao.fechar(4004, "token inválido");

    expect(aoEncerrar).toHaveBeenCalledOnce();
    expect(sessao.morta).toBe(true);
  });
});

describe("RegistroDeSessoes", () => {
  it("indexa por session_id e por bot", () => {
    const registro = new RegistroDeSessoes();
    const a = new SessaoWs({ id: "a", botUserId: "bot-1", applicationId: "app", intents: 0 });
    const b = new SessaoWs({ id: "b", botUserId: "bot-1", applicationId: "app", intents: 0 });
    const c = new SessaoWs({ id: "c", botUserId: "bot-2", applicationId: "app", intents: 0 });
    for (const s of [a, b, c]) registro.registrar(s);

    expect(registro.todas()).toHaveLength(3);
    expect(registro.porBot("bot-1").map((s) => s.id)).toEqual(["a", "b"]);
    expect(registro.porId("c")).toBe(c);

    registro.remover("b");
    expect(registro.porId("b")).toBeNull();
    expect(registro.porBot("bot-1").map((s) => s.id)).toEqual(["a"]);
  });
});
