import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BotTokenGuard } from "./bot-token.guard";
import { traduzirExcecao } from "./erros";
import type { ApplicationsService } from "../applications/applications.service";
import type { IdsService } from "./ids.service";
import type { RequisicaoDeBot } from "./tipos";

/**
 * O guard e o 401.
 *
 * O que está sendo provado não é "recusa quem não tem token" — é que ele recusa
 * **com 401**, no corpo que o discord.js entende. Um 403 aqui deixa a lib em
 * retry cego em vez de levantar `TokenInvalid` (§5).
 */

const VERIFICADO = {
  application: { id: "app_1", snowflake: 42n, name: "Bot de teste" },
  botUserId: "user_bot",
};

function contexto(headers: Record<string, string | string[] | undefined>) {
  const req = { headers } as unknown as RequisicaoDeBot;
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

function guard(
  verificarToken: ApplicationsService["verificarToken"],
  snowflakeDeUsuario: IdsService["snowflakeDeUsuario"] = async () => 7n,
) {
  return new BotTokenGuard(
    { verificarToken } as unknown as ApplicationsService,
    { snowflakeDeUsuario } as unknown as IdsService,
  );
}

/** O que a resposta HTTP teria, se o filtro tivesse pegado a exceção. */
async function recusa(headers: Record<string, string | string[] | undefined>, verificar = async () => null) {
  const { ctx } = contexto(headers);
  try {
    await guard(verificar as ApplicationsService["verificarToken"]).canActivate(ctx);
    return null;
  } catch (e) {
    return traduzirExcecao(e);
  }
}

describe("BotTokenGuard", () => {
  it("põe o bot em req.bot quando o token vale", async () => {
    const verificar = vi.fn(async () => VERIFICADO);
    const { req, ctx } = contexto({ authorization: "Bot MTM4.aGVj.segredo" });

    await expect(
      guard(verificar as unknown as ApplicationsService["verificarToken"]).canActivate(ctx),
    ).resolves.toBe(true);

    // o token vai inteiro para o service — o hash é do texto todo, não das partes
    expect(verificar).toHaveBeenCalledWith("MTM4.aGVj.segredo");
    expect(req.bot).toEqual({
      applicationId: "app_1",
      applicationSnowflake: 42n,
      applicationName: "Bot de teste",
      botUserId: "user_bot",
      botSnowflake: 7n,
    });
  });

  it("recusa com 401 no formato do Discord — e nunca com 403", async () => {
    const esperado = { status: 401, corpo: { code: 0, message: "401: Unauthorized" } };

    // sem cabeçalho nenhum
    expect(await recusa({})).toEqual(esperado);
    // `Bearer` é do JwtGuard: os dois esquemas convivem porque o prefixo separa
    expect(await recusa({ authorization: "Bearer um.jwt.qualquer" })).toEqual(esperado);
    // prefixo certo, token vazio
    expect(await recusa({ authorization: "Bot " })).toEqual(esperado);
    // sem prefixo
    expect(await recusa({ authorization: "MTM4.aGVj.segredo" })).toEqual(esperado);
    // cabeçalho repetido chega como array
    expect(await recusa({ authorization: ["Bot a.b.c", "Bot d.e.f"] })).toEqual(esperado);
    // token desconhecido ou revogado: `verificarToken` devolve null nos dois casos
    expect(await recusa({ authorization: "Bot nao.existe.mais" })).toEqual(esperado);
  });

  it("recusa com 401 quando o usuário-bot sumiu com o token de pé", async () => {
    const { ctx } = contexto({ authorization: "Bot MTM4.aGVj.segredo" });
    const semUsuario = guard(
      (async () => VERIFICADO) as unknown as ApplicationsService["verificarToken"],
      async () => null,
    );

    // 500 aqui seria mentira: para a lib do bot é credencial que não vale mais
    const erro = await semUsuario.canActivate(ctx).catch((e: unknown) => e);
    expect(traduzirExcecao(erro)).toEqual({
      status: 401,
      corpo: { code: 0, message: "401: Unauthorized" },
    });
  });
});
