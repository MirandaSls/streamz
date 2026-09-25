import { describe, expect, it } from "vitest";
import {
  ORIGEM_PADRAO,
  deveEntrarNaChamada,
  deveTrocarATela,
  type OrigemDaAbertura,
} from "./voice-entrada";

/** Atalho: canal de voz, ninguém conectado, só a origem varia. */
const aoAbrir = (origem: OrigemDaAbertura, jaConectadoAqui = false) =>
  deveEntrarNaChamada({ origem, ehCanalDeVoz: true, jaConectadoAqui });

describe("deveEntrarNaChamada", () => {
  it("clicar no canal de voz entra na chamada — é o clique do Discord", () => {
    // o defeito da 0.0.22: o #131 trocou o clique por uma vista com botão, e
    // entrar virou dois cliques
    expect(aoAbrir("clique")).toBe(true);
  });

  it("o balão da linha abre a conversa sem entrar", () => {
    // quem clica no balão pediu para ler o que foi dito no canal; abrir o
    // microfone não estava no pedido
    expect(aoAbrir("balao")).toBe(false);
  });

  it("chegar por link, busca rápida ou histórico não entra", () => {
    // era o que o `useEffect` de montagem fazia: qualquer coisa que montasse o
    // painel conectava, inclusive um link da caixa de entrada
    expect(aoAbrir("navegacao")).toBe(false);
  });

  it("o F5 não entra por aqui: quem decide é a retomada", () => {
    // `retomarSeReconectando` já reconectou (ou decidiu não reconectar) antes
    // de pôr o canal na tela — ver `voice-retomada.ts`
    expect(aoAbrir("retomada")).toBe(false);
  });

  it("clicar de novo no canal em que já estou não reconecta (#122)", () => {
    // uma segunda `Room` com a mesma identidade derruba a primeira: era a
    // queda de alguns segundos que levava a tela compartilhada junto
    expect(aoAbrir("clique", true)).toBe(false);
  });

  it("canal de texto nunca entra, venha de onde vier", () => {
    for (const origem of ["clique", "balao", "navegacao", "retomada"] as const) {
      expect(deveEntrarNaChamada({ origem, ehCanalDeVoz: false, jaConectadoAqui: false })).toBe(
        false,
      );
    }
  });

  it("call site que não declara a origem não entra", () => {
    // o padrão erra para o lado de não abrir o microfone de ninguém
    expect(aoAbrir(ORIGEM_PADRAO)).toBe(false);
  });
});

describe("deveTrocarATela", () => {
  it("clique que entra na call com chat de texto na tela não troca a tela", () => {
    // pedido do dono do produto: entrar na call não é largar a leitura
    expect(
      deveTrocarATela({
        origem: "clique",
        ehCanalDeVoz: true,
        jaConectadoAqui: false,
        chatDeTextoNaTela: true,
      }),
    ).toBe(false);
  });

  it("segundo clique no canal em que já estou, com chat na tela, abre o palco", () => {
    // já conectado: `deveEntrarNaChamada` vira false, o clique deixa de ser
    // "entrar" e vira o pedido explícito de ver o palco
    expect(
      deveTrocarATela({
        origem: "clique",
        ehCanalDeVoz: true,
        jaConectadoAqui: true,
        chatDeTextoNaTela: true,
      }),
    ).toBe(true);
  });

  it("clique que entra na call sem chat de texto na tela troca a tela — comportamento de hoje", () => {
    // coluna já mostra palco ou a vista de outro canal de voz: nada muda
    expect(
      deveTrocarATela({
        origem: "clique",
        ehCanalDeVoz: true,
        jaConectadoAqui: false,
        chatDeTextoNaTela: false,
      }),
    ).toBe(true);
  });

  it("balão com chat de texto na tela troca a tela — não entra na call, então a regra nova não se aplica", () => {
    expect(
      deveTrocarATela({
        origem: "balao",
        ehCanalDeVoz: true,
        jaConectadoAqui: false,
        chatDeTextoNaTela: true,
      }),
    ).toBe(true);
  });

  it("navegação com chat de texto na tela troca a tela", () => {
    expect(
      deveTrocarATela({
        origem: "navegacao",
        ehCanalDeVoz: true,
        jaConectadoAqui: false,
        chatDeTextoNaTela: true,
      }),
    ).toBe(true);
  });

  it("retomada (F5) com chat de texto na tela troca a tela", () => {
    expect(
      deveTrocarATela({
        origem: "retomada",
        ehCanalDeVoz: true,
        jaConectadoAqui: false,
        chatDeTextoNaTela: true,
      }),
    ).toBe(true);
  });

  it("canal de texto (ehCanalDeVoz false) sempre troca a tela", () => {
    // não entra na chamada de jeito nenhum, então a regra nova não entra em jogo
    expect(
      deveTrocarATela({
        origem: "clique",
        ehCanalDeVoz: false,
        jaConectadoAqui: false,
        chatDeTextoNaTela: true,
      }),
    ).toBe(true);
  });
});
