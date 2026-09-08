import { createHash, randomBytes } from "node:crypto";

/**
 * O token de bot: formato, geração e leitura.
 *
 * Parte pura (só `node:crypto`), separada do service para poder ser testada
 * sem banco. Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §5, "Formato do
 * token (D3)".
 *
 * ```
 * Authorization: Bot MTM4MjkxNTc3MDA1NzI0OTQ3Mg.aGVjNzUx.j3lQ_9d…
 *                    └──── 1 ────┘ └── 2 ──┘ └──── 3 ────┘
 * ```
 *
 * | Parte | Conteúdo                                        | Tamanho |
 * |-------|-------------------------------------------------|---------|
 * | 1     | `base64url` do id decimal do usuário-bot (ascii) | 24–26   |
 * | 2     | `base64url` de 4 bytes BE do unix time da emissão| 6       |
 * | 3     | `base64url` de 32 bytes aleatórios               | 43      |
 *
 * **Por que imitar o formato se ninguém valida?** Porque *algumas ferramentas
 * leem*: o `_censoredToken` do discord.js corta no ponto para censurar; a
 * Nostrum tem um caminho rápido que casa `<<id::24, ".", ts::6, ".", …>>`;
 * scanners de segredo (o TruffleHog usa `[\w-]{24}\.[\w-]{6}\.[\w-]{27}`)
 * dependem dos três blocos; e alguns forks extraem o id da parte 1 para saber
 * quem é o bot sem chamar a API. Manter o formato é grátis.
 *
 * O que **não** é decorativo: a parte 3. São 32 bytes de `randomBytes` — é ela
 * que autentica. As partes 1 e 2 são informação pública e nunca são usadas
 * como credencial (a busca é sempre pelo hash do token inteiro).
 */

/** Separador das três partes. */
const PONTO = ".";

/** Bytes aleatórios da terceira parte. 32 → 43 caracteres em base64url. */
const BYTES_ALEATORIOS = 32;

/**
 * Caracteres do token guardados em claro, para a UI mostrar "token MTU0Njkz…".
 *
 * Oito caracteres caem todos dentro da parte 1, que é o id do usuário-bot:
 * este prefixo identifica **o bot**, não o token, e não muda ao regenerar. É
 * o que permite reconhecer de quem é um token achado num arquivo de
 * configuração; um token do outro se distingue pelo `createdAt`.
 */
export const TAMANHO_DO_PREFIXO = 8;

/** O que a criação e a regeneração produzem. */
export interface TokenGerado {
  /** o valor em claro. Só existe aqui e na resposta HTTP — o banco guarda o hash. */
  token: string;
  /** sha256 do token, em hex. É o que a coluna `BotToken.tokenHash` recebe. */
  hash: string;
  /** os 8 primeiros caracteres do token. */
  prefixo: string;
}

/**
 * Gera um token para o usuário-bot de snowflake `snowflakeDoBot`.
 *
 * `agora` é injetável só para o teste — a segunda parte é o unix time da
 * emissão, e ninguém a lê de volta para autorizar nada.
 */
export function gerarToken(snowflakeDoBot: bigint, agora: Date = new Date()): TokenGerado {
  const parte1 = Buffer.from(snowflakeDoBot.toString(10), "ascii").toString("base64url");

  const segundos = Math.floor(agora.getTime() / 1000);
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(segundos >>> 0, 0);
  const parte2 = buf.toString("base64url");

  const parte3 = randomBytes(BYTES_ALEATORIOS).toString("base64url");

  const token = [parte1, parte2, parte3].join(PONTO);
  return { token, hash: hashDoToken(token), prefixo: token.slice(0, TAMANHO_DO_PREFIXO) };
}

/**
 * SHA-256 do token, em hex.
 *
 * **Não é argon2, e é de propósito**: o token é 256 bits de aleatório puro, não
 * há dicionário para atacar, e este hash é calculado a *cada requisição* de um
 * bot — um bot de música faz dezenas por minuto. Argon2 aqui seria um desastre
 * de CPU sem ganho de segurança. Ver §5 do documento.
 */
export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * O snowflake do bot embutido na primeira parte, ou `null` se o texto não tem
 * a forma de um token.
 *
 * É atalho de diagnóstico e de log — **nunca** autorização: quem manda um
 * token com a parte 1 de outro bot continua sendo recusado, porque o que
 * decide é o hash do token inteiro.
 */
export function snowflakeDoToken(token: string): bigint | null {
  const partes = token.split(PONTO);
  if (partes.length !== 3 || partes.some((p) => p.length === 0)) return null;
  const decimal = Buffer.from(partes[0], "base64url").toString("ascii");
  if (!/^\d{1,20}$/.test(decimal)) return null;
  try {
    return BigInt(decimal);
  } catch {
    return null;
  }
}

/**
 * Separa o `Bot <token>` do cabeçalho `Authorization`.
 *
 * O prefixo é **obrigatório**: é ele que faz os dois esquemas conviverem sem se
 * pisarem — o `JwtGuard` do app continua exigindo `Bearer`. Devolve `null`
 * quando o cabeçalho não é de bot.
 */
export function tokenDoCabecalho(header: string | undefined): string | null {
  if (!header?.startsWith("Bot ")) return null;
  const token = header.slice(4).trim();
  return token.length > 0 ? token : null;
}
