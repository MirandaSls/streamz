import { describe, expect, it } from "vitest";
import { FECHAMENTO, VERSAO_DO_GATEWAY } from "../tipos";
import { lerIdentify, lerResume, montarReady } from "./identify";

const IDENTIFY_MINIMO = { token: "abc", intents: 1 };

describe("lerIdentify", () => {
  it("aceita o IDENTIFY que o discord.js manda", () => {
    const lido = lerIdentify({
      token: "  abc  ",
      properties: { os: "linux", browser: "discord.js", device: "discord.js" },
      intents: 33_281,
      compress: false,
      shard: [0, 1],
      large_threshold: 50,
    });

    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.corpo.token).toBe("abc");
    expect(lido.corpo.intents).toBe(33_281);
    expect(lido.corpo.shard).toEqual([0, 1]);
    expect(lido.corpo.large_threshold).toBe(50);
  });

  it("assume shard [0, 1] quando o IDENTIFY não manda shard", () => {
    const lido = lerIdentify(IDENTIFY_MINIMO);
    expect(lido.ok && lido.corpo.shard).toEqual([0, 1]);
  });

  it("recusa shard [0, 2] com 4010 — o Streamz é de um shard só (§13)", () => {
    const lido = lerIdentify({ ...IDENTIFY_MINIMO, shard: [0, 2] });
    expect(lido).toMatchObject({ ok: false, codigo: FECHAMENTO.SHARD_INVALIDO });
  });

  it("recusa shard malformado também com 4010", () => {
    for (const shard of [[0], ["0", "1"], [1, 1], "0,1", 7]) {
      expect(lerIdentify({ ...IDENTIFY_MINIMO, shard })).toMatchObject({
        ok: false,
        codigo: FECHAMENTO.SHARD_INVALIDO,
      });
    }
  });

  it("recusa corpo que não é objeto com 4002", () => {
    for (const d of [null, undefined, "abc", 7, ["token"]]) {
      expect(lerIdentify(d)).toMatchObject({ ok: false, codigo: FECHAMENTO.PAYLOAD_INVALIDO });
    }
  });

  it("recusa token ausente com 4004 — é o único código que faz a lib parar", () => {
    for (const token of [undefined, "", "   ", 7, null]) {
      expect(lerIdentify({ token, intents: 1 })).toMatchObject({
        ok: false,
        codigo: FECHAMENTO.TOKEN_INVALIDO,
      });
    }
  });

  it("recusa intents ausente ou inválido com 4013", () => {
    for (const intents of [undefined, -1, 1.5, "1", null]) {
      expect(lerIdentify({ token: "abc", intents })).toMatchObject({
        ok: false,
        codigo: FECHAMENTO.INTENTS_INVALIDOS,
      });
    }
  });

  it("guarda o bitfield de intents como veio — quem filtra é o lote D", () => {
    // GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT | GUILD_VOICE_STATES
    const pedido = (1 << 0) | (1 << 9) | (1 << 15) | (1 << 7);
    const lido = lerIdentify({ token: "abc", intents: pedido });
    expect(lido.ok && lido.corpo.intents).toBe(pedido);
  });
});

describe("lerResume", () => {
  it("aceita o RESUME do discord.js", () => {
    const lido = lerResume({ token: "abc", session_id: "sess", seq: 42 });
    expect(lido.ok && lido.corpo).toEqual({ token: "abc", session_id: "sess", seq: 42 });
  });

  it("trata seq nulo como zero (o bot nunca viu dispatch)", () => {
    expect(lerResume({ token: "abc", session_id: "sess", seq: null })).toMatchObject({
      ok: true,
      corpo: { seq: 0 },
    });
  });

  it("recusa session_id ausente com 4002 e seq inválido com 4007", () => {
    expect(lerResume({ token: "abc", seq: 1 })).toMatchObject({
      ok: false,
      codigo: FECHAMENTO.PAYLOAD_INVALIDO,
    });
    expect(lerResume({ token: "abc", session_id: "s", seq: -3 })).toMatchObject({
      ok: false,
      codigo: FECHAMENTO.SEQUENCIA_INVALIDA,
    });
  });
});

describe("montarReady", () => {
  const ready = montarReady({
    sessionId: "sessao-1",
    usuario: { id: "222", username: "botzinho", bot: true },
    aplicacao: { id: "111", flags: 0 },
    guildSnowflakes: [333n, 444n],
    resumeGatewayUrl: "ws://localhost:3333/gateway",
  });

  it("traz os três campos que o handler de READY do discord.js acessa", () => {
    expect(ready.user).toBeDefined();
    expect(ready.guilds).toBeDefined();
    expect(ready.application).toBeDefined();
  });

  it("manda as guilds indisponíveis — o GUILD_CREATE é que resolve o ready", () => {
    expect(ready.guilds).toEqual([
      { id: "333", unavailable: true },
      { id: "444", unavailable: true },
    ]);
  });

  it("anuncia v10, um shard e a URL de resume", () => {
    expect(ready.v).toBe(VERSAO_DO_GATEWAY);
    expect(ready.shard).toEqual([0, 1]);
    expect(ready.session_id).toBe("sessao-1");
    expect(ready.resume_gateway_url).toBe("ws://localhost:3333/gateway");
  });

  it("sobrevive ao JSON.stringify — nenhum bigint escapa para o payload", () => {
    expect(() => JSON.stringify(ready)).not.toThrow();
    expect(JSON.parse(JSON.stringify(ready)).guilds[0].id).toBe("333");
  });
});
