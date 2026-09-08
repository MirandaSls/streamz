import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import {
  assinarHs256,
  endpointDaPonte,
  ENDPOINT_PADRAO_DA_PONTE,
  VALIDADE_DO_TOKEN_DA_PONTE_S,
  VoiceService,
} from "./voice.service";

/**
 * O JWT do `VOICE_SERVER_UPDATE` — a fronteira entre a API e a ponte em Go
 * (§3 do `apps/ponte-voz/CONTRATO-F2.md`).
 *
 * **Os nomes dos campos são contrato e não mudam de um lado só**: a
 * `Reivindicacao` de `sessao.go` os lê exatamente assim. Um `expect` a menos
 * aqui é um bot que conecta, não decifra nada e não diz por quê.
 *
 * O teste também **mede o tamanho** do token: o §D5.8 lista "o `token` passar de
 * 1 KB" como o risco nº 1 do Lavalink, e o número tem de estar no PR — medido,
 * não estimado.
 */

const SEGREDO = "um-segredo-de-ponte-de-16+";
const CHAVE_LK = "devkey";
const SEGREDO_LK = "3f9a1c7e5b2d8046a1f3c9e7b5d2048613f9a1c7e5b2d8046a1f3c9e7b5d20486";

function servico(): VoiceService {
  // O `VoiceService` só toca em Prisma/Realtime/Guilds nos caminhos de estado
  // de voz; assinar token não passa por nenhum deles.
  return new VoiceService(
    {} as unknown as GuildsService,
    {} as unknown as PrismaService,
    {} as unknown as RealtimeService,
  );
}

function partes(token: string) {
  const [cabecalho, corpo, assinatura] = token.split(".");
  return {
    cabecalho: JSON.parse(Buffer.from(cabecalho, "base64url").toString("utf8")),
    corpo: JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")),
    assinatura,
    conteudo: `${cabecalho}.${corpo}`,
  };
}

const DADOS = {
  botSnowflake: "1420000000000000000",
  guildSnowflake: "1418000000000000000",
  sessionId: "9f3c1d2e4a5b6c7d8e9f0a1b2c3d4e5f",
  canalId: "clx9abcdefghijklmnopqrstu",
  canalSnowflake: "1419000000000000000",
  nome: "Bot de música",
};

describe("assinarHs256", () => {
  it("produz as três partes em base64url **sem padding** (é o que o golang-jwt lê)", () => {
    const token = assinarHs256({ a: 1 }, SEGREDO);
    expect(token.split(".")).toHaveLength(3);
    expect(token).not.toContain("=");
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    const { cabecalho, conteudo, assinatura } = partes(token);
    expect(cabecalho).toEqual({ alg: "HS256", typ: "JWT" });
    expect(assinatura).toBe(
      createHmac("sha256", SEGREDO).update(conteudo).digest().toString("base64url"),
    );
  });

  it("segredo errado não valida — é o que a ponte fecha com 4004", () => {
    const { conteudo, assinatura } = partes(assinarHs256({ a: 1 }, SEGREDO));
    const outra = createHmac("sha256", "outro").update(conteudo).digest().toString("base64url");
    expect(outra).not.toBe(assinatura);
  });
});

describe("endpointDaPonte", () => {
  const original = process.env.PONTE_VOZ_ENDPOINT;
  afterEach(() => {
    if (original === undefined) delete process.env.PONTE_VOZ_ENDPOINT;
    else process.env.PONTE_VOZ_ENDPOINT = original;
  });

  it("cai no padrão quando a variável não vem", () => {
    delete process.env.PONTE_VOZ_ENDPOINT;
    expect(endpointDaPonte({})).toBe(ENDPOINT_PADRAO_DA_PONTE);
    expect(endpointDaPonte({ PONTE_VOZ_ENDPOINT: "  " })).toBe(ENDPOINT_PADRAO_DA_PONTE);
  });

  it("tira esquema, porta e caminho: as libs montam wss://<endpoint>/?v=8 sozinhas", () => {
    expect(endpointDaPonte({ PONTE_VOZ_ENDPOINT: "voz.streamz.chat" })).toBe("voz.streamz.chat");
    expect(endpointDaPonte({ PONTE_VOZ_ENDPOINT: "wss://voz.streamz.chat:443/" })).toBe(
      "voz.streamz.chat",
    );
    expect(endpointDaPonte({ PONTE_VOZ_ENDPOINT: "ponte:8080" })).toBe("ponte");
  });
});

