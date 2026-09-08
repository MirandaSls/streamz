import { describe, expect, it } from "vitest";
import {
  DESLOCAMENTO_TIMESTAMP,
  EPOCH_DISCORD,
  dataParaSnowflake,
  ehSnowflake,
  snowflakeParaData,
} from "@streamz/shared";

/**
 * Os helpers de snowflake de `@streamz/shared`.
 *
 * O valor em si é gerado pelo **banco** (`streamz_snowflake()`), então o que
 * está aqui é a leitura: extrair a data de um id e montar o cursor de
 * paginação a partir de uma data. Errar o epoch faz toda mensagem do Streamz
 * aparecer datada de 2015 no log de qualquer bot — é a razão de o teste
 * comparar contra uma data real, e não só ida-e-volta.
 *
 * A prova de que a *geração* do banco bate com o `createdAt` da linha está na
 * migration e no PR (o backfill roda contra um Postgres descartável).
 */
describe("snowflake", () => {
  it("usa o epoch do Discord, não o unix", () => {
    expect(EPOCH_DISCORD).toBe(1420070400000n);
    // o id 0 é o instante 0 do Discord: 2015-01-01T00:00:00Z
    expect(snowflakeParaData(0n).toISOString()).toBe("2015-01-01T00:00:00.000Z");
  });

  it("extrai a data de um snowflake real do Discord", () => {
    // Um id publicado pela documentação do Discord, com a data que ela declara.
    expect(snowflakeParaData(175928847299117063n).toISOString()).toBe("2016-04-30T11:18:25.796Z");
  });

  it("monta o snowflake de uma data e volta na mesma data", () => {
    const d = new Date("2026-09-08T13:45:12.345Z");
    const s = dataParaSnowflake(d);
    expect(snowflakeParaData(s).getTime()).toBe(d.getTime());
  });

  it("o snowflake de uma data é o menor daquele milissegundo", () => {
    const d = new Date("2026-09-08T13:45:12.345Z");
    const base = dataParaSnowflake(d);
    // os 22 bits de baixo zerados: qualquer id gerado nesse ms é >= a ele, que
    // é o que faz dele um cursor `after` correto
    expect(base % (1n << DESLOCAMENTO_TIMESTAMP)).toBe(0n);
    expect(base + 1n).toBeGreaterThan(base);
    expect(snowflakeParaData(base + 4095n).getTime()).toBe(d.getTime());
  });

  it("compara: mais novo é sempre maior", () => {
    const antes = dataParaSnowflake(new Date("2026-09-08T13:45:12.345Z"));
    const depois = dataParaSnowflake(new Date("2026-09-08T13:45:12.346Z"));
    expect(depois).toBeGreaterThan(antes);
    // um milissegundo a mais = 2^22 a mais, e não 1: o incremento fica embaixo
    expect(depois - antes).toBe(1n << DESLOCAMENTO_TIMESTAMP);
  });

  it("data anterior a 2015 não gera snowflake negativo", () => {
    // não acontece com dado nosso, mas um `before=` malformado do bot chegaria
    // aqui, e um id negativo quebraria a comparação no banco
    expect(dataParaSnowflake(new Date("2010-01-01T00:00:00Z"))).toBe(0n);
  });

  it("ehSnowflake aceita o que as libs mandam e recusa o nosso cuid", () => {
    expect(ehSnowflake("175928847299117063")).toBe(true);
    expect(ehSnowflake("1382915770057249472")).toBe(true);
    expect(ehSnowflake("clx3k9abc0000xyz123456789")).toBe(false);
    expect(ehSnowflake("12345")).toBe(false);
    expect(ehSnowflake("")).toBe(false);
    expect(ehSnowflake("12345678901234567890123")).toBe(false);
  });
});
