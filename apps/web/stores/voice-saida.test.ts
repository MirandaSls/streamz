import { describe, expect, it } from "vitest";
import { decidirSaida } from "./voice-saida";

describe("decidirSaida", () => {
  it("sair pelo botão avisa o gateway e fecha a coluna do canal de voz", () => {
    expect(decidirSaida("usuario")).toEqual({ avisaGateway: true, fechaColuna: true });
    expect(decidirSaida("fim-da-chamada")).toEqual({ avisaGateway: true, fechaColuna: true });
  });

  it("expulso pelo servidor não manda voice.leave: ele derrubaria a conexão nova da conta", () => {
    expect(decidirSaida("expulso")).toEqual({ avisaGateway: false, fechaColuna: true });
  });

  it("trocar para outro canal de voz de servidor mantém a coluna: o painel de destino é quem conectou", () => {
    // era o defeito: `disconnect` fechava a coluna e desmontava o painel que
    // acabara de disparar o `connect` — conexão viva, tela sem palco
    expect(decidirSaida("troca-de-sala", true)).toEqual({ avisaGateway: true, fechaColuna: false });
  });

  it("trocar para uma chamada em conversa fecha a coluna do servidor", () => {
    // senão o painel antigo reconectaria no canal de voz ao voltar ao servidor
    expect(decidirSaida("troca-de-sala", false)).toEqual({ avisaGateway: true, fechaColuna: true });
  });
});
