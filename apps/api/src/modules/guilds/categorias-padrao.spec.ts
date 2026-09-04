import { describe, expect, it } from "vitest";
import {
  CategoriasPadraoService,
  NOME_CATEGORIA_TEXTO,
  NOME_CATEGORIA_VOZ,
  arrumarCategoriasPadrao,
} from "./categorias-padrao";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * As duas categorias padrão são linhas, não rótulo.
 *
 * O defeito que originou este arquivo: criar uma categoria qualquer fazia
 * "Canais de Texto" e "Canais de Voz" desaparecerem, porque a barra lateral só
 * desenhava esses dois títulos enquanto o servidor não tivesse categoria
 * nenhuma. O que se garante aqui é o outro lado do conserto — o banco: um
 * servidor nasce com as duas categorias de verdade, e um servidor antigo é
 * corrigido **uma vez só**, sem nunca desfazer o que a pessoa organizou depois.
 */

interface LinhaCategoria {
  id: string;
  guildId: string;
  name: string;
  position: number;
}
interface LinhaCanal {
  id: string;
  guildId: string;
  type: string;
  position: number;
  categoryId: string | null;
  createdAt: Date;
}

/** Banco de mentira, mas com as regras que a rotina usa: filtro, ordem e update. */
function bancoCom(canais: LinhaCanal[], categorias: LinhaCategoria[] = []) {
  let seq = 0;
  const category = {
    count: async ({ where }: { where: { guildId: string } }) =>
      categorias.filter((c) => c.guildId === where.guildId).length,
    create: async ({ data }: { data: Omit<LinhaCategoria, "id"> }) => {
      const linha: LinhaCategoria = { id: `cat${++seq}`, ...data };
      categorias.push(linha);
      return linha;
    },
  };
  const channel = {
    findMany: async ({ where }: { where: { guildId: string; categoryId: null } }) =>
      canais
        .filter((c) => c.guildId === where.guildId && c.categoryId === where.categoryId)
        .sort((a, b) => a.position - b.position || +a.createdAt - +b.createdAt)
        .map((c) => ({ id: c.id, type: c.type })),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { categoryId: string; position: number };
    }) => {
      const linha = canais.find((c) => c.id === where.id);
      if (!linha) throw new Error(`canal ${where.id} não existe`);
      Object.assign(linha, data);
      return linha;
    },
  };
  const guild = {
    // `{ categories: { none: {} } }`: servidor que não tem categoria nenhuma
    findMany: async () =>
      [...new Set(canais.map((c) => c.guildId))]
        .filter((id) => !categorias.some((c) => c.guildId === id))
        .map((id) => ({ id })),
  };
  const tx = { category, channel };
  return {
    categorias,
    canais,
    category,
    channel,
    guild,
    // transação interativa: para o teste, encadear as chamadas basta
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  };
}

function canal(
  id: string,
  type: string,
  position: number,
  guildId = "g1",
  categoryId: string | null = null,
): LinhaCanal {
  return { id, guildId, type, position, categoryId, createdAt: new Date(2026, 0, 1 + position) };
}

const comoPrisma = (banco: ReturnType<typeof bancoCom>) => banco as unknown as PrismaService;

describe("arrumarCategoriasPadrao", () => {
  it("cria as duas categorias e põe cada canal na sua, pelo tipo", async () => {
    const banco = bancoCom([canal("texto", "TEXT", 0), canal("voz", "VOICE", 1)]);

    const r = await arrumarCategoriasPadrao(comoPrisma(banco), "g1");

    expect(r).not.toBeNull();
    expect(banco.categorias.map((c) => [c.name, c.position])).toEqual([
      [NOME_CATEGORIA_TEXTO, 0],
      [NOME_CATEGORIA_VOZ, 1],
    ]);
    expect(banco.canais.find((c) => c.id === "texto")?.categoryId).toBe(r!.textoId);
    expect(banco.canais.find((c) => c.id === "voz")?.categoryId).toBe(r!.vozId);
    expect(r!.movidos).toBe(2);
  });

  it("manda anúncio para 'Canais de Texto' (só voz vai para a de voz)", async () => {
    const banco = bancoCom([canal("avisos", "ANNOUNCEMENT", 0)]);
    const r = await arrumarCategoriasPadrao(comoPrisma(banco), "g1");
    expect(banco.canais[0].categoryId).toBe(r!.textoId);
  });

  it("preserva a ordem dentro de cada categoria, renumerando de 0", async () => {
    const banco = bancoCom([
      canal("t1", "TEXT", 0),
      canal("v1", "VOICE", 1),
      canal("t2", "TEXT", 2),
      canal("v2", "VOICE", 3),
    ]);

    await arrumarCategoriasPadrao(comoPrisma(banco), "g1");

    const pos = (id: string) => banco.canais.find((c) => c.id === id)!.position;
    expect([pos("t1"), pos("t2")]).toEqual([0, 1]);
    expect([pos("v1"), pos("v2")]).toEqual([0, 1]);
  });

  it("é idempotente: a segunda passada não cria nem move nada", async () => {
    const banco = bancoCom([canal("texto", "TEXT", 0), canal("voz", "VOICE", 1)]);

    await arrumarCategoriasPadrao(comoPrisma(banco), "g1");
    const depoisDaPrimeira = JSON.stringify(banco.canais);
    const segunda = await arrumarCategoriasPadrao(comoPrisma(banco), "g1");

    expect(segunda).toBeNull();
    expect(banco.categorias).toHaveLength(2);
    expect(JSON.stringify(banco.canais)).toBe(depoisDaPrimeira);
  });

  it("não toca em servidor que já organizou as próprias categorias", async () => {
    // quem renomeou "Canais de Texto" para "Bate-papo" e deixou um canal de
    // propósito no topo, sem categoria: a rotina passa longe
    const banco = bancoCom(
      [canal("solto", "TEXT", 0), canal("dentro", "TEXT", 1, "g1", "minha")],
      [{ id: "minha", guildId: "g1", name: "Bate-papo", position: 0 }],
    );

    const r = await arrumarCategoriasPadrao(comoPrisma(banco), "g1");

    expect(r).toBeNull();
    expect(banco.categorias).toHaveLength(1);
    expect(banco.canais.find((c) => c.id === "solto")?.categoryId).toBeNull();
  });

  it("não invade servidor vizinho", async () => {
    const banco = bancoCom([canal("meu", "TEXT", 0, "g1"), canal("alheio", "TEXT", 0, "g2")]);
    await arrumarCategoriasPadrao(comoPrisma(banco), "g1");
    expect(banco.canais.find((c) => c.id === "alheio")?.categoryId).toBeNull();
  });
});

describe("CategoriasPadraoService (correção no boot)", () => {
  it("corrige os servidores pendentes e, rodando de novo, não acha nenhum", async () => {
    const banco = bancoCom([
      canal("t", "TEXT", 0, "g1"),
      canal("v", "VOICE", 1, "g1"),
      canal("t2", "TEXT", 0, "g2"),
    ]);
    const s = new CategoriasPadraoService(comoPrisma(banco));

    expect(await s.corrigirServidoresExistentes()).toBe(2);
    expect(banco.categorias).toHaveLength(4); // duas por servidor
    expect(banco.canais.every((c) => c.categoryId !== null)).toBe(true);

    expect(await s.corrigirServidoresExistentes()).toBe(0);
    expect(banco.categorias).toHaveLength(4);
  });
});
