import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import {
  ApplicationsCompatController,
  OAuth2ApplicationsCompatController,
} from "../rest/applications.controller";
import { ApplicationCommandsCompatController } from "../rest/application-commands.controller";
import { CargosCompatController } from "../rest/cargos.controller";
import { ChannelsCompatController } from "../rest/channels.controller";
import { GatewayCompatController } from "../rest/gateway.controller";
import { GuildsCompatController } from "../rest/guilds.controller";
import { InteractionCallbackCompatController } from "../rest/interactions.controller";
import { BanimentosCompatController, MembrosCompatController } from "../rest/membros.controller";
import { MessagesCompatController } from "../rest/messages.controller";
import { UsersCompatController } from "../rest/users.controller";
import { WebhooksCompatController } from "../rest/webhooks.controller";
import { DocumentacaoCompatController } from "./documentacao.controller";
import { OPENAPI_COMPAT } from "./openapi";

/**
 * O que este arquivo protege: **a especificação não pode mentir.**
 *
 * Ela é escrita à mão (ver o cabeçalho de `openapi.ts`), e documentação escrita
 * à mão apodrece em silêncio — a rota muda, o documento fica, e quem confia
 * nele escreve um bot contra uma API que não existe mais. Como o documento é o
 * que a página empresarial publica, isso seria uma mentira publicada.
 *
 * Então o teste não confere "o formato está bonito": ele confere a
 * **correspondência com o código**. As rotas não saem de um arquivo lido como
 * texto, e sim dos **metadados que os decorators do Nest gravaram nas
 * classes** — é literalmente o que o Nest usa para montar o roteador. Rota que
 * o Nest registra e o documento não descreve (ou o contrário) reprova aqui.
 *
 * A comparação ignora o **nome** dos parâmetros: o caminho vira
 * `/channels/{}/messages/{}`. O nome no código é `:id`/`:mid` (curto, porque é
 * digitado o tempo todo) e no documento é `{channel_id}`/`{message_id}` (o do
 * Discord, porque é o que o leitor reconhece). Exigir que fossem iguais
 * pioraria os dois lados sem provar nada.
 */

// ── as rotas, segundo o Nest ─────────────────────────────────

/** `RequestMethod` → o verbo HTTP. */
const VERBO: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
};

/**
 * Os controllers da versão 10.
 *
 * Os aliases `v9` ficam de fora de propósito: eles herdam tudo e servem
 * exatamente as mesmas rotas, e a versão é uma **variável de servidor** no
 * documento (`/api/{versao}`), não um caminho a mais.
 */
const CONTROLLERS: (new (...args: never[]) => object)[] = [
  GatewayCompatController,
  UsersCompatController,
  ApplicationsCompatController,
  // extende o de cima e por isso não tem método próprio: o `/oauth2/…` só
  // aparece porque percorremos a cadeia de protótipos
  OAuth2ApplicationsCompatController,
  ApplicationCommandsCompatController,
  GuildsCompatController,
  MembrosCompatController,
  BanimentosCompatController,
  CargosCompatController,
  ChannelsCompatController,
  MessagesCompatController,
  InteractionCallbackCompatController,
  WebhooksCompatController,
  DocumentacaoCompatController,
];

/** `"v10/guilds/:gid/members"` + `":uid/roles/:rid"` → `/guilds/{}/members/{}/roles/{}`. */
function normalizarDoNest(prefixo: string, sufixo: string): string {
  const segmentos = [...prefixo.split("/"), ...sufixo.split("/")]
    .filter((s) => s.length > 0 && s !== "v10")
    .map((s) => (s.startsWith(":") ? "{}" : s));
  return `/${segmentos.join("/")}`;
}

/** `/channels/{channel_id}/messages` → `/channels/{}/messages`. */
function normalizarDoDocumento(caminho: string): string {
  return caminho.replace(/\{[^}]+\}/g, "{}");
}

/** As rotas que o Nest vai registrar, como `"MÉTODO /caminho"`. */
function rotasDoNest(): Set<string> {
  const rotas = new Set<string>();

  for (const controller of CONTROLLERS) {
    const prefixo = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
    expect(typeof prefixo, `${controller.name} sem @Controller`).toBe("string");
    if (prefixo === undefined) continue;

    // a cadeia de protótipos, e não só o próprio: o `OAuth2ApplicationsCompatController`
    // é uma classe vazia que herda o `@Get("@me")` — é assim que o alias existe
    let alvo: object | null = controller.prototype as object;
    const jaVistos = new Set<string>();
    while (alvo && alvo !== Object.prototype) {
      for (const nome of Object.getOwnPropertyNames(alvo)) {
        if (nome === "constructor" || jaVistos.has(nome)) continue;
        const handler = (alvo as Record<string, unknown>)[nome];
        if (typeof handler !== "function") continue;

        const sufixo = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        // método sem decorator de rota (os `private` de apoio) não é rota
        if (sufixo === undefined || metodo === undefined) continue;

        jaVistos.add(nome);
        const verbo = VERBO[metodo];
        expect(verbo, `verbo HTTP desconhecido em ${controller.name}.${nome}`).toBeDefined();
        rotas.add(`${verbo} ${normalizarDoNest(prefixo, sufixo)}`);
      }
      alvo = Object.getPrototypeOf(alvo) as object | null;
    }
  }

  return rotas;
}

