import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { ApplicationsController } from "./applications.controller";
import { DiretorioController } from "./diretorio.controller";
import { DiretorioService, TAMANHO_DA_PAGINA, urlDoIconeDoApp } from "./diretorio.service";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * O diretório: a ordem das rotas e as regras de leitura.
 *
 * ── j-bots · F4, lote B ──
 */

// ── a ordem de declaração ──────────────────────────────────

/**
 * As rotas `GET` de um controller, **na ordem em que foram declaradas**.
 *
 * É a mesma lista que o `MetadataScanner` do Nest percorre para registrar os
 * handlers: os nomes próprios do protótipo, que em JavaScript saem na ordem de
 * definição (chaves de texto; as numéricas seriam ordenadas, e não há nenhuma
 * aqui). Ler o metadado é o que permite testar isto **sem** subir um servidor
 * HTTP — a API não tem `@nestjs/testing` nem supertest, e acrescentá-los por um
 * teste seria uma dependência nova fora do escopo do lote.
 */
function rotasGet(controller: new (...args: never[]) => object): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((nome) => nome !== "constructor")
    .filter((nome) => {
      const fn = proto[nome];
      return (
        typeof fn === "function" &&
        Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.GET
      );
    })
    .map((nome) => String(Reflect.getMetadata(PATH_METADATA, proto[nome] as object)));
}

describe("DiretorioController — a ordem das rotas", () => {
  it('declara "publicas" ANTES de ":id"', () => {
    const rotas = rotasGet(DiretorioController);

    expect(rotas).toContain("publicas");
    expect(rotas).toContain(":id");
    // É o teste que o §3.2 do contrato pede. Ao contrário, o Express casaria
    // `publicas` com `:id`, o diretório inteiro responderia 404 e nada
    // apareceria no log: do ponto de vista do servidor seria só um cuid que
    // não existe.
    expect(
      rotas.indexOf("publicas"),
      `ordem errada: ${rotas.join(" → ")} — "publicas" viraria um id`,
    ).toBeLessThan(rotas.indexOf(":id"));
  });

  it("o portal (lote A) não declara um GET de um segmento que roube o diretório", () => {
    // `@Get(":id")` é do diretório. Se o portal ganhar um irmão de um segmento
    // só, os dois passam a disputar — e quem vence depende da ordem do array
    // `controllers:`, que é frágil demais para ficar implícita.
    const doPortal = rotasGet(ApplicationsController);
    const deUmSegmento = doPortal.filter((r) => r !== "" && r !== "/" && !r.includes("/"));
    expect(
      deUmSegmento.filter((r) => r.startsWith(":")),
      `o ApplicationsController declarou ${deUmSegmento.join(", ")}: fale com o coordenador`,
    ).toEqual([]);
  });

  it("os dois controllers dividem o mesmo prefixo, de propósito", () => {
    expect(Reflect.getMetadata(PATH_METADATA, DiretorioController)).toBe("applications");
    expect(Reflect.getMetadata(PATH_METADATA, ApplicationsController)).toBe("applications");
  });
});

// ── as regras de leitura ───────────────────────────────────

/** Uma linha de `Application` como o `SELECT_DO_DIRETORIO` a devolve. */
function linha(campos: Partial<Record<string, unknown>> = {}) {
  return {
    id: "app1",
    snowflake: 987654321098765432n,
    name: "Hydra",
    description: "Toca música",
    iconKey: null,
    permissoesPadrao: 3,
    ownerId: "u_dono",
    publico: true,
    botUser: {
      id: "u_bot",
      username: "hydra",
      displayName: "Hydra",
      avatarUrl: null,
      status: "ONLINE",
      isBot: true,
    },
    _count: { installs: 7 },
    ...campos,
  };
}

function servico(linhas: ReturnType<typeof linha>[]) {
  const chamadas: unknown[] = [];
  const prisma = {
    application: {
      async findMany(args: unknown) {
        chamadas.push(args);
        return linhas;
      },
      async findUnique(args: { where: { id: string } }) {
        chamadas.push(args);
        return linhas.find((l) => l.id === args.where.id) ?? null;
      },
    },
  } as unknown as PrismaService;
  return { diretorio: new DiretorioService(prisma), chamadas };
}

