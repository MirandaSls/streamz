// Snowflakes — o id numérico que as bibliotecas de bot do Discord esperam.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// Por que existe: as libs do Discord não tratam id como texto opaco, elas
// **calculam** em cima dele. `SnowflakeUtil.timestampFrom(id)` do discord.js
// alimenta `message.createdAt`; `discord.utils.snowflake_time()` do discord.py
// faz o mesmo; o Lavalink usa `guildId` como chave de `Map<Long, Player>`. Um
// `cuid()` vira `NaN` no primeiro caso e `ValueError` no segundo. Ver
// `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §4 (decisão D1).
//
// O valor é gerado **no banco** (`streamz_snowflake()`, ver a migration
// `..._snowflakes`), não aqui: assim toda inserção ganha o seu, inclusive as
// que alguém esquecer de atualizar, e a unicidade é do Postgres. Este arquivo é
// só a leitura e a aritmética — puro, sem dependência, testável.

/**
 * Epoch do **Discord** (2015-01-01T00:00:00Z), não um epoch nosso.
 *
 * É o que faz o `createdAt` derivado do id bater com o `createdAt` real da
 * linha. Com outro epoch, toda mensagem do Streamz apareceria datada de 2015 no
 * log de qualquer bot. Com 42 bits de milissegundos desde 2015, o esquema vai
 * até 2154.
 */
export const EPOCH_DISCORD = 1420070400000n;

/**
 * Deslocamento do bloco de milissegundos dentro do snowflake.
 *
 * ```
 *  63                    22 21   17 16   12 11         0
 * +------------------------+-------+-------+------------+
 * |  ms desde 2015-01-01   | worker| proc  | incremento |
 * |        42 bits         | 5 bits| 5 bits|  12 bits   |
 * +------------------------+-------+-------+------------+
 * ```
 *
 * Worker e processo ficam em 0 porque a fonte é única (um banco) e os 12 bits
 * de incremento já dão 4095 ids distintos por milissegundo.
 */
export const DESLOCAMENTO_TIMESTAMP = 22n;

/** Data de criação embutida num snowflake. */
export function snowflakeParaData(s: bigint): Date {
  return new Date(Number((s >> DESLOCAMENTO_TIMESTAMP) + EPOCH_DISCORD));
}

/**
 * O menor snowflake de um instante — o que a paginação `before`/`after` do
 * Discord usa como cursor quando o cliente manda uma data em vez de um id.
 */
export function dataParaSnowflake(d: Date): bigint {
  const ms = BigInt(d.getTime()) - EPOCH_DISCORD;
  return (ms < 0n ? 0n : ms) << DESLOCAMENTO_TIMESTAMP;
}

/**
 * O texto parece um snowflake?
 *
 * A faixa é a mesma que as libs aceitam: só dígitos, de 17 a 20 caracteres.
 * Serve para decidir se um `:id` de rota é snowflake ou cuid **antes** de ir ao
 * banco — não é validação de existência.
 */
export function ehSnowflake(v: string): boolean {
  return /^\d{17,20}$/.test(v);
}
