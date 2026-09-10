/**
 * O estado do bot: **um arquivo JSON por servidor**, num volume próprio.
 *
 * ## Por que não uma tabela no banco do Streamz
 *
 * Porque a configuração é do **bot**, não do produto. Uma tabela custaria uma
 * migration no schema que a API e a web compartilham, e passaria a ser mais uma
 * coisa que um `prisma migrate` de outra feature precisa levar em conta. O
 * volume do próprio bot é a fronteira certa: se o bot sair, o estado sai junto,
 * e nada no Streamz fica sabendo que ele existiu.
 *
 * ## Por que um arquivo por servidor
 *
 * Um arquivo único com todos os servidores é um ponto de corrupção comum: duas
 * escritas concorrentes de servidores diferentes disputam o mesmo `rename`, e um
 * JSON truncado leva **todos** os servidores junto. Por servidor, o pior caso é
 * um servidor perder a configuração — e nem isso acontece, por causa da
 * escrita atômica abaixo.
 *
 * ## A escrita atômica
 *
 * `write` num temporário no **mesmo diretório**, `fsync` no arquivo, `rename`
 * por cima. O `rename` dentro do mesmo sistema de arquivos é atômico no POSIX:
 * um leitor vê o conteúdo antigo ou o novo, nunca meio arquivo. Sem isso, um
 * container morto no meio de um `writeFile` deixa um JSON pela metade, e o
 * `JSON.parse` da próxima subida derruba a configuração do servidor — que é
 * justamente a hora em que ninguém está olhando.
 *
 * Mesmo diretório é requisito, não estilo: `rename` entre sistemas de arquivos
 * (`/tmp` e o volume, por exemplo) vira `EXDEV`, e a biblioteca cai para
 * copiar — que não é atômico.
 *
 * ## A fila por servidor
 *
 * Um `Map` de promessas encadeadas serializa as escritas do **mesmo** servidor.
 * Sem ela, dois `/boas-vindas` no mesmo segundo fazem ler-modificar-gravar em
 * paralelo e o segundo apaga o primeiro em silêncio — o defeito que só aparece
 * quando duas pessoas configuram juntas e ninguém consegue reproduzir depois.
 */

import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DIRETORIO_PADRAO, diretorioDosDados } from "../runtime/dados";
import { normalizarConfiguracao, type Configuracao } from "./configuracao";

/**
 * O diretório de estado é o comum a todos os bots (`/dados`, via
 * `BOTS_DADOS_DIR`) — ver `../runtime/dados.ts` para o porquê de o caminho não
 * ser escolha de cada bot. Reexportado aqui porque o resto do módulo e os
 * testes já o chamavam por este nome.
 */
export { DIRETORIO_PADRAO, diretorioDosDados };

/**
 * `<guildId>.json`, com o id conferido.
 *
 * O id vem do gateway e é sempre um snowflake decimal, mas ele acaba num
 * caminho de arquivo: conferir aqui é a diferença entre um id estranho virar
 * `ENOENT` e virar `../../etc/algo`. Falhar alto é o certo — um id que não é
 * snowflake quer dizer que o dispatch mudou de forma.
 */
export function nomeDoArquivo(guildId: string): string {
  if (!/^[0-9]{1,32}$/.test(guildId)) {
    throw new Error(`id de servidor fora do formato esperado: ${JSON.stringify(guildId)}`);
  }
  return `${guildId}.json`;
}

export class Armazem {
  private readonly filas = new Map<string, Promise<unknown>>();
  private diretorioPronto: Promise<void> | null = null;

  constructor(private readonly diretorio: string = diretorioDosDados()) {}

  private caminho(guildId: string): string {
    return join(this.diretorio, nomeDoArquivo(guildId));
  }

  /** `mkdir -p`, uma vez só por processo. */
  private async garantirDiretorio(): Promise<void> {
    this.diretorioPronto ??= mkdir(this.diretorio, { recursive: true }).then(() => undefined);
    await this.diretorioPronto;
  }

  /**
   * A configuração de um servidor. **Nunca lança**: servidor sem arquivo, ou com
   * arquivo ilegível, cai no padrão (tudo desligado).
   *
   * Sem cache de propósito. São dezenas de servidores e um `readFile` de 400
   * bytes por entrada de membro; um cache pediria invalidação e é a origem
   * clássica do "configurei e não mudou nada" quando dois containers do mesmo
   * bot rodam ao mesmo tempo.
   */
  async ler(guildId: string): Promise<Configuracao> {
    try {
      const cru = await readFile(this.caminho(guildId), "utf8");
      return normalizarConfiguracao(JSON.parse(cru));
    } catch {
      return normalizarConfiguracao(undefined);
    }
  }

  /** Ler, mexer, gravar — em fila, por servidor. Devolve o que ficou gravado. */
  async atualizar(
    guildId: string,
    mudanca: (atual: Configuracao) => Configuracao,
  ): Promise<Configuracao> {
    const anterior = this.filas.get(guildId) ?? Promise.resolve();
    const proxima = anterior.then(
      async () => {
        const atual = await this.ler(guildId);
        const nova = normalizarConfiguracao(mudanca(atual));
        await this.gravar(guildId, nova);
        return nova;
      },
      async () => {
        // A falha da escrita **anterior** não pode contaminar esta: a fila
        // serializa, não propaga. Sem este segundo ramo, um `ENOSPC` de uma vez
        // deixaria todo `/boas-vindas` seguinte daquele servidor falhando.
        const atual = await this.ler(guildId);
        const nova = normalizarConfiguracao(mudanca(atual));
        await this.gravar(guildId, nova);
        return nova;
      },
    );
    this.filas.set(guildId, proxima);
    try {
      return await proxima;
    } finally {
      if (this.filas.get(guildId) === proxima) this.filas.delete(guildId);
    }
  }

  /** Escrita atômica: temporário no mesmo diretório, `fsync`, `rename`. */
  async gravar(guildId: string, config: Configuracao): Promise<void> {
    await this.garantirDiretorio();
    const destino = this.caminho(guildId);
    const temporario = `${destino}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const conteudo = `${JSON.stringify(config, null, 2)}\n`;

    const arquivo = await open(temporario, "w", 0o600);
    try {
      await arquivo.writeFile(conteudo, "utf8");
      // Sem o `sync`, o `rename` pode chegar ao disco antes do conteúdo: o
      // arquivo existe, com o nome certo, e vazio. É o modo de falha que uma
      // queda de energia produz e que nenhum teste pega.
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
