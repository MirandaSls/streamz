import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModalDeBotAbertoEvent, PublicUser } from "@streamz/shared";

/**
 * ── onda 3 ── A store das interações de componente.
 *
 * O que estes testes protegem:
 *
 * 1. **O nonce é a chave**, não o id da interação: o evento do bot pode chegar
 *    antes da resposta HTTP, e só a sessão que disparou reage.
 * 2. **"Esta interação falhou" é por mensagem**, e some ao clicar de novo.
 * 3. **Resposta velha de autocomplete não sobrescreve a nova.**
 */

const api = vi.hoisted(() => ({
  clicarComponente: vi.fn(async (_c: string, corpo: { nonce: string }) => ({
    id: "i_1",
    nonce: corpo.nonce,
    expiresAt: "2026-09-14T12:15:00.000Z",
  })),
  enviarModalDeBot: vi.fn(async (_c: string, corpo: { nonce: string }) => ({
    id: "i_2",
    nonce: corpo.nonce,
    expiresAt: "2026-09-14T12:15:00.000Z",
  })),
  pedirAutocompleteDeComando: vi.fn(async (_c: string, corpo: { nonce: string }) => ({
    id: "i_3",
    nonce: corpo.nonce,
    expiresAt: "2026-09-14T12:15:00.000Z",
  })),
}));
vi.mock("@/lib/api", () => ({ api }));

import { componenteEstaPendente, useInteracoesDeBot } from "./interacoes-de-bot";

const MENSAGEM = { id: "m_1", channelId: "c_1" };

const BOT: PublicUser = {
  id: "u_bot",
  username: "pixel",
  displayName: "Pixel",
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
} as PublicUser;

function ultimoNonce(espiao: { mock: { calls: unknown[][] } }): string {
  const corpo = espiao.mock.calls.at(-1)?.[1] as { nonce: string };
  return corpo.nonce;
}

beforeEach(() => {
  vi.useFakeTimers();
  useInteracoesDeBot.getState().limparTudo();
  api.clicarComponente.mockClear();
  api.enviarModalDeBot.mockClear();
  api.pedirAutocompleteDeComando.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("clique em botão", () => {
  it("fica pendente até o `interaction.success` com o mesmo nonce", async () => {
    const loja = useInteracoesDeBot.getState();
    await loja.clicarBotao(MENSAGEM, "status:atualizar");

    expect(api.clicarComponente).toHaveBeenCalledWith("c_1", {
      messageId: "m_1",
      customId: "status:atualizar",
      componentType: 2,
      nonce: expect.any(String),
    });
    expect(componenteEstaPendente(useInteracoesDeBot.getState(), "m_1", "status:atualizar")).toBe(true);

    useInteracoesDeBot.getState().aoConcluir({
      interactionId: "i_1",
      nonce: ultimoNonce(api.clicarComponente),
      channelId: "c_1",
      messageId: "m_1",
      customId: "status:atualizar",
    });
    expect(componenteEstaPendente(useInteracoesDeBot.getState(), "m_1", "status:atualizar")).toBe(false);
  });

  it("evento de outra sessão (nonce desconhecido) é ignorado", async () => {
    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "x");
    useInteracoesDeBot.getState().aoFalhar({
      interactionId: "i_9",
      nonce: "de-outra-aba",
      channelId: "c_1",
      messageId: "m_1",
      customId: "x",
      motivo: "sem_resposta",
    });
    expect(useInteracoesDeBot.getState().falhas).toEqual({});
    expect(componenteEstaPendente(useInteracoesDeBot.getState(), "m_1", "x")).toBe(true);
  });

  it("`interaction.failed` marca a mensagem, e clicar de novo apaga o aviso", async () => {
    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "x");
    useInteracoesDeBot.getState().aoFalhar({
      interactionId: "i_1",
      nonce: ultimoNonce(api.clicarComponente),
      channelId: "c_1",
      messageId: "m_1",
      customId: "x",
      motivo: "sem_resposta",
    });
    expect(useInteracoesDeBot.getState().falhas.m_1).toMatchObject({ motivo: "sem_resposta", customId: "x" });

    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "x");
    expect(useInteracoesDeBot.getState().falhas.m_1).toBeUndefined();
  });

  it("sem evento nenhum (socket caído), a rede de segurança falha a interação", async () => {
    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "x");
    vi.advanceTimersByTime(6_001);
    expect(useInteracoesDeBot.getState().falhas.m_1?.motivo).toBe("sem_resposta");
    expect(componenteEstaPendente(useInteracoesDeBot.getState(), "m_1", "x")).toBe(false);
  });

  it("a rota recusou: falha com a mensagem da API", async () => {
    api.clicarComponente.mockRejectedValueOnce(new Error("Componente desabilitado"));
    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "x");
    expect(useInteracoesDeBot.getState().falhas.m_1).toMatchObject({
      motivo: "erro",
      mensagem: "Componente desabilitado",
    });
  });
});

