import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApplicationsService } from "../../applications/applications.service";
import { DadosDeCompatService } from "../dados.service";
import { IdsService } from "../ids.service";
import { GuildsService } from "../../guilds/guilds.service";
import { MessagesService } from "../../messages/messages.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { ReacoesDeCompatService } from "../reacoes.service";
import { corpoDeMensagemSchema } from "./corpos";
import { MessagesCompatController } from "./messages.controller";

/**
 * O risco (b) do §12, provado com o pipe global ligado.
 *
 * O `main.ts` instala `new ValidationPipe({ whitelist: true, transform: true })`
 * globalmente. Com `whitelist`, todo campo que não está declarado num DTO de
 * `class-validator` é **apagado antes do handler** — e o discord.js manda
 * `embeds`, `components`, `flags`, `allowed_mentions`, `message_reference`,
 * `tts` e `nonce` em todo `POST /channels/:id/messages`. O sintoma de errar isto
 * é um bot que responde sem citar a mensagem e ninguém sabe por quê.
 *
 * A saída do §5 é `@Body()` com um tipo que não é classe: o metatype que chega
 * ao pipe global é `Object`, e ele não valida (nem faz whitelist de) `Object`.
 * **Isto é raciocínio sobre o Nest, e raciocínio não é prova** — daí este teste
 * subir um app de verdade, com o mesmo pipe do `main.ts`, e olhar o que chegou.
 */

// a tradução é do lote C e ainda lança; aqui só precisamos saber que ela recebeu
// a linha que a casca montou
vi.mock("../traducao/mensagem", () => ({
  mensagemParaDiscord: (m: { snowflake: bigint }) => ({ id: String(m.snowflake) }),
}));

const BOT = {
  applicationId: "app_1",
  applicationSnowflake: 42n,
  applicationName: "Bot de teste",
  botUserId: "user_bot",
  botSnowflake: 7n,
};

/** O corpo exato que um `channel.send()` do discord.js produz. */
const CORPO_DO_DISCORD_JS = {
  content: "pong",
  tts: false,
  nonce: "1382915770057249472",
  embeds: [{ title: "um embed", description: "que a F1 ainda não renderiza" }],
  components: [{ type: 1, components: [] }],
  flags: 4,
  allowed_mentions: { parse: ["users"], replied_user: false },
  message_reference: { message_id: "1000000000000000000", fail_if_not_exists: false },
};

const criar = vi.fn(async () => ({ id: "msg_novo", channelId: "canal_1" }));
const emitToChannel = vi.fn();

@Module({
  controllers: [MessagesCompatController],
  providers: [
    // O guard e o interceptor **não** são substituídos: o Nest constrói todo
    // enhancer de `@UseGuards`/`@UseInterceptors` a partir da classe (ver
    // `Module.addInjectable`), então quem se troca são as dependências deles. O
    // efeito colateral é bom — o caminho do corpo é exercitado com o guard e o
    // rate limit de verdade no meio.
    {
      provide: ApplicationsService,
      useValue: {
        verificarToken: async () => ({
          application: {
            id: BOT.applicationId,
            snowflake: BOT.applicationSnowflake,
            name: BOT.applicationName,
          },
          botUserId: BOT.botUserId,
        }),
      },
    },
    {
      provide: IdsService,
      useValue: {
        snowflakeDeUsuario: async () => BOT.botSnowflake,
        cuidDeCanalOuCategoria: async () => ({ id: "canal_1", tipo: "canal" }),
        cuidDeMensagem: async (sf: string) => (sf === "1000000000000000000" ? "msg_citada" : null),
      },
    },
    { provide: GuildsService, useValue: { assertCanViewChannel: async () => ({}) } },
    { provide: MessagesService, useValue: { create: criar } },
    { provide: RealtimeService, useValue: { emitToChannel } },
    // F5: o controller resolve o emoji da reação por aqui. Este teste é do
    // corpo do POST — nenhuma rota de reação passa por ele.
    { provide: ReacoesDeCompatService, useValue: {} },
    {
      provide: DadosDeCompatService,
      useValue: { mensagemPorCuid: async () => ({ snowflake: 123n }) },
    },
  ],
})
class ModuloDeProva {}

describe("POST /api/v10/channels/:id/messages — o corpo sobrevive ao ValidationPipe global", () => {
  let app: NestExpressApplication;
  let url: string;
  /** O que o pipe do handler recebeu — ou seja, o que sobrou do corpo. */
  const espiao = vi.spyOn(corpoDeMensagemSchema, "safeParse");

  beforeAll(async () => {
    // `abortOnError: false`: sem isso o Nest chama `process.abort()` num erro de
    // injeção, e dentro do worker do vitest isso vira "not supported in workers"
    // em vez da mensagem que diz o que faltou
    app = await NestFactory.create<NestExpressApplication>(ModuloDeProva, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix("api");
    // exatamente o do main.ts — é a razão de este teste existir
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("entrega ao handler os sete campos que o discord.js manda", async () => {
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify(CORPO_DO_DISCORD_JS),
    });

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual({ id: "123" });

    // o que o pipe local viu **depois** de o pipe global ter passado por ele
    const recebido = espiao.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(recebido).toEqual(CORPO_DO_DISCORD_JS);
    // nomeados um a um: se um dia sumir, o teste diz qual
    for (const campo of [
      "content",
      "tts",
      "nonce",
      "embeds",
      "components",
      "flags",
      "allowed_mentions",
      "message_reference",
    ]) {
      expect(recebido, `o ValidationPipe global comeu \`${campo}\``).toHaveProperty(campo);
    }
  });

  it("e usa os campos: a citação vira reply, e o nonce é ecoado no tempo real", async () => {
    criar.mockClear();
    emitToChannel.mockClear();

    await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify(CORPO_DO_DISCORD_JS),
    });

    expect(criar).toHaveBeenCalledWith("canal_1", "user_bot", "pong", undefined, [], {
      replyToId: "msg_citada",
      // `allowed_mentions.replied_user: false` desliga o "@ ligado"
      replyMention: false,
    });
    // o mesmo evento e a mesma forma do chat.gateway, para o navegador ver a
    // resposta do bot sem F5
    expect(emitToChannel).toHaveBeenCalledWith("canal_1", "message.new", {
      id: "msg_novo",
      channelId: "canal_1",
      nonce: "1382915770057249472",
    });
  });

  it("mensagem vazia leva 50035, e não uma linha em branco no canal", async () => {
    criar.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({ content: "   " }),
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50035, message: "Invalid Form Body" });
    expect(criar).not.toHaveBeenCalled();
  });
});
