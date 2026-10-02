import { EventEmitter } from "node:events";
import { Events, type Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ContextoDoBot } from "../runtime/tipos";
import { ServicoDeMusica } from "./servico";

/**
 * O bot tirado da voz à força — moderador clicando em "Desconectar", kick, ban.
 *
 * O relato era: "ao desconectar ele e tentar mandar o comando no chat
 * novamente ele não entra mais na call". O player do Lavalink sobrevivia à
 * saída, o `/tocar` seguinte o reaproveitava achando que ainda havia voz e
 * nenhum op 4 saía. A API agora manda o `VOICE_STATE_UPDATE` do próprio bot
 * com `channel_id: null` (ver `VozDoGateway.acompanharExpulsao`); estes testes
 * passam esse payload pelo `raw` real do serviço e pela `sendRawData` real do
 * lavalink-client, e conferem o que precisa acontecer do lado do bot.
 */

const SF_BOT = "444555666777888999";
const SF_SERVIDOR = "111222333444555666";
const SF_CANAL = "222333444555666777";

function montar() {
  const cliente = Object.assign(new EventEmitter(), {
    user: { id: SF_BOT, username: "musicabot" },
    guilds: { cache: new Map() },
  });
  const ctx = {
    id: "musica",
    nome: "Música",
    cliente: cliente as unknown as Client,
    log: { debug: vi.fn(), info: vi.fn(), aviso: vi.fn(), erro: vi.fn() },
  } satisfies ContextoDoBot;
  const servico = new ServicoDeMusica(ctx);
  const manager = servico.manager;

  // `init` de verdade abriria o WebSocket com o Lavalink; aqui só o que a
  // `sendRawData` confere: o id do bot e a marca de iniciado.
  vi.spyOn(manager, "init").mockImplementation(async (dados) => {
    manager.options.client = { ...manager.options.client, ...dados };
    (manager as unknown as { initiated: boolean }).initiated = true;
    return manager;
  });

  // Um player tocando no canal. O `destroy` emite o `playerDestroy` como a lib
  // faz no fim do dela — é nesse evento que o serviço esquece a ponte vista.
  const jogador = {
    guildId: SF_SERVIDOR,
    voiceChannelId: SF_CANAL,
    voice: { sessionId: "9f3c", channelId: SF_CANAL },
    node: { sessionId: "no-1", updatePlayer: vi.fn(async () => undefined) },
    getData: () => undefined,
    destroy: vi.fn(async (motivo: string) => {
      manager.emit("playerDestroy", jogador as never, motivo as never);
    }),
  };
  vi.spyOn(manager, "getPlayer").mockImplementation(
    (id: string) => (id === SF_SERVIDOR ? jogador : undefined) as never,
  );

  async function bruto(t: string, d: Record<string, unknown>) {
    cliente.emit(Events.Raw, { op: 0, t, d });
    // a `sendRawData` roda solta (`void`) e tem `await`s por dentro
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }

  return { servico, jogador, bruto };
}

/** O payload que a API despacha ao tirar o bot da voz (`estadoDeVozParaDiscord`). */
function saidaDoBot(campos: Record<string, unknown> = {}) {
  return {
    guild_id: SF_SERVIDOR,
    channel_id: null,
    user_id: SF_BOT,
    session_id: "9f3c",
    deaf: false,
    mute: false,
    self_deaf: false,
    self_mute: false,
    self_video: false,
    self_stream: false,
    suppress: false,
    request_to_speak_timestamp: null,
    ...campos,
  };
}

describe("bot tirado da voz pela API", () => {
  it("o VOICE_STATE_UPDATE nulo do próprio bot destrói o player", async () => {
    const { servico, jogador, bruto } = montar();
    await servico.iniciar();

    await bruto("VOICE_STATE_UPDATE", saidaDoBot());

    // `onDisconnect.destroyPlayer: true` (servico.ts): o player morto é o que
    // faz o próximo `/tocar` criar outro e mandar op 4 de novo
    expect(jogador.destroy).toHaveBeenCalledTimes(1);
    expect(jogador.destroy).toHaveBeenCalledWith("Disconnected");
  });

  it("e o próximo /tocar volta a esperar um VOICE_SERVER_UPDATE novo", async () => {
    const { servico, bruto } = montar();
    await servico.iniciar();
    await bruto("VOICE_SERVER_UPDATE", {
      guild_id: SF_SERVIDOR,
      token: "jwt.da.ponte",
      endpoint: "voz.streamz.chat",
    });
    expect(await servico.esperarPonte(SF_SERVIDOR, 5)).toBe(true);

    await bruto("VOICE_STATE_UPDATE", saidaDoBot());

    // Ponte "já vista" de uma sessão que acabou faria o `play` sair antes de
    // a voz nova existir — e o bot entraria mudo.
    expect(await servico.esperarPonte(SF_SERVIDOR, 5)).toBe(false);
  });

  it("sem session_id a lib descarta o evento — por isso a API manda o da sessão", async () => {
    const { servico, jogador, bruto } = montar();
    await servico.iniciar();

    const { session_id: _semSessao, ...semSessao } = saidaDoBot();
    await bruto("VOICE_STATE_UPDATE", semSessao);

    expect(jogador.destroy).not.toHaveBeenCalled();
  });

  it("a saída de outra pessoa do canal não derruba o player", async () => {
    const { servico, jogador, bruto } = montar();
    await servico.iniciar();

    await bruto("VOICE_STATE_UPDATE", saidaDoBot({ user_id: "555444333222111000" }));

    expect(jogador.destroy).not.toHaveBeenCalled();
  });
});
