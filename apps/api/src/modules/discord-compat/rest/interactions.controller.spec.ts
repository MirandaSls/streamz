import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractionsService } from "../../interactions/interactions.service";
import type { InteracaoAutenticada } from "../../interactions/tipos";
import { DadosDeCompatService } from "../dados.service";
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
 * O terceiro motivo nasceu da prova 3b da fase, com discord.py de verdade: a
 * lib manda **`?with_response=1`** e *parseia o corpo* — com o 204 vazio ela
 * morre em `TypeError: string indices must be integers` lá dentro, e o bot fica
 * pendurado no `defer()` sem uma linha de log. Os testes de `with_response`
 * abaixo são o que impede isso de voltar.
 *
 * O `InteractionsService` é um duplo: o que se prova aqui é a casca — quem é
 * chamado, com o quê, e o que vira status HTTP.
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

/** Depois de responder, a interação tem a mensagem — é o que o `with_response` lê. */
const porTokenDepois = vi.fn(async (token: string) => {
  if (token !== TOKEN) throw interacaoDesconhecida();
  return { ...INTERACAO, responseMessageId: "msg_1", respondedAt: new Date() };
});

const mensagemPorCuid = vi.fn(async () => ({ snowflake: 555n }));

/**
 * ── j-bots ── a efêmera original da interação, quando a resposta foi efêmera.
 *
 * `null` por padrão: quase todo teste daqui é do caminho comum. Quem exercita a
 * efemeridade sobrescreve com uma linha e cobra `response_message_ephemeral`.
 */
const linhaEfemeraOriginalParaCompat = vi.fn(async (): Promise<unknown> => null);

vi.mock("../traducao/mensagem", () => ({
  mensagemParaDiscord: (m: { snowflake: bigint }) => ({ id: String(m.snowflake) }),
}));

@Module({
  controllers: [InteractionCallbackCompatController],
  providers: [
    {
      provide: InteractionsService,
      useValue: { porToken, responder, linhaEfemeraOriginalParaCompat },
    },
    { provide: DadosDeCompatService, useValue: { mensagemPorCuid } },
  ],
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
    mensagemPorCuid.mockClear();
    linhaEfemeraOriginalParaCompat.mockClear();
    linhaEfemeraOriginalParaCompat.mockResolvedValue(null);
  });

  // ── o `?with_response` (o que a prova 3b da fase pegou) ──────

  it("sem `with_response` continua sendo 204 sem corpo", async () => {
    const resposta = await callback(`/${String(INTERACAO.snowflake)}/${TOKEN}/callback`, {
      type: 5,
    });

    expect(resposta.status).toBe(204);
    expect(await resposta.text()).toBe("");
  });

  it("com `?with_response=1` devolve 200 e o InteractionCallbackResponse", async () => {
    porToken.mockImplementationOnce(porTokenDepois).mockImplementationOnce(porTokenDepois);

    const resposta = await callback(
      `/${String(INTERACAO.snowflake)}/${TOKEN}/callback?with_response=1`,
      { type: 5 },
    );

    expect(resposta.status, "204 aqui trava o defer() do discord.py").toBe(200);
    // o `Content-Type` sem charset é o §5: o `json_or_text` do discord.py
    // compara o cabeçalho por igualdade exata
    expect(resposta.headers.get("content-type")).toBe("application/json");

    const corpo = await resposta.json();
    // o `_update` do discord.py lê `data['interaction']` **sem `.get`**
    expect(corpo).toMatchObject({
      interaction: {
        id: String(INTERACAO.snowflake),
        type: 2,
        response_message_id: "555",
        // type 5 é o "pensando…": a mensagem está carregando
        response_message_loading: true,
        response_message_ephemeral: false,
      },
      resource: { type: 5, message: { id: "555" } },
    });
  });

  it("`with_response` de um callback tipo 4 não vem como carregando", async () => {
    porToken.mockImplementationOnce(porTokenDepois).mockImplementationOnce(porTokenDepois);

    const resposta = await callback(
      `/${String(INTERACAO.snowflake)}/${TOKEN}/callback?with_response=true`,
      { type: 4, data: { content: "pong" } },
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      interaction: { response_message_loading: false },
      resource: { type: 4 },
    });
  });

  // ── j-bots: a mensagem efêmera ──────────────────────────────

  it("resposta efêmera: `response_message_ephemeral: true` e o snowflake da efêmera", async () => {
    // Aqui a interação **não** tem `responseMessageId` — a efêmera não é uma
    // `Message` —, e é justamente por isso que o campo tem de sair da consulta
    // à tabela própria. Sem ela o discord.py ficaria sem o
    // `response_message_id` que ele guarda para o `edit_original_response()`.
    linhaEfemeraOriginalParaCompat.mockResolvedValue({ snowflake: 888n });

    const resposta = await callback(
      `/${String(INTERACAO.snowflake)}/${TOKEN}/callback?with_response=1`,
      { type: 4, data: { content: "só você vê", flags: 64 } },
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      interaction: {
        response_message_id: "888",
        // ecoar `false` aqui faria o bot achar que falou para o canal todo
        response_message_ephemeral: true,
      },
      // `flags: 64` de volta é como a lib reconhece a efemeridade
      resource: { type: 4, message: { id: "888", flags: 64 } },
    });
    expect(mensagemPorCuid).not.toHaveBeenCalled();
  });

  it("`with_response=0` e `false` valem como ausente (204)", async () => {
    for (const valor of ["0", "false", ""]) {
      const resposta = await callback(
        `/${String(INTERACAO.snowflake)}/${TOKEN}/callback?with_response=${valor}`,
        { type: 5 },
      );
      expect(resposta.status, `with_response=${valor}`).toBe(204);
    }
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
