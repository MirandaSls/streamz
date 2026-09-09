import { describe, expect, it, vi } from "vitest";
import { ApplicationsService, iconeDoApp } from "./applications.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import type { InstalacaoService } from "./instalacao.service";
import { appEditarSchema } from "@streamz/shared";

/**
 * O portal do desenvolvedor (F4, lote A): editar, apagar, ícone e a lista de
 * servidores.
 *
 * O que está aqui é o que dá para provar sem banco: **a checagem de dono** (404
 * para o que não existe, 403 para o de outra pessoa, em toda rota nova), **a
 * ordem do apagar** (o usuário-bot é quem cai, e a `Application` vem junto por
 * cascade), e **a derivação do `iconUrl`** — a peça que existe justamente
 * porque a `Application` não tem coluna de URL.
 *
 * O que **não** está aqui, e está dito no PR: o efeito no Postgres de verdade
 * (o cascade em si) e o R2 (não configurado na bancada).
 */

const LINHA = {
  id: "app_1",
  snowflake: 1382915770057249473n,
  ownerId: "u_dono",
  name: "Música",
  description: null as string | null,
  iconKey: null as string | null,
  publico: false,
  permissoesPadrao: 0,
  botUserId: "u_bot",
  createdAt: new Date("2026-09-08T12:00:00Z"),
};

const BOT_USER = {
  id: "u_bot",
  username: "musica",
  displayName: "Música",
  avatarUrl: null,
  status: "OFFLINE" as const,
  isBot: true,
};

/** Um Prisma de mentira com uma `Application` e nada mais. */
function bancada(linha: typeof LINHA | null = LINHA) {
  const findUnique = vi.fn(async () => linha);
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...(linha ?? LINHA),
    ...data,
    botUser: BOT_USER,
    tokens: [{ prefixo: "MTM4Mjkx", createdAt: new Date("2026-09-08T12:00:00Z") }],
  }));
  const apagarUsuario = vi.fn(async () => ({}));
  const instalacoesNoBanco = [
    {
      permissions: 3,
      createdAt: new Date("2026-09-08T15:00:00Z"),
      guild: { id: "g1", name: "Time de Produto", iconUrl: null as string | null },
    },
    {
      permissions: 0,
      createdAt: new Date("2026-09-08T16:00:00Z"),
      guild: { id: "g2", name: "Amigos", iconUrl: "https://cdn/x.png" as string | null },
    },
  ];
  const instalacoesFindMany = vi.fn(async (_args: { where: { applicationId: string } }) => instalacoesNoBanco);
  const prisma = {
    application: { findUnique, update },
    user: { delete: apagarUsuario },
    guildApplication: { findMany: instalacoesFindMany },
  } as unknown as PrismaService;

  const apagarObjeto = vi.fn(async () => {});
  const storage = {
    isConfigured: () => true,
    put: vi.fn(async () => {}),
    delete: apagarObjeto,
  } as unknown as StorageService;

  /**
   * O `InstalacaoService` entrou no construtor na **integração** da F4: é a
   * junção A↔B que o PR do lote A deixou anotada. Aqui ele devolve duas
   * instalações, para o teste poder provar que apagar o aplicativo passa por
   * cada uma **antes** de apagar o usuário-bot.
   */
  const desinstalar = vi.fn(async () => {});
  const instalacoes = [
    { id: "gapp_1", guildId: "g1", roleId: "r1" },
    { id: "gapp_2", guildId: "g2", roleId: null as string | null },
  ];
  const instalacao = {
    instalacoesDoApp: vi.fn(async () => instalacoes),
    desinstalar,
  } as unknown as InstalacaoService;

  return {
    apps: new ApplicationsService(prisma, storage, instalacao),
    findUnique,
    update,
    apagarUsuario,
    apagarObjeto,
    desinstalar,
    instalacoesFindMany,
  };
}

