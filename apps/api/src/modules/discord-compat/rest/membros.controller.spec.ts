import "reflect-metadata";
import { ForbiddenException, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsService } from "../../applications/applications.service";
import { GuildsService } from "../../guilds/guilds.service";
import { ModerationService } from "../../moderation/moderation.service";
import { RolesService } from "../../roles/roles.service";
import { DadosDeCompatService } from "../dados.service";
import { IdsService } from "../ids.service";
import {
  BanimentosCompatController,
  horasDeLimpeza,
  MembrosCompatController,
} from "./membros.controller";

/**
 * ── F5 membros ── As rotas de cargo, castigo, expulsão e banimento.
 *
 * O que este arquivo protege, em uma frase: **o código de erro**. Um bot
 * classifica pelo número (`10011` = esse cargo não existe mais, `50013` = falta
 * permissão, `50028` = esse cargo não se veste), e o caminho fácil — deixar o
 * `NotFoundException` do service subir — devolveria `10003 Unknown Channel`
 * para um cargo que não existe, porque é assim que o `FiltroDeErrosDoDiscord`
 * traduz um 404 genérico. Cada `it` abaixo é um número desses.
 *
 * O guard e o interceptor **de verdade** ficam no caminho (o mesmo desenho de
 * `application-commands.controller.spec.ts`): o que se troca são as
 * dependências deles e os services de escrita, para se poder ler o que a casca
 * entregou.
 */

const TOKEN = "t".repeat(40);

const BOT = {
  applicationId: "app_1",
  applicationSnowflake: 111n,
  applicationName: "Bot de prova",
  botUserId: "user_bot",
  botSnowflake: 222n,
};

const SERVIDOR = { cuid: "guild_1", snowflake: "1000000000000000001" };
const DE_FORA = { cuid: "guild_2", snowflake: "1000000000000000002" };
const MEMBRO = { cuid: "user_alvo", snowflake: "1000000000000000010" };
const ESTRANHO = { snowflake: "1000000000000000011" };

const CARGO = {
  id: "role_1",
  snowflake: 1000000000000000020n,
  guildId: SERVIDOR.cuid,
  guildSnowflake: BigInt(SERVIDOR.snowflake),
  name: "Moderação",
  color: null,
  position: 3,
  permissions: 0,
  hoist: false,
  mentionable: false,
  isDefault: false,
};
const EVERYONE = { ...CARGO, id: "role_everyone", snowflake: 999n, name: "@everyone", position: 0, isDefault: true };

const LINHA_DE_MEMBRO = {
  user: { id: MEMBRO.cuid, snowflake: BigInt(MEMBRO.snowflake), username: "alvo", displayName: null, isBot: false },
  cargoSnowflakes: [CARGO.snowflake],
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  timeoutUntil: null as Date | null,
  nickname: null as string | null,
};

const assign = vi.fn(async (..._a: unknown[]) => ({ userId: MEMBRO.cuid, roleIds: [CARGO.id] }));
const unassign = vi.fn(async (..._a: unknown[]) => ({ userId: MEMBRO.cuid, roleIds: [] }));
const timeout = vi.fn(async (..._a: unknown[]) => ({ userId: MEMBRO.cuid, timeoutUntil: null }));
const removeTimeout = vi.fn(async (..._a: unknown[]) => ({ userId: MEMBRO.cuid, timeoutUntil: null }));
const kick = vi.fn(async (..._a: unknown[]) => ({ kicked: MEMBRO.cuid }));
const ban = vi.fn(async (..._a: unknown[]) => ({ banned: MEMBRO.cuid }));
const unban = vi.fn(async (..._a: unknown[]) => ({ unbanned: MEMBRO.cuid }));
const isBanned = vi.fn(async (_g: string, userId: string) => userId === MEMBRO.cuid);
const roleIdsOf = vi.fn(async (..._a: unknown[]) => [CARGO.id]);
const listBans = vi.fn(async (..._a: unknown[]) => [
  {
    reason: "spam",
    createdAt: "2026-02-01T00:00:00.000Z",
    user: { id: MEMBRO.cuid, username: "alvo", displayName: null, bot: false },
  },
]);

