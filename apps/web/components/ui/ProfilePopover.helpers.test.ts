import { describe, expect, it } from "vitest";
import type { ComandoDeApp, PublicUser } from "@streamz/shared";
import {
  calcularPodeAbrirVisaoDeModerador,
  comandosDeBarraDoBot,
  rotuloDoBotaoDeAmizade,
} from "./ProfilePopover";

/*
 * Só a parte pura do cartão (leva 2, s7/s8/s9): o resto vive atrás do
 * `Popout`, que se recusa a desenhar sem `document` de verdade
 * (`if (!aberto || typeof document === "undefined") return null;`, ver
 * `primitivos/Popout.tsx`) — e este pacote roda os testes em `environment:
 * "node"`, sem jsdom. Um render de verdade do cartão pediria esse harness
 * (fora do escopo desta entrega); o que dá para travar sem ele é a conta.
 */

describe("calcularPodeAbrirVisaoDeModerador", () => {
  const base = {
    isMe: false,
    guildAtiva: "g1",
    roleDoAlvo: "MEMBER" as const,
    podeExpulsar: false,
    podeBanir: false,
    podeCastigar: false,
  };

  it("nenhuma permissão de moderação: false", () => {
    expect(calcularPodeAbrirVisaoDeModerador(base)).toBe(false);
  });

  it("com MODERATE_MEMBERS: true", () => {
    expect(calcularPodeAbrirVisaoDeModerador({ ...base, podeCastigar: true })).toBe(true);
  });

  it("nunca em mim mesmo, mesmo com permissão", () => {
    expect(calcularPodeAbrirVisaoDeModerador({ ...base, isMe: true, podeBanir: true })).toBe(false);
  });

  it("nunca no dono do servidor", () => {
    expect(calcularPodeAbrirVisaoDeModerador({ ...base, roleDoAlvo: "OWNER", podeExpulsar: true })).toBe(false);
  });

  it("sem servidor aberto: false", () => {
    expect(calcularPodeAbrirVisaoDeModerador({ ...base, guildAtiva: null, podeCastigar: true })).toBe(false);
  });
});

describe("rotuloDoBotaoDeAmizade", () => {
  it("cobre as cinco relações", () => {
    expect(rotuloDoBotaoDeAmizade("none")).toBe("Adicionar amigo");
    expect(rotuloDoBotaoDeAmizade("outgoing")).toBe("Pedido de amizade enviado");
    expect(rotuloDoBotaoDeAmizade("incoming")).toBe("Pedido de amizade recebido");
    expect(rotuloDoBotaoDeAmizade("friend")).toBe("Amigos");
    // "blocked"/"self" não abrem o botão (o cartão nem o desenha), mas a
    // função não pode explodir se for chamada mesmo assim
    expect(rotuloDoBotaoDeAmizade("blocked")).toBe("Adicionar amigo");
  });
});

describe("comandosDeBarraDoBot", () => {
  const bot = usuario("bot1", true);
  const outroBot = usuario("bot2", true);

  function comando(parcial: Partial<ComandoDeApp> & { id: string; name: string; botUser: PublicUser }): ComandoDeApp {
    return {
      snowflake: "1",
      description: "",
      options: [],
      applicationId: "app1",
      applicationName: "FredBoat",
      ...parcial,
    };
  }

  it("só os comandos deste bot, e só os de barra (tipo ausente ou 1)", () => {
    const lista = [
      comando({ id: "c1", name: "play", botUser: bot }),
      comando({ id: "c2", name: "join", botUser: bot, tipo: 1 }),
      comando({ id: "c3", name: "de-outro-bot", botUser: outroBot }),
      comando({ id: "c4", name: "Ação de usuário", botUser: bot, tipo: 2 }),
      comando({ id: "c5", name: "Ação de mensagem", botUser: bot, tipo: 3 }),
    ];
    expect(comandosDeBarraDoBot(lista, bot.id).map((c) => c.name)).toEqual(["play", "join"]);
  });

  it("bot sem comando nenhum: lista vazia", () => {
    expect(comandosDeBarraDoBot([], bot.id)).toEqual([]);
  });
});

function usuario(id: string, bot: boolean): PublicUser {
  return {
    id,
    username: id,
    displayName: null,
    avatarUrl: null,
    status: "ONLINE",
    customStatusText: null,
    customStatusEmoji: null,
    bot,
  };
}
