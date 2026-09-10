/**
 * Onde o XP mora: **um arquivo JSON por servidor**, num volume só deste bot.
 *
 * ## Por que não o banco do Streamz
 *
 * Uma tabela `NivelDeUsuario` no Postgres seria o lugar óbvio, e é para lá que
 * isto vai um dia (ver "Migração" no fim). Não é o que a primeira versão faz,
 * por três motivos, em ordem de peso:
 *
 * 1. **Uma tabela é uma migration**, e migration é o arquivo mais compartilhado
 *    do repositório. O `CONTRATO.md` existe justamente para um bot novo não
 *    precisar tocar em nada que outro bot também toque; uma migration jogaria
 *    fora essa propriedade.
 * 2. **O bot não tem credencial de banco, e não deveria ter.** Ele fala com a
 *    instância por HTTP como qualquer bot de terceiro — é a promessa inteira da
 *    casca de compatibilidade (§14 do documento dos bots). Dar `DATABASE_URL` a
 *    um bot abriria um segundo caminho para dentro dos dados, ao lado da API.
 * 3. **O volume de escrita é alto e o valor de cada escrita é baixo.** Um
 *    servidor movimentado gera dezenas de ganhos de XP por minuto; perder os
 *    últimos trinta segundos numa queda custa a alguém 25 XP, e nenhuma linha
 *    disso precisa de transação, junção ou índice.
 *
 * ## A política de escrita
 *
 * Escrever a cada mensagem seria um `write`+`fsync` por ganho de XP — o jeito
 * mais fácil de transformar um bot de níveis num gerador de I/O. Então:
 *
 * - o estado vive **em memória**, e é a fonte de verdade enquanto o processo
 *   roda;
 * - grava a cada **{@link INTERVALO_PADRAO_MS}** (30 s) **ou** a cada
 *   {@link MUDANCAS_PADRAO} (50) mudanças, o que vier primeiro — o intervalo
 *   cobre o servidor parado, o contador cobre o servidor em pico;
 * - **grava no desligamento**, pelo `aoDesligar` do runtime (que roda em
 *   SIGTERM/SIGINT). É esta linha que faz um `docker compose restart` não
 *   custar meio minuto de XP a ninguém.
 *
 * A escrita é **atômica**: arquivo temporário no mesmo diretório, `fsync`, e
 * `rename` por cima. `rename` no mesmo sistema de arquivos é atômico no POSIX,
 * então nunca existe um `<guildId>.json` pela metade — o pior caso de uma queda
 * no meio da gravação é o arquivo **anterior**, inteiro. Um `writeFile` direto
 * no destino, sem isso, deixaria JSON truncado, e JSON truncado num arquivo de
 * XP significa o ranking do servidor zerado.
 *
 * ## Migração para o banco, quando chegar a hora
 *
 * O formato é `{ versao: 1, config, usuarios }`, e o `versao` está lá desde a
 * primeira linha gravada exatamente para isto. A migração é um script que lê
 * cada `<guildId>.json` e insere as linhas — nenhuma conversão de formato, e o
 * `guildId` do nome do arquivo é o snowflake do servidor. Os sinais de que a
 * hora chegou: alguém querer ranking global entre servidores, ou querer o XP na
 * tela do Streamz (as duas coisas exigem consulta, que é o que um arquivo JSON
 * não dá). Até lá, o arquivo é legível, editável e copiável com `cp`.
 */

import { mkdirSync, readFileSync } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Log } from "../runtime/tipos";
import { DIRETORIO_PADRAO, diretorioDosDados } from "../runtime/dados";
import { estadoVazio, sanearEstado, type EstadoDoServidor } from "./dados";

/**
 * O diretório do volume: `/dados`, o mesmo de todo bot com estado (a variável
 * é `BOTS_DADOS_DIR`, e o volume nomeado é só deste container). Ver
 * `../runtime/dados.ts`.
 */
export { DIRETORIO_PADRAO, diretorioDosDados };

export const INTERVALO_PADRAO_MS = 30_000;
export const MUDANCAS_PADRAO = 50;

/**
 * O id do servidor vira nome de arquivo, então ele **precisa** ser conferido.
 *
 * Um `guildId` com `../` viraria escrita fora do volume. Hoje o id vem do
 * gateway e é sempre um snowflake, mas "hoje vem sempre" é o começo de toda
 * travessia de diretório: a checagem custa uma expressão regular por servidor
 * por processo.
 */
export function nomeDeArquivo(guildId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(guildId)) {
    throw new Error(`id de servidor inesperado para virar nome de arquivo: ${JSON.stringify(guildId)}`);
  }
  return `${guildId}.json`;
}

export interface OpcoesDaLoja {
  diretorio?: string;
  log: Log;
  intervaloMs?: number;
  mudancasPorGravacao?: number;
}

export class LojaDeNiveis {
  private readonly diretorio: string;
  private readonly log: Log;
  private readonly intervaloMs: number;
  private readonly mudancasPorGravacao: number;

  private readonly emMemoria = new Map<string, EstadoDoServidor>();
  private readonly sujos = new Set<string>();
  private mudancasDesdeAGravacao = 0;
  private relogio: ReturnType<typeof setInterval> | null = null;
  /** Fila de uma via: duas gravações do mesmo arquivo nunca se cruzam. */
  private fila: Promise<void> = Promise.resolve();