@Module({
  controllers: [MembrosCompatController, BanimentosCompatController],
  providers: [
    {
      provide: ApplicationsService,
      useValue: {
        verificarToken: async (t: string) =>
          t === TOKEN
            ? {
                application: {
                  id: BOT.applicationId,
                  snowflake: BOT.applicationSnowflake,
                  name: BOT.applicationName,
                },
                botUserId: BOT.botUserId,
              }
            : null,
      },
    },
    {
      provide: IdsService,
      useValue: {
        snowflakeDeUsuario: async () => BOT.botSnowflake,
        cuidDeServidor: async (sf: string) =>
          ({ [SERVIDOR.snowflake]: SERVIDOR.cuid, [DE_FORA.snowflake]: DE_FORA.cuid })[sf] ?? null,
        cuidDeUsuario: async (sf: string) => (sf === MEMBRO.snowflake ? MEMBRO.cuid : null),
        snowflakesEmLote: async () => new Map([[MEMBRO.cuid, BigInt(MEMBRO.snowflake)]]),
      },
    },
    {
      provide: DadosDeCompatService,
      useValue: {
        // o bot é membro do primeiro servidor e não do segundo
        membroDoServidor: async (guildId: string, userId: string) => {
          if (guildId !== SERVIDOR.cuid) return null;
          if (userId === BOT.botUserId) return { ...LINHA_DE_MEMBRO, user: { ...LINHA_DE_MEMBRO.user, id: BOT.botUserId } };
          return userId === MEMBRO.cuid ? LINHA_DE_MEMBRO : null;
        },
        cargosDoServidor: async () => [EVERYONE, CARGO],
      },
    },
    { provide: RolesService, useValue: { assign, unassign } },
    { provide: ModerationService, useValue: { timeout, removeTimeout, kick, ban } },
    { provide: GuildsService, useValue: { roleIdsOf, listBans, isBanned, unban } },
  ],
})
class ModuloDeProva {}

