import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { TEXTO_PENSANDO, WS_EVENTS, type Message as MessageDTO } from "@streamz/shared";
import type { PrismaService } from "../../prisma/prisma.service";
import type { DadosDeCompatService } from "../discord-compat/dados.service";
import type { RegistroDeSessoes, SessaoDoBot } from "../discord-compat/gateway/sessao";
import type { IdsService } from "../discord-compat/ids.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { MessagesService } from "../messages/messages.service";
import type { RealtimeService } from "../realtime/realtime.service";
import { InteractionsService } from "./interactions.service";
import { TIPO_DE_CALLBACK, VALIDADE_DA_INTERACAO_MS, type InteracaoAutenticada } from "./tipos";

/**
 * O domínio das interações.
 *
 * O que estes testes protegem, em ordem de quanto custa errar:
 *
 * 1. **O `INTERACTION_CREATE` sai direto na sessão do bot**, sem intent e sem
 *    passar pela ponte de eventos, e com todo id em string decimal — um
 *    `bigint` num `JSON.stringify` lança, e um campo faltando levanta dentro da
 *    lib do bot, onde não há log nenhum.
 * 2. **Callback duplicado é escrita condicional**, não `if` depois de leitura:
 *    dois callbacks quase simultâneos passariam pelos dois `if` e criariam duas
 *    mensagens.
 * 3. **O emit do `message.new` é nosso**: o bot não tem socket, e sem o emit a
 *    resposta só aparece com F5.
 *
 * Ver `CONTRATO-F3.md` §4 e §3.4.
 */

// ── as linhas de mentira ─────────────────────────────────────

const USUARIO = {
  id: "u_1",
  snowflake: 111n,
  username: "ze",
  displayName: "Zé",
  isBot: false,
};

const BOT = { id: "u_bot", snowflake: 222n, username: "musicbot", displayName: null, isBot: true };

const CANAL = {
  id: "c_1",
  snowflake: 555n,
  guildId: "g_1",
  guildSnowflake: 333n,
  name: "geral",
  type: "TEXT" as const,
  position: 0,
  topic: null,
  nsfw: false,
  slowmodeSeconds: 0,
  categoriaSnowflake: null,
  destinatarios: [],
};

const MEMBRO = {
  user: USUARIO,
  cargoSnowflakes: [444n],
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  timeoutUntil: null,
};

const COMANDO = {
  id: "cmd_1",
  snowflake: 999n,
  name: "play",
  options: [{ name: "url", description: "o link", type: 3, required: true }],
  guildId: "g_1",
  applicationId: "app_1",
  application: { id: "app_1", snowflake: 666n, botUserId: BOT.id },
};

function mensagemDeMentira(id = "m_1"): MessageDTO {
  return { id, channelId: CANAL.id, content: "pong" } as unknown as MessageDTO;
}

/** ── j-bots ── uma linha de `EphemeralMessage`, como o `select` a devolve. */
function efemeraDeMentira(ajustes: Partial<Record<string, unknown>> = {}) {
  return {
    id: "e_1",
    snowflake: 888n,
    channelId: CANAL.id,
    ephemeralFor: USUARIO.id,
    content: "só você vê",
    createdAt: new Date("2026-09-09T12:00:00.000Z"),
    editedAt: null,
    ...ajustes,
  };
}

// ── onda 3 · 3a: a mensagem de bot com componentes ───────────

/** Os componentes gravados da mensagem clicada (já com `id`, como a gravação deixa). */
const COMPONENTES_DA_MENSAGEM = [
  {
    type: 1,
    id: 1,
    components: [
      { type: 2, id: 2, style: 1, label: "Tocar", custom_id: "tocar" },
      { type: 2, id: 3, style: 4, label: "Parar", custom_id: "parar", disabled: true },
    ],
  },
  { type: 1, id: 4, components: [{ type: 5, id: 5, custom_id: "quem" }] },
];

/** A linha de `Message` que `origemDoClique` lê. */
const MENSAGEM_DO_BOT = {
  id: "m_bot",
  channelId: CANAL.id,
  authorId: BOT.id,
  botPayload: { components: COMPONENTES_DA_MENSAGEM },
};

/** A mesma mensagem no formato da compat (`DadosDeCompatService.mensagemPorCuid`). */
const LINHA_DA_ORIGEM = {
  id: "m_bot",
  snowflake: 901n,
  channelSnowflake: CANAL.snowflake,
  guildSnowflake: CANAL.guildSnowflake,
  author: BOT,
  content: "Escolha",
  createdAt: new Date("2026-09-14T12:00:00.000Z"),
  editedAt: null,
  type: "DEFAULT",
  attachments: [],
  reactions: [],
  respostaA: null,
  pinned: false,
};

// ── a bancada ────────────────────────────────────────────────

function montar(
  ajustes: {
    comando?: unknown;
    canal?: unknown;
    membroBot?: unknown;
    /** ── j-bots ── a efêmera original que a interação já tem, se tiver. */
    efemeraOriginal?: unknown;
  } = {},
) {
  const sessao = { id: "s_1", botUserId: BOT.id, despachar: vi.fn(), fechar: vi.fn() };

  const prisma = {
    applicationCommand: {
      findUnique: vi.fn(async () => ("comando" in ajustes ? ajustes.comando : COMANDO)),
      findMany: vi.fn(async (_argumentos: unknown): Promise<unknown[]> => []),
    },
    channel: {
      findUnique: vi.fn(async () =>
        "canal" in ajustes ? ajustes.canal : { id: CANAL.id, guildId: CANAL.guildId },
      ),
    },
    guildMember: {
      findUnique: vi.fn(async () =>
        "membroBot" in ajustes ? ajustes.membroBot : { userId: BOT.id },
      ),
      findMany: vi.fn(async () => [{ userId: BOT.id }]),
    },
    // ── onda 3 · 3a ── a mensagem clicada, o aplicativo do autor e os anexos do
    // upload do modal. Os testes de componente sobrescrevem o que precisam.
    message: {
      findUnique: vi.fn(async (_argumentos: unknown): Promise<unknown> => null),
    },
    application: {
      findUnique: vi.fn(
        async (_argumentos: unknown): Promise<unknown> => ({
          id: "app_1",
          snowflake: 666n,
          botUser: BOT,
        }),
      ),
    },
    attachment: {
      findMany: vi.fn(async (_argumentos: unknown): Promise<unknown[]> => []),
    },
    interaction: {
      create: vi.fn(async (_argumentos: unknown) => ({ id: "i_1", snowflake: 777n })),
      // ── j-bots ── é o que o `contextoDaEfemera` lê: a interação com os dois
      // usuários embutidos. Os testes de `porToken`, que são o outro uso do
      // método, sobrescrevem este mock.
      findUnique: vi.fn(
        async (): Promise<unknown> => ({
          commandName: "play",
          guildId: CANAL.guildId,
          user: USUARIO,
          application: { botUser: BOT },
        }),
      ),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      // ── api-interacoes ── a varredura dos prazos na subida (`retomarPrazos`)
      findMany: vi.fn(async (_argumentos: unknown): Promise<unknown[]> => []),
    },
    // ── j-bots ── a tabela da mensagem efêmera
    ephemeralMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        efemeraDeMentira({
          channelId: data.channelId,
          ephemeralFor: data.ephemeralFor,
          content: data.content,
        }),
      ),
      findFirst: vi.fn(
        async (): Promise<unknown> =>
          "efemeraOriginal" in ajustes ? ajustes.efemeraOriginal : null,
      ),
      findUnique: vi.fn(async (): Promise<unknown> => null),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        efemeraDeMentira({ content: data.content, editedAt: new Date() }),
      ),
      delete: vi.fn(async () => ({})),
    },
  };

  const guilds = {
    assertCanPostChannel: vi.fn(async () => ({})),
    // ── onda 3 · 3a ── clicar exige ver o canal
    assertCanViewChannel: vi.fn(async (..._a: unknown[]) => ({})),
    assertMember: vi.fn(async () => ({})),
    // SEND_MESSAGES | VIEW_CHANNEL, o que quer que sejam os bits — o teste só
    // cobra que o valor saia como **string**
    permissionsInChannel: vi.fn(async () => 3),
  };

  // ── onda 3 ── o bot escreve e edita por `criarComoBot`/`editarComoBot`
  // (embeds, componentes e flags junto do texto)
  const mensagens = {
    criarComoBot: vi.fn(async (..._a: unknown[]) => mensagemDeMentira()),
    getDTO: vi.fn(async () => mensagemDeMentira()),
    editarComoBot: vi.fn(async (..._a: unknown[]) => mensagemDeMentira()),
    remove: vi.fn(async () => ({ channelId: CANAL.id, parentId: null })),
    // ── onda 3 · 3a ── os componentes da mensagem de origem, para o bot
    payloadsDeBot: vi.fn(
      async (ids: readonly string[]) =>
        new Map<string, unknown>(ids.map((id): [string, unknown] => [id, { embeds: [], components: [], flags: 0 }])),
    ),
  };

  const realtime = { emitToChannel: vi.fn(), emitToUser: vi.fn() };
  const ids = { snowflakeDeServidor: vi.fn(async () => CANAL.guildSnowflake) };
  const dados = {
    canalPorCuid: vi.fn(async (..._a: unknown[]): Promise<unknown> => CANAL),
    // ── onda 3 · 3a ── a mensagem de origem no formato da compat
    mensagemPorCuid: vi.fn(async (..._a: unknown[]): Promise<unknown> => LINHA_DA_ORIGEM),
    membroDoServidor: vi.fn(async () => MEMBRO),
    usuarioPorCuid: vi.fn(async () => USUARIO),
    cargosDoServidor: vi.fn(async () => []),
  };
  const sessoes = { porBot: vi.fn(() => [sessao as unknown as SessaoDoBot]) };

  const service = new InteractionsService(
    prisma as unknown as PrismaService,
    guilds as unknown as GuildsService,
    mensagens as unknown as MessagesService,
    realtime as unknown as RealtimeService,
    ids as unknown as IdsService,
    dados as unknown as DadosDeCompatService,
    sessoes as unknown as RegistroDeSessoes,
  );

  return { service, prisma, guilds, mensagens, realtime, dados, sessoes, sessao };
}

