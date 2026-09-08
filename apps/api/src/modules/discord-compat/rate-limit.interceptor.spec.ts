import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { traduzirExcecao } from "./erros";
import { RateLimitDoDiscordInterceptor } from "./rate-limit.interceptor";

/**
 * Os cabeçalhos que o `@discordjs/rest` lê e o corpo do 429.
 *
 * O que precisa estar certo, e por quê: `retry_after` é **float em segundos**
 * (em milissegundos o bot dormiria 700 vezes mais), `X-RateLimit-Reset` é epoch
 * em segundos com fração, e o bucket é estável entre chamadas da mesma rota — é
 * a chave da fila que a lib mantém.
 */

/** `res` de mentira: só o `setHeader`, que é tudo que o interceptor usa. */
function resposta() {
  const cabecalhos = new Map<string, string>();
  return {
    cabecalhos,
    res: { setHeader: (nome: string, valor: string) => cabecalhos.set(nome, valor) },
  };
}

function contexto(res: unknown, params: Record<string, string> = {}, applicationId = "app_1") {
  const req = { bot: { applicationId }, params, headers: {} };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getClass: () => class GatewayCompatController {},
    getHandler: () => function gatewayDoBot() {},
  } as unknown as ExecutionContext;
}

const proximo: CallHandler = { handle: () => of("ok") };

describe("RateLimitDoDiscordInterceptor", () => {
  let interceptor: RateLimitDoDiscordInterceptor;

  beforeEach(() => {
    interceptor = new RateLimitDoDiscordInterceptor();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
  });

  it("manda os cinco cabeçalhos em toda resposta", async () => {
    const { cabecalhos, res } = resposta();
    await firstValueFrom(interceptor.intercept(contexto(res), proximo));

    expect(cabecalhos.get("X-RateLimit-Limit")).toBe("50");
    // 50 - 1: o `Remaining` é o que sobra **depois** desta requisição
    expect(cabecalhos.get("X-RateLimit-Remaining")).toBe("49");
    // epoch em segundos, com fração — nunca milissegundos
    expect(cabecalhos.get("X-RateLimit-Reset")).toBe("1788868801.000");
    expect(cabecalhos.get("X-RateLimit-Reset-After")).toBe("1.000");
    expect(cabecalhos.get("X-RateLimit-Bucket")).toMatch(/^[\w-]{22}$/);
  });

  it("o bucket é estável por rota+recurso e muda com o recurso", async () => {
    const a = resposta();
    const b = resposta();
    const c = resposta();
    await firstValueFrom(interceptor.intercept(contexto(a.res, { id: "111" }), proximo));
    await firstValueFrom(interceptor.intercept(contexto(b.res, { id: "111" }), proximo));
    await firstValueFrom(interceptor.intercept(contexto(c.res, { id: "222" }), proximo));

    expect(a.cabecalhos.get("X-RateLimit-Bucket")).toBe(b.cabecalhos.get("X-RateLimit-Bucket"));
    expect(a.cabecalhos.get("X-RateLimit-Bucket")).not.toBe(c.cabecalhos.get("X-RateLimit-Bucket"));
  });

  it("no 51º pedido do segundo devolve 429 com retry_after em SEGUNDOS", async () => {
    for (let i = 0; i < 50; i++) {
      await firstValueFrom(interceptor.intercept(contexto(resposta().res), proximo));
    }
    // meio segundo depois: a janela ainda é a mesma
    vi.setSystemTime(new Date("2026-09-08T12:00:00.500Z"));

    const { cabecalhos, res } = resposta();
    const handle = vi.fn(() => of("ok"));
    const erro = (() => {
      try {
        interceptor.intercept(contexto(res), { handle });
        return null;
      } catch (e) {
        return e;
      }
    })();

    // o handler não roda: um 429 não pode ter efeito colateral
    expect(handle).not.toHaveBeenCalled();
    // o mesmo caminho de erro do resto: o filtro que os controllers já declaram
    expect(traduzirExcecao(erro)).toEqual({
      status: 429,
      corpo: {
        message: "You are being rate limited.",
        // 0,5 s — em ms seriam 500 e o bot dormiria oito minutos
        retry_after: 0.5,
        global: false,
      },
    });
    expect(cabecalhos.get("X-RateLimit-Remaining")).toBe("0");
    expect(cabecalhos.get("X-RateLimit-Scope")).toBe("user");
    // o cabeçalho clássico é em segundos inteiros, arredondados para cima
    expect(cabecalhos.get("Retry-After")).toBe("1");
  });

  it("a janela seguinte devolve o crédito, e um bot não gasta o do outro", async () => {
    for (let i = 0; i < 50; i++) {
      await firstValueFrom(interceptor.intercept(contexto(resposta().res), proximo));
    }

    // outro aplicativo, mesma janela: a chave é `bot:<applicationId>`
    const outro = resposta();
    await firstValueFrom(
      interceptor.intercept(contexto(outro.res, {}, "app_2"), proximo),
    );
    expect(outro.cabecalhos.get("X-RateLimit-Remaining")).toBe("49");

    vi.setSystemTime(new Date("2026-09-08T12:00:01.100Z"));
    const depois = resposta();
    await expect(
      firstValueFrom(interceptor.intercept(contexto(depois.res), proximo)),
    ).resolves.toBe("ok");
    expect(depois.cabecalhos.get("X-RateLimit-Remaining")).toBe("49");
  });
});
