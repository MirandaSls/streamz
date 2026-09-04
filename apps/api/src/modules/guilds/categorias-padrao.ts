import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * As duas categorias com que todo servidor do Discord nasce: "Canais de Texto"
 * e "Canais de Voz".
 *
 * Aqui elas são **categorias de verdade** — linhas em `Category` —, não
 * rótulos que a barra lateral desenha. Era daí que vinha o defeito: a coluna
 * inventava os dois títulos por tipo de canal *só enquanto o servidor não
 * tivesse categoria nenhuma*; na primeira categoria criada os dois títulos
 * sumiam e os canais caíam todos no bloco sem título do topo. Sendo linhas,
 * elas se renomeiam, se apagam e se arrastam como qualquer outra categoria, e
 * criar uma categoria nova não mexe nelas.
 *
 * Canal sem categoria continua existindo e continua no topo, sem título — é o
 * que o Discord faz com quem você arrasta para fora de uma categoria.
 */

export const NOME_CATEGORIA_TEXTO = "Canais de Texto";
export const NOME_CATEGORIA_VOZ = "Canais de Voz";
/** Os dois canais com que um servidor novo nasce, um em cada categoria. */
export const CANAL_TEXTO_INICIAL = "geral";
export const CANAL_VOZ_INICIAL = "Geral";

export interface ArrumacaoDeCategorias {
  textoId: string;
  vozId: string;
  /** quantos canais soltos foram recolhidos para uma das duas. */
  movidos: number;
}

/**
 * Cria as duas categorias padrão do servidor e recolhe para elas os canais que
 * estavam sem categoria, separados pelo tipo e **preservando a ordem**.
 *
 * É a mesma rotina em dois usos: o servidor recém-criado (que nasce com os
 * dois canais soltos) e a correção do servidor antigo. Uma verdade só sobre o
 * que é "um servidor arrumado".
 *
 * **Idempotente pela guarda mais conservadora possível**: só age em servidor
 * que não tem categoria nenhuma. Rodar de novo não faz nada e — o que importa
 * mais — um servidor já organizado por gente nunca é tocado: quem renomeou
 * "Canais de Texto" para "Bate-papo" não ganha uma "Canais de Texto" de volta
 * no próximo boot, e quem deixou um canal de propósito no topo sem categoria
 * (o Discord permite) não vê a rotina engoli-lo. Sem essa guarda a correção
 * brigaria com o usuário a cada reinício da API.
 */
export async function arrumarCategoriasPadrao(
  prisma: PrismaService,
  guildId: string,
): Promise<ArrumacaoDeCategorias | null> {
  if ((await prisma.category.count({ where: { guildId } })) > 0) return null;

  // `guildId` concreto: canal de DM/grupo tem `guildId` null e nunca entra aqui.
  const soltos = await prisma.channel.findMany({
    where: { guildId, categoryId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, type: true },
  });
  const voz = soltos.filter((c) => c.type === "VOICE");
  // tudo que não é voz mora em "Canais de Texto" — texto, anúncio e o que vier
  // depois. É a divisão que o Discord faz no servidor recém-criado.
  const texto = soltos.filter((c) => c.type !== "VOICE");

  return prisma.$transaction(async (tx) => {
    const catTexto = await tx.category.create({
      data: { guildId, name: NOME_CATEGORIA_TEXTO, position: 0 },
    });
    const catVoz = await tx.category.create({
      data: { guildId, name: NOME_CATEGORIA_VOZ, position: 1 },
    });
    // a posição passa a ser o índice dentro do grupo: a ordem que a pessoa via
    // no topo é a ordem que ela passa a ver dentro da categoria
    const recolher = async (lista: { id: string }[], categoryId: string) => {
      for (const [i, canal] of lista.entries()) {
        await tx.channel.update({ where: { id: canal.id }, data: { categoryId, position: i } });
      }
    };
    await recolher(texto, catTexto.id);
    await recolher(voz, catVoz.id);
    return { textoId: catTexto.id, vozId: catVoz.id, movidos: soltos.length };
  });
}

/**
 * Correção dos servidores que já existiam quando as duas categorias padrão
 * eram só rótulo da barra lateral.
 *
 * É correção de **dado**, não de esquema: nenhuma coluna muda, então não há
 * migration SQL nova. Ela roda como passo do boot da API (`onModuleInit`,
 * antes de a porta abrir), e a partir da segunda vez não encontra mais
 * ninguém — a consulta filtra por "servidor sem categoria nenhuma".
 */
@Injectable()
export class CategoriasPadraoService implements OnModuleInit {
  private readonly logger = new Logger(CategoriasPadraoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.corrigirServidoresExistentes();
  }

  async corrigirServidoresExistentes(): Promise<number> {
    const pendentes = await this.prisma.guild.findMany({
      where: { categories: { none: {} } },
      select: { id: true },
    });
    if (pendentes.length === 0) return 0;

    let arrumados = 0;
    for (const guild of pendentes) {
      try {
        if (await arrumarCategoriasPadrao(this.prisma, guild.id)) arrumados += 1;
      } catch (e) {
        // um servidor problemático não pode impedir a API inteira de subir
        this.logger.error(`Servidor ${guild.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(
      `Categorias padrão ("${NOME_CATEGORIA_TEXTO}"/"${NOME_CATEGORIA_VOZ}") ` +
        `criadas em ${arrumados} de ${pendentes.length} servidor(es)`,
    );
    return arrumados;
  }
}
