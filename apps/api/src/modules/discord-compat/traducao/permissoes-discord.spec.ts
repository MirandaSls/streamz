import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  DM_PERMISSIONS,
  PAR_NO_DISCORD,
  PERMISSAO_DO_DISCORD,
  PERMISSION_ORDER,
  Permission,
  SEMPRE_LIGADAS,
  doBitfieldDoDiscord,
  paraBitfieldDoDiscord,
} from "@streamz/shared";
import { describe, expect, it } from "vitest";

/**
 * A tradução do bitfield (D8, §6 do documento).
 *
 * Mora aqui, e não em `packages/shared`, pelo mesmo motivo que o
 * `snowflake.test.ts` da F0: o pacote `shared` não tem runner de teste
 * (`package.json` dele tem build/dev/typecheck/lint e mais nada), e o
 * `vitest.config.ts` da API coleta `src/**` — é o único lugar onde um teste do
 * pacote de fato roda hoje.
 *
 * Por que testar bit a bit em vez de conferir um número inteiro: um bit trocado
 * não quebra nada visivelmente. Ele faz o bot **desistir antes de tentar** — o
 * `@discordjs/voice` checa `CONNECT`/`SPEAK` e vários bots de música checam
 * `READ_MESSAGE_HISTORY`/`EMBED_LINKS` antes de responder qualquer coisa.
 */

/** Amostra determinística de bitfields válidos (sem `Math.random` num teste). */
function amostraDeBitfields(quantos: number): number[] {
  const valores: number[] = [];
  // xorshift de 32 bits: reprodutível, e só com operações inteiras exatas
  let x = 123456789;
  for (let i = 0; i < quantos; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    valores.push(x & ALL_PERMISSIONS);
  }
  return valores;
}

