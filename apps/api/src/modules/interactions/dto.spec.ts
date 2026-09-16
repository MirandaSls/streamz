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
      tipo: 1,
    });
  });

  it("── menus de contexto ── o tipo da faixa sai do `data.type` guardado", () => {
    const deMensagem = toInteracaoDaMensagem({
      id: "i_2",
      commandName: "Traduzir mensagem",
      user: usuario,
      data: { id: "1", name: "Traduzir mensagem", type: 3, target_id: "9" },
    });
    expect(deMensagem).toMatchObject({ name: "Traduzir mensagem", tipo: 3 });

    const deUsuario = toInteracaoDaMensagem({
      id: "i_3",
      commandName: "Ver avatar",
      user: usuario,
      data: { type: 2 },
    });
    expect(deUsuario?.tipo).toBe(2);

    // `data` estranho (ou de antes da entrega) vale como barra
    expect(toInteracaoDaMensagem({ id: "i_4", commandName: "x", user: usuario, data: { type: 9 } })?.tipo).toBe(1);
    expect(toInteracaoDaMensagem({ id: "i_5", commandName: "x", user: usuario, data: null })?.tipo).toBe(1);
  });

  it("o include traz só o que a faixa desenha", () => {
    // consulta a mais por página de mensagens, contra uma tabela pequena e
    // indexada — a linha inteira da interação seria cara por nada. O `data`
    // entrou com os menus de contexto: é de lá que sai o `tipo` da faixa
    expect(INTERACAO_DA_MENSAGEM_INCLUDE.select).toEqual({
      id: true,
      commandName: true,
      user: true,
      data: true,
    });
  });
});