describe("DiretorioService.listarPublicas", () => {
  it("filtra por publico e devolve o card montado", async () => {
    const { diretorio, chamadas } = servico([linha()]);

    const pagina = await diretorio.listarPublicas();

    expect(chamadas[0]).toMatchObject({ where: { publico: true } });
    expect(pagina.itens[0]).toEqual({
      id: "app1",
      // string decimal, nunca number: o valor passa de 2^53
      snowflake: "987654321098765432",
      name: "Hydra",
      description: "Toca música",
      iconUrl: null,
      permissoesPadrao: 3,
      servidores: 7,
      botUser: expect.objectContaining({ id: "u_bot", bot: true }),
    });
    expect(pagina.proximoCursor).toBeNull();
  });

  it("busca em nome E descrição, sem diferenciar maiúsculas", async () => {
    const { diretorio, chamadas } = servico([]);

    await diretorio.listarPublicas("  música  ");

    expect(chamadas[0]).toMatchObject({
      where: {
        publico: true,
        OR: [
          { name: { contains: "música", mode: "insensitive" } },
          { description: { contains: "música", mode: "insensitive" } },
        ],
      },
    });
  });

  it("busca só com espaços é o mesmo que busca nenhuma", async () => {
    const { diretorio, chamadas } = servico([]);
    await diretorio.listarPublicas("   ");
    expect(chamadas[0]).toMatchObject({ where: { publico: true } });
    expect((chamadas[0] as { where: Record<string, unknown> }).where.OR).toBeUndefined();
  });

  it("a linha excedente vira o cursor, e não entra na página", async () => {
    const cheia = Array.from({ length: TAMANHO_DA_PAGINA + 1 }, (_, i) =>
      linha({ id: `app${i}` }),
    );
    const { diretorio } = servico(cheia);

    const pagina = await diretorio.listarPublicas();

    expect(pagina.itens).toHaveLength(TAMANHO_DA_PAGINA);
    expect(pagina.proximoCursor).toBe(`app${TAMANHO_DA_PAGINA - 1}`);
  });

  it("um limit absurdo não vira varredura de tabela", async () => {
    const { diretorio, chamadas } = servico([]);
    await diretorio.listarPublicas(undefined, undefined, 100_000);
    expect(chamadas[0]).toMatchObject({ take: TAMANHO_DA_PAGINA + 1 });
  });

  it("com cursor, pula a linha do cursor (senão ela se repetiria)", async () => {
    const { diretorio, chamadas } = servico([]);
    await diretorio.listarPublicas(undefined, "app9");
    expect(chamadas[0]).toMatchObject({ skip: 1, cursor: { id: "app9" } });
  });
});

describe("DiretorioService.porId", () => {
  it("devolve o app público para qualquer um", async () => {
    const { diretorio } = servico([linha()]);
    await expect(diretorio.porId("u_qualquer", "app1")).resolves.toMatchObject({ id: "app1" });
  });

  it("devolve o app privado para o dono", async () => {
    const { diretorio } = servico([linha({ publico: false })]);
    await expect(diretorio.porId("u_dono", "app1")).resolves.toMatchObject({ id: "app1" });
  });

  it("app privado de outra pessoa é 404, e não 403", async () => {
    const { diretorio } = servico([linha({ publico: false })]);
    // um 403 confirmaria que o id existe, e a privacidade de um app que o dono
    // ainda não publicou inclui a existência dele
    await expect(diretorio.porId("u_qualquer", "app1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("app que não existe é 404 — a mesma resposta, indistinguível", async () => {
    const { diretorio } = servico([]);
    await expect(diretorio.porId("u_qualquer", "app1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("urlDoIconeDoApp", () => {
  it("sem chave no storage, não há URL", () => {
    expect(urlDoIconeDoApp("app1", null)).toBeNull();
  });

  it("com chave, deriva a URL e carimba a versão (senão o cache mostra o antigo)", () => {
    expect(urlDoIconeDoApp("app1", "app-icons/app1/abc123.png")).toContain(
      "/api/applications/app1/icone?v=abc123.png",
    );
  });
});
