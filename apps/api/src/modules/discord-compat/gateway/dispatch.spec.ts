import { WS_EVENTS } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { GuildsService } from "../../guilds/guilds.service";
import type { AlvoDoEvento, RealtimeService } from "../../realtime/realtime.service";
import type { VoiceService } from "../../voice/voice.service";
import type { DadosDeCompatService } from "../dados.service";
import type { IdsService } from "../ids.service";
import type { ReacoesDeCompatService } from "../reacoes.service";
import { CAMPOS_DO_SERVIDOR } from "../traducao/servidor";
import type {
  LinhaDeMembro,
  LinhaDeMensagem,
  LinhaDeServidor,
  LinhaDeUsuario,
} from "../tipos";
import { INTENT } from "../tipos";
import { PonteDeEventos } from "./dispatch";
import type { RegistroDeSessoes, SessaoDoBot } from "./sessao";

/**
 * A ponte de eventos: quem recebe o quê, e o que **não** sai.
 *
 * O que estes testes prendem:
 *
 * - o filtro de intent e o de acesso, que são os dois "não" do §7 — um bot que
 *   recebe evento de canal que não vê é um vazamento, e um bot que recebe sem
 *   ter pedido o intent processa comando que não deveria;
 * - o bot **recebe a própria mensagem de volta**, como no Discord (as libs
 *   filtram por `message.author.bot`) — é disso que depende o `!ping`/`pong`;
 * - uma leitura por **bot**, não por conexão;
 * - com bot nenhum ligado, o banco não é tocado;
 * - o `GUILD_CREATE` sai com a lista do §7 inteira.
 */

/** Deixa a fila interna da ponte terminar (ela é assíncrona de propósito). */
const assentar = () => new Promise((resolva) => setTimeout(resolva, 0));

interface Despachado {
  sessao: string;
  evento: string;
  dados: unknown;
}

function usuario(campos: Partial<LinhaDeUsuario> = {}): LinhaDeUsuario {
  return {
    id: "u_ana",
    snowflake: 555444333222111000n,
    username: "ana",
    displayName: "Ana",
    isBot: false,
    ...campos,
  };
}

function mensagem(campos: Partial<LinhaDeMensagem> = {}): LinhaDeMensagem {
  return {
    id: "m1",
    snowflake: 1234567890123456789n,
    channelSnowflake: 222333444555666777n,
    guildSnowflake: 111222333444555666n,
    author: usuario(),
    content: "!ping",
    createdAt: new Date("2026-09-08T13:45:12.345Z"),
    editedAt: null,
    type: "DEFAULT",
    attachments: [],
    reactions: [],
    respostaA: null,
    pinned: false,
    ...campos,
  };
}

function membro(campos: Partial<LinhaDeMembro> = {}): LinhaDeMembro {
  return {
    user: usuario(),
    cargoSnowflakes: [],
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    timeoutUntil: null,
    ...campos,
  };
}

function servidor(): LinhaDeServidor {
  return {
    id: "g1",
    snowflake: 111222333444555666n,
    name: "Streamz",
    ownerSnowflake: 555444333222111000n,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    systemChannelSnowflake: 222333444555666777n,
    rulesChannelSnowflake: null,
    cargos: [
      {
        id: "r_everyone",
        snowflake: 100000000000000001n,
        guildId: "g1",
        guildSnowflake: 111222333444555666n,
        name: "@everyone",
        color: null,
        position: 0,
        permissions: 0,
        hoist: false,
        mentionable: false,
        isDefault: true,
      },
    ],
    canais: [
      {
        id: "c1",
        snowflake: 222333444555666777n,
        guildId: "g1",
        guildSnowflake: 111222333444555666n,
        name: "geral",
        type: "TEXT",
        position: 0,
        topic: null,
        nsfw: false,
        slowmodeSeconds: 0,
        categoriaSnowflake: null,
        destinatarios: [],
      },
    ],
    categorias: [],
    membros: [membro()],
    memberCount: 1,
  };
}