describe("VoiceService.assinarTokenDaPonte", () => {
  beforeEach(() => {
    process.env.PONTE_VOZ_SEGREDO = SEGREDO;
    process.env.LIVEKIT_API_KEY = CHAVE_LK;
    process.env.LIVEKIT_API_SECRET = SEGREDO_LK;
    process.env.LIVEKIT_URL = "wss://livekit.streamz.chat";
    process.env.PONTE_VOZ_ENDPOINT = "voz.streamz.chat";
  });

  afterEach(() => {
    delete process.env.PONTE_VOZ_SEGREDO;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
    delete process.env.PONTE_VOZ_ENDPOINT;
  });

  it("tem o shape exato do §3 — campo por campo", async () => {
    const antes = Math.floor(Date.now() / 1000);
    const { token, endpoint } = await servico().assinarTokenDaPonte(DADOS);
    const { cabecalho, corpo, conteudo, assinatura } = partes(token);

    expect(cabecalho).toEqual({ alg: "HS256", typ: "JWT" });
    expect(Object.keys(corpo).sort()).toEqual(
      ["aud", "canal", "exp", "gid", "iat", "ident", "iss", "lk", "lkUrl", "nome", "sala", "sid", "sub"].sort(),
    );
    expect(corpo.iss).toBe("streamz-api");
    expect(corpo.aud).toBe("ponte-voz");
    expect(corpo.sub).toBe(DADOS.botSnowflake);
    expect(corpo.gid).toBe(DADOS.guildSnowflake);
    expect(corpo.sid).toBe(DADOS.sessionId);
    expect(corpo.sala).toBe(`voice:${DADOS.canalId}`);
    expect(corpo.canal).toBe(DADOS.canalSnowflake);
    expect(corpo.nome).toBe(DADOS.nome);
    // §D5.6: a identidade no LiveKit é `bot:<snowflake>`
    expect(corpo.ident).toBe(`bot:${DADOS.botSnowflake}`);
    expect(corpo.lkUrl).toBe("wss://livekit.streamz.chat");
    expect(typeof corpo.lk).toBe("string");
    expect(endpoint).toBe("voz.streamz.chat");

    // Assinatura conferível com o mesmo segredo, como a ponte faz.
    expect(assinatura).toBe(
      createHmac("sha256", SEGREDO).update(conteudo).digest().toString("base64url"),
    );

    // `exp` de 15 minutos — não os 60 s do documento (§3, divergência 1).
    expect(corpo.exp - corpo.iat).toBe(VALIDADE_DO_TOKEN_DA_PONTE_S);
    expect(VALIDADE_DO_TOKEN_DA_PONTE_S).toBe(900);
    expect(corpo.iat).toBeGreaterThanOrEqual(antes);
    expect(corpo.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("o token do LiveKit lá dentro tem os grants do §D5.6 e vale 6 h", async () => {
    const { token } = await servico().assinarTokenDaPonte(DADOS);
    const lk = partes(token).corpo.lk as string;
    const dentro = JSON.parse(Buffer.from(lk.split(".")[1], "base64url").toString("utf8"));

    expect(dentro.sub).toBe(`bot:${DADOS.botSnowflake}`);
    expect(dentro.name).toBe(DADOS.nome);
    expect(dentro.video).toMatchObject({
      room: `voice:${DADOS.canalId}`,
      roomJoin: true,
      canPublish: true,
      // bot de música não escuta ninguém (§D5.6)
      canSubscribe: false,
      canPublishData: false,
    });
    // 6 h, e não a 1 h do `assinarToken` de hoje (§3, divergência 2): o TTL do
    // LiveKit vale na **entrada** na sala. O SDK do LiveKit não põe `iat` — ele
    // marca `nbf`, e é dele que a validade se mede.
    expect(dentro.exp - dentro.nbf).toBe(6 * 60 * 60);
  });

  it("mede o tamanho — o risco nº 1 do §D5.8", async () => {
    const { token, tamanho } = await servico().assinarTokenDaPonte(DADOS);
    expect(tamanho).toBe(token.length);
    const lk = partes(token).corpo.lk as string;
    // O número que vai no PR. Não é `toBeLessThan(1024)` para o teste não virar
    // um alarme falso se alguém puser um nome de aplicação comprido — o que
    // importa é a ordem de grandeza e o registro.
    console.log(
      `[medida] JWT da ponte: ${tamanho} bytes (token do LiveKit dentro: ${lk.length} bytes)`,
    );
    expect(tamanho).toBeGreaterThan(400);
    expect(tamanho).toBeLessThan(2048);
  });

  it("sem PONTE_VOZ_SEGREDO recusa em vez de assinar com undefined", async () => {
    delete process.env.PONTE_VOZ_SEGREDO;
    await expect(servico().assinarTokenDaPonte(DADOS)).rejects.toThrow(/PONTE_VOZ_SEGREDO/);
  });

  it("sem as credenciais do LiveKit recusa: não há sala em que entrar", async () => {
    delete process.env.LIVEKIT_API_SECRET;
    await expect(servico().assinarTokenDaPonte(DADOS)).rejects.toThrow(/LiveKit/);
  });
});