const ENTRADA = {
  canalId: CANAL.id,
  usuarioId: USUARIO.id,
  commandId: COMANDO.id,
  opcoes: [{ nome: "url", tipo: 3, valor: "https://exemplo/never-gonna" }],
};

/** A interação já autenticada pelo token, como `porToken` a devolve. */
function autenticada(ajustes: Partial<InteracaoAutenticada> = {}): InteracaoAutenticada {
  return {
    id: "i_1",
    snowflake: 777n,
    applicationId: "app_1",
    applicationSnowflake: 666n,
    botUserId: BOT.id,
    canalId: CANAL.id,
    usuarioId: USUARIO.id,
    guildId: CANAL.guildId,
    responseMessageId: null,
    respondedAt: null,
    expiresAt: new Date(Date.now() + VALIDADE_DA_INTERACAO_MS),
    ...ajustes,
  };
}

// ── criarInteracao ───────────────────────────────────────────

describe("criarInteracao", () => {
  it("grava a interação, devolve o token de 86 caracteres e não o mostra ao web", async () => {
    const { service, prisma } = montar();

    const emVoo = await service.criarInteracao(ENTRADA);

    expect(emVoo.nome).toBe("play");
    expect(emVoo.botUserId).toBe(BOT.id);
    // 64 bytes de entropia em base64url = 86 caracteres, sem `+`, `/` nem `=`
    // (o token viaja no **caminho** da URL)
    expect(emVoo.token).toHaveLength(86);
    expect(emVoo.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(emVoo.expiraEm.getTime() - Date.now()).toBeGreaterThan(VALIDADE_DA_INTERACAO_MS - 5_000);

    const gravado = prisma.interaction.create.mock.calls[0]?.[0] as unknown as {
      data: Record<string, unknown>;
    };
    // o nome é copiado na hora: o `PUT` do bot apaga a linha do comando e a
    // faixa "usou /play" não pode sumir do histórico por isso
    expect(gravado.data.commandName).toBe("play");
    expect(gravado.data.commandId).toBe(COMANDO.id);
  });

  it("despacha INTERACTION_CREATE direto na sessão do bot, sem olhar intent", async () => {
    const { service, sessao, sessoes } = montar();

    await service.criarInteracao(ENTRADA);

    expect(sessoes.porBot).toHaveBeenCalledWith(BOT.id);
    expect(sessao.despachar).toHaveBeenCalledTimes(1);
    const [evento, payload] = sessao.despachar.mock.calls[0] as [string, Record<string, unknown>];
    expect(evento).toBe("INTERACTION_CREATE");

    // 2 = APPLICATION_COMMAND; e todo id é **string decimal**
    expect(payload.type).toBe(2);
    expect(payload.version).toBe(1);
    expect(payload.id).toBe("777");
    expect(payload.application_id).toBe("666");
    expect(payload.guild_id).toBe("333");
    expect(payload.channel_id).toBe("555");
    expect(payload.channel).toMatchObject({ id: "555" });
    expect(payload.locale).toBe("pt-BR");
    expect(payload.guild_locale).toBe("pt-BR");
    expect(payload.entitlements).toEqual([]);
    expect(payload.context).toBe(0);
    expect(typeof payload.token).toBe("string");

    // `app_permissions` é **string**: o discord.js faz `BigInt(...)` em cima
    expect(typeof payload.app_permissions).toBe("string");

    // `attachment_size_limit` é obrigatório e o documento não o previa: o
    // `Interaction._from_data` do discord.py 2.7 o lê **sem `.get`**, e sem ele
    // o `KeyError` acontece dentro da lib, onde não há log. Foi a prova com a
    // lib de verdade que pegou.
    expect(payload.attachment_size_limit).toBe(25 * 1024 * 1024);

    // `member` traz o `user` dentro (é de lá que o discord.py tira o autor em
    // servidor) e `user` também vem no topo — mandar os dois cobre as duas libs
    expect(payload.member).toMatchObject({ user: { id: "111" } });
    expect(payload.user).toMatchObject({ id: "111" });

    // nada de bigint escapando para o JSON
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it("o `data` leva o comando, as opções e o `resolved` (vazio quando não há alvo)", async () => {
    const { service, sessao } = montar();

    await service.criarInteracao(ENTRADA);

    const payload = sessao.despachar.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.data).toEqual({
      id: "999",
      name: "play",
      type: 1,
      guild_id: "333",
      options: [{ name: "url", type: 3, value: "https://exemplo/never-gonna" }],
      resolved: { users: {}, members: {}, channels: {}, roles: {} },
    });
  });

  it("opção de tipo 6 vira snowflake e entra em `resolved.users` e `resolved.members`", async () => {
    const { service, sessao } = montar({
      comando: {
        ...COMANDO,
        options: [{ name: "alvo", description: "quem", type: 6, required: true }],
      },
    });

    await service.criarInteracao({
      ...ENTRADA,
      opcoes: [{ nome: "alvo", tipo: 6, valor: USUARIO.id }],
    });

    const payload = sessao.despachar.mock.calls[0]?.[1] as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.options).toEqual([{ name: "alvo", type: 6, value: "111" }]);

    const resolved = data.resolved as Record<string, Record<string, unknown>>;
    // o `_get_namespace` do discord.py resolve o alvo por aqui e levanta se não
    // achar; o discord.js devolve `null` no `getUser()`
    expect(resolved.users["111"]).toMatchObject({ id: "111" });
    // o membro vai **sem** o `user` dentro: ele está em `users`, e a lib junta
    expect(resolved.members["111"]).toBeDefined();
    expect(resolved.members["111"]).not.toHaveProperty("user");
  });

  it("bot sem sessão de gateway: 200 mesmo assim, a interação existe e ninguém responde", async () => {
    const { service, sessoes, prisma } = montar();
    sessoes.porBot.mockReturnValue([]);

    await expect(service.criarInteracao(ENTRADA)).resolves.toMatchObject({ nome: "play" });
    expect(prisma.interaction.create).toHaveBeenCalled();
  });

  it("404 quando o comando não existe", async () => {
    const { service } = montar({ comando: null });
    await expect(service.criarInteracao(ENTRADA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404 quando o comando é de outro servidor", async () => {
    const { service } = montar({ comando: { ...COMANDO, guildId: "g_outro" } });
    await expect(service.criarInteracao(ENTRADA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404 quando o usuário-bot não é membro do servidor", async () => {
    // para quem digitou, comando de bot que saiu é comando que não existe
    const { service, prisma } = montar({ membroBot: null });
    await expect(service.criarInteracao(ENTRADA)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("comando global (guildId null) vale em qualquer servidor e sai sem `data.guild_id`", async () => {
    const { service, sessao } = montar({ comando: { ...COMANDO, guildId: null } });

    await service.criarInteracao(ENTRADA);

    const payload = sessao.despachar.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.data).not.toHaveProperty("guild_id");
    // o `guild_id` do topo continua lá: a interação aconteceu num servidor
    expect(payload.guild_id).toBe("333");
  });

  it("400 quando falta uma opção obrigatória, e nada é gravado", async () => {
    const { service, prisma } = montar();
    await expect(service.criarInteracao({ ...ENTRADA, opcoes: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("400 quando a opção é de tipo errado, ou não foi declarada", async () => {
    const { service } = montar();

    await expect(
      service.criarInteracao({ ...ENTRADA, opcoes: [{ nome: "url", tipo: 4, valor: 7 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.criarInteracao({
        ...ENTRADA,
        opcoes: [
          { nome: "url", tipo: 3, valor: "x" },
          { nome: "volume", tipo: 3, valor: "alto" },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("400 quando o valor não casa com o tipo declarado (inteiro com decimal)", async () => {
    const { service } = montar({
      comando: {
        ...COMANDO,
        options: [{ name: "volume", description: "0 a 100", type: 4, required: true }],
      },
    });

    await expect(
      service.criarInteracao({ ...ENTRADA, opcoes: [{ nome: "volume", tipo: 4, valor: 3.5 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("404 em conversa direta: comando de barra em DM é F5", async () => {
    const { service } = montar({ canal: { id: "c_dm", guildId: null } });
    await expect(service.criarInteracao(ENTRADA)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── porToken ─────────────────────────────────────────────────

describe("porToken", () => {
  it("404 10062 para token que não existe", async () => {
    const { service, prisma } = montar();
    prisma.interaction.findUnique.mockResolvedValue(null);

    await expect(service.porToken("nada")).rejects.toMatchObject({
      response: { code: 10062 },
      status: 404,
    });
  });

  it("404 10062 para interação vencida — a expiração é conferida na leitura", async () => {
    const { service, prisma } = montar();
    prisma.interaction.findUnique.mockResolvedValue({
      id: "i_1",
      snowflake: 777n,
      applicationId: "app_1",
      channelId: CANAL.id,
      userId: USUARIO.id,
      guildId: CANAL.guildId,
      responseMessageId: null,
      respondedAt: null,
      // 15 min e um segundo atrás
      expiresAt: new Date(Date.now() - 1_000),
      application: { snowflake: 666n, botUserId: BOT.id },
    } as never);

    await expect(service.porToken("velho")).rejects.toMatchObject({
      response: { code: 10062 },
      status: 404,
    });
  });
});

// ── responder ────────────────────────────────────────────────

describe("responder", () => {
  it("tipo 5 escreve o 'pensando…' e emite o message.new — o bot não tem socket", async () => {
    const { service, mensagens, realtime, prisma } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, {});

    expect(mensagens.criarComoBot).toHaveBeenCalledWith(
      CANAL.id,
      BOT.id,
      // ── onda 3 ── o texto provisório fica, e `carregando` liga `LOADING`
      expect.objectContaining({ content: TEXTO_PENSANDO, carregando: true }),
    );
    // a mensagem é ligada à interação **antes** do emit, e relida: sem isso a
    // faixa "usou /play" só apareceria depois de um F5
    expect(prisma.interaction.update).toHaveBeenCalledWith({
      where: { id: "i_1" },
      data: { responseMessageId: "m_1" },
    });
    expect(mensagens.getDTO).toHaveBeenCalledWith("m_1");
    expect(realtime.emitToChannel).toHaveBeenCalledWith(
      CANAL.id,
      WS_EVENTS.MESSAGE_NEW,
      expect.objectContaining({ id: "m_1" }),
    );
  });

  it("tipo 4 escreve o `content` do bot", async () => {
    const { service, mensagens } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "  Tocando **Never Gonna…**  ",
    });

    expect(mensagens.criarComoBot).toHaveBeenCalledWith(
      CANAL.id,
      BOT.id,
      expect.objectContaining({ content: "Tocando **Never Gonna…**" }),
    );
  });

  it("a tomada da resposta é escrita condicional (`respondedAt: null`), não `if`", async () => {
    const { service, prisma } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "oi",
    });

    // ── onda 3 ── e **não vencida**: o relógio dos 3 s vence o token, e o
    // callback atrasado não pode escrever depois de a web mostrar "falhou"
    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { id: "i_1", respondedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { respondedAt: expect.any(Date) },
    });
  });

  it("callback duplicado é 400 40060, e nenhuma segunda mensagem é escrita", async () => {
    const { service, prisma, mensagens } = montar();
    // é o que o banco devolve quando o outro callback chegou primeiro
    prisma.interaction.updateMany.mockResolvedValue({ count: 0 });
    prisma.interaction.findUnique.mockResolvedValue({ respondedAt: new Date() });

    await expect(
      service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, { content: "b" }),
    ).rejects.toMatchObject({ response: { code: 40060 }, status: 400 });

    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
  });

  it("── onda 3 ── 6, 7 e 8 num comando de barra são 50035 — e não gastam a resposta", async () => {
    for (const tipo of [6, 7, 8]) {
      const { service, prisma } = montar();
      await expect(service.responder(autenticada(), tipo, {})).rejects.toMatchObject({
        response: { code: 50035 },
        status: 400,
      });
      expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
    }
  });

  it("── onda 3 ── callback atrasado (o relógio dos 3 s já venceu o token) é 404 10062", async () => {
    const { service, prisma, mensagens } = montar();
    prisma.interaction.updateMany.mockResolvedValue({ count: 0 });
    prisma.interaction.findUnique.mockResolvedValue({ respondedAt: null });

    await expect(
      service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, { content: "tarde" }),
    ).rejects.toMatchObject({ response: { code: 10062 }, status: 404 });
    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
  });

  it("PONG (1) e tipo desconhecido são 50035", async () => {
    for (const tipo of [1, 12]) {
      const { service } = montar();
      await expect(service.responder(autenticada(), tipo, {})).rejects.toMatchObject({
        response: { code: 50035 },
      });
    }
  });

});

// ── j-bots: a mensagem efêmera ───────────────────────────────

/**
 * `flags: 64`.
 *
 * O que estes testes protegem é uma coisa só, e é a feature inteira: **a
 * efêmera não pode chegar a mais ninguém**. Daí a forma deles ser sempre a
 * mesma — o que foi chamado e, principalmente, o que **não** foi:
 * `emitToChannel` nunca, `messages.create` nunca.
 */
describe("mensagem efêmera (flags: 64)", () => {
  it("não vira `Message`: grava na tabela própria, com `ephemeralFor` = quem invocou", async () => {
    const { service, prisma, mensagens } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "só você vê",
      flags: 64,
    });

    // é isto que faz `GET /channels/:id/messages` não a listar: ela não está lá
    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
    expect(prisma.ephemeralMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interactionId: "i_1",
        channelId: CANAL.id,
        ephemeralFor: USUARIO.id,
        authorId: BOT.id,
        content: "só você vê",
        original: true,
      }),
      select: expect.anything(),
    });
  });

  it("sai por `emitToUser` do invocador, com `efemera: true` — e nunca pelo canal", async () => {
    const { service, realtime } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "só você vê",
      flags: 64,
    });

    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.MESSAGE_NEW,
      expect.objectContaining({
        efemera: true,
        content: "só você vê",
        // a faixa "@fulano usou /play" continua: a efêmera também chega sozinha
        interacao: expect.objectContaining({ name: "play" }),
      }),
    );
  });

  it("o bot precisa poder escrever no canal: o 403 do caminho normal vale aqui", async () => {
    const { service, guilds, prisma } = montar();
    guilds.assertCanPostChannel.mockRejectedValue(new Error("50013"));

    await expect(
      service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
        content: "x",
        flags: 64,
      }),
    ).rejects.toThrow();
    expect(prisma.ephemeralMessage.create).not.toHaveBeenCalled();
  });

  it("`deferReply({ ephemeral: true })` nasce efêmero: o 'pensando…' já é privado", async () => {
    const { service, mensagens, realtime } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, {
      flags: 64,
    });

    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.MESSAGE_NEW,
      expect.objectContaining({ efemera: true, content: TEXTO_PENSANDO }),
    );
  });

  it("`editReply()` edita a linha efêmera, mesmo sem `responseMessageId`", async () => {
    // é o caso que o `exigirOriginal` sozinho quebraria: a resposta efêmera não
    // tem linha de `Message`, então `responseMessageId` fica null
    const { service, prisma, mensagens, realtime } = montar({
      efemeraOriginal: efemeraDeMentira(),
    });

    await service.editarOriginal(autenticada({ respondedAt: new Date() }), { content: "pong" });

    expect(mensagens.editarComoBot).not.toHaveBeenCalled();
    expect(prisma.ephemeralMessage.update).toHaveBeenCalledWith({
      where: { id: "e_1" },
      // ── onda 3 ── as colunas de bot vão junto (vazias: o corpo só trouxe texto)
      data: { content: "pong", embeds: [], components: [], flags: 0, editedAt: expect.any(Date) },
      select: expect.anything(),
    });
    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.MESSAGE_UPDATED,
      expect.objectContaining({ efemera: true, content: "pong" }),
    );
  });

  it("`deleteReply()` apaga a linha e avisa só o dono dela", async () => {
    const { service, prisma, realtime } = montar({ efemeraOriginal: efemeraDeMentira() });

    await service.apagarOriginal(autenticada({ respondedAt: new Date() }));

    expect(prisma.ephemeralMessage.delete).toHaveBeenCalledWith({ where: { id: "e_1" } });
    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(USUARIO.id, WS_EVENTS.MESSAGE_DELETED, {
      messageId: "e_1",
      channelId: CANAL.id,
      parentId: null,
    });
  });

  it("followup com `flags: 64` também é efêmero, e não vira a original", async () => {
    const { service, prisma, mensagens, realtime } = montar({
      efemeraOriginal: efemeraDeMentira(),
    });

    await service.followup(autenticada({ respondedAt: new Date() }), {
      content: "mais uma só para você",
      flags: 64,
    });

    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
    expect(prisma.ephemeralMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ original: false }),
      select: expect.anything(),
    });
    expect(realtime.emitToChannel).not.toHaveBeenCalled();
  });

  it("followup **sem** a flag depois de uma resposta efêmera é mensagem normal do canal", async () => {
    // é o comportamento do Discord: a efemeridade não se herda, cada followup
    // declara a dele
    const { service, mensagens, realtime } = montar({ efemeraOriginal: efemeraDeMentira() });

    await service.followup(autenticada({ respondedAt: new Date() }), { content: "agora todos" });

    expect(mensagens.criarComoBot).toHaveBeenCalledWith(
      CANAL.id,
      BOT.id,
      expect.objectContaining({ content: "agora todos" }),
    );
    expect(realtime.emitToChannel).toHaveBeenCalled();
  });

  it("um followup depois de uma resposta efêmera não sequestra o `@original`", async () => {
    // `responseMessageId` continua null numa interação já respondida com
    // efêmera; o critério é `respondedAt`, senão o followup se declararia a
    // original e o `editReply()` seguinte editaria a mensagem errada
    const { service, mensagens } = montar({ efemeraOriginal: efemeraDeMentira() });

    await service.followup(autenticada({ respondedAt: new Date() }), { content: "n" });

    expect(mensagens.criarComoBot).toHaveBeenCalled();
    // `ehOriginal` é o terceiro argumento de `escreverComoBot`; o efeito
    // observável dele é a ligação, que só acontece quando é a original
    expect(mensagens.getDTO).not.toHaveBeenCalled();
  });

  it("a efêmera vencida não é ressuscitada: sem original efêmera, o 404 antigo vale", async () => {
    const { service } = montar();
    await expect(service.editarOriginal(autenticada(), { content: "x" })).rejects.toMatchObject({
      response: { code: 10062 },
    });
  });
});

// ── @original e followup ─────────────────────────────────────

describe("@original", () => {
  it("editar sem callback antes é 404 10062: não há original a editar", async () => {
    const { service } = montar();
    await expect(service.editarOriginal(autenticada(), { content: "pong" })).rejects.toMatchObject({
      response: { code: 10062 },
    });
  });

  it("editar emite message.updated", async () => {
    const { service, mensagens, realtime } = montar();

    await service.editarOriginal(autenticada({ responseMessageId: "m_1" }), { content: "pong" });

    expect(mensagens.editarComoBot).toHaveBeenCalledWith("m_1", BOT.id, { content: "pong" });
    expect(realtime.emitToChannel).toHaveBeenCalledWith(
      CANAL.id,
      WS_EVENTS.MESSAGE_UPDATED,
      expect.objectContaining({ id: "m_1" }),
    );
  });

  it("apagar emite message.deleted com o id da mensagem", async () => {
    const { service, mensagens, realtime } = montar();

    await service.apagarOriginal(autenticada({ responseMessageId: "m_1" }));

    expect(mensagens.remove).toHaveBeenCalledWith("m_1", BOT.id);
    expect(realtime.emitToChannel).toHaveBeenCalledWith(CANAL.id, WS_EVENTS.MESSAGE_DELETED, {
      messageId: "m_1",
      channelId: CANAL.id,
      parentId: null,
    });
  });
});

describe("followup", () => {
  it("antes de qualquer callback, vira a resposta original (o Discord faz assim)", async () => {
    const { service, prisma } = montar();

    await service.followup(autenticada(), { content: "pong" });

    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { id: "i_1", respondedAt: null },
      data: { respondedAt: expect.any(Date) },
    });
    expect(prisma.interaction.update).toHaveBeenCalledWith({
      where: { id: "i_1" },
      data: { responseMessageId: "m_1" },
    });
  });

  it("depois da original, é mensagem nova e não mexe na ligação", async () => {
    const { service, prisma, realtime } = montar();

    // `respondedAt` junto com `responseMessageId`: é como a linha fica de
    // verdade depois de um callback, e desde as efêmeras é o `respondedAt` que
    // decide se este followup é a original (ver `followup`)
    await service.followup(autenticada({ responseMessageId: "m_0", respondedAt: new Date() }), {
      content: "e mais",
    });

    expect(prisma.interaction.update).not.toHaveBeenCalled();
    expect(realtime.emitToChannel).toHaveBeenCalledWith(
      CANAL.id,
      WS_EVENTS.MESSAGE_NEW,
      expect.anything(),
    );
  });
});

// ── comandosDoServidor ───────────────────────────────────────

describe("comandosDoServidor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("só os comandos de bots que estão de fato no servidor", async () => {
    const { service, prisma, guilds } = montar();
    prisma.applicationCommand.findMany.mockResolvedValue([
      {
        id: "cmd_1",
        snowflake: 999n,
        name: "play",
        description: "toca",
        options: [{ name: "url", description: "o link", type: 3, required: true }],
        application: { id: "app_1", name: "MusicBot", botUser: { ...BOT, avatarUrl: null, status: "ONLINE" } },
      },
    ] as never);

    const saida = await service.comandosDoServidor("g_1", USUARIO.id);

    expect(guilds.assertMember).toHaveBeenCalledWith(USUARIO.id, "g_1");
    const where = (prisma.applicationCommand.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    // global **ou** deste servidor, e só de bot presente
    expect(where.OR).toEqual([{ guildId: null }, { guildId: "g_1" }]);
    expect(where.application).toEqual({ botUserId: { in: [BOT.id] } });

    expect(saida).toEqual([
      {
        id: "cmd_1",
        // string decimal: o número passa de 2^53
        snowflake: "999",
        name: "play",
        description: "toca",
        options: [{ name: "url", description: "o link", type: 3, required: true }],
        applicationId: "app_1",
        applicationName: "MusicBot",
        botUser: expect.objectContaining({ id: "u_bot", bot: true }),
      },
    ]);
  });

  it("servidor sem bot nenhum: lista vazia, sem consultar comandos", async () => {
    const { service, prisma } = montar();
    prisma.guildMember.findMany.mockResolvedValue([] as never);

    await expect(service.comandosDoServidor("g_1", USUARIO.id)).resolves.toEqual([]);
    expect(prisma.applicationCommand.findMany).not.toHaveBeenCalled();
  });
});

// ── onda 3: embeds, componentes e flags nas respostas ────────

describe("onda 3 — o corpo do bot é guardado, não descartado", () => {
  it("callback 4 com embed e botão chega ao `criarComoBot` normalizado", async () => {
    const { service, mensagens } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      embeds: [{ title: "  Tocando  " }],
      components: [{ type: 1, components: [{ type: 2, style: 1, label: "Pular", custom_id: "pular" }] }],
    });

    expect(mensagens.criarComoBot).toHaveBeenCalledWith(
      CANAL.id,
      BOT.id,
      expect.objectContaining({
        content: "",
        embeds: [{ type: "rich", title: "Tocando" }],
        components: [
          { type: 1, id: 1, components: [{ type: 2, id: 2, style: 1, label: "Pular", custom_id: "pular" }] },
        ],
      }),
    );
  });

  it("corpo inválido é 50035 e **não** gasta a resposta da interação", async () => {
    const { service, prisma, mensagens } = montar();

    await expect(
      service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
        embeds: [{ title: "x".repeat(300) }],
      }),
    ).rejects.toMatchObject({ response: { code: 50035 }, status: 400 });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
  });

  it("callback 4 vazio (sem texto, embed nem componente) é 50035, como no Discord", async () => {
    const { service, prisma } = montar();

    await expect(
      service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {}),
    ).rejects.toMatchObject({ response: { code: 50035 } });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
  });

  it("a efêmera guarda embeds e flags nas próprias colunas", async () => {
    const { service, prisma } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      flags: 64 | 4,
      embeds: [{ description: "segredo" }],
    });

    expect(prisma.ephemeralMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        embeds: [{ type: "rich", description: "segredo" }],
        components: [],
        // EPHEMERAL não é guardado (é a tabela); SUPPRESS_EMBEDS é, porque a
        // efêmera não tem a coluna `suppressEmbeds`
        flags: 4,
      }),
      select: expect.anything(),
    });
  });

  it("editReply() passa o corpo inteiro ao `editarComoBot` (ausente não mexe)", async () => {
    const { service, mensagens } = montar();

    await service.editarOriginal(autenticada({ responseMessageId: "m_1" }), {
      components: [],
    });

    expect(mensagens.editarComoBot).toHaveBeenCalledWith("m_1", BOT.id, { components: [] });
  });
});