  constructor(opcoes: OpcoesDaLoja) {
    this.diretorio = opcoes.diretorio ?? diretorioDosDados();
    this.log = opcoes.log;
    this.intervaloMs = opcoes.intervaloMs ?? INTERVALO_PADRAO_MS;
    this.mudancasPorGravacao = opcoes.mudancasPorGravacao ?? MUDANCAS_PADRAO;
  }

  /** Cria o diretório e liga o relógio de gravação. */
  iniciar(): void {
    mkdirSync(this.diretorio, { recursive: true });
    this.relogio = setInterval(() => {
      void this.gravarPendentes();
    }, this.intervaloMs);
    // Um `setInterval` vivo segura o processo de pé. Este não deve: quem manda
    // no ciclo de vida é o runtime, e um relógio de gravação não é motivo para
    // o Node continuar rodando depois de tudo fechado.
    this.relogio.unref?.();
    this.log.info("estado dos níveis pronto", {
      diretorio: this.diretorio,
      intervaloMs: this.intervaloMs,
      mudancasPorGravacao: this.mudancasPorGravacao,
    });
  }

  /**
   * O estado de um servidor, lendo do disco na primeira vez.
   *
   * Leitura **síncrona** de propósito: acontece uma vez por servidor por
   * processo, e o caminho assíncrono obrigaria todo chamador (inclusive o
   * `messageCreate`, que é quente) a esperar por uma promessa que quase sempre
   * já está resolvida. Arquivo que não existe é servidor novo, não é erro.
   */
  estado(guildId: string): EstadoDoServidor {
    const guardado = this.emMemoria.get(guildId);
    if (guardado) return guardado;

    let estado: EstadoDoServidor;
    try {
      const cru = readFileSync(join(this.diretorio, nomeDeArquivo(guildId)), "utf8");
      estado = sanearEstado(JSON.parse(cru));
    } catch (erro) {
      const codigo = (erro as NodeJS.ErrnoException)?.code;
      if (codigo !== "ENOENT") {
        // JSON corrompido: **não** apaga. Começa do zero em memória e avisa
        // alto, deixando o arquivo quebrado onde está para alguém olhar — um
        // ranking perdido em silêncio é pior que um ranking perdido com log.
        this.log.erro("arquivo de níveis ilegível; começando vazio (o arquivo não foi apagado)", {
          servidor: guildId,
          erro,
        });
      }
      estado = estadoVazio();
    }
    this.emMemoria.set(guildId, estado);
    return estado;
  }

  /** O servidor mudou: marca para gravar, e grava já se acumulou demais. */
  marcarSujo(guildId: string): void {
    this.sujos.add(guildId);
    this.mudancasDesdeAGravacao++;
    if (this.mudancasDesdeAGravacao >= this.mudancasPorGravacao) {
      void this.gravarPendentes();
    }
  }

  /** Grava o que está sujo. Idempotente e serializada. */
  gravarPendentes(): Promise<void> {
    const pendentes = [...this.sujos];
    if (pendentes.length === 0) return this.fila;
    this.sujos.clear();
    this.mudancasDesdeAGravacao = 0;

    this.fila = this.fila.then(async () => {
      for (const guildId of pendentes) {
        const estado = this.emMemoria.get(guildId);
        if (!estado) continue;
        try {
          await this.gravar(guildId, estado);
        } catch (erro) {
          // Devolve para a fila: a próxima rodada tenta de novo. Sem isto, um
          // disco cheio de um minuto custaria o XP daquele servidor para sempre.
          this.sujos.add(guildId);
          this.log.erro("não consegui gravar o estado dos níveis", { servidor: guildId, erro });
        }
      }
    });
    return this.fila;
  }

  /** Escrita atômica: temporário → `fsync` → `rename` por cima. */
  private async gravar(guildId: string, estado: EstadoDoServidor): Promise<void> {
    const destino = join(this.diretorio, nomeDeArquivo(guildId));
    const temporario = `${destino}.tmp`;
    const conteudo = `${JSON.stringify(estado, null, 2)}\n`;

    const arquivo = await open(temporario, "w", 0o600);
    try {
      await arquivo.writeFile(conteudo, "utf8");
      // Sem o `sync` o `rename` pode chegar ao disco antes do conteúdo, e uma
      // queda de energia entre os dois deixaria um arquivo novo **vazio** no
      // lugar do antigo — exatamente o que a escrita atômica existe para evitar.
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

  /** Para o relógio e grava tudo. Chamado pelo `aoDesligar` do runtime. */
  async desligar(): Promise<void> {
    if (this.relogio) {
      clearInterval(this.relogio);
      this.relogio = null;
    }
    // Tudo, e não só o marcado: o desligamento é a última chance.
    for (const guildId of this.emMemoria.keys()) this.sujos.add(guildId);
    await this.gravarPendentes();
    this.log.info("estado dos níveis gravado no desligamento", {
      servidores: this.emMemoria.size,
    });
  }

  /** Só para o teste e para o log: quantos servidores estão em memória. */
  get servidores(): number {
    return this.emMemoria.size;
  }
}