describe("dono do aplicativo", () => {
  /**
   * As quatro rotas novas com id, na mesma prova: quem escreve a quinta não
   * pode esquecer a checagem sem o teste ficar vermelho.
   */
  const rotas: [string, (a: ApplicationsService) => Promise<unknown>][] = [
    ["editar", (a) => a.editar("u_dono", "app_1", { name: "Outro" })],
    ["apagar", (a) => a.apagar("u_dono", "app_1")],
    ["removerIcone", (a) => a.removerIcone("u_dono", "app_1")],
    ["servidoresComOApp", (a) => a.servidoresComOApp("u_dono", "app_1")],
    [
      "atualizarIcone",
      (a) => a.atualizarIcone("u_dono", "app_1", { buffer: Buffer.alloc(0), size: 0 }),
    ],
  ];

  for (const [nome, chamar] of rotas) {
    it(`${nome}: 404 para aplicativo que não existe`, async () => {
      const { apps } = bancada(null);
      await expect(chamar(apps)).rejects.toMatchObject({ status: 404 });
    });

    it(`${nome}: 403 para aplicativo de outra pessoa`, async () => {
      const { apps } = bancada({ ...LINHA, ownerId: "u_outra_pessoa" });
      await expect(chamar(apps)).rejects.toMatchObject({ status: 403 });
    });
  }

  it("404 e 403 são o mesmo par que `regenerarToken` já usava", async () => {
    // a mensagem faz parte do contrato: é o que a tela mostra
    const { apps } = bancada(null);
    await expect(apps.editar("u_dono", "app_1", { publico: true })).rejects.toMatchObject({
      message: "Aplicativo não encontrado",
    });
    const outro = bancada({ ...LINHA, ownerId: "u_outra" });
    await expect(outro.apps.apagar("u_dono", "app_1")).rejects.toMatchObject({
      message: "Este aplicativo não é seu",
    });
  });
});

describe("editar", () => {
  it("escreve só o que veio — `{publico}` não apaga a descrição", async () => {
    const { apps, update } = bancada({ ...LINHA, description: "Toca música" });
    await apps.editar("u_dono", "app_1", { publico: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app_1" }, data: { publico: true } }),
    );
  });

  it("`description: null` apaga; ausente não mexe", async () => {
    const { apps, update } = bancada({ ...LINHA, description: "Toca música" });
    await apps.editar("u_dono", "app_1", { description: null });
    expect(update.mock.calls[0]?.[0]).toMatchObject({ data: { description: null } });

    const outra = bancada({ ...LINHA, description: "Toca música" });
    await outra.apps.editar("u_dono", "app_1", { name: "Outro" });
    expect(outra.update.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ data: { name: "Outro" } }),
    );
  });

  it("o schema recusa corpo vazio antes de o service ser chamado", () => {
    expect(appEditarSchema.safeParse({}).success).toBe(false);
    expect(appEditarSchema.safeParse({ publico: true }).success).toBe(true);
  });

  it("não renomeia o usuário-bot: quem está na lista de membros continua igual", async () => {
    const { apps, update } = bancada();
    await apps.editar("u_dono", "app_1", { name: "Outro nome" });
    // o `include: { botUser }` é leitura; o que não pode é escrita no bot
    const { data } = update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data).toEqual({ name: "Outro nome" });
    expect(JSON.stringify(data)).not.toContain("displayName");
  });
});

