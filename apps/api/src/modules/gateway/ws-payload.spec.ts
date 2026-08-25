import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  messageCreateSchema,
  parseWsPayload,
  reactionSchema,
} from "@newdisc/shared";

/**
 * Os schemas moram no contrato, mas quem depende deles para não gravar lixo no
 * banco é o gateway — por isso o teste vive aqui, do lado de quem valida.
 */
describe("payloads do WebSocket", () => {
  it("aceita mensagem só com texto e mensagem só com anexo", () => {
    expect(parseWsPayload(messageCreateSchema, { channelId: "c1", content: "oi" }).ok).toBe(true);
    expect(
      parseWsPayload(messageCreateSchema, {
        channelId: "c1",
        content: "",
        attachmentIds: ["a1"],
      }).ok,
    ).toBe(true);
  });

  it("recusa mensagem sem texto e sem anexo", () => {
    const r = parseWsPayload(messageCreateSchema, { channelId: "c1", content: "   " });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/vazia/i);
  });

  it("recusa acima do teto em vez de truncar", () => {
    const r = parseWsPayload(messageCreateSchema, {
      channelId: "c1",
      content: "x".repeat(MAX_MESSAGE_LENGTH + 1),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain(String(MAX_MESSAGE_LENGTH));
    // exatamente no teto passa
    expect(
      parseWsPayload(messageCreateSchema, {
        channelId: "c1",
        content: "x".repeat(MAX_MESSAGE_LENGTH),
      }).ok,
    ).toBe(true);
  });

  it("recusa campo obrigatório ausente, com o nome do campo em pt-BR", () => {
    const r = parseWsPayload(messageCreateSchema, { content: "oi" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toBe("channelId: obrigatório");
  });

  it("recusa payload que não é objeto", () => {
    for (const lixo of [null, undefined, "texto", 42, []]) {
      expect(parseWsPayload(messageCreateSchema, lixo).ok).toBe(false);
    }
  });

  it("limita a quantidade de anexos", () => {
    const ids = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) => `a${i}`);
    expect(parseWsPayload(messageCreateSchema, { channelId: "c1", content: "", attachmentIds: ids }).ok).toBe(
      false,
    );
  });

  it("recusa emoji vazio e id absurdamente longo", () => {
    expect(parseWsPayload(reactionSchema, { messageId: "m1", emoji: "" }).ok).toBe(false);
    expect(parseWsPayload(reactionSchema, { messageId: "x".repeat(200), emoji: "👍" }).ok).toBe(false);
  });
});
