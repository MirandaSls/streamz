import { describe, expect, it } from "vitest";
import {
  canalExibido,
  canalExibidoAgora,
  canalNaTela,
  type CanalDaMensagem,
  type EstadoDaInterface,
} from "./na-tela";

const DM: CanalDaMensagem = { channelId: "dm-1", guildId: null };
const CANAL: CanalDaMensagem = { channelId: "canal-1", guildId: "g-1" };

/** Conversa aberta na coluna 3: modo DM, Amigos fechada, DM selecionada. */
const CONVERSA_ABERTA: EstadoDaInterface = {
  view: "dm",
  amigosAberta: false,
  dmAtiva: "dm-1",
  canalAtivo: null,
  guildDosCanais: null,
};

const OLHANDO = { visivel: true, comFoco: true };

describe("conversa direta", () => {
  it("está na tela quando é ela que a coluna mostra", () => {
    expect(canalNaTela(DM, CONVERSA_ABERTA, OLHANDO)).toBe(true);
  });

  /**
   * O bug: abrir a conversa e clicar em Amigos. A sala da DM é `sticky` e
   * continua aberta (`useMessages.activeChannelId` ainda aponta para ela), mas
   * quem ocupa a coluna é a página Amigos — a mensagem que chega ali é não
   * lida.
   */
  it("sai da tela ao ir para a página Amigos", () => {
    const amigos = { ...CONVERSA_ABERTA, amigosAberta: true };
    expect(canalExibido(DM, amigos)).toBe(false);
    expect(canalNaTela(DM, amigos, OLHANDO)).toBe(false);
  });

  /** O mesmo bug pelo outro caminho: sair da conversa para um servidor. */
  it("sai da tela ao ir para um servidor", () => {
    const servidor: EstadoDaInterface = {
      ...CONVERSA_ABERTA,
      view: "guild",
      canalAtivo: "canal-1",
      guildDosCanais: "g-1",
    };
    expect(canalExibido(DM, servidor)).toBe(false);
    expect(canalNaTela(DM, servidor, OLHANDO)).toBe(false);
  });

  it("outra conversa selecionada não conta", () => {
    expect(canalExibido(DM, { ...CONVERSA_ABERTA, dmAtiva: "dm-2" })).toBe(false);
  });
});

describe("canal de servidor", () => {
  const SERVIDOR: EstadoDaInterface = {
    view: "guild",
    amigosAberta: false,
    dmAtiva: "dm-1",
    canalAtivo: "canal-1",
    guildDosCanais: "g-1",
  };

  it("está na tela quando é o canal ativo do servidor carregado", () => {
    expect(canalNaTela(CANAL, SERVIDOR, OLHANDO)).toBe(true);
  });

  it("outro canal do mesmo servidor não está na tela", () => {
    expect(canalExibido({ channelId: "canal-2", guildId: "g-1" }, SERVIDOR)).toBe(false);
  });

  /**
   * Coincidência de id entre servidores não pode valer: o canal só está na
   * tela se os canais carregados são os do servidor da mensagem.
   */
  it("mesmo id de canal em outro servidor não está na tela", () => {
    expect(canalExibido({ channelId: "canal-1", guildId: "g-2" }, SERVIDOR)).toBe(false);
  });

  it("no modo DM nenhum canal de servidor está na tela", () => {
    expect(canalExibido(CANAL, { ...SERVIDOR, view: "dm" })).toBe(false);
  });
});

describe("janela", () => {
  it("atrás de outro app nada está na tela (não lida e notifica)", () => {
    expect(canalNaTela(DM, CONVERSA_ABERTA, { visivel: true, comFoco: false })).toBe(false);
    expect(canalNaTela(DM, CONVERSA_ABERTA, { visivel: false, comFoco: true })).toBe(false);
  });
});

describe("canal exibido agora", () => {
  it("devolve a conversa aberta", () => {
    expect(canalExibidoAgora(CONVERSA_ABERTA)).toEqual({ channelId: "dm-1", guildId: null });
  });

  it("devolve nada com a página Amigos na frente", () => {
    expect(canalExibidoAgora({ ...CONVERSA_ABERTA, amigosAberta: true })).toBeNull();
  });

  it("devolve o canal do servidor com o id do servidor junto", () => {
    expect(
      canalExibidoAgora({
        view: "guild",
        amigosAberta: false,
        dmAtiva: "dm-1",
        canalAtivo: "canal-1",
        guildDosCanais: "g-1",
      }),
    ).toEqual({ channelId: "canal-1", guildId: "g-1" });
  });

  it("devolve nada em servidor sem canal escolhido", () => {
    expect(
      canalExibidoAgora({
        view: "guild",
        amigosAberta: false,
        dmAtiva: null,
        canalAtivo: null,
        guildDosCanais: "g-1",
      }),
    ).toBeNull();
  });
});

/**
 * Os três cenários do defeito relatado ("mensagem não marca como lida com a
 * conversa aberta"), escritos como o usuário os descreve. A regra em si não
 * mudou; o que estava errado era a resposta de `janelaTemFoco()` no desktop
 * (ver `lib/foco-da-janela.ts`), e estes testes fixam o contrato que ela
 * alimenta.
 */
describe("mensagem que chega com a conversa aberta", () => {
  it("DM aberta e janela em foco → lida", () => {
    expect(canalNaTela(DM, CONVERSA_ABERTA, { visivel: true, comFoco: true })).toBe(true);
  });

  it("DM aberta e janela atrás → não lida (e é o que faz notificar)", () => {
    expect(canalNaTela(DM, CONVERSA_ABERTA, { visivel: true, comFoco: false })).toBe(false);
  });

  it("Amigos aberto por cima da conversa → não lida, mesmo com foco", () => {
    const amigos = { ...CONVERSA_ABERTA, amigosAberta: true };
    expect(canalNaTela(DM, amigos, { visivel: true, comFoco: true })).toBe(false);
  });
});
