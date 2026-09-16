import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PREFIXO_TEMPORARIO,
  traduzirErroDeDisco,
  type ArquivoRecebido,
} from "./armazenamento-de-envio";
import {
  CHAVE_PUBLICA_DO_ATUALIZADOR,
  lerChavePublica,
  verificarMinisign,
  type ChavePublicaMinisign,
} from "./minisign";
import {
  MANIFESTO_MACOS,
  nomeDoBundle,
  nomeDoDmg,
  pastaDoEnvio,
  pareceDmg,
  pareceGzip,
  sufixoConfere,
  urlDoArquivo,
  versaoValida,
  type CampoDeEnvio,
  type ManifestoMacosPublicado,
} from "./publicacao";
import { UpdatesService, type EstadoDoDesktop } from "./updates.service";
import { ehMaisNova } from "./versao";

/** Token para trocar a chave pública nos testes. */
export const CHAVE_DO_ATUALIZADOR = Symbol("CHAVE_DO_ATUALIZADOR");

/** Tamanho máximo das notas da versão. */
const MAX_NOTAS = 2000;

/** Temporário esquecido (processo morto no meio) com mais que isto é apagado. */
const IDADE_DE_TEMPORARIO_ORFAO_MS = 60 * 60 * 1000;

export interface ArquivoPublicado {
  campo: "dmg" | "bundle";
  nome: string;
  pasta: "downloads" | "updates";
  tamanho: number;
  sha256: string;
  /** `ja-existia`: o mesmo conteúdo já estava lá — nada foi regravado. */
  situacao: "gravado" | "ja-existia";
}

/**
 * Resposta de `POST /updates/macos`. Fica aqui, e não em `@streamz/shared`,
 * porque quem a lê é um script de shell (`scripts/enviar-macos.sh`), não a web.
 */
export interface ResultadoDaPublicacaoMacos {
  versao: string;
  arquivos: ArquivoPublicado[];
  manifesto: { gravado: boolean; url: string | null };
  autoUpdateMacos: EstadoDoDesktop;
}

export interface EntradaDaPublicacao {
  corpo: unknown;
  arquivos: Partial<Record<CampoDeEnvio, ArquivoRecebido[]>> | undefined;
  autor: { id: string; username: string };
}

/**
 * Publica o macOS sem SFTP nem `.env`: recebe `.dmg` e/ou o pacote do
 * atualizador, confere tudo e só então põe no lugar.
 *
 * Mesmas regras do `scripts/publicar-desktop.sh`, agora do lado da API:
 * - nomes padronizados (`Streamz_<versão>_universal.{dmg,app.tar.gz}`);
 * - **nunca** sobrescreve arquivo existente com conteúdo diferente (409); o
 *   mesmo conteúdo de novo é inofensivo (idempotente);
 * - pacote do atualizador só com a assinatura, e a assinatura é **conferida**
 *   contra a chave pública do app antes de gravar qualquer coisa.
 *
 * "Pôr no lugar" é `link` do temporário (mesma pasta) para o nome final: é
 * atômico e, ao contrário do `rename`, falha com `EEXIST` em vez de pisar em
 * quem chegou antes — o "nunca sobrescreve" vale até numa corrida.
 */
@Injectable()
export class PublicacaoMacosService {
  private readonly logger = new Logger(PublicacaoMacosService.name);
  private readonly chave: ChavePublicaMinisign;

  constructor(
    private readonly updates: UpdatesService,
    private readonly config: ConfigService,
    @Optional() @Inject(CHAVE_DO_ATUALIZADOR) chavePublica?: string,
  ) {
    const chave = lerChavePublica(chavePublica ?? CHAVE_PUBLICA_DO_ATUALIZADOR);
    if (!chave) throw new Error("chave pública do atualizador inválida");
    this.chave = chave;
  }

  async publicar(entrada: EntradaDaPublicacao): Promise<ResultadoDaPublicacaoMacos> {
    const recebidos = Object.values(entrada.arquivos ?? {}).flat();
    try {
      return await this.publicarRecebidos(entrada);
    } finally {
      // sucesso ou erro, o temporário nunca fica: o que foi publicado já tem
      // o próprio link
      await Promise.all(
        recebidos.map((a) => (a.caminhoTemporario ? unlink(a.caminhoTemporario).catch(() => undefined) : undefined)),
      );
    }
  }