describe("modal", () => {
  const abrir = (nonce: string): ModalDeBotAbertoEvent => ({
    interactionId: "i_1",
    nonce,
    channelId: "c_1",
    applicationId: "app_1",
    bot: BOT,
    modal: {
      custom_id: "relato",
      title: "Relatar",
      components: [{ type: 18, id: 1, label: "O quê?", component: { type: 4, id: 2, custom_id: "t", style: 2 } }],
    },
  });

  it("abre só na sessão que clicou, envia e fecha no `interaction.success`", async () => {
    // outra sessão: não abre
    useInteracoesDeBot.getState().aoAbrirModal(abrir("de-outra-aba"));
    expect(useInteracoesDeBot.getState().modal).toBeNull();

    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "abrir-relato");
    useInteracoesDeBot.getState().aoAbrirModal(abrir(ultimoNonce(api.clicarComponente)));
    expect(useInteracoesDeBot.getState().modal?.modal.title).toBe("Relatar");

    await useInteracoesDeBot.getState().enviarModal([
      { type: 18, id: 1, component: { type: 4, id: 2, custom_id: "t", value: "quebrou" } },
    ]);
    expect(api.enviarModalDeBot).toHaveBeenCalledWith("c_1", {
      interactionId: "i_1",
      customId: "relato",
      components: [{ type: 18, id: 1, component: { type: 4, id: 2, custom_id: "t", value: "quebrou" } }],
      nonce: expect.any(String),
    });
    expect(useInteracoesDeBot.getState().modal?.enviando).toBe(true);

    useInteracoesDeBot.getState().aoConcluir({
      interactionId: "i_2",
      nonce: ultimoNonce(api.enviarModalDeBot),
      channelId: "c_1",
      messageId: null,
      customId: "relato",
    });
    expect(useInteracoesDeBot.getState().modal).toBeNull();
  });

  it("envio que falha deixa o modal aberto com o erro", async () => {
    await useInteracoesDeBot.getState().clicarBotao(MENSAGEM, "abrir-relato");
    useInteracoesDeBot.getState().aoAbrirModal(abrir(ultimoNonce(api.clicarComponente)));
    await useInteracoesDeBot.getState().enviarModal([{ type: 10, id: 1 }]);
    useInteracoesDeBot.getState().aoFalhar({
      interactionId: "i_2",
      nonce: ultimoNonce(api.enviarModalDeBot),
      channelId: "c_1",
      messageId: null,
      customId: "relato",
      motivo: "sem_resposta",
    });
    expect(useInteracoesDeBot.getState().modal).toMatchObject({ enviando: false, erro: "Esta interação falhou" });
  });
});

describe("autocomplete", () => {
  it("resposta de um pedido velho não sobrescreve a do novo", async () => {
    const opcoes = (valor: string) => [{ name: "musica", type: 3, value: valor, focused: true }];
    await useInteracoesDeBot.getState().pedirAutocomplete("c_1", "cmd_1", opcoes("nev"));
    const velho = ultimoNonce(api.pedirAutocompleteDeComando);
    await useInteracoesDeBot.getState().pedirAutocomplete("c_1", "cmd_1", opcoes("never"));
    const novo = ultimoNonce(api.pedirAutocompleteDeComando);

    useInteracoesDeBot.getState().aoReceberAutocomplete({
      interactionId: "i_a",
      nonce: velho,
      choices: [{ name: "velho", value: "v" }],
    });
    expect(useInteracoesDeBot.getState().autocomplete).toMatchObject({ carregando: true, escolhas: [] });

    useInteracoesDeBot.getState().aoReceberAutocomplete({
      interactionId: "i_b",
      nonce: novo,
      choices: [{ name: "Never Gonna Give You Up", value: "ngg" }],
    });
    expect(useInteracoesDeBot.getState().autocomplete).toMatchObject({
      chave: "cmd_1:musica",
      carregando: false,
      escolhas: [{ name: "Never Gonna Give You Up", value: "ngg" }],
    });
  });
});
