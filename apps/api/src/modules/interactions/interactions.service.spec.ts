import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

// ── a bancada ────────────────────────────────────────────────

function montar(ajustes: { comando?: unknown; canal?: unknown; membroBot?: unknown } = {}) {
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
    interaction: {
      create: vi.fn(async (_argumentos: unknown) => ({ id: "i_1", snowflake: 777n })),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };

  const guilds = {
    assertCanPostChannel: vi.fn(async () => ({})),
    assertMember: vi.fn(async () => ({})),
    // SEND_MESSAGES | VIEW_CHANNEL, o que quer que sejam os bits — o teste só
    // cobra que o valor saia como **string**
    permissionsInChannel: vi.fn(async () => 3),
  };

  const mensagens = {
    create: vi.fn(async () => mensagemDeMentira()),
    getDTO: vi.fn(async () => mensagemDeMentira()),
    edit: vi.fn(async () => mensagemDeMentira()),
    remove: vi.fn(async () => ({ channelId: CANAL.id, parentId: null })),
  };

  const realtime = { emitToChannel: vi.fn() };
  const ids = { snowflakeDeServidor: vi.fn(async () => CANAL.guildSnowflake) };
  const dados = {
    canalPorCuid: vi.fn(async () => CANAL),
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

    expect(mensagens.create).toHaveBeenCalledWith(CANAL.id, BOT.id, TEXTO_PENSANDO);
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

    expect(mensagens.create).toHaveBeenCalledWith(CANAL.id, BOT.id, "Tocando **Never Gonna…**");
  });

  it("a tomada da resposta é escrita condicional (`respondedAt: null`), não `if`", async () => {
    const { service, prisma } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "oi",
    });

    expect(prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { id: "i_1", respondedAt: null },
      data: { respondedAt: expect.any(Date) },
    });
  });

  it("callback duplicado é 400 40060, e nenhuma segunda mensagem é escrita", async () => {
    const { service, prisma, mensagens } = montar();
    // é o que o banco devolve quando o outro callback chegou primeiro
    prisma.interaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, { content: "b" }),
    ).rejects.toMatchObject({ response: { code: 40060 }, status: 400 });

    expect(mensagens.create).not.toHaveBeenCalled();
  });

  it("tipos 6, 7, 8 e 9 são 501 20012 — e não gastam a resposta da interação", async () => {
    for (const tipo of [6, 7, 8, 9]) {
      const { service, prisma } = montar();
      await expect(service.responder(autenticada(), tipo, {})).rejects.toMatchObject({
        response: { code: 20012 },
        status: 501,
      });
      expect(prisma.interaction.updateMany).not.toHaveBeenCalled();
    }
  });

  it("aceita `flags: 64` e entrega a mensagem normal (efêmera não existe aqui)", async () => {
    const { service, mensagens, realtime } = montar();

    await service.responder(autenticada(), TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE, {
      content: "só você vê",
      flags: 64,
    });

    expect(mensagens.create).toHaveBeenCalledWith(CANAL.id, BOT.id, "só você vê");
    expect(realtime.emitToChannel).toHaveBeenCalled();
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

    expect(mensagens.edit).toHaveBeenCalledWith("m_1", BOT.id, "pong");
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

    await service.followup(autenticada({ responseMessageId: "m_0" }), { content: "e mais" });

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