function ambiente() {
  const despachados: Despachado[] = [];
  const sessoes: SessaoDoBot[] = [];
  const consultas: string[] = [];
  /** `bot:canal` que o `assertCanViewChannel` recusa. */
  const semAcesso = new Set<string>();
  /** `guild:bot` que **é** membro; vazio = todo mundo é. */
  const membros = new Set<string>();

  let ouvinte: ((a: AlvoDoEvento, e: string, d: unknown) => void) | null = null;

  const realtime = {
    onEvent(cb: (a: AlvoDoEvento, e: string, d: unknown) => void) {
      ouvinte = cb;
    },
  } as unknown as RealtimeService;

  const registro = {
    todas: () => sessoes,
    // F4: é por aqui que a ponte descobre que o membro que entrou (ou saiu) é o
    // usuário-bot de uma sessão viva. Mesmo corpo do `RegistroDeSessoes` real.
    porBot: (botUserId: string) => sessoes.filter((s) => s.botUserId === botUserId),
  } as unknown as RegistroDeSessoes;

  const dados = {
    async servidorCompleto(guildId: string) {
      consultas.push(`servidorCompleto:${guildId}`);
      return guildId === "g1" ? servidor() : null;
    },
    async mensagemPorCuid(id: string, paraBot: string | null) {
      consultas.push(`mensagemPorCuid:${id}:${paraBot}`);
      return id === "m1" ? mensagem() : null;
    },
    async canalPorCuid(id: string) {
      consultas.push(`canalPorCuid:${id}`);
      return servidor().canais.find((c) => c.id === id) ?? null;
    },
    async membroDoServidor(guildId: string, userId: string) {
      consultas.push(`membroDoServidor:${guildId}:${userId}`);
      if (membros.size > 0 && !membros.has(`${guildId}:${userId}`)) return null;
      return membro({ user: usuario({ id: userId }) });
    },
    async usuarioPorCuid(id: string) {
      consultas.push(`usuarioPorCuid:${id}`);
      return usuario({ id });
    },
    async cargosDoServidor(guildId: string) {
      consultas.push(`cargosDoServidor:${guildId}`);
      return servidor().cargos;
    },
  } as unknown as DadosDeCompatService;

  const ids = {
    async snowflakeDeServidor(id: string) {
      consultas.push(`snowflakeDeServidor:${id}`);
      return id === "g1" ? 111222333444555666n : null;
    },
    async snowflakeDeMensagem(id: string) {
      consultas.push(`snowflakeDeMensagem:${id}`);
      return null; // a linha já foi apagada: é o caso real
    },
    async snowflakeDeCanal(id: string) {
      consultas.push(`snowflakeDeCanal:${id}`);
      return null;
    },
    async snowflakeDeCargo(id: string) {
      consultas.push(`snowflakeDeCargo:${id}`);
      return null;
    },
    async snowflakeDeUsuario(id: string) {
      consultas.push(`snowflakeDeUsuario:${id}`);
      return 555444333222111000n;
    },
  } as unknown as IdsService;

  const guilds = {
    async assertCanViewChannel(userId: string, channelId: string) {
      consultas.push(`assertCanViewChannel:${userId}:${channelId}`);
      if (semAcesso.has(`${userId}:${channelId}`)) throw new Error("Canal privado");
      return {};
    },
  } as unknown as GuildsService;

  // F2: o `voice_states` do GUILD_CREATE sai do estado de voz. Sem ninguém em
  // call, a lista é vazia — que é o caso destes testes, todos de F1.
  const voz = {
    async statesForGuild(userId: string, guildId: string) {
      consultas.push(`statesForGuild:${userId}:${guildId}`);
      return [];
    },
  } as unknown as VoiceService;

  // F5: a ponte resolve o emoji da reação por aqui. Nestes testes não há emoji
  // personalizado nenhum, então o token cru já é o `name` do Discord.
  const reacoes = {
    async traduzirToken(token: string) {
      return { id: null, name: token, animated: false };
    },
  } as unknown as ReacoesDeCompatService;

  const ponte = new PonteDeEventos(realtime, registro, dados, ids, guilds, voz, reacoes);
  ponte.iniciar();

  function ligar(id: string, botUserId: string, intents: number) {
    const sessao: SessaoDoBot = {
      id,
      botUserId,
      applicationId: `app_${botUserId}`,
      intents,
      despachar: (evento, dados_) => despachados.push({ sessao: id, evento, dados: dados_ }),
      fechar: () => undefined,
    };
    sessoes.push(sessao);
    return sessao;
  }

  async function emitir(alvo: AlvoDoEvento, evento: string, dado: unknown) {
    ouvinte?.(alvo, evento, dado);
    await assentar();
  }

  return { ponte, ligar, emitir, despachados, consultas, semAcesso, membros };
}