/** As rotas que o documento descreve, no mesmo formato. */
function rotasDoDocumento(): Set<string> {
  const rotas = new Set<string>();
  for (const [caminho, item] of Object.entries(OPENAPI_COMPAT.paths)) {
    for (const verbo of ["get", "put", "post", "patch", "delete"] as const) {
      if (item[verbo]) rotas.add(`${verbo.toUpperCase()} ${normalizarDoDocumento(caminho)}`);
    }
  }
  return rotas;
}

// ── caminhar pelo documento ──────────────────────────────────

/** Todo `$ref` que aparece em qualquer profundidade. */
function referencias(valor: unknown, achados: string[] = []): string[] {
  if (Array.isArray(valor)) {
    for (const item of valor) referencias(item, achados);
    return achados;
  }
  if (typeof valor === "object" && valor !== null) {
    for (const [chave, filho] of Object.entries(valor)) {
      if (chave === "$ref" && typeof filho === "string") achados.push(filho);
      else referencias(filho, achados);
    }
  }
  return achados;
}

/** Resolve `#/components/schemas/Mensagem` dentro do próprio documento. */
function resolver(referencia: string): unknown {
  const partes = referencia.replace(/^#\//, "").split("/");
  let atual: unknown = OPENAPI_COMPAT;
  for (const parte of partes) {
    if (typeof atual !== "object" || atual === null) return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

/** Todas as operações, com o caminho e o verbo de onde vieram. */
function operacoes(): { caminho: string; verbo: string; operacao: Record<string, unknown> }[] {
  const lista: { caminho: string; verbo: string; operacao: Record<string, unknown> }[] = [];
  for (const [caminho, item] of Object.entries(OPENAPI_COMPAT.paths)) {
    for (const verbo of ["get", "put", "post", "patch", "delete"] as const) {
      const operacao = item[verbo];
      if (operacao) lista.push({ caminho, verbo, operacao: operacao as unknown as Record<string, unknown> });
    }
  }
  return lista;
}

// ── os testes ────────────────────────────────────────────────

describe("a especificação OpenAPI da API de bots", () => {
  it("é um documento 3.1 com título e versão", () => {
    expect(OPENAPI_COMPAT.openapi).toBe("3.1.0");
    expect(OPENAPI_COMPAT.info.title).toBe("API de Bots do Streamz");
    expect(OPENAPI_COMPAT.info.version.length).toBeGreaterThan(0);
    expect(OPENAPI_COMPAT.servers.length).toBeGreaterThan(0);
  });

  it("descreve exatamente as rotas que o Nest registra", () => {
    const doNest = rotasDoNest();
    const doDocumento = rotasDoDocumento();

    // pelo menos uma rota de cada lado — um `Set` vazio dos dois lados passaria
    // nas duas comparações abaixo sem provar nada
    expect(doNest.size).toBeGreaterThan(40);

    const naoDocumentadas = [...doNest].filter((r) => !doDocumento.has(r)).sort();
    const inventadas = [...doDocumento].filter((r) => !doNest.has(r)).sort();

    expect(naoDocumentadas, "rotas que existem e a especificação não descreve").toEqual([]);
    expect(inventadas, "rotas na especificação que não existem no código").toEqual([]);
  });

  it("não tem `$ref` quebrado", () => {
    const quebradas = [...new Set(referencias(OPENAPI_COMPAT))].filter(
      (r) => resolver(r) === undefined,
    );
    expect(quebradas).toEqual([]);
  });

  it("não repete `operationId`", () => {
    const ids = operacoes().map(({ operacao }) => operacao.operationId as string);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repetidos).toEqual([]);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("tem todo caminho começando com `/` e sem barra final", () => {
    for (const caminho of Object.keys(OPENAPI_COMPAT.paths)) {
      expect(caminho.startsWith("/"), `${caminho} não começa com /`).toBe(true);
      expect(caminho.endsWith("/"), `${caminho} termina com /`).toBe(false);
    }
  });

  it("declara todos os parâmetros de rota que os caminhos usam", () => {
    for (const [caminho, item] of Object.entries(OPENAPI_COMPAT.paths)) {
      const noGabarito = [...caminho.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);

      for (const verbo of ["get", "put", "post", "patch", "delete"] as const) {
        const operacao = item[verbo];
        if (!operacao) continue;

        const declarados = [...(item.parameters ?? []), ...(operacao.parameters ?? [])]
          // um parâmetro por referência é resolvido antes de ser lido
          .map((p) => ("$ref" in p ? (resolver(p.$ref) as { name: string; in: string } | undefined) : p))
          .filter((p): p is { name: string; in: string } => p !== undefined && p.in === "path")
          .map((p) => p.name);

        for (const nome of noGabarito) {
          expect(declarados, `${verbo.toUpperCase()} ${caminho}: falta declarar {${nome}}`).toContain(
            nome,
          );
        }
        for (const nome of declarados) {
          expect(noGabarito, `${verbo.toUpperCase()} ${caminho}: {${nome}} não está no caminho`).toContain(
            nome,
          );
        }
      }
    }
  });

  it("só usa tags declaradas, e usa todas elas", () => {
    const declaradas = OPENAPI_COMPAT.tags.map((t) => t.name);
    const usadas = new Set<string>();
    for (const { caminho, verbo, operacao } of operacoes()) {
      const tags = operacao.tags as string[];
      expect(tags.length, `${verbo.toUpperCase()} ${caminho} sem tag`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(declaradas, `tag não declarada: ${tag}`).toContain(tag);
        usadas.add(tag);
      }
    }
    expect([...declaradas].filter((t) => !usadas.has(t)), "tags declaradas e nunca usadas").toEqual(
      [],
    );
  });

  it("só exige esquemas de segurança que existem", () => {
    const esquemas = Object.keys(OPENAPI_COMPAT.components.securitySchemes);
    for (const entrada of OPENAPI_COMPAT.security) {
      for (const nome of Object.keys(entrada)) expect(esquemas).toContain(nome);
    }
    for (const { operacao } of operacoes()) {
      const seguranca = operacao.security as Record<string, string[]>[] | undefined;
      if (!seguranca) continue;
      for (const entrada of seguranca) {
        for (const nome of Object.keys(entrada)) expect(esquemas).toContain(nome);
      }
    }
  });

  it("descreve toda rota e todo código de resposta com texto de verdade", () => {
    for (const { caminho, verbo, operacao } of operacoes()) {
      const onde = `${verbo.toUpperCase()} ${caminho}`;
      expect((operacao.summary as string)?.length ?? 0, `${onde} sem resumo`).toBeGreaterThan(0);
      // 40 caracteres é o piso do "é documentação, não é rótulo repetido"
      expect((operacao.description as string)?.length ?? 0, `${onde} sem descrição`).toBeGreaterThan(40);

      const respostas = operacao.responses as Record<string, unknown>;
      expect(Object.keys(respostas).length, `${onde} sem resposta`).toBeGreaterThan(0);
      for (const codigo of Object.keys(respostas)) {
        expect(/^[1-5]\d\d$/.test(codigo), `${onde}: código de resposta estranho (${codigo})`).toBe(
          true,
        );
      }
      // o 401 só falta onde o credencial é o token do caminho (interações)
      const publica = Array.isArray(operacao.security) && operacao.security.length === 0;
      if (!publica) expect(Object.keys(respostas), `${onde} sem 401`).toContain("401");
    }
  });

  it("carrega os blocos `x-` que a página de documentação consome", () => {
    const guias = OPENAPI_COMPAT["x-guias"] as { id: string; titulo: string; conteudo: string }[];
    expect(guias.length).toBeGreaterThanOrEqual(9);
    for (const guia of guias) {
      expect(guia.id).toMatch(/^[a-z-]+$/);
      expect(guia.titulo.length).toBeGreaterThan(0);
      expect(guia.conteudo.length).toBeGreaterThan(200);
    }
    // ids repetidos virariam âncoras duplicadas na página
    const ids = guias.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);

    const permissoes = OPENAPI_COMPAT["x-tabela-permissoes"] as {
      pares: { streamz: string; bitStreamz: number }[];
      sempreConcedidas: unknown[];
      sempreApagadas: string[];
    };
    // as 21 do Streamz, e os bits sem buraco nem repetição
    expect(permissoes.pares).toHaveLength(21);
    expect(permissoes.pares.map((p) => p.bitStreamz)).toEqual([...Array(21).keys()]);
    // as duas listas do §6: o que se prova aqui é que nenhuma ficou vazia — o
    // conteúdo delas é prosa conferida contra o documento, não aritmética
    expect(permissoes.sempreConcedidas.length).toBeGreaterThan(0);
    expect(permissoes.sempreApagadas.length).toBeGreaterThan(0);

    for (const chave of [
      "x-intents",
      "x-opcodes",
      "x-eventos-gateway",
      "x-codigos-de-fechamento",
      "x-codigos-de-erro",
    ] as const) {
      expect(Array.isArray(OPENAPI_COMPAT[chave]), `${chave} deveria ser uma lista`).toBe(true);
      expect((OPENAPI_COMPAT[chave] as unknown[]).length, `${chave} vazio`).toBeGreaterThan(0);
    }
  });
});
