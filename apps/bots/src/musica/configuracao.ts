/**
 * Configuração por servidor do bot de música (autoplay e modo 24/7).
 *
 * Mesmo padrão do `boas-vindas/armazem.ts`: um arquivo JSON por servidor no
 * volume do bot, escrita atômica (temporário no mesmo diretório, `fsync`,
 * `rename`) e uma fila por servidor para que dois comandos simultâneos não
 * se sobreponham no ler-modificar-gravar. Ver o cabeçalho de lá para o porquê.
 */

import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { diretorioDosDados } from "../runtime/dados";

export interface ConfiguracaoDoServidor {
  /** Fica na call mesmo com a fila vazia. */
  vinte4Sete: boolean;
  /** Fila acabou: busca uma faixa parecida e segue tocando. */
  autoplay: boolean;
}

export const CONFIGURACAO_PADRAO: Readonly<ConfiguracaoDoServidor> = Object.freeze({
  vinte4Sete: false,
  autoplay: false,
});

/**
 * Qualquer coisa lida do disco vira uma configuração válida. Campo ausente ou
 * de tipo errado cai no padrão **sozinho**: um arquivo meio estragado não pode
 * ligar o 24/7 por engano nem derrubar o comando.
 */
export function normalizarConfiguracao(cru: unknown): ConfiguracaoDoServidor {
  const o = cru && typeof cru === "object" ? (cru as Record<string, unknown>) : {};
  return {
    vinte4Sete: typeof o.vinte4Sete === "boolean" ? o.vinte4Sete : CONFIGURACAO_PADRAO.vinte4Sete,
    autoplay: typeof o.autoplay === "boolean" ? o.autoplay : CONFIGURACAO_PADRAO.autoplay,
  };
}

/** Aplica só os campos booleanos presentes em `parcial`; o resto fica como está. */
export function mesclarConfiguracao(
  atual: ConfiguracaoDoServidor,
  parcial: Partial<ConfiguracaoDoServidor>,
): ConfiguracaoDoServidor {
  return normalizarConfiguracao({ ...atual, ...parcial });
}

/** O id vira nome de arquivo: só snowflake decimal passa. */
export function nomeDoArquivoDeConfiguracao(guildId: string): string {
  if (!/^[0-9]{1,32}$/.test(guildId)) {
    throw new Error(`id de servidor fora do formato esperado: ${JSON.stringify(guildId)}`);
  }
  return `${guildId}.json`;
}

export class ArmazemDeConfiguracao {
  private readonly filas = new Map<string, Promise<unknown>>();
  private diretorioPronto: Promise<void> | null = null;
  private readonly diretorio: string;

  constructor(raiz: string = diretorioDosDados()) {
    // Subpasta própria: o volume do bot pode ganhar outros estados depois.
    this.diretorio = join(raiz, "configuracao-musica");
  }

  private async garantirDiretorio(): Promise<void> {
    this.diretorioPronto ??= mkdir(this.diretorio, { recursive: true }).then(() => undefined);
    await this.diretorioPronto;
  }

  /** Nunca lança: sem arquivo ou ilegível, devolve o padrão. */
  async ler(guildId: string): Promise<ConfiguracaoDoServidor> {
    try {
      const cru = await readFile(join(this.diretorio, nomeDoArquivoDeConfiguracao(guildId)), "utf8");
      return normalizarConfiguracao(JSON.parse(cru));
    } catch {
      return normalizarConfiguracao(undefined);
    }
  }

  /** Mescla `parcial` na configuração gravada, em fila por servidor. */
  async alterar(
    guildId: string,
    parcial: Partial<ConfiguracaoDoServidor>,
  ): Promise<ConfiguracaoDoServidor> {
    const anterior = this.filas.get(guildId) ?? Promise.resolve();
    const passo = async () => {
      const nova = mesclarConfiguracao(await this.ler(guildId), parcial);
      await this.gravar(guildId, nova);
      return nova;
    };
    // A falha da escrita anterior não contamina esta: a fila serializa, não propaga.
    const proxima = anterior.then(passo, passo);
    this.filas.set(guildId, proxima);
    try {
      return await proxima;
    } finally {
      if (this.filas.get(guildId) === proxima) this.filas.delete(guildId);
    }
  }

  private async gravar(guildId: string, config: ConfiguracaoDoServidor): Promise<void> {
    await this.garantirDiretorio();
    const destino = join(this.diretorio, nomeDoArquivoDeConfiguracao(guildId));
    const temporario = `${destino}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const arquivo = await open(temporario, "w", 0o600);
    try {
      await arquivo.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
      // Sem o `sync` o rename pode chegar ao disco antes do conteúdo.
      await arquivo.sync();
    } finally {
      await arquivo.close();
    }
    try {
      await rename(temporario, destino);
    } catch (erro) {
      await unlink(temporario).catch(() => undefined);
      throw erro;
    }
  }
}