const CANAL: AlvoDoEvento = { tipo: "canal", id: "c1" };
const SERVIDOR: AlvoDoEvento = { tipo: "servidor", id: "g1" };

/** O `message.new` como o Streamz o emite (DTO, com id cuid). */
const MENSAGEM_NOVA = { id: "m1", channelId: "c1", guildId: "g1", content: "!ping" };

describe("PonteDeEventos — mensagens", () => {
  it("message.new vira MESSAGE_CREATE traduzido", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS | INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);

    expect(a.despachados).toHaveLength(1);
    expect(a.despachados[0]?.evento).toBe("MESSAGE_CREATE");
    expect(a.despachados[0]?.dados).toMatchObject({
      id: "1234567890123456789",
      channel_id: "222333444555666777",
      guild_id: "111222333444555666",
      content: "!ping",
      type: 0,
    });
  });

  it("sessão sem o intent GUILD_MESSAGES não recebe", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS); // pediu só GUILDS

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);

    expect(a.despachados).toEqual([]);
    // e nem chegou a perguntar ao banco por causa dela
    expect(a.consultas).toEqual([]);
  });

  it("bot que não vê o canal não recebe", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);
    a.semAcesso.add("bot1:c1");

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);

    expect(a.despachados).toEqual([]);
    expect(a.consultas).toContain("assertCanViewChannel:bot1:c1");
    expect(a.consultas.some((c) => c.startsWith("mensagemPorCuid"))).toBe(false);
  });

  it("o bot recebe de volta o que ele mesmo escreveu (como no Discord)", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);

    // autor = o próprio bot; a lib é que filtra por `message.author.bot`
    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, { ...MENSAGEM_NOVA, id: "m1" });

    expect(a.despachados).toHaveLength(1);
  });

  it("duas conexões do mesmo bot recebem, mas o banco é lido uma vez", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);
    a.ligar("s2", "bot1", INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);

    expect(a.despachados.map((d) => d.sessao)).toEqual(["s1", "s2"]);
    expect(a.consultas.filter((c) => c.startsWith("mensagemPorCuid"))).toHaveLength(1);
  });

  it("dois bots diferentes leem cada um o seu (o `me` das reações é por bot)", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);
    a.ligar("s2", "bot2", INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);

    expect(a.consultas).toContain("mensagemPorCuid:m1:bot1");
    expect(a.consultas).toContain("mensagemPorCuid:m1:bot2");
  });

  it("sem bot ligado, o banco não é tocado", async () => {
    const a = ambiente();
    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);
    expect(a.consultas).toEqual([]);
    expect(a.despachados).toEqual([]);
  });

  it("message.updated vira MESSAGE_UPDATE (é também o que uma reação produz)", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_UPDATED, MENSAGEM_NOVA);

    expect(a.despachados[0]?.evento).toBe("MESSAGE_UPDATE");
  });

  it("message.deleted usa o snowflake aprendido no MESSAGE_CREATE", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);
    await a.emitir(CANAL, WS_EVENTS.MESSAGE_DELETED, { messageId: "m1", channelId: "c1" });

    const apagada = a.despachados.find((d) => d.evento === "MESSAGE_DELETE");
    expect(apagada?.dados).toEqual({
      id: "1234567890123456789",
      channel_id: "222333444555666777",
      guild_id: "111222333444555666",
    });
  });

  it("message.deleted de mensagem que a ponte nunca viu não sai (id inventado é pior)", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_DELETED, { messageId: "m9", channelId: "c1" });

    expect(a.despachados).toEqual([]);
    expect(a.consultas).toContain("snowflakeDeMensagem:m9");
  });

  it("a ordem dos dispatches é a ordem dos eventos", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);

    // sem esperar entre um e outro: é a fila da ponte que garante a ordem
    const ouvinteDireto = a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);
    const segundo = a.emitir(CANAL, WS_EVENTS.MESSAGE_UPDATED, MENSAGEM_NOVA);
    await Promise.all([ouvinteDireto, segundo]);

    expect(a.despachados.map((d) => d.evento)).toEqual(["MESSAGE_CREATE", "MESSAGE_UPDATE"]);
  });
});

