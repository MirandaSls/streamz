import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApplicationsService } from "../../applications/applications.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { DadosDeCompatService } from "../dados.service";
import { IdsService } from "../ids.service";
import { ApplicationCommandsCompatController } from "./application-commands.controller";

/**
 * O registro de comandos, com um app Nest de verdade e o `ValidationPipe`
 * global ligado.
 *
 * Três coisas que só um teste assim pega:
 *
 * 1. **O corpo sobrevive ao pipe global** (risco (b) do §12). O `PUT` manda um
 *    array, e o `whitelist: true` não pode comer `options` nem os campos que o
 *    `SlashCommandBuilder` preenche sozinho.
 * 2. **O `PUT` é sobrescrita em bloco** — é o que faz o `deploy-commands.js` ser
 *    idempotente, e é a prova 1 da fase.
 * 3. **A resposta tem os campos que o `ApplicationCommand` do discord.js lê.**
 *    Campo faltando quebra dentro da lib, sem log — a lição da F1.
 *
 * O banco é um duplo em memória com a forma da migration 4 (que é do lote A e
 * ainda não existe nesta branch); é o outro lado da interface estrutural que o
 * controller usa. Ver o cabeçalho de `application-commands.controller.ts`.
 */

const BOT = {
  applicationId: "app_1",
  applicationSnowflake: 42n,
  applicationName: "Bot de teste",
  botUserId: "user_bot",
  botSnowflake: 7n,
};

/** O snowflake do servidor no caminho, e o cuid a que ele corresponde. */
const SERVIDOR = { snowflake: "1000000000000000001", cuid: "guild_1" };

/** Um servidor que existe e de onde o bot foi removido. */
const SEM_O_BOT = { snowflake: "1000000000000000002", cuid: "guild_2" };

// ── o duplo do banco ─────────────────────────────────────────

interface LinhaFalsa {
  id: string;
  snowflake: bigint;
  applicationId: string;
  guildId: string | null;
  name: string;
  description: string;
  type: number;
  options: unknown;
  defaultMemberPermissions: string | null;
}

let tabela: LinhaFalsa[] = [];
let proximoSnowflake = 1000000000000000100n;
let proximoId = 1;

/** `where` do Prisma, na fatia que o controller usa. */
type Onde = {
  id?: string;
  applicationId?: string;
  guildId?: string | null;
  snowflake?: bigint;
  type?: number;
  name?: string | { notIn: string[] };
  /** ── menus de contexto ── "não casa nenhum destes" (o `PUT` por `(type, name)`). */
  NOT?: Onde[];
};

function casa(linha: LinhaFalsa, onde: Onde = {}): boolean {
  if (onde.id !== undefined && linha.id !== onde.id) return false;
  if (onde.applicationId !== undefined && linha.applicationId !== onde.applicationId) return false;
  if (onde.guildId !== undefined && linha.guildId !== onde.guildId) return false;
  if (onde.snowflake !== undefined && linha.snowflake !== onde.snowflake) return false;
  if (onde.type !== undefined && linha.type !== onde.type) return false;
  if (onde.NOT && onde.NOT.some((n) => casa(linha, n))) return false;
  if (typeof onde.name === "string" && linha.name !== onde.name) return false;
  if (onde.name && typeof onde.name === "object" && onde.name.notIn.includes(linha.name)) {
    return false;
  }
  return true;
}

const applicationCommand = {
  async findMany({ where }: { where?: Onde } = {}) {
    return tabela.filter((l) => casa(l, where)).sort((a, b) => a.name.localeCompare(b.name));
  },
  async findFirst({ where }: { where?: Onde } = {}) {
    return tabela.find((l) => casa(l, where)) ?? null;
  },
  async create({ data }: { data: Omit<LinhaFalsa, "id" | "snowflake"> }) {
    const linha: LinhaFalsa = { id: `cmd_${proximoId++}`, snowflake: proximoSnowflake++, ...data };
    tabela.push(linha);
    return linha;
  },
  async updateMany({ where, data }: { where?: Onde; data: Partial<LinhaFalsa> }) {
    const alvos = tabela.filter((l) => casa(l, where));
    for (const alvo of alvos) Object.assign(alvo, data);
    return { count: alvos.length };
  },
  async deleteMany({ where }: { where?: Onde }) {
    const antes = tabela.length;
    tabela = tabela.filter((l) => !casa(l, where));
    return { count: antes - tabela.length };
  },
};

