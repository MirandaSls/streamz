import { describe, expect, it } from "vitest";
import type { PublicUser } from "@streamz/shared";
import { efemeraParaDTO, efemeraParaLinhaDeMensagem, type LinhaEfemera } from "./efemeras";

/**
 * As duas conversões da mensagem efêmera.
 *
 * O que elas protegem:
 *
 * 1. **`efemera: true` sai no DTO.** É o campo inteiro que a tela usa para pôr o
 *    rodapé "Somente você pode ver isso" e para **não** contar a mensagem como
 *    não lida. Perdê-lo faz a efêmera se disfarçar de mensagem comum.
 * 2. **A faixa "@fulano usou /play" continua.** Uma efêmera chega ao chat
 *    sozinha, como qualquer resposta de comando; sem a faixa o bot fala sozinho.
 * 3. **Nada de reação, anexo, fixação ou thread.** Nenhuma delas teria onde ser
 *    gravada — a efêmera não é uma `Message` —, e mostrar o botão seria mentir.
 */

const BOT: PublicUser = {
  id: "u_bot",
  username: "musicbot",
  displayName: null,
} as unknown as PublicUser;

const INVOCADOR: PublicUser = {
  id: "u_1",
  username: "ze",
  displayName: "Zé",
} as unknown as PublicUser;

const LINHA: LinhaEfemera = {
  id: "e_1",
  snowflake: 888n,
  channelId: "c_1",
  ephemeralFor: "u_1",
  content: "Tocando **Never Gonna Give You Up**",
  createdAt: new Date("2026-09-09T12:00:00.000Z"),
  editedAt: null,
};

const CONTEXTO = {
  bot: BOT,
  invocador: INVOCADOR,
  interacaoId: "i_1",
  comando: "play",
  guildId: "g_1",
};

describe("efemeraParaDTO", () => {
  it("marca `efemera: true` e traz a faixa do comando", () => {
    const dto = efemeraParaDTO(LINHA, CONTEXTO);

    expect(dto.efemera).toBe(true);
    expect(dto.id).toBe("e_1");
    expect(dto.channelId).toBe("c_1");
    expect(dto.guildId).toBe("g_1");
    expect(dto.author).toBe(BOT);
    expect(dto.content).toBe("Tocando **Never Gonna Give You Up**");
    expect(dto.createdAt).toBe("2026-09-09T12:00:00.000Z");
    expect(dto.interacao).toEqual({ id: "i_1", name: "play", user: INVOCADOR });
  });

  it("não tem reação, anexo, fixação, thread nem enquete — não há onde gravá-las", () => {
    const dto = efemeraParaDTO(LINHA, CONTEXTO);

    expect(dto.reactions).toEqual([]);
    expect(dto.attachments).toEqual([]);
    expect(dto.pinned).toBe(false);
    expect(dto.thread).toBeNull();
    expect(dto.poll).toBeNull();
    expect(dto.replyTo).toBeNull();
    expect(dto.parentId).toBeNull();
    expect(dto.replyCount).toBe(0);
  });

  it("o `editReply()` aparece como `editedAt`, como em qualquer edição", () => {
    const editada = { ...LINHA, editedAt: new Date("2026-09-09T12:00:30.000Z") };
    expect(efemeraParaDTO(editada, CONTEXTO).editedAt).toBe("2026-09-09T12:00:30.000Z");
  });

  it("em conversa direta o `guildId` é null, e isso não é um erro", () => {
    expect(efemeraParaDTO(LINHA, { ...CONTEXTO, guildId: null }).guildId).toBeNull();
  });
});

describe("efemeraParaLinhaDeMensagem", () => {
  const autor = {
    id: "u_bot",
    snowflake: 222n,
    username: "musicbot",
    displayName: null,
    isBot: true,
  };

  it("leva o snowflake **da efêmera**, que é o que o bot guarda como `@original`", () => {
    const linha = efemeraParaLinhaDeMensagem(LINHA, {
      autor,
      channelSnowflake: 555n,
      guildSnowflake: 333n,
    });

    expect(linha.snowflake).toBe(888n);
    expect(linha.channelSnowflake).toBe(555n);
    expect(linha.guildSnowflake).toBe(333n);
    expect(linha.author).toBe(autor);
    expect(linha.content).toBe(LINHA.content);
    expect(linha.attachments).toEqual([]);
    expect(linha.reactions).toEqual([]);
    expect(linha.respostaA).toBeNull();
    expect(linha.pinned).toBe(false);
  });
});