describe("PonteDeEventos — estrutura do servidor", () => {
  it("member.left vira GUILD_MEMBER_REMOVE com o usuário", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MEMBERS);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_LEFT, { guildId: "g1", userId: "u_ana" });

    expect(a.despachados[0]?.evento).toBe("GUILD_MEMBER_REMOVE");
    expect(a.despachados[0]?.dados).toMatchObject({
      guild_id: "111222333444555666",
      user: { id: "555444333222111000", username: "ana" },
    });
  });

  it("member.updated vira GUILD_MEMBER_UPDATE com guild_id", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MEMBERS);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_UPDATED, {
      guildId: "g1",
      userId: "u_ana",
      role: "MEMBER",
      roleIds: [],
    });

    expect(a.despachados[0]?.evento).toBe("GUILD_MEMBER_UPDATE");
    expect(a.despachados[0]?.dados).toMatchObject({ guild_id: "111222333444555666" });
  });

  it("bot que não é membro do servidor não recebe evento de membro", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MEMBERS);
    a.membros.add("g1:outro"); // bot1 fica de fora

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_LEFT, { guildId: "g1", userId: "u_ana" });

    expect(a.despachados).toEqual([]);
  });

  it("role.created vira GUILD_ROLE_CREATE com o cargo traduzido", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);

    await a.emitir(SERVIDOR, WS_EVENTS.ROLE_CREATED, { id: "r_everyone", guildId: "g1" });

    expect(a.despachados[0]?.evento).toBe("GUILD_ROLE_CREATE");
    // o @everyone sai com o id do servidor (lote C)
    expect(a.despachados[0]?.dados).toMatchObject({
      guild_id: "111222333444555666",
      role: { id: "111222333444555666", name: "@everyone" },
    });
  });

  it("role.deleted sai com o snowflake aprendido no GUILD_CREATE", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);
    await a.ponte.montarGuildCreate("g1", "bot1");

    await a.emitir(SERVIDOR, WS_EVENTS.ROLE_DELETED, { guildId: "g1", roleId: "r_everyone" });

    expect(a.despachados[0]?.dados).toEqual({
      guild_id: "111222333444555666",
      role_id: "100000000000000001",
    });
  });

  it("channel.created vira CHANNEL_CREATE traduzido", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);

    await a.emitir(SERVIDOR, WS_EVENTS.CHANNEL_CREATED, { id: "c1", guildId: "g1" });

    expect(a.despachados[0]?.evento).toBe("CHANNEL_CREATE");
    expect(a.despachados[0]?.dados).toMatchObject({ id: "222333444555666777", type: 0 });
  });

  it("channel.deleted sai com o snowflake aprendido no GUILD_CREATE", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);
    await a.ponte.montarGuildCreate("g1", "bot1");

    await a.emitir(SERVIDOR, WS_EVENTS.CHANNEL_DELETED, { channelId: "c1", guildId: "g1" });

    expect(a.despachados[0]?.dados).toEqual({
      id: "222333444555666777",
      guild_id: "111222333444555666",
    });
  });

  it("typing vira TYPING_START com o timestamp em segundos", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGE_TYPING);

    await a.emitir(CANAL, WS_EVENTS.TYPING, { channelId: "c1", user: { id: "u_ana" } });

    const evento = a.despachados[0]?.dados as { timestamp: number; user_id: string };
    expect(a.despachados[0]?.evento).toBe("TYPING_START");
    expect(evento.user_id).toBe("555444333222111000");
    // segundos, não milissegundos: o discord.js faz `new Date(ts * 1000)`
    expect(evento.timestamp).toBeLessThan(2_000_000_000);
  });
});

