import { describe, expect, it } from "vitest";

import { conexoesAExpulsar } from "./voz-em-um-lugar-so";

const conexao = (id: string, voiceChannelId?: string) => ({ id, voiceChannelId });

describe("conexoesAExpulsar", () => {
  it("nunca expulsa quem acabou de entrar", () => {
    const novo = conexao("app", "canal-1");
    expect(conexoesAExpulsar([novo], "app")).toEqual([]);
  });

  it("expulsa a outra conexão que já estava na mesma sala", () => {
    // o caso que quebrava: navegador e app na mesma call. O LiveKit não aceita
    // identidade repetida e derrubava o navegador sem avisar ninguém.
    const conexoes = [conexao("navegador", "canal-1"), conexao("app", "canal-1")];
    expect(conexoesAExpulsar(conexoes, "app").map((c) => c.id)).toEqual(["navegador"]);
  });

  it("expulsa também quando a outra conexão está em outra sala", () => {
    const conexoes = [conexao("navegador", "canal-1"), conexao("app", "canal-2")];
    expect(conexoesAExpulsar(conexoes, "app").map((c) => c.id)).toEqual(["navegador"]);
  });

  it("deixa em paz as abas que não estão em voz", () => {
    const conexoes = [conexao("aba-de-chat"), conexao("navegador", "canal-1"), conexao("app", "canal-1")];
    expect(conexoesAExpulsar(conexoes, "app").map((c) => c.id)).toEqual(["navegador"]);
  });

  it("expulsa todas as outras quando há várias", () => {
    const conexoes = [
      conexao("navegador", "canal-1"),
      conexao("celular", "canal-2"),
      conexao("app", "canal-1"),
    ];
    expect(conexoesAExpulsar(conexoes, "app").map((c) => c.id)).toEqual(["navegador", "celular"]);
  });
});