  private async publicarRecebidos({
    corpo,
    arquivos,
    autor,
  }: EntradaDaPublicacao): Promise<ResultadoDaPublicacaoMacos> {
    const campos = (corpo ?? {}) as Record<string, unknown>;
    const versao = campos.version;
    if (!versaoValida(versao)) {
      throw new BadRequestException("`version` precisa ser X.Y.Z (ex.: 1.2.3)");
    }
    const notas = typeof campos.notes === "string" ? campos.notes.trim() : "";
    if (notas.length > MAX_NOTAS) {
      throw new BadRequestException(`\`notes\` passa de ${MAX_NOTAS} caracteres`);
    }

    const dmg = arquivos?.dmg?.[0];
    const bundle = arquivos?.bundle?.[0];
    const sig = arquivos?.sig?.[0];
    if (!dmg && !bundle && !sig) {
      throw new BadRequestException("Envie ao menos um arquivo: `dmg` e/ou `bundle` + `sig`");
    }
    if (!!bundle !== !!sig) {
      throw new BadRequestException("`bundle` (.app.tar.gz) e `sig` (.app.tar.gz.sig) só vão juntos");
    }

    for (const [campo, arquivo] of [["dmg", dmg], ["bundle", bundle], ["sig", sig]] as const) {
      if (!arquivo) continue;
      if (!sufixoConfere(campo, arquivo.originalname)) {
        throw new BadRequestException(`\`${campo}\`: extensão inesperada em "${arquivo.originalname}"`);
      }
      if (arquivo.size === 0) throw new BadRequestException(`\`${campo}\`: arquivo vazio`);
    }
    if (dmg && !pareceDmg(dmg.fim)) {
      throw new BadRequestException("`dmg`: não é uma imagem de disco do macOS (falta o trailer koly)");
    }
    if (bundle && !pareceGzip(bundle.inicio)) {
      throw new BadRequestException("`bundle`: não é um arquivo gzip");
    }

    let assinatura = "";
    if (bundle && sig) {
      // o manifesto leva o conteúdo do `.sig` como está (base64 do texto
      // minisign) — é o que o atualizador do Tauri espera, igual ao .env
      assinatura = (sig.buffer ?? Buffer.alloc(0)).toString("utf8").trim();
      const caminho = bundle.caminhoTemporario!;
      const resultado = await verificarMinisign({
        chave: this.chave,
        assinatura,
        blake2b512: bundle.blake2b512,
        lerArquivo: () => readFile(caminho),
      });
      if (!resultado.ok) {
        throw new BadRequestException(`Assinatura do atualizador recusada: ${resultado.motivo}`);
      }

      const atual = this.updates.manifestoMacosPublicado();
      if (atual && ehMaisNova(atual.version, versao)) {
        throw new ConflictException(
          `O manifesto do macOS já está na ${atual.version}, mais nova que ${versao} — não volto versão pela rota`,
        );
      }
    }

    const downloads = pastaDoEnvio("dmg");
    const updatesDir = pastaDoEnvio("bundle");
    await this.varrerOrfaos([downloads, updatesDir]);

    const plano: { campo: "dmg" | "bundle"; arquivo: ArquivoRecebido; pasta: "downloads" | "updates"; destino: string; nome: string }[] = [];
    if (dmg) {
      const nome = nomeDoDmg(versao);
      plano.push({ campo: "dmg", arquivo: dmg, pasta: "downloads", destino: join(downloads, nome), nome });
    }
    if (bundle) {
      const nome = nomeDoBundle(versao);
      plano.push({ campo: "bundle", arquivo: bundle, pasta: "updates", destino: join(updatesDir, nome), nome });
    }

    // Todos os conflitos antes de gravar qualquer um: um 409 não deixa o .dmg
    // publicado e o pacote do atualizador de fora.
    const jaExistem = new Set<string>();
    for (const item of plano) {
      const existente = await sha256DoArquivo(item.destino);
      if (existente === null) continue;
      if (existente !== item.arquivo.sha256) throw this.conflito(item.destino);
      jaExistem.add(item.destino);
    }

    const publicados: ArquivoPublicado[] = [];
    for (const item of plano) {
      let situacao: ArquivoPublicado["situacao"] = "ja-existia";
      if (!jaExistem.has(item.destino)) {
        try {
          await link(item.arquivo.caminhoTemporario!, item.destino);
          situacao = "gravado";
        } catch (erro) {
          if ((erro as NodeJS.ErrnoException).code !== "EEXIST") {
            throw traduzirErroDeDisco(erro, join(item.destino, ".."));
          }
          // alguém gravou entre a checagem e o link
          if ((await sha256DoArquivo(item.destino)) !== item.arquivo.sha256) throw this.conflito(item.destino);
        }
      }
      publicados.push({
        campo: item.campo,
        nome: item.nome,
        pasta: item.pasta,
        tamanho: item.arquivo.size,
        sha256: item.arquivo.sha256,
        situacao,
      });
    }

    let urlDoManifesto: string | null = null;
    if (bundle) {
      const api = this.config.get<string>("API_PUBLIC_URL")?.trim() || "http://localhost:3333";
      urlDoManifesto = urlDoArquivo(api, nomeDoBundle(versao));
      const manifesto: ManifestoMacosPublicado = {
        version: versao,
        url: urlDoManifesto,
        signature: assinatura,
        notes: notas || "Correções e melhorias.",
        pubDate: new Date().toISOString(),
      };
      await this.gravarManifesto(updatesDir, manifesto);
    }

    const estado = this.updates.estadoDoDesktop("MACOS");
    this.logger.log(
      `macOS ${versao} publicado por @${autor.username} (${autor.id}): ` +
        publicados.map((p) => `${p.pasta}/${p.nome} [${p.situacao}, ${p.tamanho} B, sha256 ${p.sha256}]`).join("; ") +
        (bundle ? `; manifesto → ${versao}` : "") +
        `; auto-update do mac ${estado.ativo ? `ativo (${estado.versao}, ${estado.origem})` : "inativo"}`,
    );

    return {
      versao,
      arquivos: publicados,
      manifesto: { gravado: !!bundle, url: urlDoManifesto },
      autoUpdateMacos: estado,
    };
  }

