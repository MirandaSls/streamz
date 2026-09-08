import { constants, createDeflate, type Deflate } from "node:zlib";

/**
 * `compress=zlib-stream` — a compressão de transporte do gateway (§7).
 *
 * ── Lote C da F2 implementa. ──
 *
 * **Por que ela existe, se a F1 provou que texto puro funciona.** Porque o
 * `@discordjs/ws` **1.x** decide a compressão pelo que está instalado:
 *
 * ```js
 * let zlib; try { zlib = require("zlib-sync"); } catch {}
 * compression: zlib ? CompressionMethod.ZlibStream : null
 * ```
 *
 * `zlib-sync` não é dependência do discord.js, mas **vários projetos o instalam
 * "para performance"** — e aí a lib pede `compress=zlib-stream` na query e passa
 * a esperar quadro **binário**. Pior: se a biblioteca sumir depois, o 1.x cai
 * para `"compress": true` **dentro do IDENTIFY**, que é compressão por payload e
 * quebra um servidor que só sabe texto. Suportar o `zlib-stream` de verdade tira
 * essa classe inteira de "por que não conecta" da mesa por ~40 linhas.
 *
 * **O formato**, que é o que não pode errar: um **único** fluxo deflate por
 * conexão, com o estado (o dicionário) atravessando as mensagens. Cada mensagem
 * é escrita no fluxo e liberada com `Z_SYNC_FLUSH`, o que produz um bloco
 * terminado em `00 00 FF FF` — e é esse sufixo que o `zlib-sync` do outro lado
 * usa para saber que a mensagem acabou. Um `deflateSync` por mensagem **não**
 * serve: seriam N fluxos independentes, e o inflate do cliente, que é um só,
 * se perderia no segundo.
 *
 * Como o estado é compartilhado, **a ordem dos quadros é o próprio formato**:
 * dois quadros comprimidos fora de ordem são lixo do lado de lá, não uma
 * mensagem trocada. Por isso o `FluxoZlib` tem fila própria — a compressão em
 * Node é assíncrona e quem chama (`despachar`) é síncrono.
 *
 * O que **continua recusado**: `encoding=etf` (§13: quem pedir leva close 4000
 * com a razão). `zstd-stream` **não** é recusado — ver `lerCompressao`, que
 * carrega a medida. Texto puro continua sendo o padrão.
 */

/** O valor de `compress` que sabemos falar. */
export const ZLIB_STREAM = "zlib-stream";

/**
 * O sufixo de um bloco `Z_SYNC_FLUSH`. É o marcador de fim de mensagem que o
 * `zlib-sync` procura (`Inflate.push(dado, Z_SYNC_FLUSH)`).
 */
export const FIM_DE_MENSAGEM = Buffer.from([0x00, 0x00, 0xff, 0xff]);

/**
 * O que fazer com o `compress` da query.
 *
 * - `"zlib-stream"` → ligamos o fluxo;
 * - qualquer outra coisa (ausente, vazio, `zstd-stream`, um valor novo que
 *   ainda não existe) → **texto puro**, com aviso no log.
 *
 * **Medido, e o contrário do que este arquivo dizia na primeira versão:**
 * responder close 4000 a quem pede `zstd-stream` **quebra o discord.py**. O
 * 2.7.1 pede `compress=zstd-stream` quando o `zstandard` está instalado (e ele
 * vem por padrão em instalação recente), e o close derruba o `login()` com um
 * `AttributeError` dentro da lib — sem nem chegar ao `ready`. Com texto puro ele
 * funciona, porque `DiscordWebSocket.received_message` só descomprime
 * `if type(msg) is bytes`: quadro de texto vai direto para o `json.loads`.
 *
 * Ou seja: o "**nunca**" do §7 sobre `zstd-stream` quer dizer "não
 * implementamos", **não** "recusamos a conexão". Quem é estrito é o
 * `encoding=etf` — ali não há como responder nada que o cliente entenda, e o
 * close 4000 com a razão é o único recado honesto.
 */
export function lerCompressao(valor: string | null): { zlib: boolean; aviso: string | null } {
  if (valor === null || valor.trim() === "") return { zlib: false, aviso: null };
  if (valor === ZLIB_STREAM) return { zlib: true, aviso: null };
  return {
    zlib: false,
    aviso: `compress "${valor}" não é suportado: respondendo em texto puro (o cliente aceita — a compressão é opcional por mensagem no protocolo)`,
  };
}

/** Tamanho do buffer interno do deflate. Um dispatch nosso raramente passa disso. */
const PEDACO = 64 * 1024;

/**
 * Um fluxo deflate por conexão, com fila.
 *
 * `escrever` devolve na hora e garante que os quadros saiam na ordem em que
 * foram pedidos — é o que o formato exige (ver o cabeçalho).
 */
export class FluxoZlib {
  private readonly deflate: Deflate;
  private pedacos: Buffer[] = [];
  private fila: Promise<void> = Promise.resolve();
  private fechado = false;

  constructor(private readonly aoFalhar?: (erro: Error) => void) {
    this.deflate = createDeflate({ chunkSize: PEDACO });
    this.deflate.on("data", (pedaco: Buffer) => this.pedacos.push(pedaco));
    // Um deflate que quebrou não tem conserto: o dicionário do outro lado já
    // não bate. Quem chama fecha a conexão, e a lib reconecta.
    this.deflate.on("error", (erro) => {
      this.fechado = true;
      this.aoFalhar?.(erro as Error);
    });
  }

  /** Já não dá para escrever (falhou ou foi fechado). */
  get morto(): boolean {
    return this.fechado;
  }

  /**
   * Enfileira um quadro. `entregar` recebe o bloco comprimido, na ordem.
   *
   * Não lança: uma falha de compressão vira `aoFalhar`, e o chamador (o
   * servidor do gateway) decide o que fazer com a conexão.
   */
  escrever(texto: string, entregar: (quadro: Buffer) => void): void {
    this.fila = this.fila.then(async () => {
      if (this.fechado) return;
      try {
        entregar(await this.comprimir(texto));
      } catch (erro) {
        this.fechado = true;
        this.aoFalhar?.(erro as Error);
      }
    });
  }

  /**
   * Comprime uma mensagem e libera o bloco com `Z_SYNC_FLUSH`.
   *
   * Público porque é o que o teste exercita: um quadro daqui tem de sair
   * inteiro do inflate do outro lado.
   */
  async comprimir(texto: string): Promise<Buffer> {
    this.deflate.write(Buffer.from(texto, "utf8"));
    await new Promise<void>((pronto, falhou) => {
      // O ouvinte é removido nos dois caminhos: sem isso, uma conexão longa
      // acumularia um listener por dispatch e o Node acabaria avisando de
      // vazamento — num lugar em que não haveria vazamento nenhum.
      const aoFalhar = (erro: Error) => falhou(erro);
      this.deflate.once("error", aoFalhar);
      this.deflate.flush(constants.Z_SYNC_FLUSH, () => {
        this.deflate.off("error", aoFalhar);
        pronto();
      });
    });
    const quadro = Buffer.concat(this.pedacos);
    this.pedacos = [];
    return quadro;
  }

  /** Solta o fluxo. Depois disto, `escrever` não faz nada. */
  fechar(): void {
    if (this.fechado) return;
    this.fechado = true;
    this.pedacos = [];
    // `close()` e não `end()`: não queremos o bloco de fim de fluxo — a conexão
    // já está indo embora, e ninguém vai ler.
    this.deflate.close();
  }
}