/**
 * F4 — instalar e remover um aplicativo, visto pelo gateway.
 *
 * O que estes testes prendem, e por que cada um existe:
 *
 * - o bot recebe o **servidor inteiro** ao entrar, e não um `GUILD_MEMBER_ADD`
 *   sobre si mesmo: é do `GUILD_CREATE` que depende o `guildCreate` do
 *   discord.js e, com ele, o servidor aparecer no `client.guilds`. Sem isso um
 *   `!ping` no canal chega a uma sessão que não sabe que o canal existe;
 * - **sem exigir o intent `GUILD_MEMBERS`**, que no Discord é privilegiado e a
 *   maioria dos bots não pede (o `prova-discordjs.mjs` pede só `Guilds` e
 *   `GuildMessages`). Filtrar por ele deixaria o bot comum sem saber que entrou
 *   — o defeito mais caro possível, porque é silencioso;
 * - o `GUILD_DELETE` sai **mesmo com a linha de `GuildMember` já apagada**, que
 *   é o estado real no instante do `member.left`;
 * - `unavailable: false`, que é o que faz a lib disparar `guildDelete` e limpar
 *   o cache em vez de esperar o servidor voltar;
 * - e os **outros** bots do servidor continuam vendo o membro entrar e sair
 *   normalmente: a regra é sobre a sessão do próprio bot, não sobre o evento.
 */
describe("PonteDeEventos — o bot entra e sai do servidor (F4)", () => {
  /** O `member.joined` como o `InstalacaoService` o emite. */
  const entrou = (userId: string) => ({
    guildId: "g1",
    member: {
      role: "MEMBER",
      user: { id: userId },
      roleIds: ["r_app"],
      joinedAt: "2026-09-08T15:00:00.000Z",
    },
  });

  it("o bot instalado recebe GUILD_CREATE, e não GUILD_MEMBER_ADD sobre si mesmo", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS | INTENT.GUILD_MEMBERS);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_JOINED, entrou("bot1"));

    expect(a.despachados.map((d) => d.evento)).toEqual(["GUILD_CREATE"]);
    expect(a.despachados[0]?.dados).toMatchObject({
      id: "111222333444555666",
      unavailable: false,
    });
  });

  it("o GUILD_CREATE sai sem o intent GUILD_MEMBERS (que é privilegiado)", async () => {
    const a = ambiente();
    // exatamente os intents do `prova-discordjs.mjs`
    a.ligar("s1", "bot1", INTENT.GUILDS | INTENT.GUILD_MESSAGES);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_JOINED, entrou("bot1"));

    expect(a.despachados.map((d) => d.evento)).toEqual(["GUILD_CREATE"]);
  });

  it("as duas conexões do mesmo bot recebem o GUILD_CREATE", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);
    a.ligar("s2", "bot1", INTENT.GUILDS);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_JOINED, entrou("bot1"));

    expect(a.despachados.map((d) => d.sessao)).toEqual(["s1", "s2"]);
    // e o servidor é montado UMA vez, não uma por conexão
    expect(a.consultas.filter((c) => c === "servidorCompleto:g1")).toHaveLength(1);
  });

  it("outro bot do servidor vê o bot novo entrar como GUILD_MEMBER_ADD", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS); // o que entrou
    a.ligar("s2", "bot2", INTENT.GUILD_MEMBERS); // o vizinho

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_JOINED, entrou("bot1"));

    expect(a.despachados).toEqual([
      { sessao: "s1", evento: "GUILD_CREATE", dados: expect.anything() },
      { sessao: "s2", evento: "GUILD_MEMBER_ADD", dados: expect.anything() },
    ]);
  });

  it("uma pessoa entrando continua sendo só GUILD_MEMBER_ADD", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MEMBERS);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_JOINED, entrou("u_ana"));

    expect(a.despachados.map((d) => d.evento)).toEqual(["GUILD_MEMBER_ADD"]);
  });

  it("removido, o bot recebe GUILD_DELETE com unavailable: false", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);
    // a linha de `GuildMember` do bot já não existe: é o estado real no
    // instante do `member.left`, e é o que `botsNoServidor` não alcança
    a.membros.add("g1:u_ana");

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_LEFT, { guildId: "g1", userId: "bot1" });

    expect(a.despachados.map((d) => d.evento)).toEqual(["GUILD_DELETE"]);
    expect(a.despachados[0]?.dados).toEqual({
      id: "111222333444555666",
      unavailable: false,
    });
  });

  it("o bot removido não recebe também um GUILD_MEMBER_REMOVE sobre si mesmo", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS | INTENT.GUILD_MEMBERS);
    // aqui o bot ainda conta como membro (a corrida oposta): mesmo assim o
    // dispatch sobre si mesmo é o GUILD_DELETE, e só ele
    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_LEFT, { guildId: "g1", userId: "bot1" });

    expect(a.despachados.map((d) => d.evento)).toEqual(["GUILD_DELETE"]);
  });

  it("outro bot do servidor vê a saída como GUILD_MEMBER_REMOVE", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS);
    a.ligar("s2", "bot2", INTENT.GUILD_MEMBERS);

    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_LEFT, { guildId: "g1", userId: "bot1" });

    expect(a.despachados).toEqual([
      { sessao: "s1", evento: "GUILD_DELETE", dados: expect.anything() },
      { sessao: "s2", evento: "GUILD_MEMBER_REMOVE", dados: expect.anything() },
    ]);
  });

  it("instalar num servidor que sumiu no meio não vira GUILD_MEMBER_ADD sobre si mesmo", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS | INTENT.GUILD_MEMBERS);

    // `servidorCompleto` devolve null para qualquer coisa que não seja "g1"
    await a.emitir(SERVIDOR, WS_EVENTS.MEMBER_JOINED, {
      ...entrou("bot1"),
      guildId: "g9",
    });

    // evento nenhum: um GUILD_MEMBER_ADD aqui faria a lib guardar um membro de
    // um servidor que ela não conhece
    expect(a.despachados).toEqual([]);
  });
});

