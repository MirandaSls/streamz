import { describe, expect, it } from "vitest";
import { mentionsEveryone, mentionsUser } from "@streamz/shared";
import { parseInline, plainText } from "../markdown-core";

/**
 * `@everyone`/`@here` sem permissão viram texto puro: o composer escapa o `@`
 * com barra invertida (ver `Composer.submit`). Estes testes travam as duas
 * pontas dessa combinação — o contrato deixa de contar a menção, e o markdown
 * deixa de destacá-la.
 */
describe("menção a todos", () => {
  it("reconhece @everyone e @here", () => {
    expect(mentionsEveryone("atenção @everyone")).toBe(true);
    expect(mentionsEveryone("@here alguém aí?")).toBe(true);
  });

  it("não confunde com palavra colada nem com e-mail", () => {
    expect(mentionsEveryone("time@everyone.com")).toBe(false);
    expect(mentionsEveryone("@everyones")).toBe(false);
  });

  it("escapada com barra invertida deixa de contar", () => {
    expect(mentionsEveryone("olha o \\@everyone aqui")).toBe(false);
    expect(mentionsEveryone("\\@here")).toBe(false);
  });

  it("conta como menção a mim — é o aviso que mais importa", () => {
    expect(mentionsUser("@everyone reunião agora", "ana")).toBe(true);
    expect(mentionsUser("@ana e mais ninguém", "ana")).toBe(true);
    expect(mentionsUser("nada comigo", "ana")).toBe(false);
  });

  it("escapada também não avisa a pessoa", () => {
    expect(mentionsUser("\\@everyone só de brincadeira", "ana")).toBe(false);
  });

  it("no markdown a escapada vira texto, não menção", () => {
    const nos = parseInline("\\@everyone");
    expect(nos.every((n) => n.t === "text")).toBe(true);
    expect(plainText(nos)).toBe("@everyone");
    expect(parseInline("@everyone")[0].t).toBe("mention");
  });
});