/** A tabela como texto — com o snowflake em string, que `JSON.stringify` de um
 * `bigint` lança `TypeError` (a mesma regra que vale na resposta HTTP). */
function retrato(): string {
  return JSON.stringify(tabela, (_chave, valor) =>
    typeof valor === "bigint" ? String(valor) : valor,
  );
}

const prismaFalso = {
  applicationCommand,
  // a forma interativa: é a que o controller usa, e a única que funciona com um
  // repositório que não devolve `PrismaPromise`
  async $transaction<T>(tarefa: (tx: unknown) => Promise<T>): Promise<T> {
    return tarefa(prismaFalso);
  },
};

@Module({
  controllers: [ApplicationCommandsCompatController],
  providers: [
    // o guard e o interceptor de verdade continuam no caminho; quem se troca são
    // as dependências deles (o mesmo desenho de `corpo-do-post.spec.ts`)
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
        cuidDeServidor: async (sf: string) =>
          ({ [SERVIDOR.snowflake]: SERVIDOR.cuid, [SEM_O_BOT.snowflake]: SEM_O_BOT.cuid })[sf] ??
          null,
      },
    },
    {
      provide: DadosDeCompatService,
      useValue: {
        membroDoServidor: async (guildId: string) =>
          guildId === SERVIDOR.cuid ? { user: { id: BOT.botUserId } } : null,
      },
    },
    { provide: PrismaService, useValue: prismaFalso },
  ],
})
class ModuloDeProva {}

/** O corpo do `deploy-commands.js`: `commands.map(c => c.toJSON())`. */
const DEPLOY = [
  {
    name: "play",
    description: "Toca uma música",
    options: [
      {
        name: "url",
        description: "O link",
        type: 3,
        required: true,
        autocomplete: false,
        name_localizations: null,
      },
    ],
    dm_permission: undefined,
    default_member_permissions: undefined,
    nsfw: false,
    contexts: undefined,
    integration_types: undefined,
  },
  { name: "ping", description: "pong" },
];

