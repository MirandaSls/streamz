import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractionsService } from "../../interactions/interactions.service";
import type { InteracaoAutenticada } from "../../interactions/tipos";
import { interacaoDesconhecida, interacaoJaRespondida } from "../erros";
import { InteractionCallbackCompatController } from "./interactions.controller";

/**
 * `POST /api/v10/interactions/:id/:token/callback`.
 *
 * **O teste que justifica o arquivo é o primeiro: nenhuma requisição daqui manda
 * `Authorization`.** O `@discordjs/rest` manda o callback com `auth: false`, e
 * um `BotTokenGuard` nesta rota daria 401 em todo `reply()` e `deferReply()` do
 * planeta (§3.3 do `CONTRATO-F3.md`). Se alguém puser um guard aqui um dia,
 * estes testes ficam vermelhos na hora.
 *
 * O segundo motivo é o mesmo do `corpo-do-post.spec.ts`: com o `ValidationPipe`
 * global e `whitelist: true` ligados, `data.embeds`, `data.components` e
 * `data.flags` **têm** que chegar ao `responder`.
 *
 * O `InteractionsService` é um duplo: o lote A ainda o está preenchendo, e o que
 * se prova aqui é a casca — quem é chamado, com o quê, e o que vira status HTTP.
 */

const TOKEN = "u".repeat(86);

const INTERACAO: InteracaoAutenticada = {
  id: "int_1",
  snowflake: 1234567890123456789n,
  applicationId: "app_1",
  applicationSnowflake: 42n,
  botUserId: "user_bot",
  canalId: "canal_1",
  usuarioId: "user_1",
  guildId: "guild_1",
  responseMessageId: null,
  respondedAt: null,
  expiresAt: new Date(Date.now() + 900_000),
};

const porToken = vi.fn(async (token: string) => {
  if (token !== TOKEN) throw interacaoDesconhecida();
  return INTERACAO;
});
const responder = vi.fn(async () => {});

@Module({
  controllers: [InteractionCallbackCompatController],
  providers: [{ provide: InteractionsService, useValue: { porToken, responder } }],
})
class ModuloDeProva {}

describe("POST /api/v10/interactions/:id/:token/callback", () => {
  let app: NestExpressApplication;
  let url: string;

  /** Manda o callback **sem `Authorization`**, como as libs mandam. */
  const callback = (caminho: string, corpo: unknown) =>
    fetch(`${url}/api/v10/interactions${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(ModuloDeProva, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    porToken.mockClear();
    responder.mockClear();
  });

  it("um deferReply() sem cabeçalho nenhum responde 204 sem corpo", async () => {
    const resposta = await callback(`/${INTERACAO.snowflake}/${TOKEN}/callback`, { type: 5 });

    expect(resposta.status, "401 aqui é guard indevido na rota — ver §3.3").toBe(204);
    expect(await resposta.text()).toBe("");
    expect(responder).toHaveBeenCalledWith(INTERACAO, 5, undefined);
  });

  it("o `data` chega inteiro ao `responder`, com embeds, components e flags", async () => {
    const dados = {
      content: "pong",
      tts: false,
      flags: 64,
      embeds: [{ title: "um embed" }],
      components: [{ type: 1, components: [] }],
      allowed_mentions: { parse: [] },
    };

    await callback(`/${INTERACAO.snowflake}/${TOKEN}/callback`, { type: 4, data: dados });

    const recebido = responder.mock.calls.at(-1) as unknown as [unknown, number, typeof dados];
    expect(recebido[1]).toBe(4);
    for (const campo of ["content", "flags", "embeds", "components", "allowed_mentions"]) {
      expect(recebido[2], `o ValidationPipe global comeu \`data.${campo}\``).toHaveProperty(campo);
    }
  });

  it("token que o service não conhece é 404 10062, e ninguém responde nada", async () => {
    const resposta = await callback(`/${INTERACAO.snowflake}/${"z".repeat(86)}/callback`, {
      type: 4,
      data: { content: "tarde demais" },
    });

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toMatchObject({ code: 10062, message: "Unknown interaction" });
    expect(responder).not.toHaveBeenCalled();
  });

  it("token válido com o `:id` de outra interação é o **mesmo** 404 10062", async () => {
    const resposta = await callback(`/999999999999999999/${TOKEN}/callback`, { type: 4 });

    // 403 contaria que a interação existe para quem não tem o token
    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toMatchObject({ code: 10062 });
    expect(responder).not.toHaveBeenCalled();
  });

  it("o 40060 do segundo callback sai no formato do Discord", async () => {
    responder.mockRejectedValueOnce(interacaoJaRespondida());

    const resposta = await callback(`/${INTERACAO.snowflake}/${TOKEN}/callback`, { type: 4 });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({
      code: 40060,
      message: "Interaction has already been acknowledged.",
    });
  });

  it("corpo sem `type` é 50035", async () => {
    const resposta = await callback(`/${INTERACAO.snowflake}/${TOKEN}/callback`, {
      data: { content: "e o type?" },
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50035 });
    expect(responder).not.toHaveBeenCalled();
  });

  it("o Content-Type do erro é `application/json` pelado — o discord.py compara por igualdade", async () => {
    // no 204 o Express apaga o cabeçalho junto com o corpo, e é o erro que o bot
    // precisa conseguir ler: com `; charset=utf-8` ele chegaria como string
    const resposta = await callback(`/${INTERACAO.snowflake}/${"z".repeat(86)}/callback`, {
      type: 4,
    });
    expect(resposta.headers.get("content-type")).toBe("application/json");
  });
});
