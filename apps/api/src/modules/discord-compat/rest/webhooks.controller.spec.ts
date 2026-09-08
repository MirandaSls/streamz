import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractionsService } from "../../interactions/interactions.service";
import type { InteracaoAutenticada } from "../../interactions/tipos";
import { DadosDeCompatService } from "../dados.service";
import { interacaoDesconhecida } from "../erros";
import { WebhooksCompatController } from "./webhooks.controller";

/**
 * Os followups: `editReply()`, `fetchReply()`, `deleteReply()` e `followUp()`.
 *
 * Como no callback, **nenhuma requisição daqui manda `Authorization`** — o
 * `@discordjs/rest` manda os followups com `auth: false` e o credencial é o
 * `:token` do caminho (§3.3 do `CONTRATO-F3.md`).
 *
 * A outra coisa que este arquivo protege é a **ordem das rotas**:
 * `/messages/@original` está declarado antes de `/messages/:mid`, e sem isso o
 * `@original` casaria como um id — o `editReply()` iria parar no 501 dos
 * followups nomeados em vez de editar o "pensando…".
 */

const TOKEN = "w".repeat(86);

const INTERACAO: InteracaoAutenticada = {
  id: "int_1",
  snowflake: 1234567890123456789n,
  applicationId: "app_1",
  applicationSnowflake: 42n,
  botUserId: "user_bot",
  canalId: "canal_1",
  usuarioId: "user_1",
  guildId: "guild_1",
  responseMessageId: "msg_1",
  respondedAt: new Date(),
  expiresAt: new Date(Date.now() + 900_000),
};

const porToken = vi.fn(async (token: string) => {
  if (token !== TOKEN) throw interacaoDesconhecida();
  return INTERACAO;
});
// os dois parâmetros são declarados para o `mock.calls` ficar tipado — é como
// se lê o que a casca entregou ao lote A
const editarOriginal = vi.fn(async (_i: unknown, _dados: unknown) => ({ id: "msg_1" }));
const lerOriginal = vi.fn(async (_i: unknown) => ({ id: "msg_1" }));
const apagarOriginal = vi.fn(async (_i: unknown) => {});
const followup = vi.fn(async (_i: unknown, _dados: unknown) => ({ id: "msg_2" }));

/** A tradução é da F1 e já tem teste próprio; aqui só interessa que ela rodou. */
vi.mock("../traducao/mensagem", () => ({
  mensagemParaDiscord: (m: { snowflake: bigint }) => ({ id: String(m.snowflake) }),
}));

const mensagemPorCuid = vi.fn(async (id: string) => ({
  snowflake: id === "msg_1" ? 555n : 556n,
}));

@Module({
  controllers: [WebhooksCompatController],
  providers: [
    {
      provide: InteractionsService,
      useValue: { porToken, editarOriginal, lerOriginal, apagarOriginal, followup },
    },
    { provide: DadosDeCompatService, useValue: { mensagemPorCuid } },
  ],
})
class ModuloDeProva {}

