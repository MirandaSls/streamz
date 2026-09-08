import { describe, expect, it } from "vitest";
import { INTERACAO_DA_MENSAGEM_INCLUDE, toInteracaoDaMensagem } from "./dto";

/**
 * A faixa "@fulano usou /play".
 *
 * O que o teste protege: a faixa sai do `include` da mensagem (e não de uma
 * consulta à parte), e o nome do comando vem da **cópia** guardada na linha da
 * interação — não da linha do comando, que o `PUT` do `deploy-commands.js`
 * apaga toda vez que o dono do bot re-registra.
 */

const usuario = {
  id: "u_1",
  username: "ze",
  displayName: "Zé",
  avatarUrl: null,
  status: "ONLINE" as const,
  isBot: false,
};

describe("toInteracaoDaMensagem", () => {
  it("é null para mensagem que não veio de uma interação", () => {
    expect(toInteracaoDaMensagem(null)).toBeNull();
    expect(toInteracaoDaMensagem(undefined)).toBeNull();
  });

  it("leva o nome do comando e quem digitou", () => {
    const faixa = toInteracaoDaMensagem({ id: "i_1", commandName: "play", user: usuario });

    expect(faixa).toEqual({
      id: "i_1",
      name: "play",
      user: expect.objectContaining({ id: "u_1", username: "ze", bot: false }),
    });
  });

  it("o include traz só o que a faixa desenha", () => {
    // consulta a mais por página de mensagens, contra uma tabela pequena e
    // indexada — trazer a linha inteira da interação (o `data` do payload!)
    // seria caro por nada
    expect(INTERACAO_DA_MENSAGEM_INCLUDE.select).toEqual({
      id: true,
      commandName: true,
      user: true,
    });
  });
});