describe("/api/v10/applications/:app/commands", () => {
  let app: NestExpressApplication;
  let url: string;

  const chamar = (caminho: string, init: RequestInit = {}) =>
    fetch(`${url}/api/v10/applications${caminho}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: "Bot a.b.c",
        ...(init.headers as Record<string, string>),
      },
    });

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(ModuloDeProva, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix("api");
    // exatamente o do `main.ts` — é metade da razão de este teste existir
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    tabela = [];
    proximoSnowflake = 1000000000000000100n;
    proximoId = 1;
  });

  it("PUT registra a lista e devolve os campos que o discord.js lê", async () => {
    const resposta = await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as Record<string, unknown>[];
    expect(corpo).toHaveLength(2);

    const play = corpo.find((c) => c.name === "play");
    for (const campo of [
      "id",
      "application_id",
      "name",
      "description",
      "type",
      "options",
      "version",
      "default_member_permissions",
    ]) {
      expect(play, `o ApplicationCommand do discord.js lê \`${campo}\``).toHaveProperty(campo);
    }
    // todo id é string decimal: um bigint aqui teria derrubado o JSON.stringify
    expect(typeof play?.id).toBe("string");
    expect(play?.application_id).toBe("42");
    expect(play?.type).toBe(1);
    // comando global não tem `guild_id`, como no Discord
    expect(play).not.toHaveProperty("guild_id");
    expect(play?.options).toEqual([
      { name: "url", description: "O link", type: 3, required: true },
    ]);
  });

  it("PUT é sobrescrita em bloco: o que não veio some, e o id do que ficou não muda", async () => {
    const primeira = (await (
      await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) })
    ).json()) as Record<string, unknown>[];
    const idDoPlay = primeira.find((c) => c.name === "play")?.id;

    // o dono do bot apagou o `/ping` do deploy-commands.js e rodou de novo
    const segunda = (await (
      await chamar("/42/commands", {
        method: "PUT",
        body: JSON.stringify([{ ...DEPLOY[0], description: "Toca uma música (agora com fila)" }]),
      })
    ).json()) as Record<string, unknown>[];

    expect(segunda.map((c) => c.name)).toEqual(["play"]);
    expect(segunda[0]?.description).toBe("Toca uma música (agora com fila)");
    // atualizado, não recriado: o `commandId` que o composer já carregou continua valendo
    expect(segunda[0]?.id).toBe(idDoPlay);
  });

  it("PUT rodado duas vezes deixa o banco idêntico — o script é idempotente", async () => {
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    const antes = retrato();
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    expect(retrato()).toBe(antes);
  });

  it("PUT com [] apaga tudo", async () => {
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    const resposta = await chamar("/42/commands", { method: "PUT", body: "[]" });

    expect(await resposta.json()).toEqual([]);
    expect(tabela).toHaveLength(0);
  });

  it("GET lista o que o PUT deixou", async () => {
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    const corpo = (await (await chamar("/42/commands")).json()) as Record<string, unknown>[];
    expect(corpo.map((c) => c.name)).toEqual(["ping", "play"]);
  });

  it("POST cria um comando, e um segundo POST com o mesmo nome atualiza", async () => {
    const criado = await chamar("/42/commands", {
      method: "POST",
      body: JSON.stringify({ name: "play", description: "v1" }),
    });
    expect(criado.status).toBe(201);

    await chamar("/42/commands", {
      method: "POST",
      body: JSON.stringify({ name: "play", description: "v2" }),
    });
    expect(tabela).toHaveLength(1);
    expect(tabela[0]?.description).toBe("v2");
  });

  it("DELETE apaga e devolve 204 sem corpo", async () => {
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    const snowflake = String(tabela[0]?.snowflake);

    const resposta = await chamar(`/42/commands/${snowflake}`, { method: "DELETE" });
    expect(resposta.status).toBe(204);
    expect(await resposta.text()).toBe("");
    expect(tabela).toHaveLength(1);
  });

  it("DELETE de comando que não existe é 404, e não 500", async () => {
    const resposta = await chamar("/42/commands/1000000000000000009", { method: "DELETE" });
    expect(resposta.status).toBe(404);
  });

  it("`:cmd` que não é snowflake é 404, e não um SyntaxError de BigInt", async () => {
    const resposta = await chamar("/42/commands/nao-e-um-id", { method: "DELETE" });
    expect(resposta.status).toBe(404);
  });

  it("`:app` de outro aplicativo é 403 50001", async () => {
    const resposta = await chamar("/999/commands", { method: "PUT", body: "[]" });
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ code: 50001 });
  });

  it("`@me` vale como apelido do aplicativo do token", async () => {
    const resposta = await chamar("/@me/commands", { method: "PUT", body: JSON.stringify(DEPLOY) });
    expect(resposta.status).toBe(200);
  });

  it("sem `Authorization` é 401 no formato do Discord — aqui o guard existe", async () => {
    const resposta = await fetch(`${url}/api/v10/applications/42/commands`);
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toMatchObject({ code: 0, message: "401: Unauthorized" });
  });

  // ── menus de contexto ─────────────────────────────────────

  /** `new ContextMenuCommandBuilder().setName(…).setType(…).toJSON()`: sem descrição nem opções. */
  const DE_CONTEXTO = [
    { name: "Traduzir mensagem", type: 3, contexts: undefined, integration_types: undefined },
    { name: "Ver avatar", type: 2, default_member_permissions: undefined },
  ];

  it("PUT aceita comando de usuário (2) e de mensagem (3), e devolve o `type` guardado", async () => {
    const resposta = await chamar("/42/commands", {
      method: "PUT",
      body: JSON.stringify([...DEPLOY, ...DE_CONTEXTO]),
    });

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as Record<string, unknown>[];
    const traduzir = corpo.find((c) => c.name === "Traduzir mensagem");
    expect(traduzir).toMatchObject({ type: 3, description: "", options: [] });
    expect(corpo.find((c) => c.name === "Ver avatar")).toMatchObject({ type: 2, description: "" });
    expect(tabela.find((l) => l.name === "Ver avatar")?.type).toBe(2);

    const listados = (await (await chamar("/42/commands")).json()) as Record<string, unknown>[];
    expect(listados.find((c) => c.name === "Traduzir mensagem")?.type).toBe(3);
  });

  it("o mesmo nome em tipos diferentes são dois comandos, e o PUT os preserva", async () => {
    const lista = [
      { name: "info", description: "barra" },
      { name: "info", type: 2 },
    ];
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify(lista) });
    const ids = tabela.map((l) => l.id).sort();
    expect(tabela.map((l) => l.type).sort()).toEqual([1, 2]);

    // de novo, com o de usuário removido: só o de barra fica, e com o mesmo id
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify([lista[0]]) });
    expect(tabela).toHaveLength(1);
    expect(tabela[0]).toMatchObject({ name: "info", type: 1 });
    expect(ids).toContain(tabela[0]?.id);
  });

  it("POST de contexto com o nome de um de barra cria outro, não sobrescreve", async () => {
    await chamar("/42/commands", { method: "POST", body: JSON.stringify({ name: "info", description: "barra" }) });
    const criado = await chamar("/42/commands", { method: "POST", body: JSON.stringify({ name: "info", type: 3 }) });

    expect(criado.status).toBe(201);
    expect(await criado.json()).toMatchObject({ name: "info", type: 3, description: "" });
    expect(tabela).toHaveLength(2);
    expect(tabela.find((l) => l.type === 1)?.description).toBe("barra");
  });

  it("comando de contexto com descrição ou opções é 50035", async () => {
    for (const corpo of [
      { name: "Traduzir", type: 3, description: "traduz" },
      { name: "Traduzir", type: 3, options: [{ name: "x", description: "x", type: 3 }] },
      { name: "Traduzir", type: 4 },
    ]) {
      const resposta = await chamar("/42/commands", { method: "POST", body: JSON.stringify(corpo) });
      expect(resposta.status, JSON.stringify(corpo)).toBe(400);
      expect(await resposta.json()).toMatchObject({ code: 50035 });
    }
    expect(tabela).toHaveLength(0);
  });

  it("subcomando é recusado com 50035, e não aceito em silêncio", async () => {
    const resposta = await chamar("/42/commands", {
      method: "PUT",
      body: JSON.stringify([
        {
          name: "musica",
          description: "grupo",
          options: [{ name: "tocar", description: "toca", type: 1, options: [] }],
        },
      ]),
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ code: 50035, message: "Invalid Form Body" });
    expect(tabela).toHaveLength(0);
  });
});

