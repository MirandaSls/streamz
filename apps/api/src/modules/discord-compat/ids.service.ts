import { Injectable } from "@nestjs/common";
import { ehSnowflake } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Tradução de id nos dois sentidos: snowflake ↔ cuid.
 *
 * Por que existe, se a decisão D1 foi "coluna na própria tabela"? Porque a
 * coluna resolve a **leitura** (o registro já vem do `SELECT` com o snowflake
 * junto) e sobram dois caminhos que não têm o registro em mãos:
 *
 * 1. **A rota**: o `:id` que o bot manda é snowflake, e os services do Streamz
 *    (`MessagesService`, `GuildsService`) só falam cuid.
 * 2. **O DTO**: `MessagesService.create` devolve um `Message` de
 *    `@streamz/shared`, que tem `id` cuid e **não** tem snowflake; o mesmo vale
 *    para os payloads que chegam por `RealtimeService.onEvent`. Para responder
 *    o `POST /channels/:id/messages` e para emitir `MESSAGE_CREATE` é preciso
 *    ir buscar o número.
 *
 * O cache é seguro porque **snowflake e cuid de uma linha nunca mudam**: o par
 * é imutável por construção (o `DEFAULT` roda uma vez, na inserção). O que pode
 * ficar velho é o par de uma linha apagada — e aí a consulta seguinte, pelo
 * cuid, não acha nada e o chamador devolve 10008/10003, que é o certo.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §4.
 */

/** Teto do cache. Estourou, esvazia: é cache, não índice. */
const TETO_DO_CACHE = 20_000;

/** As tabelas que a F1 resolve por id. */
type Tabela = "user" | "guild" | "channel" | "category" | "message" | "role";

@Injectable()
export class IdsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `<tabela>:<snowflake>` → cuid, e `<tabela>:<cuid>` → snowflake. */
  private readonly cache = new Map<string, string | bigint>();

  // ── snowflake → cuid ───────────────────────────────────────

  /** O `:id` de uma rota (snowflake decimal) → cuid, ou `null`. */
  async cuidDeUsuario(snowflake: string): Promise<string | null> {
    return this.paraCuid("user", snowflake);
  }

  async cuidDeServidor(snowflake: string): Promise<string | null> {
    return this.paraCuid("guild", snowflake);
  }

  async cuidDeMensagem(snowflake: string): Promise<string | null> {
    return this.paraCuid("message", snowflake);
  }

  async cuidDeCargo(snowflake: string): Promise<string | null> {
    return this.paraCuid("role", snowflake);
  }

  /**
   * O `:id` de `/channels/:id` → o que ele for.
   *
   * **Categoria no Discord é canal** (tipo 4), e o `GET /channels/:id` precisa
   * resolver as duas tabelas. É o detalhe do §4 que é fácil esquecer.
   */
  async cuidDeCanalOuCategoria(
    snowflake: string,
  ): Promise<{ id: string; tipo: "canal" | "categoria" } | null> {
    const canal = await this.paraCuid("channel", snowflake);
    if (canal) return { id: canal, tipo: "canal" };
    const categoria = await this.paraCuid("category", snowflake);
    return categoria ? { id: categoria, tipo: "categoria" } : null;
  }

  // ── cuid → snowflake ───────────────────────────────────────

  async snowflakeDeUsuario(id: string): Promise<bigint | null> {
    return this.paraSnowflake("user", id);
  }

  async snowflakeDeServidor(id: string): Promise<bigint | null> {
    return this.paraSnowflake("guild", id);
  }

  async snowflakeDeCanal(id: string): Promise<bigint | null> {
    return this.paraSnowflake("channel", id);
  }

  async snowflakeDeCategoria(id: string): Promise<bigint | null> {
    return this.paraSnowflake("category", id);
  }

  async snowflakeDeMensagem(id: string): Promise<bigint | null> {
    return this.paraSnowflake("message", id);
  }

  async snowflakeDeCargo(id: string): Promise<bigint | null> {
    return this.paraSnowflake("role", id);
  }

  /**
   * Vários cuid de uma vez → mapa cuid → snowflake.
   *
   * Existe para o `GUILD_CREATE` e para as listas: resolver cem membros um a um
   * seriam cem consultas. O que já está em cache não vai ao banco.
   */
  async snowflakesEmLote(tabela: Tabela, ids: readonly string[]): Promise<Map<string, bigint>> {
    const resultado = new Map<string, bigint>();
    const faltando: string[] = [];

    for (const id of ids) {
      const guardado = this.cache.get(`${tabela}:${id}`);
      if (typeof guardado === "bigint") resultado.set(id, guardado);
      else faltando.push(id);
    }
    if (faltando.length === 0) return resultado;

    const linhas = (await this.delegate(tabela).findMany({
      where: { id: { in: faltando } },
      select: { id: true, snowflake: true },
    })) as { id: string; snowflake: bigint }[];

    for (const linha of linhas) {
      this.guardar(tabela, linha.id, linha.snowflake);
      resultado.set(linha.id, linha.snowflake);
    }
    return resultado;
  }

  // ── internos ───────────────────────────────────────────────

  private async paraCuid(tabela: Tabela, snowflake: string): Promise<string | null> {
    // filtra antes do banco: `int` de um cuid levanta, e `WHERE snowflake = 'x'`
    // com texto que não é número faria o Prisma lançar em vez de devolver vazio
    if (!ehSnowflake(snowflake)) return null;

    const chave = `${tabela}:${snowflake}`;
    const guardado = this.cache.get(chave);
    if (typeof guardado === "string") return guardado;

    const linha = (await this.delegate(tabela).findUnique({
      where: { snowflake: BigInt(snowflake) },
      select: { id: true },
    })) as { id: string } | null;
    if (!linha) return null;

    this.guardar(tabela, linha.id, BigInt(snowflake));
    return linha.id;
  }

  private async paraSnowflake(tabela: Tabela, id: string): Promise<bigint | null> {
    const chave = `${tabela}:${id}`;
    const guardado = this.cache.get(chave);
    if (typeof guardado === "bigint") return guardado;

    const linha = (await this.delegate(tabela).findUnique({
      where: { id },
      select: { snowflake: true },
    })) as { snowflake: bigint } | null;
    if (!linha) return null;

    this.guardar(tabela, id, linha.snowflake);
    return linha.snowflake;
  }

  /** Grava as duas direções de uma vez — elas nascem e morrem juntas. */
  private guardar(tabela: Tabela, id: string, snowflake: bigint) {
    if (this.cache.size >= TETO_DO_CACHE) this.cache.clear();
    this.cache.set(`${tabela}:${id}`, snowflake);
    this.cache.set(`${tabela}:${snowflake.toString()}`, id);
  }

  /**
   * O delegate do Prisma da tabela.
   *
   * O `any` é local e consciente: os seis delegates têm a mesma forma para
   * `findUnique`/`findMany` com `select`, mas o tipo gerado de cada um é
   * distinto e uni-los daria uma união que o TypeScript resolve como `never`
   * no `where`. O contrato de verdade está nos métodos públicos acima.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private delegate(tabela: Tabela): any {
    switch (tabela) {
      case "user":
        return this.prisma.user;
      case "guild":
        return this.prisma.guild;
      case "channel":
        return this.prisma.channel;
      case "category":
        return this.prisma.category;
      case "message":
        return this.prisma.message;
      case "role":
        return this.prisma.role;
    }
  }
}