describe("/api/v10/guilds/:gid/members e /bans", () => {
  let app: NestExpressApplication;
  let url: string;

  const chamar = (caminho: string, init: RequestInit = {}) =>
    fetch(`${url}/api/v10/guilds${caminho}`, {
      ...init,
      headers: {
        authorization: `Bot ${TOKEN}`,
        "content-type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(ModuloDeProva, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix("api");
    // o pipe global do `main.ts`, ligado: é ele que apagaria o corpo se as
    // rotas não usassem `@Body()` cru + zod
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    for (const espiao of [assign, unassign, timeout, removeTimeout, kick, ban, unban, roleIdsOf]) {
      espiao.mockClear();
    }
  });

  // ── cargo de membro: a rota que três bots esperavam ──────────

  it("PUT .../roles/:rid dá o cargo e responde 204 sem corpo", async () => {
    const resposta = await chamar(
      `/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}/roles/${CARGO.snowflake}`,
      { method: "PUT" },
    );

    expect(resposta.status).toBe(204);
    expect(await resposta.text()).toBe("");
    // o **service**, não um `create` na mão: é ele que emite o `member.updated`
    // que atualiza a lista de membros do navegador e vira `GUILD_MEMBER_UPDATE`
    expect(assign).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, CARGO.id);
  });

  it("DELETE .../roles/:rid tira o cargo", async () => {
    const resposta = await chamar(
      `/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}/roles/${CARGO.snowflake}`,
      { method: "DELETE" },
    );

    expect(resposta.status).toBe(204);
    expect(unassign).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, CARGO.id);
  });

  it("cargo que não é deste servidor leva 10011, e não o 10003 do filtro genérico", async () => {
    const resposta = await chamar(
      `/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}/roles/1000000000000000099`,
      { method: "PUT" },
    );

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({ code: 10011, message: "Unknown Role" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("o @everyone (id do servidor) não se veste à mão: 50028", async () => {
    const resposta = await chamar(
      `/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}/roles/${SERVIDOR.snowflake}`,
      { method: "PUT" },
    );

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ code: 50028, message: "Invalid Role" });
  });

  it("quem não é membro leva 10007", async () => {
    const resposta = await chamar(
      `/${SERVIDOR.snowflake}/members/${ESTRANHO.snowflake}/roles/${CARGO.snowflake}`,
      { method: "PUT" },
    );

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({ code: 10007, message: "Unknown Member" });
  });

  it("servidor em que o bot não está leva 10004 (e não 403: o Discord não confirma que existe)", async () => {
    const resposta = await chamar(
      `/${DE_FORA.snowflake}/members/${MEMBRO.snowflake}/roles/${CARGO.snowflake}`,
      { method: "PUT" },
    );

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({ code: 10004, message: "Unknown Guild" });
  });

  it("hierarquia: o `ForbiddenException` do service vira 50013 e nada é escrito", async () => {
    assign.mockRejectedValueOnce(
      new ForbiddenException("Você não pode mexer num cargo igual ou acima do seu"),
    );

    const resposta = await chamar(
      `/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}/roles/${CARGO.snowflake}`,
      { method: "PUT" },
    );

    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({ code: 50013, message: "Missing Permissions" });
  });

  // ── PATCH do membro ─────────────────────────────────────────

  it("PATCH com `roles` **substitui** o conjunto: dá o que falta e tira o que sobra", async () => {
    roleIdsOf.mockResolvedValueOnce(["role_antigo"]);

    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "PATCH",
      body: JSON.stringify({ roles: [String(CARGO.snowflake)] }),
    });

    expect(resposta.status).toBe(200);
    expect(assign).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, CARGO.id);
    expect(unassign).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, "role_antigo");
  });

  it("PATCH com `communication_disabled_until` silencia pelo ModerationService", async () => {
    const ate = "2030-01-01T00:00:00.000Z";
    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "PATCH",
      body: JSON.stringify({ communication_disabled_until: ate }),
      headers: { "x-audit-log-reason": "flood" },
    });

    expect(resposta.status).toBe(200);
    expect(timeout).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, {
      until: ate,
      reason: "flood",
    });
  });

  it("`communication_disabled_until: null` tira o castigo", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "PATCH",
      body: JSON.stringify({ communication_disabled_until: null }),
    });

    expect(resposta.status).toBe(200);
    expect(removeTimeout).toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  });

  it("data que não é data leva 50035 com o campo apontado", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "PATCH",
      body: JSON.stringify({ communication_disabled_until: "amanhã" }),
    });

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { code: number; errors: Record<string, unknown> };
    expect(corpo.code).toBe(50035);
    expect(corpo.errors).toHaveProperty("communication_disabled_until");
    expect(timeout).not.toHaveBeenCalled();
  });

  // A divergência declarada: editar apelido por esta casca não existe (o §6 já
  // lista `MANAGE_NICKNAMES` entre as permissões sempre apagadas, e esta
  // entrega não criou o bit `CHANGE_NICKNAME`). 200 mudo seria mentira.
  it("`nick` com texto leva 50013 — e o resto do PATCH não é aplicado", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "PATCH",
      body: JSON.stringify({ nick: "Zé", roles: [String(CARGO.snowflake)] }),
    });

    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({ code: 50013, message: "Missing Permissions" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("`nick: null` (limpar o que não existe) passa", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "PATCH",
      body: JSON.stringify({ nick: null }),
    });

    expect(resposta.status).toBe(200);
  });

  it("DELETE do membro expulsa pelo ModerationService", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/members/${MEMBRO.snowflake}`, {
      method: "DELETE",
    });

    expect(resposta.status).toBe(204);
    expect(kick).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, {
      reason: undefined,
    });
  });

  // ── banimentos ──────────────────────────────────────────────

  it("PUT /bans/:uid bane, e `delete_message_seconds` vira horas", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/bans/${MEMBRO.snowflake}`, {
      method: "PUT",
      body: JSON.stringify({ delete_message_seconds: 3600, reason: "spam" }),
    });

    expect(resposta.status).toBe(204);
    expect(ban).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid, {
      reason: "spam",
      deleteMessageHours: 1,
    });
  });

  it("DELETE /bans/:uid desbane", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/bans/${MEMBRO.snowflake}`, {
      method: "DELETE",
    });

    expect(resposta.status).toBe(204);
    expect(unban).toHaveBeenCalledWith(BOT.botUserId, SERVIDOR.cuid, MEMBRO.cuid);
  });

  it("desbanir quem não está banido leva 10026 Unknown Ban", async () => {
    isBanned.mockResolvedValueOnce(false);

    const resposta = await chamar(`/${SERVIDOR.snowflake}/bans/${MEMBRO.snowflake}`, {
      method: "DELETE",
    });

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({ code: 10026, message: "Unknown Ban" });
    expect(unban).not.toHaveBeenCalled();
  });

  it("GET /bans devolve `[{reason, user}]` com o **snowflake** do banido", async () => {
    const resposta = await chamar(`/${SERVIDOR.snowflake}/bans`);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual([
      {
        reason: "spam",
        user: expect.objectContaining({ id: MEMBRO.snowflake, username: "alvo" }),
      },
    ]);
  });
});

describe("horasDeLimpeza", () => {
  it("arredonda para cima: meia hora pedida nunca vira zero", () => {
    expect(horasDeLimpeza({ delete_message_seconds: 1800 })).toBe(1);
  });

  it("aceita o `delete_message_days` antigo", () => {
    expect(horasDeLimpeza({ delete_message_days: 2 })).toBe(48);
  });

  it("sem campo nenhum é 0 — não apagar nada", () => {
    expect(horasDeLimpeza({})).toBe(0);
  });
});