describe("apagar", () => {
  /**
   * A prova que o §3.1 do contrato pede: quem se apaga é o **usuário-bot**.
   *
   * Apagar a `Application` sozinha deixaria um `User` órfão com `isBot: true`
   * — uma conta sem dono que continua na lista de membros de todo servidor
   * onde entrou.
   */
  it("apaga o usuário-bot, não a `Application`", async () => {
    const { apps, apagarUsuario, update } = bancada();
    await apps.apagar("u_dono", "app_1");
    expect(apagarUsuario).toHaveBeenCalledWith({ where: { id: "u_bot" } });
    expect(update).not.toHaveBeenCalled();
  });

  it("tira o ícone do bucket antes de perder a linha que guardava a chave", async () => {
    const { apps, apagarObjeto, apagarUsuario } = bancada({
      ...LINHA,
      iconKey: "app-icons/app_1/abc.png",
    });
    await apps.apagar("u_dono", "app_1");
    expect(apagarObjeto).toHaveBeenCalledWith("app-icons/app_1/abc.png");
    expect(apagarObjeto.mock.invocationCallOrder[0]).toBeLessThan(
      apagarUsuario.mock.invocationCallOrder[0]!,
    );
  });

  it("aplicativo sem ícone não chama o storage", async () => {
    const { apps, apagarObjeto } = bancada();
    await apps.apagar("u_dono", "app_1");
    expect(apagarObjeto).not.toHaveBeenCalled();
  });

  /**
   * A junção A↔B, ligada na integração da F4.
   *
   * O cascade do banco (`User` → `GuildMember`, `Application` →
   * `GuildApplication`) já deixava o **banco** consistente sozinho. O que ele
   * não faz é o **evento**: sem este laço, as telas abertas continuariam
   * mostrando o bot na lista de membros até alguém recarregar, e um bot
   * conectado nunca receberia o `GUILD_DELETE`. É por isso que a prova é da
   * *ordem*, e não só da chamada.
   */
  it("sai de cada servidor ANTES de apagar o usuário-bot", async () => {
    const { apps, desinstalar, apagarUsuario } = bancada();
    await apps.apagar("u_dono", "app_1");

    expect(desinstalar).toHaveBeenCalledTimes(2);
    expect(desinstalar).toHaveBeenNthCalledWith(1, "gapp_1", "g1", "u_bot", "r1");
    // instalação sem cargo (nenhuma permissão concedida) passa `roleId: null`
    expect(desinstalar).toHaveBeenNthCalledWith(2, "gapp_2", "g2", "u_bot", null);

    expect(desinstalar.mock.invocationCallOrder[1]!).toBeLessThan(
      apagarUsuario.mock.invocationCallOrder[0]!,
    );
  });

  it("usa o desinstalar do lote B, e não uma segunda implementação", async () => {
    // duas rotinas que tiram o mesmo bot do mesmo servidor divergem no primeiro
    // evento novo; o `apagar` não pode escrever em `GuildMember`/`Role` sozinho
    const { apps, desinstalar } = bancada();
    await apps.apagar("u_dono", "app_1");
    expect(desinstalar).toHaveBeenCalled();
  });
});