// ── onda 3 · cartão 3a: interações de componente, modal e autocomplete ──

/** Uma interação de componente já autenticada pelo token (o clique em "Tocar"). */
function deComponente(ajustes: Partial<InteracaoAutenticada> = {}): InteracaoAutenticada {
  return autenticada({
    tipo: 3,
    nonce: "n_1",
    customId: "tocar",
    messageId: "m_bot",
    ephemeralMessageId: null,
    ...ajustes,
  });
}

const CLIQUE = {
  canalId: CANAL.id,
  usuarioId: USUARIO.id,
  messageId: "m_bot",
  customId: "tocar",
  componentType: 2,
  nonce: "n_1",
};

describe("onda 3 — clicarComponente (interação 3)", () => {
  it("grava a interação 3 e despacha INTERACTION_CREATE com `message` e `data`", async () => {
    const { service, prisma, sessao, mensagens } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);
    mensagens.payloadsDeBot.mockResolvedValue(
      new Map<string, unknown>([["m_bot", { embeds: [], components: COMPONENTES_DA_MENSAGEM, flags: 0 }]]),
    );

    const criada = await service.clicarComponente(CLIQUE);

    expect(criada).toEqual({ id: "i_1", nonce: "n_1", expiresAt: expect.any(String) });
    const gravado = (prisma.interaction.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(gravado).toMatchObject({
      type: 3,
      customId: "tocar",
      componentType: 2,
      messageId: "m_bot",
      ephemeralMessageId: null,
      nonce: "n_1",
      commandName: null,
      commandId: null,
      applicationId: "app_1",
    });

    const [evento, payload] = sessao.despachar.mock.calls[0] as [string, Record<string, unknown>];
    expect(evento).toBe("INTERACTION_CREATE");
    expect(payload.type).toBe(3);
    // botão: sem `values` e sem `resolved`, como o Discord manda
    expect(payload.data).toEqual({ custom_id: "tocar", component_type: 2 });
    // a mensagem de origem com os componentes: é o que o `update()` do bot reaproveita
    expect(payload.message).toMatchObject({
      id: "901",
      flags: 0,
      components: [expect.objectContaining({ type: 1 }), expect.objectContaining({ type: 1 })],
    });
  });

  it("select de usuário: `values` em snowflake e o `resolved` com os quatro mapas", async () => {
    const { service, prisma, sessao } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);

    await service.clicarComponente({ ...CLIQUE, customId: "quem", componentType: 5, values: [USUARIO.id] });

    const payload = sessao.despachar.mock.calls[0]?.[1] as { data: Record<string, unknown> };
    expect(payload.data).toMatchObject({
      custom_id: "quem",
      component_type: 5,
      values: ["111"],
      resolved: {
        users: { "111": expect.objectContaining({ id: "111" }) },
        members: expect.any(Object),
        roles: {},
        channels: {},
      },
    });
  });

  it("quem não vê o canal leva 403 **antes** de a mensagem ser procurada", async () => {
    const { service, prisma, guilds } = montar();
    guilds.assertCanViewChannel.mockRejectedValue(new Error("403"));

    await expect(service.clicarComponente(CLIQUE)).rejects.toThrow("403");
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("mensagem de outro canal é 404", async () => {
    const { service, prisma } = montar();
    prisma.message.findUnique.mockResolvedValue({ ...MENSAGEM_DO_BOT, channelId: "c_outro" });
    await expect(service.clicarComponente(CLIQUE)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("componente desabilitado é 400, e nada é gravado nem despachado", async () => {
    const { service, prisma, sessao } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);

    await expect(service.clicarComponente({ ...CLIQUE, customId: "parar" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.interaction.create).not.toHaveBeenCalled();
    expect(sessao.despachar).not.toHaveBeenCalled();
  });

  it("`custom_id` que a mensagem não tem é 404", async () => {
    const { service, prisma } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);
    await expect(service.clicarComponente({ ...CLIQUE, customId: "sumiu" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("autor que não é bot de aplicativo é 404", async () => {
    const { service, prisma } = montar();
    prisma.message.findUnique.mockResolvedValue({ ...MENSAGEM_DO_BOT, authorId: USUARIO.id });
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.clicarComponente(CLIQUE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("conversa direta é 404: DM com bot é F5", async () => {
    const { service } = montar({ canal: { id: CANAL.id, guildId: null } });
    await expect(service.clicarComponente(CLIQUE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("efêmera de **outra pessoa** é 404 — só o dono clica", async () => {
    const { service, prisma } = montar();
    prisma.ephemeralMessage.findUnique.mockResolvedValue({
      id: "e_9",
      channelId: CANAL.id,
      ephemeralFor: "u_outra",
      authorId: BOT.id,
      components: COMPONENTES_DA_MENSAGEM,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.clicarComponente({ ...CLIQUE, messageId: "e_9" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("efêmera do próprio usuário: grava `ephemeralMessageId` e o `message` vai com `flags` 64", async () => {
    const { service, prisma, sessao } = montar();
    prisma.ephemeralMessage.findUnique.mockResolvedValue({
      ...efemeraDeMentira({ id: "e_9" }),
      authorId: BOT.id,
      embeds: [],
      components: COMPONENTES_DA_MENSAGEM,
      flags: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.clicarComponente({ ...CLIQUE, messageId: "e_9" });

    const gravado = (prisma.interaction.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(gravado).toMatchObject({ messageId: null, ephemeralMessageId: "e_9" });
    const payload = sessao.despachar.mock.calls[0]?.[1] as { message: { flags: number } };
    expect(payload.message.flags & 64).toBe(64);
  });

  it("bot sem sessão de gateway: `interaction.failed` com `bot_offline` na hora, só para quem clicou", async () => {
    const { service, prisma, sessoes, realtime } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);
    sessoes.porBot.mockReturnValue([]);

    await service.clicarComponente(CLIQUE);

    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(USUARIO.id, WS_EVENTS.INTERACTION_FAILED, {
      interactionId: "i_1",
      nonce: "n_1",
      channelId: CANAL.id,
      messageId: "m_bot",
      customId: "tocar",
      motivo: "bot_offline",
    });
  });
});

describe("onda 3 — o prazo dos 3 s", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** O relógio dispara uma função `async`: deixa as promessas dela andarem. */
  const esvaziar = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };

  it("sem callback: vence o token (escrita condicional) e avisa `sem_resposta`", async () => {
    const { service, prisma, realtime } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);

    await service.clicarComponente(CLIQUE);
    expect(realtime.emitToUser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await esvaziar();

    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { id: "i_1", respondedAt: null },
      data: { expiresAt: expect.any(Date) },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_FAILED,
      expect.objectContaining({ nonce: "n_1", motivo: "sem_resposta" }),
    );
  });

  it("callback a tempo desarma o relógio: sai `success`, e nunca `failed`", async () => {
    const { service, prisma, realtime } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);

    await service.clicarComponente(CLIQUE);
    await service.responder(deComponente(), TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE, undefined);
    await vi.advanceTimersByTimeAsync(5_000);
    await esvaziar();

    const eventos = realtime.emitToUser.mock.calls.map((c) => c[1]);
    expect(eventos).toContain(WS_EVENTS.INTERACTION_SUCCESS);
    expect(eventos).not.toContain(WS_EVENTS.INTERACTION_FAILED);
  });

  it("o banco decide: callback gravado por outra instância (`count` 0) não vira `failed`", async () => {
    const { service, prisma, realtime } = montar();
    prisma.message.findUnique.mockResolvedValue(MENSAGEM_DO_BOT);
    await service.clicarComponente(CLIQUE);
    prisma.interaction.updateMany.mockResolvedValue({ count: 0 });

    await vi.advanceTimersByTimeAsync(3_000);
    await esvaziar();

    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
});

describe("onda 3 — callbacks 6, 7, 8 e 9", () => {
  it("6 DEFERRED_UPDATE_MESSAGE: toma a resposta, não mexe em mensagem e emite `success`", async () => {
    const { service, prisma, mensagens, realtime } = montar();

    await service.responder(deComponente(), TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE, undefined);

    expect(prisma.interaction.updateMany).toHaveBeenCalledTimes(1);
    expect(mensagens.criarComoBot).not.toHaveBeenCalled();
    expect(mensagens.editarComoBot).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(USUARIO.id, WS_EVENTS.INTERACTION_SUCCESS, {
      interactionId: "i_1",
      nonce: "n_1",
      channelId: CANAL.id,
      messageId: "m_bot",
      customId: "tocar",
    });
  });

  it("7 UPDATE_MESSAGE: edita a mensagem de origem, emite `message.updated` no canal e `success`", async () => {
    const { service, prisma, mensagens, realtime } = montar();
    prisma.message.findUnique.mockResolvedValue({
      content: "antes",
      suppressEmbeds: false,
      stickerId: null,
      botPayload: { embeds: [], components: COMPONENTES_DA_MENSAGEM, flags: 0 },
      _count: { attachments: 0 },
    });
    mensagens.editarComoBot.mockResolvedValue({ id: "m_bot", channelId: CANAL.id } as MessageDTO);

    await service.responder(deComponente(), TIPO_DE_CALLBACK.UPDATE_MESSAGE, {
      content: "depois",
      components: [],
    });

    expect(mensagens.editarComoBot).toHaveBeenCalledWith("m_bot", BOT.id, { content: "depois", components: [] });
    expect(realtime.emitToChannel).toHaveBeenCalledWith(
      CANAL.id,
      WS_EVENTS.MESSAGE_UPDATED,
      expect.objectContaining({ id: "m_bot" }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_SUCCESS,
      expect.objectContaining({ nonce: "n_1" }),
    );
  });

  it("7 que quebra o conjunto (v2 com `content`) é 50035 **antes** da tomada", async () => {
    const { service, prisma, mensagens } = montar();
    prisma.message.findUnique.mockResolvedValue({
      content: "",
      suppressEmbeds: false,
      stickerId: null,
      botPayload: { embeds: [], components: [{ type: 10, id: 1, content: "oi" }], flags: 1 << 15 },
      _count: { attachments: 0 },
    });

    await expect(
      service.responder(deComponente(), TIPO_DE_CALLBACK.UPDATE_MESSAGE, { content: "não pode" }),
    ).rejects.toMatchObject({ response: { code: 50035 } });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
    expect(mensagens.editarComoBot).not.toHaveBeenCalled();
  });

  it("7 numa efêmera de origem: edita a linha e avisa **só** o dono, com a faixa da interação dona", async () => {
    const { service, prisma, realtime } = montar();
    prisma.ephemeralMessage.findUnique.mockResolvedValue({
      ...efemeraDeMentira(),
      embeds: [],
      components: COMPONENTES_DA_MENSAGEM,
      flags: 0,
      interactionId: "i_cmd",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.responder(
      deComponente({ messageId: null, ephemeralMessageId: "e_1" }),
      TIPO_DE_CALLBACK.UPDATE_MESSAGE,
      { content: "atualizada" },
    );

    expect(prisma.ephemeralMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e_1" }, data: expect.objectContaining({ content: "atualizada" }) }),
    );
    // a faixa "usou /play" é da interação que criou a efêmera, não do clique
    expect(prisma.interaction.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i_cmd" } }));
    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.MESSAGE_UPDATED,
      expect.objectContaining({ efemera: true, content: "atualizada" }),
    );
  });

  it("7 com a efêmera de origem já vencida é 404 10008, sem gastar a resposta", async () => {
    const { service, prisma } = montar();
    prisma.ephemeralMessage.findUnique.mockResolvedValue(null);

    await expect(
      service.responder(
        deComponente({ messageId: null, ephemeralMessageId: "e_1" }),
        TIPO_DE_CALLBACK.UPDATE_MESSAGE,
        { content: "x" },
      ),
    ).rejects.toMatchObject({ response: { code: 10008 } });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
  });

  it("4 num componente escreve a mensagem nova e também emite `success`", async () => {
    const { service, mensagens, realtime } = montar();

    await service.responder(deComponente(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, { content: "ok" });

    expect(mensagens.criarComoBot).toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_SUCCESS,
      expect.objectContaining({ customId: "tocar" }),
    );
  });

  it("escrita que falha **depois** da tomada vira `failed` para quem clicou", async () => {
    const { service, mensagens, realtime } = montar();
    mensagens.criarComoBot.mockRejectedValue(new Error("50013"));

    await expect(
      service.responder(deComponente(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, { content: "ok" }),
    ).rejects.toThrow("50013");
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_FAILED,
      expect.objectContaining({ motivo: "sem_resposta" }),
    );
  });

  it("8 AUTOCOMPLETE_RESULT: as `choices` vão só para quem pediu, casadas pelo `nonce`", async () => {
    const { service, realtime } = montar();

    await service.responder(autenticada({ tipo: 4, nonce: "n_ac" }), TIPO_DE_CALLBACK.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, {
      choices: [{ name: "Never Gonna Give You Up", value: "never" }],
    } as never);

    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(USUARIO.id, WS_EVENTS.INTERACTION_AUTOCOMPLETE, {
      interactionId: "i_1",
      nonce: "n_ac",
      choices: [{ name: "Never Gonna Give You Up", value: "never" }],
    });
  });

  it("8 com mais de 25 escolhas é 50035, sem gastar a resposta; 8 fora de autocomplete também", async () => {
    const { service, prisma } = montar();
    const muitas = Array.from({ length: 26 }, (_, i) => ({ name: `op ${i}`, value: i }));

    await expect(
      service.responder(autenticada({ tipo: 4, nonce: "n" }), 8, { choices: muitas } as never),
    ).rejects.toMatchObject({ response: { code: 50035 } });
    await expect(service.responder(deComponente(), 8, { choices: [] } as never)).rejects.toMatchObject({
      response: { code: 50035 },
    });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
  });

  const MODAL_DO_BOT = {
    custom_id: "cadastro",
    title: "Cadastro",
    components: [{ type: 18, label: "Nome", component: { type: 4, custom_id: "nome", style: 1 } }],
  };

  it("9 MODAL: grava o modal na mesma escrita da tomada e o entrega só a quem clicou", async () => {
    const { service, prisma, realtime } = montar();

    await service.responder(deComponente(), TIPO_DE_CALLBACK.MODAL, MODAL_DO_BOT as never);

    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "i_1", respondedAt: null }),
      data: {
        respondedAt: expect.any(Date),
        // numerado: é contra estes `id` que o envio confere
        modal: expect.objectContaining({
          custom_id: "cadastro",
          components: [expect.objectContaining({ id: 1, component: expect.objectContaining({ id: 2 }) })],
        }),
      },
    });
    expect(realtime.emitToChannel).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_MODAL,
      expect.objectContaining({
        interactionId: "i_1",
        nonce: "n_1",
        channelId: CANAL.id,
        applicationId: "app_1",
        bot: expect.objectContaining({ id: BOT.id }),
        modal: expect.objectContaining({ title: "Cadastro" }),
      }),
    );
    // o modal substitui o `success`: o botão sai do "carregando" quando o modal abre
    expect(realtime.emitToUser.mock.calls.map((c) => c[1])).not.toContain(WS_EVENTS.INTERACTION_SUCCESS);
  });

  it("9 com título acima de 45 é 50035; 9 num envio de modal (5) também", async () => {
    const { service, prisma } = montar();
    await expect(
      service.responder(deComponente(), 9, { ...MODAL_DO_BOT, title: "x".repeat(46) } as never),
    ).rejects.toMatchObject({ response: { code: 50035 } });
    await expect(
      service.responder(deComponente({ tipo: 5, customId: "cadastro" }), 9, MODAL_DO_BOT as never),
    ).rejects.toMatchObject({ response: { code: 50035 } });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
  });
});

describe("onda 3 — `@original` de uma interação de componente", () => {
  it("respondida com 6, o `editReply()` edita a mensagem de origem", async () => {
    const { service, mensagens } = montar();

    await service.editarOriginal(deComponente({ respondedAt: new Date() }), { content: "tocando" });

    expect(mensagens.editarComoBot).toHaveBeenCalledWith("m_bot", BOT.id, { content: "tocando" });
  });

  it("sem callback antes continua 404 10062", async () => {
    const { service } = montar();
    await expect(service.editarOriginal(deComponente(), { content: "x" })).rejects.toMatchObject({
      response: { code: 10062 },
    });
  });

  it("comando de barra sem resposta não cai na origem (não tem)", async () => {
    const { service, mensagens } = montar();
    await expect(
      service.editarOriginal(autenticada({ respondedAt: new Date() }), { content: "x" }),
    ).rejects.toMatchObject({ response: { code: 10062 } });
    expect(mensagens.editarComoBot).not.toHaveBeenCalled();
  });
});

describe("onda 3 — enviarModal (interação 5)", () => {
  /** O modal como `validarModalDeBot` o gravou (numerado). */
  const MODAL_GRAVADO = {
    custom_id: "cadastro",
    title: "Cadastro",
    components: [
      { type: 18, id: 1, label: "Nome", component: { type: 4, id: 2, custom_id: "nome", style: 1 } },
      { type: 18, id: 3, label: "Quem", component: { type: 5, id: 4, custom_id: "quem", required: false } },
    ],
  };

  const ORIGEM = {
    id: "i_orig",
    userId: USUARIO.id,
    channelId: CANAL.id,
    guildId: CANAL.guildId,
    modal: MODAL_GRAVADO,
    expiresAt: new Date(Date.now() + 60_000),
    messageId: "m_bot",
    ephemeralMessageId: null,
    application: { botUserId: BOT.id },
  };

  const ENVIO = {
    canalId: CANAL.id,
    usuarioId: USUARIO.id,
    interactionId: "i_orig",
    customId: "cadastro",
    nonce: "n_modal",
    components: [
      { type: 18 as const, id: 1, component: { type: 4 as const, id: 2, custom_id: "nome", value: "Zé" } },
      { type: 18 as const, id: 3, component: { type: 5 as const, id: 4, custom_id: "quem", values: [USUARIO.id] } },
    ],
  };

  it("confere contra o modal, zera-o (um envio só) e despacha o MODAL_SUBMIT com `message`", async () => {
    const { service, prisma, sessao } = montar();
    prisma.interaction.findUnique.mockResolvedValue(ORIGEM);

    const criada = await service.enviarModal(ENVIO);

    expect(criada).toMatchObject({ id: "i_1", nonce: "n_modal" });
    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { id: "i_orig", userId: USUARIO.id, modal: { not: Prisma.DbNull } },
      data: { modal: Prisma.DbNull },
    });
    const gravado = (prisma.interaction.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(gravado).toMatchObject({ type: 5, customId: "cadastro", messageId: "m_bot", nonce: "n_modal", commandName: null });

    const payload = sessao.despachar.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.type).toBe(5);
    expect(payload.data).toEqual({
      custom_id: "cadastro",
      components: [
        { type: 18, id: 1, component: { type: 4, id: 2, custom_id: "nome", value: "Zé" } },
        // cuid → snowflake, e o usuário no `resolved`
        { type: 18, id: 3, component: { type: 5, id: 4, custom_id: "quem", values: ["111"] } },
      ],
      resolved: expect.objectContaining({ users: { "111": expect.anything() }, attachments: {} }),
    });
    expect(payload.message).toMatchObject({ id: "901" });
  });

  it("modal de outra pessoa, de outro `custom_id`, vencido ou já enviado é 404", async () => {
    const casos: unknown[] = [
      { ...ORIGEM, userId: "u_outra" },
      { ...ORIGEM, modal: { ...MODAL_GRAVADO, custom_id: "outro" } },
      { ...ORIGEM, expiresAt: new Date(Date.now() - 1) },
      { ...ORIGEM, modal: null },
      null,
    ];
    for (const origem of casos) {
      const { service, prisma } = montar();
      prisma.interaction.findUnique.mockResolvedValue(origem);
      await expect(service.enviarModal(ENVIO)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.interaction.create).not.toHaveBeenCalled();
    }
  });

  it("dois envios quase juntos: o que perde a escrita condicional leva 404", async () => {
    const { service, prisma } = montar();
    prisma.interaction.findUnique.mockResolvedValue(ORIGEM);
    prisma.interaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.enviarModal(ENVIO)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("obrigatório vazio é 400, e o modal **não** é consumido", async () => {
    const { service, prisma } = montar();
    prisma.interaction.findUnique.mockResolvedValue(ORIGEM);

    await expect(
      service.enviarModal({ ...ENVIO, components: [ENVIO.components[1]!] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
  });
});

describe("onda 3 — pedirAutocomplete (interação 4)", () => {
  const COMANDO_COM_AUTOCOMPLETE = {
    ...COMANDO,
    options: [
      { name: "url", description: "o link", type: 3, required: true, autocomplete: true },
      { name: "volume", description: "0–100", type: 4, required: false },
    ],
  };

  it("grava a interação 4 e manda a opção em foco com `focused` e o `value` em texto", async () => {
    const { service, prisma, sessao } = montar({ comando: COMANDO_COM_AUTOCOMPLETE });

    const criada = await service.pedirAutocomplete({
      canalId: CANAL.id,
      usuarioId: USUARIO.id,
      commandId: COMANDO.id,
      nonce: "n_ac",
      options: [{ name: "url", type: 3, value: "never", focused: true }],
    });

    expect(criada).toMatchObject({ id: "i_1", nonce: "n_ac" });
    const gravado = (prisma.interaction.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(gravado).toMatchObject({ type: 4, commandId: COMANDO.id, commandName: "play", nonce: "n_ac", customId: null });
    const payload = sessao.despachar.mock.calls[0]?.[1] as { type: number; data: Record<string, unknown> };
    expect(payload.type).toBe(4);
    expect(payload.data).toMatchObject({
      name: "play",
      options: [{ name: "url", type: 3, value: "never", focused: true }],
    });
  });

  it("opção em foco sem `autocomplete: true` é 400, e nada é gravado", async () => {
    const { service, prisma } = montar({ comando: COMANDO_COM_AUTOCOMPLETE });

    await expect(
      service.pedirAutocomplete({
        canalId: CANAL.id,
        usuarioId: USUARIO.id,
        commandId: COMANDO.id,
        nonce: "n",
        options: [{ name: "volume", type: 4, value: 5, focused: true }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });

  it("quem não pode escrever no canal leva o 403 do `assertCanPostChannel`", async () => {
    const { service, guilds, prisma } = montar({ comando: COMANDO_COM_AUTOCOMPLETE });
    guilds.assertCanPostChannel.mockRejectedValue(new Error("403"));

    await expect(
      service.pedirAutocomplete({
        canalId: CANAL.id,
        usuarioId: USUARIO.id,
        commandId: COMANDO.id,
        nonce: "n",
        options: [{ name: "url", type: 3, value: "a", focused: true }],
      }),
    ).rejects.toThrow("403");
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });
});

// ── api-interacoes: a rodada de correção ─────────────────────

describe("api-interacoes — comando de barra com `nonce`", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const esvaziar = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };

  it("grava o `nonce` e, sem callback em 3 s, vence o token e avisa `sem_resposta` casado por ele", async () => {
    const { service, prisma, realtime } = montar();

    await service.criarInteracao({ ...ENTRADA, nonce: "n_cmd" });
    const gravado = (prisma.interaction.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(gravado.nonce).toBe("n_cmd");
    expect(realtime.emitToUser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await esvaziar();

    expect(realtime.emitToUser).toHaveBeenCalledWith(USUARIO.id, WS_EVENTS.INTERACTION_FAILED, {
      interactionId: "i_1",
      nonce: "n_cmd",
      channelId: CANAL.id,
      messageId: null,
      customId: null,
      motivo: "sem_resposta",
    });
  });

  it("sem `nonce` (cliente antigo) continua sem relógio e sem evento, e grava `nonce` nulo", async () => {
    const { service, prisma, realtime } = montar();

    await service.criarInteracao(ENTRADA);
    await vi.advanceTimersByTimeAsync(5_000);
    await esvaziar();

    const gravado = (prisma.interaction.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(gravado.nonce).toBeNull();
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it("bot sem sessão: `bot_offline` na hora, com o `nonce` do comando", async () => {
    const { service, sessoes, realtime } = montar();
    sessoes.porBot.mockReturnValue([]);

    await service.criarInteracao({ ...ENTRADA, nonce: "n_cmd" });

    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_FAILED,
      expect.objectContaining({ nonce: "n_cmd", motivo: "bot_offline" }),
    );
  });

  it("callback 9 num comando: o `interaction.modal` sai com o `nonce` do comando (o modal abre na web)", async () => {
    const { service, realtime } = montar();

    await service.responder(
      autenticada({ tipo: 2, nonce: "n_cmd" }),
      TIPO_DE_CALLBACK.MODAL,
      {
        custom_id: "cadastro",
        title: "Cadastro",
        components: [{ type: 18, label: "Nome", component: { type: 4, custom_id: "nome", style: 1 } }],
      } as never,
    );

    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_MODAL,
      expect.objectContaining({ interactionId: "i_1", nonce: "n_cmd" }),
    );
  });

  it("callback 4 num comando com `nonce` emite `success`", async () => {
    const { service, realtime } = montar();

    await service.responder(autenticada({ tipo: 2, nonce: "n_cmd" }), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "pong",
    });

    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_SUCCESS,
      expect.objectContaining({ nonce: "n_cmd", messageId: null, customId: null }),
    );
  });
});

describe("api-interacoes — autocomplete com opção de alvo não focada", () => {
  const COMANDO_COM_ALVO = {
    ...COMANDO,
    options: [
      { name: "url", description: "o link", type: 3, required: true, autocomplete: true },
      { name: "alvo", description: "quem", type: 6, required: false },
      { name: "sala", description: "onde", type: 7, required: false },
    ],
  };

  it("alvo inexistente não é 400: a opção é omitida e a em foco segue para o bot", async () => {
    const { service, dados, prisma, sessao } = montar({ comando: COMANDO_COM_ALVO });
    // só o alvo some: quem digitou (lido na montagem do payload) continua existindo
    dados.usuarioPorCuid.mockImplementation(async (...a: unknown[]) =>
      a[0] === "cuid_que_nao_existe" ? (null as never) : USUARIO,
    );
    dados.canalPorCuid.mockImplementation(async (...a: unknown[]) => (a[0] === CANAL.id ? CANAL : null));

    await service.pedirAutocomplete({
      canalId: CANAL.id,
      usuarioId: USUARIO.id,
      commandId: COMANDO.id,
      nonce: "n_ac",
      options: [
        { name: "url", type: 3, value: "nev", focused: true },
        { name: "alvo", type: 6, value: "cuid_que_nao_existe" },
        { name: "sala", type: 7, value: CANAL.id },
      ],
    });

    expect(prisma.interaction.create).toHaveBeenCalledTimes(1);
    const payload = sessao.despachar.mock.calls[0]?.[1] as { data: Record<string, unknown> };
    // a resolvível vai em snowflake; a que não resolve some, e nunca vai o cuid bruto
    expect(payload.data.options).toEqual([
      { name: "url", type: 3, value: "nev", focused: true },
      { name: "sala", type: 7, value: "555" },
    ]);
  });

  it("no comando de barra (sem foco) o alvo inexistente continua 400", async () => {
    const { service, dados, prisma } = montar({ comando: COMANDO_COM_ALVO });
    dados.usuarioPorCuid.mockImplementation(async () => null as never);

    await expect(
      service.criarInteracao({
        ...ENTRADA,
        opcoes: [
          { nome: "url", tipo: 3, valor: "x" },
          { nome: "alvo", tipo: 6, valor: "cuid_que_nao_existe" },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
  });
});

describe("api-interacoes — componente cuja mensagem de origem foi apagada", () => {
  // `Interaction.messageId` é `onDelete: SetNull`: apagada a mensagem, a
  // interação 3 fica com os dois ids nulos
  const semOrigem = (ajustes: Partial<InteracaoAutenticada> = {}) =>
    deComponente({ messageId: null, ephemeralMessageId: null, ...ajustes });

  it("callback 7 é 404 10008 Unknown Message, e não 50035 — sem gastar a resposta", async () => {
    const { service, prisma, mensagens } = montar();

    await expect(
      service.responder(semOrigem(), TIPO_DE_CALLBACK.UPDATE_MESSAGE, { content: "x" }),
    ).rejects.toMatchObject({ response: { code: 10008 } });
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
    expect(mensagens.editarComoBot).not.toHaveBeenCalled();
  });

  it("`editReply()` depois do 6 também é 10008", async () => {
    const { service } = montar();
    await expect(
      service.editarOriginal(semOrigem({ respondedAt: new Date() }), { content: "x" }),
    ).rejects.toMatchObject({ response: { code: 10008 } });
  });

  it("envio de modal de comando (5, sem origem de nascença) continua 50035 no 7", async () => {
    const { service } = montar();
    await expect(
      service.responder(semOrigem({ tipo: 5 }), TIPO_DE_CALLBACK.UPDATE_MESSAGE, { content: "x" }),
    ).rejects.toMatchObject({ response: { code: 50035 } });
  });
});

describe("api-interacoes — retomada dos prazos na subida", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const agora = new Date("2026-09-14T12:00:00.000Z");

  const pendente = (ajustes: Record<string, unknown> = {}) => ({
    id: "i_vencida",
    userId: USUARIO.id,
    channelId: CANAL.id,
    messageId: "m_bot",
    ephemeralMessageId: null,
    customId: "tocar",
    nonce: "n_1",
    createdAt: new Date(agora.getTime() - 10_000),
    ...ajustes,
  });

  it("procura só as pendentes com `nonce` e ainda não invalidadas", async () => {
    const { service, prisma } = montar();

    await service.retomarPrazos(agora);

    expect(prisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { respondedAt: null, nonce: { not: null }, expiresAt: { gt: agora } },
      }),
    );
  });

  it("prazo vencido durante a queda: invalida (escrita condicional) e emite `failed`", async () => {
    const { service, prisma, realtime } = montar();
    prisma.interaction.findMany.mockResolvedValue([pendente()]);

    await service.retomarPrazos(agora);

    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { id: "i_vencida", respondedAt: null },
      data: { expiresAt: expect.any(Date) },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(USUARIO.id, WS_EVENTS.INTERACTION_FAILED, {
      interactionId: "i_vencida",
      nonce: "n_1",
      channelId: CANAL.id,
      messageId: "m_bot",
      customId: "tocar",
      motivo: "sem_resposta",
    });
  });

  it("o banco decide: já respondida noutra instância (`count` 0) não vira `failed`", async () => {
    const { service, prisma, realtime } = montar();
    prisma.interaction.findMany.mockResolvedValue([pendente()]);
    prisma.interaction.updateMany.mockResolvedValue({ count: 0 });

    await service.retomarPrazos(agora);

    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it("prazo ainda correndo: o relógio volta com o que falta", async () => {
    const { service, prisma, realtime } = montar();
    prisma.interaction.findMany.mockResolvedValue([pendente({ createdAt: new Date(agora.getTime() - 1_000) })]);

    await service.retomarPrazos(agora);
    expect(prisma.interaction.updateMany).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USUARIO.id,
      WS_EVENTS.INTERACTION_FAILED,
      expect.objectContaining({ interactionId: "i_vencida", motivo: "sem_resposta" }),
    );
  });

  it("erro do banco na subida só vai para o log", async () => {
    const { service, prisma } = montar();
    prisma.interaction.findMany.mockRejectedValue(new Error("banco fora"));

    await expect(service.retomarPrazos(agora)).resolves.toBeUndefined();
  });
});