describe("/api/v10/webhooks/:app/:token", () => {
  let app: NestExpressApplication;
  let url: string;

  /** Sem `Authorization`, sempre — é o ponto. */
  const chamar = (caminho: string, init: RequestInit = {}) =>
    fetch(`${url}/api/v10/webhooks${caminho}`, {
      ...init,
      headers: { "content-type": "application/json" },
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
    for (const espiao of [porToken, editarOriginal, lerOriginal, apagarOriginal, followup]) {
      espiao.mockClear();
    }
  });

  // O defeito que a prova 3 da fase pegou e que nenhum teste desta suíte
  // pegava: o `@discordjs/rest` manda `%40original`, e o Express casa rota pelo
  // caminho **cru** — a rota literal `messages/@original` não pega essa forma.
  // O `editReply()` de todo bot discord.js caía no 501 dos followups nomeados.
  it("PATCH /messages/%40original (o que o discord.js manda de verdade) edita igual", async () => {
    const resposta = await chamar(`/42/${TOKEN}/messages/%40original`, {
      method: "PATCH",
      body: JSON.stringify({ content: "pong" }),
    });

    expect(resposta.status, "501 aqui é o `%40` caindo no followup nomeado").toBe(200);
    expect(await resposta.json()).toEqual({ id: "555" });
    expect(editarOriginal).toHaveBeenCalledWith(
      INTERACAO,
      expect.objectContaining({ content: "pong" }),
    );
  });

  it("GET e DELETE também aceitam o `%40original`", async () => {
    expect((await chamar(`/42/${TOKEN}/messages/%40original`)).status).toBe(200);
    expect(lerOriginal).toHaveBeenCalledWith(INTERACAO);

    const apagou = await chamar(`/42/${TOKEN}/messages/%40original`, { method: "DELETE" });
    expect(apagou.status).toBe(204);
    expect(apagarOriginal).toHaveBeenCalledWith(INTERACAO);
  });

  it("um followup nomeado de verdade continua levando 501", async () => {
    const resposta = await chamar(`/42/${TOKEN}/messages/1546965150089609227`, {
      method: "PATCH",
      body: JSON.stringify({ content: "editar followup é F5" }),
    });

    expect(resposta.status).toBe(501);
    expect(await resposta.json()).toMatchObject({ code: 20012 });
    expect(editarOriginal).not.toHaveBeenCalled();
  });

  it("PATCH /messages/@original edita, sem cabeçalho nenhum, e devolve a mensagem", async () => {
    const resposta = await chamar(`/42/${TOKEN}/messages/@original`, {
      method: "PATCH",
      body: JSON.stringify({ content: "pong", embeds: [], components: [] }),
    });

    expect(resposta.status, "401 aqui é guard indevido na rota — ver §3.3").toBe(200);
    // o id da resposta é o **snowflake** relido, e não o cuid do DTO: um cuid ali
    // viraria um id inválido que a lib usaria em toda rota seguinte
    expect(await resposta.json()).toEqual({ id: "555" });
    expect(editarOriginal).toHaveBeenCalledWith(
      INTERACAO,
      expect.objectContaining({ content: "pong" }),
    );
  });

  it("o `data` do editReply() sobrevive ao ValidationPipe global", async () => {
    await chamar(`/42/${TOKEN}/messages/@original`, {
      method: "PATCH",
      body: JSON.stringify({
        content: "pong",
        flags: 64,
        embeds: [{ title: "um embed" }],
        components: [{ type: 1, components: [] }],
        allowed_mentions: { parse: [] },
      }),
    });

    const recebido = editarOriginal.mock.calls.at(-1)?.[1] as unknown as Record<string, unknown>;
    for (const campo of ["content", "flags", "embeds", "components", "allowed_mentions"]) {
      expect(recebido, `o ValidationPipe global comeu \`${campo}\``).toHaveProperty(campo);
    }
  });

  it("GET /messages/@original é o fetchReply()", async () => {
    const resposta = await chamar(`/42/${TOKEN}/messages/@original`);
    expect(resposta.status).toBe(200);
    expect(lerOriginal).toHaveBeenCalledWith(INTERACAO);
  });

  it("DELETE /messages/@original é 204 sem corpo", async () => {
    const resposta = await chamar(`/42/${TOKEN}/messages/@original`, { method: "DELETE" });
    expect(resposta.status).toBe(204);
    expect(await resposta.text()).toBe("");
    expect(apagarOriginal).toHaveBeenCalledWith(INTERACAO);
  });

  it("POST no webhook é o followUp(): 200 com a mensagem nova", async () => {
    const resposta = await chamar(`/42/${TOKEN}`, {
      method: "POST",
      body: JSON.stringify({ content: "e mais uma coisa" }),
    });

    // 200, como o Discord — o `webhook.send()` espera o corpo de volta
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ id: "556" });
    expect(followup).toHaveBeenCalledWith(
      INTERACAO,
      expect.objectContaining({ content: "e mais uma coisa" }),
    );
  });

  it("`@original` não é casado como um `:mid`", async () => {
    // o teste que protege a ordem das rotas: se `/messages/:mid` fosse
    // declarado antes, isto seria 501 e o `editReply()` nunca editaria nada
    await chamar(`/42/${TOKEN}/messages/@original`, {
      method: "PATCH",
      body: JSON.stringify({ content: "x" }),
    });
    expect(editarOriginal).toHaveBeenCalled();
  });

  it("followup nomeado (`/messages/:id`) é 501 20012, e não o 404 do Nest", async () => {
    const resposta = await chamar(`/42/${TOKEN}/messages/1000000000000000001`, {
      method: "PATCH",
      body: JSON.stringify({ content: "x" }),
    });

    expect(resposta.status).toBe(501);
    expect(await resposta.json()).toMatchObject({ code: 20012 });
  });

  it("token que não existe é 404 10062", async () => {
    const resposta = await chamar(`/42/${"z".repeat(86)}/messages/@original`);
    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toMatchObject({ code: 10062, message: "Unknown interaction" });
    expect(lerOriginal).not.toHaveBeenCalled();
  });

  it("`:app` de outro aplicativo é o **mesmo** 404 10062, e não 403", async () => {
    const resposta = await chamar(`/999/${TOKEN}/messages/@original`, {
      method: "PATCH",
      body: JSON.stringify({ content: "x" }),
    });

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toMatchObject({ code: 10062 });
    expect(editarOriginal).not.toHaveBeenCalled();
  });
});