describe("ícone", () => {
  it("503 claro quando o R2 não está configurado", async () => {
    const findUnique = vi.fn(async () => LINHA);
    const prisma = { application: { findUnique } } as unknown as PrismaService;
    const storage = { isConfigured: () => false } as unknown as StorageService;
    // nenhum caminho do ícone toca a instalação: um objeto vazio basta, e uma
    // chamada inesperada estoura em vez de passar em silêncio
    const apps = new ApplicationsService(prisma, storage, {} as unknown as InstalacaoService);

    await expect(
      apps.atualizarIcone("u_dono", "app_1", { buffer: Buffer.from("x"), size: 1 }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("recusa o que não é imagem — pelos bytes, não pelo nome", async () => {
    const { apps } = bancada();
    // um HTML que se chamasse `logo.png` passaria por qualquer checagem de nome
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    await expect(
      apps.atualizarIcone("u_dono", "app_1", { buffer: html, size: html.length }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("aceita PNG e guarda a chave com o formato do contrato", async () => {
    const { apps, update, apagarObjeto } = bancada();
    const png = pngDeUmPixel();
    await apps.atualizarIcone("u_dono", "app_1", { buffer: png, size: png.length });

    const chave = (update.mock.calls[0]?.[0] as { data: { iconKey: string } }).data.iconKey;
    expect(chave).toMatch(
      /^app-icons\/app_1\/[0-9a-f-]{36}\.png$/,
    );
    // sem ícone anterior, nada a apagar do bucket
    expect(apagarObjeto).not.toHaveBeenCalled();
  });

  it("troca de ícone apaga a chave anterior — depois de o banco apontar para a nova", async () => {
    const { apps, update, apagarObjeto } = bancada({
      ...LINHA,
      iconKey: "app-icons/app_1/velho.png",
    });
    const png = pngDeUmPixel();
    await apps.atualizarIcone("u_dono", "app_1", { buffer: png, size: png.length });

    expect(apagarObjeto).toHaveBeenCalledWith("app-icons/app_1/velho.png");
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      apagarObjeto.mock.invocationCallOrder[0]!,
    );
  });

  it("recusa acima do teto sem tocar no bucket", async () => {
    const { apps, apagarObjeto } = bancada();
    const png = pngDeUmPixel();
    await expect(
      apps.atualizarIcone("u_dono", "app_1", { buffer: png, size: 8 * 1024 * 1024 }),
    ).rejects.toMatchObject({ status: 413 });
    expect(apagarObjeto).not.toHaveBeenCalled();
  });
});

describe("iconeDoApp", () => {
  it("sem chave, sem URL — o cliente cai na inicial do nome", () => {
    expect(iconeDoApp("app_1", null)).toBeNull();
  });

  it("aponta para o proxy da própria API, com a versão na query", () => {
    const antes = process.env.API_PUBLIC_URL;
    process.env.API_PUBLIC_URL = "https://api.exemplo.test/";
    try {
      expect(iconeDoApp("app_1", "app-icons/app_1/abc-def.png")).toBe(
        "https://api.exemplo.test/api/applications/app_1/icone?v=abc-def.png",
      );
    } finally {
      if (antes === undefined) delete process.env.API_PUBLIC_URL;
      else process.env.API_PUBLIC_URL = antes;
    }
  });

  it("a URL muda quando o ícone muda — é o que torna o `immutable` seguro", () => {
    const a = iconeDoApp("app_1", "app-icons/app_1/um.png");
    const b = iconeDoApp("app_1", "app-icons/app_1/outro.png");
    expect(a).not.toBe(b);
  });
});

describe("servidores", () => {
  /**
   * Ligada na integração da F4, sobre a `GuildApplication` do lote B — era o
   * `[]` que o PR do lote A deixou anotado como "inerte".
   */
  it("devolve as instalações do app, no formato do contrato", async () => {
    const { apps } = bancada();
    expect(await apps.servidoresComOApp("u_dono", "app_1")).toEqual([
      {
        guildId: "g1",
        guildName: "Time de Produto",
        guildIconUrl: null,
        permissions: 3,
        createdAt: "2026-09-08T15:00:00.000Z",
      },
      {
        guildId: "g2",
        guildName: "Amigos",
        guildIconUrl: "https://cdn/x.png",
        permissions: 0,
        createdAt: "2026-09-08T16:00:00.000Z",
      },
    ]);
  });

  it("continua checando o dono antes de consultar", async () => {
    const outro = bancada({ ...LINHA, ownerId: "u_outro" });
    await expect(outro.apps.servidoresComOApp("u_dono", "app_1")).rejects.toMatchObject({
      status: 403,
    });
    expect(outro.instalacoesFindMany).not.toHaveBeenCalled();
  });

  it("filtra pelo aplicativo, e não devolve a instalação de outro", async () => {
    const { apps, instalacoesFindMany } = bancada();
    await apps.servidoresComOApp("u_dono", "app_1");
    expect(instalacoesFindMany.mock.calls[0]![0]).toMatchObject({
      where: { applicationId: "app_1" },
    });
  });
});

/** O menor PNG válido que `sniffImage` reconhece (assinatura + IHDR 1×1). */
function pngDeUmPixel(): Buffer {
  return Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
      "01f15c4890000000a49444154789c6300010000050001" +
      "0d0a2db40000000049454e44ae426082",
    "hex",
  );
}