  private conflito(destino: string): ConflictException {
    return new ConflictException(
      `${destino} já existe com conteúdo DIFERENTE — não sobrescrevo. Suba a versão, ou apague o arquivo no servidor se for intencional.`,
    );
  }

  /** Temporário + `rename`: quem lê (`UpdatesService`) nunca vê meio arquivo. */
  private async gravarManifesto(pasta: string, manifesto: ManifestoMacosPublicado): Promise<void> {
    const temporario = join(pasta, `${PREFIXO_TEMPORARIO}${process.pid}-${Date.now()}.json`);
    try {
      await writeFile(temporario, JSON.stringify(manifesto, null, 2) + "\n", { mode: 0o644, flag: "wx" });
      await rename(temporario, join(pasta, MANIFESTO_MACOS));
    } catch (erro) {
      await unlink(temporario).catch(() => undefined);
      throw traduzirErroDeDisco(erro, pasta);
    }
  }

  /** Apaga temporários de envios que morreram no meio (processo reiniciado). */
  private async varrerOrfaos(pastas: string[]): Promise<void> {
    const limite = Date.now() - IDADE_DE_TEMPORARIO_ORFAO_MS;
    for (const pasta of pastas) {
      const nomes = await readdir(pasta).catch(() => [] as string[]);
      for (const nome of nomes) {
        if (!nome.startsWith(PREFIXO_TEMPORARIO)) continue;
        const caminho = join(pasta, nome);
        const info = await stat(caminho).catch(() => null);
        if (info?.isFile() && info.mtimeMs < limite) await unlink(caminho).catch(() => undefined);
      }
    }
  }
}

/** sha256 de um arquivo no disco, ou `null` se ele não existe. */
async function sha256DoArquivo(caminho: string): Promise<string | null> {
  const info = await stat(caminho).catch(() => null);
  if (!info) return null;
  const hash = createHash("sha256");
  for await (const pedaco of createReadStream(caminho)) hash.update(pedaco as Buffer);
  return hash.digest("hex");
}
