import { describe, expect, it, vi } from "vitest";
import { HttpStatus } from "@nestjs/common";
import { aplicarContentTypeDoDiscord, JSON_DO_DISCORD } from "./content-type";
import { FiltroDeErrosDoDiscord, naoAutenticado } from "./erros";

/**
 * A regressão que a prova 4 da F1 pegou.
 *
 * O `json_or_text` do discord.py compara o `content-type` por **igualdade
 * exata** com `application/json`. O Express manda `application/json;
 * charset=utf-8`, a comparação falha e todo corpo chega ao bot como **string** —
 * o `login()` morre lá dentro com `TypeError: string indices must be integers`,
 * a três camadas de distância da causa.
 *
 * Este teste existe porque a correção é invisível: um `res.type("json")` ou um
 * `res.set(...)` bem-intencionado a desfaz sem quebrar nada que se veja daqui.
 */
describe("content-type das rotas de compat", () => {
  /** Um `res` de mentira que guarda o que foi gravado, como o Node guarda. */
  function respostaFalsa() {
    const cabecalhos = new Map<string, string>();
    return {
      cabecalhos,
      setHeader(nome: string, valor: string) {
        cabecalhos.set(nome.toLowerCase(), valor);
      },
    };
  }

  it("é `application/json` sem charset — o discord.py compara por igualdade", () => {
    const resposta = respostaFalsa();
    aplicarContentTypeDoDiscord(resposta);

    expect(resposta.cabecalhos.get("content-type")).toBe("application/json");
    expect(JSON_DO_DISCORD).not.toContain("charset");
  });

  it("desfaz o charset que o `res.send` do Express reescreve depois do corpo", () => {
    const resposta = respostaFalsa();
    aplicarContentTypeDoDiscord(resposta);

    // é literalmente o que o Express faz em `res.send`, depois de tudo que a
    // gente pôs antes: `this.set('Content-Type', setCharset(type, 'utf-8'))`
    resposta.setHeader("Content-Type", "application/json; charset=utf-8");

    expect(resposta.cabecalhos.get("content-type")).toBe("application/json");
  });

  it("não toca em Content-Type que não é JSON", () => {
    const resposta = respostaFalsa();
    aplicarContentTypeDoDiscord(resposta);

    resposta.setHeader("Content-Type", "text/html; charset=utf-8");

    expect(resposta.cabecalhos.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("o filtro de erros também o aplica — o guard recusa antes do interceptor", () => {
    // `setHeader` real (o de `respostaFalsa`) e não um `vi.fn()`: a correção
    // **substitui** o método, então um espião no lugar dele mediria o espião,
    // não o cabeçalho que o bot recebe.
    const resposta = { ...respostaFalsa(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => resposta }) };

    new FiltroDeErrosDoDiscord().catch(naoAutenticado(), host as never);

    expect(resposta.cabecalhos.get("content-type")).toBe("application/json");
    expect(resposta.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(resposta.json).toHaveBeenCalledWith({ code: 0, message: "401: Unauthorized" });
  });

  it("não deixa uma resposta já enviada virar um segundo erro", () => {
    const resposta = {
      setHeader: () => {
        throw new Error("Cannot set headers after they are sent to the client");
      },
    };
    expect(() => aplicarContentTypeDoDiscord(resposta)).not.toThrow();
  });
});
