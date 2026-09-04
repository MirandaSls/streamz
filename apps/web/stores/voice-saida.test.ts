import { describe, expect, it } from "vitest";
import { decidirSaida } from "./voice-saida";

describe("decidirSaida", () => {
  it("sair pelo botão avisa o gateway e fecha a coluna quando não há canal na tela", () => {
    // chamada de conversa direta, ou canal de voz que já não é o canal aberto:
    // não existe vista para onde voltar
    expect(decidirSaida("usuario")).toEqual({ avisaGateway: true, fechaColuna: true });
    expect(decidirSaida("fim-da-chamada")).toEqual({ avisaGateway: true, fechaColuna: true });
  });

  it("desligar com o canal de voz ainda aberto mantém a coluna: ela vira a vista do canal", () => {
    // fechá-la mandava a pessoa para o `ChatView` de largura inteira do mesmo
    // canal, sem caminho de volta a não ser clicar no canal outra vez
    expect(decidirSaida("usuario", { canalDeServidorAberto: true })).toEqual({
      avisaGateway: true,
      fechaColuna: false,
    });
    expect(decidirSaida("fim-da-chamada", { canalDeServidorAberto: true })).toEqual({
      avisaGateway: true,
      fechaColuna: false,
    });
  });

  it("expulso pelo servidor não manda voice.leave: ele derrubaria a conexão nova da conta", () => {
    expect(decidirSaida("expulso")).toEqual({ avisaGateway: false, fechaColuna: true });
    // e fecha a coluna mesmo com o canal aberto: a vista com "entrar" ali seria
    // um convite a derrubar o aparelho de onde a conta acabou de entrar
    expect(decidirSaida("expulso", { canalDeServidorAberto: true })).toEqual({
      avisaGateway: false,
      fechaColuna: true,
    });
  });

  it("trocar para outro canal de voz de servidor mantém a coluna: o painel de destino é quem conectou", () => {
    // era o defeito: `disconnect` fechava a coluna e desmontava o painel que
    // acabara de disparar o `connect` — conexão viva, tela sem palco
    expect(decidirSaida("troca-de-sala", { destinoEmServidor: true })).toEqual({
      avisaGateway: true,
      fechaColuna: false,
    });
  });

  it("movido por outra pessoa não manda voice.leave e mantém a coluna", () => {
    // um `voice.leave` chegando depois do move desfaria o próprio move; e a
    // coluna fica porque o destino é sempre outro canal de voz do servidor
    expect(decidirSaida("movido")).toEqual({ avisaGateway: false, fechaColuna: false });
    // `destinoEmServidor` não muda nada aqui: mover só existe entre canais de voz
    expect(decidirSaida("movido", { destinoEmServidor: true })).toEqual({
      avisaGateway: false,
      fechaColuna: false,
    });
  });

  it("trocar para uma chamada em conversa fecha a coluna do servidor", () => {
    // senão o painel antigo reconectaria no canal de voz ao voltar ao servidor
    expect(decidirSaida("troca-de-sala", { destinoEmServidor: false })).toEqual({
      avisaGateway: true,
      fechaColuna: true,
    });
  });
});