describe("/api/v10/applications/:app/guilds/:gid/commands", () => {
  let app: NestExpressApplication;
  let url: string;

  const chamar = (caminho: string, init: RequestInit = {}) =>
    fetch(`${url}/api/v10/applications${caminho}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: "Bot a.b.c" },
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
    tabela = [];
    proximoSnowflake = 1000000000000000100n;
    proximoId = 1;
  });

  it("registra por servidor e devolve `guild_id`, com o snowflake do caminho", async () => {
    const resposta = await chamar(`/42/guilds/${SERVIDOR.snowflake}/commands`, {
      method: "PUT",
      body: JSON.stringify(DEPLOY),
    });

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as Record<string, unknown>[];
    expect(corpo[0]?.guild_id).toBe(SERVIDOR.snowflake);
    // comando por servidor não leva `dm_permission`
    expect(corpo[0]).not.toHaveProperty("dm_permission");
    expect(tabela[0]?.guildId).toBe(SERVIDOR.cuid);
  });

  it("o escopo do servidor não vê o comando global, nem o contrário", async () => {
    await chamar("/42/commands", { method: "PUT", body: JSON.stringify([DEPLOY[1]]) });
    await chamar(`/42/guilds/${SERVIDOR.snowflake}/commands`, {
      method: "PUT",
      body: JSON.stringify([DEPLOY[0]]),
    });

    const globais = (await (await chamar("/42/commands")).json()) as { name: string }[];
    const doServidor = (await (
      await chamar(`/42/guilds/${SERVIDOR.snowflake}/commands`)
    ).json()) as { name: string }[];

    expect(globais.map((c) => c.name)).toEqual(["ping"]);
    expect(doServidor.map((c) => c.name)).toEqual(["play"]);
  });

  it("servidor de onde o bot saiu é 403 50001: registrar ali seria gravar no vácuo", async () => {
    const resposta = await chamar(`/42/guilds/${SEM_O_BOT.snowflake}/commands`, {
      method: "PUT",
      body: JSON.stringify(DEPLOY),
    });

    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ code: 50001 });
    expect(tabela).toHaveLength(0);
  });

  it("servidor desconhecido é 404 10004", async () => {
    const resposta = await chamar("/42/guilds/1000000000000000099/commands", {
      method: "PUT",
      body: "[]",
    });
    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toMatchObject({ code: 10004 });
  });
});