describe("PonteDeEventos — robustez", () => {
  it("evento sem par na F1 é ignorado em silêncio", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILDS | INTENT.GUILD_MESSAGES | INTENT.GUILD_VOICE_STATES);

    await a.emitir(SERVIDOR, WS_EVENTS.VOICE_STATE, { guildId: "g1" });
    await a.emitir(SERVIDOR, WS_EVENTS.PRESENCE_UPDATE, { userId: "u_ana" });

    expect(a.despachados).toEqual([]);
    expect(a.consultas).toEqual([]);
  });

  it("payload malformado não derruba a ponte nem os eventos seguintes", async () => {
    const a = ambiente();
    a.ligar("s1", "bot1", INTENT.GUILD_MESSAGES);

    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, null);
    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, { semNada: true });
    await a.emitir(CANAL, WS_EVENTS.MESSAGE_NEW, MENSAGEM_NOVA);

    expect(a.despachados.map((d) => d.evento)).toEqual(["MESSAGE_CREATE"]);
  });
});

describe("PonteDeEventos.montarGuildCreate", () => {
  it("produz o payload com a lista do §7 inteira", async () => {
    const a = ambiente();
    const payload = await a.ponte.montarGuildCreate("g1", "bot1");

    const faltando = CAMPOS_DO_SERVIDOR.filter((campo) => !(campo in payload));
    expect(faltando, `campos ausentes: ${faltando.join(", ")}`).toEqual([]);
    expect(payload.unavailable).toBe(false);
    expect(payload.id).toBe("111222333444555666");
  });

  it("o payload atravessa o JSON sem bigint nenhum", async () => {
    const a = ambiente();
    const payload = await a.ponte.montarGuildCreate("g1", "bot1");
    // um bigint aqui lançaria TypeError — é como o `despachar` do lote B falha
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it("servidor que não existe lança (o lote B pega e segue com os outros)", async () => {
    const a = ambiente();
    await expect(a.ponte.montarGuildCreate("g9", "bot1")).rejects.toThrow("não encontrado");
  });
});
