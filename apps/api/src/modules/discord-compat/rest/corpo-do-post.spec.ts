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
import { ModerationService } from "../../moderation/moderation.service";
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
  embeds: [{ title: "um embed", description: "que a onda 3 guarda e a web desenha" }],
  // uma action row **válida**: desde a onda 3 os componentes são validados com
  // as regras do Discord, e uma row vazia leva 50035 lá também
  components: [{ type: 1, components: [{ type: 2, style: 1, label: "Ok", custom_id: "ok" }] }],
  flags: 4,
  allowed_mentions: { parse: ["users"], replied_user: false },
  message_reference: { message_id: "1000000000000000000", fail_if_not_exists: false },
};

const criar = vi.fn(async (..._a: unknown[]) => ({ id: "msg_novo", channelId: "canal_1" }));
const emitToChannel = vi.fn();
const apagarEmLote = vi.fn(async (..._a: unknown[]) => ({ deleted: [] as string[] }));

/**
 * Um snowflake de agora e um de 20 dias atrás, montados com o epoch do Discord.
 *
 * A idade do `bulk-delete` sai do **próprio id** (é assim que o Discord valida),
 * então o teste dos 14 dias não precisa de banco nenhum: precisa de dois
 * números.
 */
const snowflakeDe = (quandoMs: number) => String((BigInt(quandoMs) - 1420070400000n) << 22n);
const RECENTE = snowflakeDe(Date.now() - 60_000);
const OUTRA_RECENTE = snowflakeDe(Date.now() - 120_000);
const ANTIGA = snowflakeDe(Date.now() - 20 * 24 * 60 * 60 * 1000);

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
        cuidDeMensagem: async (sf: string) => {
          if (sf === "1000000000000000000") return "msg_citada";
          if (sf === RECENTE) return "msg_a";
          if (sf === OUTRA_RECENTE) return "msg_b";
          if (sf === ANTIGA) return "msg_velha";
          return null;
        },
      },
    },
    { provide: GuildsService, useValue: { assertCanViewChannel: async () => ({}) } },
    // ── onda 3 ── mensagem de bot é `criarComoBot` (embeds e componentes guardados)
    { provide: MessagesService, useValue: { criarComoBot: criar } },
    // F5 membros: quem apaga o lote do `bulk-delete`.
    { provide: ModerationService, useValue: { bulkDelete: apagarEmLote } },
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

    expect(criar).toHaveBeenCalledWith(
      "canal_1",
      "user_bot",
      expect.objectContaining({
        content: "pong",
        attachmentIds: [],
        // `flags: 4` (SUPPRESS_EMBEDS) chega ao service, que a põe na coluna
        flags: 4,
        reply: {
          replyToId: "msg_citada",
          // `allowed_mentions.replied_user: false` desliga o "@ ligado"
          replyMention: false,
        },
      }),
    );
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

  // ── F5 membros → onda 3: embed sozinho é mensagem válida, e é guardado ──

  // O defeito que quem tentou escrever um bot achou: o corpo `{ embeds: [...] }`
  // — o jeito como quase todo bot responde — levava
  // `50035 content[BASE_TYPE_REQUIRED]`. No Discord ele é válido. Na F5 o embed
  // virava texto; na onda 3 ele é guardado como objeto e o texto fica vazio.
  it("corpo só com `embeds` é aceito, e o embed é guardado (não achatado)", async () => {
    criar.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({
        embeds: [{ title: "Nível 5", description: "Parabéns!", fields: [{ name: "XP", value: "1200" }] }],
      }),
    });

    expect(resposta.status).toBe(201);
    const [, , entrada] = criar.mock.calls.at(-1) as unknown as [
      string,
      string,
      { content: string; embeds: unknown[] },
    ];
    expect(entrada.content).toBe("");
    expect(entrada.embeds).toEqual([
      {
        type: "rich",
        title: "Nível 5",
        description: "Parabéns!",
        fields: [{ name: "XP", value: "1200" }],
      },
    ]);
  });

  it("corpo só com `components` também passa, e os componentes ganham `id`", async () => {
    criar.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({
        components: [{ type: 1, components: [{ type: 2, style: 2, label: "Oi", custom_id: "oi" }] }],
      }),
    });

    expect(resposta.status).toBe(201);
    const [, , entrada] = criar.mock.calls.at(-1) as unknown as [string, string, { components: unknown[] }];
    expect(entrada.components).toEqual([
      { type: 1, id: 1, components: [{ type: 2, id: 2, style: 2, label: "Oi", custom_id: "oi" }] },
    ]);
  });

  it("embed fora do limite do Discord leva 50035 com o caminho do campo", async () => {
    criar.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({ embeds: [{ title: "x".repeat(257) }] }),
    });

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as {
      code: number;
      errors: { embeds: { "0": { title: { _errors: { code: string }[] } } } };
    };
    expect(corpo.code).toBe(50035);
    expect(corpo.errors.embeds["0"].title._errors[0]?.code).toBe("BASE_TYPE_MAX_LENGTH");
    expect(criar).not.toHaveBeenCalled();
  });

  it("IS_COMPONENTS_V2 com `content` leva 50035 (regra do Discord)", async () => {
    criar.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({
        content: "não pode",
        flags: 1 << 15,
        components: [{ type: 10, content: "texto" }],
      }),
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50035, errors: { content: {} } });
    expect(criar).not.toHaveBeenCalled();
  });

  it("botão sem `custom_id` leva 50035", async () => {
    criar.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({ components: [{ type: 1, components: [{ type: 2, style: 1, label: "Sem id" }] }] }),
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50035 });
    expect(criar).not.toHaveBeenCalled();
  });

  // ── F5 membros: bulk-delete ─────────────────────────────────

  it("POST /messages/bulk-delete apaga pelo ModerationService e responde 204", async () => {
    apagarEmLote.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages/bulk-delete`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({ messages: [RECENTE, OUTRA_RECENTE] }),
    });

    expect(resposta.status).toBe(204);
    expect(apagarEmLote).toHaveBeenCalledWith("user_bot", "canal_1", ["msg_a", "msg_b"]);
  });

  it("uma mensagem só leva 50035 (o Discord exige de 2 a 100)", async () => {
    apagarEmLote.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages/bulk-delete`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({ messages: [RECENTE] }),
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50035 });
    expect(apagarEmLote).not.toHaveBeenCalled();
  });

  it("mensagem com mais de 14 dias leva 50034 — e o lote inteiro não é apagado", async () => {
    apagarEmLote.mockClear();
    const resposta = await fetch(`${url}/api/v10/channels/999/messages/bulk-delete`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
      body: JSON.stringify({ messages: [RECENTE, ANTIGA] }),
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50034 });
    expect(apagarEmLote).not.toHaveBeenCalled();
  });
});