describe("permissoes-discord", () => {
  it("são 21 permissões, não as 19 do documento", () => {
    // O §6 foi escrito antes de `MOVE_MEMBERS` (1<<19) e `STREAM` (1<<20)
    // existirem. Este teste é o que denuncia o documento se ele voltar a mentir.
    expect(PERMISSION_ORDER).toHaveLength(21);
    expect(Object.keys(Permission)).toHaveLength(21);
    expect(Object.keys(PAR_NO_DISCORD)).toHaveLength(21);
  });

  it("cada uma das 21 tem par e volta como ela mesma", () => {
    for (const nome of PERMISSION_ORDER) {
      const nosso = Permission[nome];
      const deles = paraBitfieldDoDiscord(nosso);
      const par = PERMISSAO_DO_DISCORD[PAR_NO_DISCORD[nome]];
      expect(deles & par, `${nome} não acendeu o bit do Discord`).toBe(par);
      expect(doBitfieldDoDiscord(deles), `${nome} não voltou`).toBe(nosso);
    }
  });

  it("os pares são exatamente os da tabela do §6, mais as duas novas", () => {
    // Escrito à mão de propósito: se alguém mudar `PAR_NO_DISCORD`, este teste
    // discorda antes de um bot de produção discordar.
    const esperado: Record<string, bigint> = {
      VIEW_CHANNEL: 1n << 10n,
      SEND_MESSAGES: 1n << 11n,
      MANAGE_MESSAGES: 1n << 13n,
      MANAGE_CHANNELS: 1n << 4n,
      MANAGE_ROLES: 1n << 28n,
      KICK_MEMBERS: 1n << 1n,
      BAN_MEMBERS: 1n << 2n,
      MANAGE_GUILD: 1n << 5n,
      CREATE_INVITE: 1n << 0n,
      ATTACH_FILES: 1n << 15n,
      ADD_REACTIONS: 1n << 6n,
      MENTION_EVERYONE: 1n << 17n,
      CONNECT: 1n << 20n,
      SPEAK: 1n << 21n,
      MUTE_MEMBERS: 1n << 22n,
      MODERATE_MEMBERS: 1n << 40n,
      MANAGE_EMOJIS: 1n << 30n,
      VIEW_AUDIT_LOG: 1n << 7n,
      ADMINISTRATOR: 1n << 3n,
      // as duas que o §6 dava como "sempre apagadas"
      MOVE_MEMBERS: 1n << 24n,
      STREAM: 1n << 9n,
    };
    for (const nome of PERMISSION_ORDER) {
      expect(PERMISSAO_DO_DISCORD[PAR_NO_DISCORD[nome]], nome).toBe(esperado[nome]);
    }
  });

  it("as sempre-ligadas saem mesmo com bits = 0", () => {
    const vazio = paraBitfieldDoDiscord(0);
    for (const nome of SEMPRE_LIGADAS) {
      expect(vazio & PERMISSAO_DO_DISCORD[nome], nome).toBe(PERMISSAO_DO_DISCORD[nome]);
    }
    // e nenhuma delas inventa permissão nossa na volta
    expect(doBitfieldDoDiscord(vazio)).toBe(0);
  });

  it("SEND_POLLS acende só com SEND_MESSAGES", () => {
    const sem = paraBitfieldDoDiscord(Permission.VIEW_CHANNEL);
    const com = paraBitfieldDoDiscord(Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES);
    expect(sem & PERMISSAO_DO_DISCORD.SEND_POLLS).toBe(0n);
    expect(com & PERMISSAO_DO_DISCORD.SEND_POLLS).toBe(PERMISSAO_DO_DISCORD.SEND_POLLS);
  });

  it("ADMINISTRATOR sozinho não é expandido para tudo", () => {
    // No Discord o próprio bit já significa "tudo", e as libs expandem sozinhas
    // (`PermissionsBitField#has`). Expandir aqui faria a ida-e-volta mentir.
    const deles = paraBitfieldDoDiscord(Permission.ADMINISTRATOR);
    expect(deles & PERMISSAO_DO_DISCORD.ADMINISTRATOR).toBe(PERMISSAO_DO_DISCORD.ADMINISTRATOR);
    expect(deles & PERMISSAO_DO_DISCORD.BAN_MEMBERS).toBe(0n);
    expect(deles & PERMISSAO_DO_DISCORD.MANAGE_GUILD).toBe(0n);
    expect(doBitfieldDoDiscord(deles)).toBe(Permission.ADMINISTRATOR);
  });

  it("bits do Discord sem par são descartados em silêncio", () => {
    const entrada =
      PERMISSAO_DO_DISCORD.MANAGE_THREADS |
      PERMISSAO_DO_DISCORD.MANAGE_WEBHOOKS |
      PERMISSAO_DO_DISCORD.CREATE_PUBLIC_THREADS |
      PERMISSAO_DO_DISCORD.SEND_TTS_MESSAGES |
      PERMISSAO_DO_DISCORD.VIEW_CHANNEL |
      PERMISSAO_DO_DISCORD.SPEAK;
    // não lança: a tela de "Adicionar ao servidor" da F4 ficaria inusável
    expect(doBitfieldDoDiscord(entrada)).toBe(Permission.VIEW_CHANNEL | Permission.SPEAK);
  });

  it("ida-e-volta devolve o bitfield original", () => {
    const casos = [
      0,
      ALL_PERMISSIONS,
      DEFAULT_PERMISSIONS,
      DM_PERMISSIONS,
      ...PERMISSION_ORDER.map((n) => Permission[n]),
      ...amostraDeBitfields(5000),
    ];
    // todos os pares de dois bits também, que é onde uma colisão apareceria
    for (const a of PERMISSION_ORDER) {
      for (const b of PERMISSION_ORDER) casos.push(Permission[a] | Permission[b]);
    }
    for (const x of casos) {
      expect(doBitfieldDoDiscord(paraBitfieldDoDiscord(x)), String(x)).toBe(x);
    }
  });

  it("serializa como string decimal, nunca como number", () => {
    const deles = paraBitfieldDoDiscord(ALL_PERMISSIONS);
    // `SEND_POLLS` é 1<<49: bem além dos 32 bits em que `&`/`|`/`~` do
    // JavaScript operam. Um `number` aqui não é só feio, é errado — e o próprio
    // Discord serializa este campo como string sempre.
    expect(deles).toBeGreaterThan(1n << 32n);
    expect(deles & PERMISSAO_DO_DISCORD.SEND_POLLS).toBe(PERMISSAO_DO_DISCORD.SEND_POLLS);
    expect(String(deles)).toMatch(/^\d+$/);
    expect(JSON.parse(JSON.stringify({ permissions: String(deles) }))).toEqual({
      permissions: String(deles),
    });
    // e o bigint cru continua explodindo alto, como o contrato quer
    expect(() => JSON.stringify({ permissions: deles })).toThrow(TypeError);
  });
});
