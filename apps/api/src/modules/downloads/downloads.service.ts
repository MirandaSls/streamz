import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, timingSafeEqual } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import {
  DOWNLOAD_PLATAFORMAS,
  DOWNLOAD_TOKEN_TTL_SECONDS,
  rotuloPlataforma,
  type DownloadAutorizado,
  type DownloadCatalogo,
  type DownloadDisponivel,
  type DownloadPlataforma,
} from "@streamz/shared";
import { escolherInstalador, type EntradaInstalador } from "./instalador";

/** Claims do token curto de download (`?t=` na rota do arquivo). */
interface DownloadTokenClaims {
  /** plataforma autorizada; o token não vale para nenhuma outra. */
  plt: DownloadPlataforma;
  typ: "download";
}

/** Arquivo resolvido no disco, já com o que a resposta precisa. */
interface ArquivoDeDownload {
  caminho: string;
  filename: string;
  tamanho: number;
  atualizadoEm: Date;
}

/**
 * Extensões que identificam o instalador de cada sistema, em ORDEM DE
 * PREFERÊNCIA — não é um conjunto. O build passou a gerar mais de um formato
 * na mesma pasta (Linux: `.AppImage` e `.deb` juntos; Windows, às vezes `.exe`
 * e `.msi`), e o mtime dos dois fica perto demais para decidir sozinho: bastaria
 * publicar primeiro o pacote "errado" para a página passar a entregá-lo. A
 * extensão mais preferida presente sempre vence; só entre arquivos da mesma
 * extensão o mais recente decide (`escolherInstalador`, em `instalador.ts`).
 *
 * windows: `.exe` primeiro — é o NSIS, o formato que o autoupdater usa; `.msi`
 *   fica de reserva.
 * macos: `.dmg` primeiro — instalador padrão do sistema; `.pkg` de reserva.
 * linux: `.appimage` primeiro — roda em qualquer distro sem instalar nada;
 *   `.deb` só serve Debian/Ubuntu; `.rpm` por último.
 *
 * É por extensão, e não por nome fixo, porque o nome do instalador do Tauri
 * carrega a versão (`Streamz_1.0.0_x64-setup.exe`) e mudaria a cada release —
 * exigir um nome exato faria toda publicação passar por uma troca de variável
 * de ambiente e um restart.
 */
const EXTENSOES: Record<DownloadPlataforma, readonly string[]> = {
  windows: [".exe", ".msi"],
  macos: [".dmg", ".pkg"],
  linux: [".appimage", ".deb", ".rpm"],
  // O `.aab` NÃO entra: ele é o formato de submissão à Play, não instala em
  // aparelho nenhum. Oferecê-lo aqui seria entregar um arquivo que só dá erro.
  android: [".apk"],
};

/**
 * Download do app de desktop protegido por senha única.
 *
 * A senha é verificada **no servidor** e o arquivo só sai por uma rota que
 * exige a prova dessa verificação. Não existe caminho em que o cliente decida
 * sozinho que passou: esconder um botão no front seria contornável abrindo o
 * DevTools, e um link direto para o arquivo seria compartilhável para sempre.
 *
 * Config por ambiente:
 *   DOWNLOAD_PASSWORD  — obrigatória; sem ela o recurso responde 503 inteiro
 *   DOWNLOAD_DIR       — pasta lida (padrão: `downloads` a partir do cwd)
 *
 * Segue o padrão de dependência opcional do R2/LiveKit: `isConfigured()` false
 * derruba as rotas com 503 e o resto da API continua de pé.
 */
@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);

  constructor(private readonly jwt: JwtService) {}

  isConfigured(): boolean {
    return Boolean(process.env.DOWNLOAD_PASSWORD);
  }

  /** Pasta dos instaladores, sempre absoluta. */
  private get diretorio(): string {
    return resolve(process.env.DOWNLOAD_DIR ?? "downloads");
  }

  /** Catálogo público: o que existe e quanto pesa, sem revelar o nome. */
  async catalogo(): Promise<DownloadCatalogo> {
    if (!this.isConfigured()) return { configurado: false, disponiveis: [] };

    const disponiveis: DownloadDisponivel[] = [];
    for (const plataforma of DOWNLOAD_PLATAFORMAS) {
      const arquivo = await this.arquivoDe(plataforma);
      if (arquivo) {
        disponiveis.push({
          plataforma,
          tamanho: arquivo.tamanho,
          atualizadoEm: arquivo.atualizadoEm.toISOString(),
        });
      }
    }
    return { configurado: true, disponiveis };
  }

  /**
   * Confere a senha e devolve a URL de download com o token curto.
   *
   * A ordem importa: a senha é checada **antes** de olhar o disco. Ao contrário,
   * quem errasse a senha ainda descobriria, pelo 404 chegar mais cedo que o 401,
   * para quais sistemas existe build.
   */
  async autorizar(
    senha: string,
    plataforma: DownloadPlataforma,
  ): Promise<DownloadAutorizado> {
    this.exigirConfigurado();

    if (!this.senhaConfere(senha)) {
      throw new UnauthorizedException("Senha incorreta");
    }

    const arquivo = await this.arquivoDe(plataforma);
    if (!arquivo) {
      throw new NotFoundException(
        `Ainda não há instalador para ${rotuloPlataforma(plataforma)}`,
      );
    }

    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(
      /\/+$/,
      "",
    );
    const token = this.assinarToken(plataforma);
    return {
      url: `${api}/api/downloads/arquivo?t=${encodeURIComponent(token)}`,
      filename: arquivo.filename,
      tamanho: arquivo.tamanho,
      expiraEm: Date.now() + DOWNLOAD_TOKEN_TTL_SECONDS * 1000,
    };
  }

  /** Valida o token da URL e devolve o arquivo que ele autoriza. */
  async arquivoDoToken(token: string | undefined): Promise<ArquivoDeDownload> {
    this.exigirConfigurado();

    const plataforma = token ? this.verificarToken(token) : null;
    // mesma resposta para token ausente, expirado e forjado: distinguir os três
    // só ajudaria quem está sondando
    if (!plataforma) {
      throw new UnauthorizedException("Link expirado — informe a senha de novo");
    }

    const arquivo = await this.arquivoDe(plataforma);
    if (!arquivo) {
      throw new NotFoundException(
        `Ainda não há instalador para ${rotuloPlataforma(plataforma)}`,
      );
    }
    return arquivo;
  }

  private exigirConfigurado(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "Download não configurado neste servidor (falta DOWNLOAD_PASSWORD)",
      );
    }
  }

  /**
   * Comparação em tempo constante.
   *
   * Passa pelo SHA-256 antes porque `timingSafeEqual` exige buffers do mesmo
   * tamanho — comparar as senhas cruas ou vazaria o comprimento pela exceção,
   * ou exigiria um `if` de tamanho que é justamente o vazamento de tempo que
   * se quer evitar. O digest tem 32 bytes sempre.
   */
  private senhaConfere(enviada: string): boolean {
    const esperada = process.env.DOWNLOAD_PASSWORD ?? "";
    const a = createHash("sha256").update(enviada, "utf8").digest();
    const b = createHash("sha256").update(esperada, "utf8").digest();
    return timingSafeEqual(a, b);
  }

  private assinarToken(plataforma: DownloadPlataforma): string {
    return this.jwt.sign(
      { plt: plataforma, typ: "download" } satisfies DownloadTokenClaims,
      { secret: process.env.JWT_SECRET, expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS },
    );
  }

  /** Plataforma autorizada pelo token, ou null se ele não presta. */
  private verificarToken(token: string): DownloadPlataforma | null {
    try {
      const claims = this.jwt.verify<DownloadTokenClaims>(token, {
        secret: process.env.JWT_SECRET,
      });
      // `typ` separa este token do de anexo: os dois são assinados com o mesmo
      // JWT_SECRET, e sem a marca um valeria pelo outro
      if (claims?.typ !== "download") return null;
      return DOWNLOAD_PLATAFORMAS.includes(claims.plt) ? claims.plt : null;
    } catch {
      return null;
    }
  }

  /**
   * O instalador que a extensão preferida da plataforma indica — e, entre
   * arquivos da mesma extensão, o mais recente.
   *
   * "Mais recente" dentro da extensão, e não "único", para que publicar uma
   * versão nova seja copiar o novo instalador na pasta — a anterior pode ficar
   * lá como histórico sem confundir a rota. A escolha entre extensões (quando
   * o build deixa mais de uma na pasta) é responsabilidade de
   * `escolherInstalador`; aqui só se monta a lista de candidatos e se resolve
   * o caminho final.
   */
  private async arquivoDe(
    plataforma: DownloadPlataforma,
  ): Promise<ArquivoDeDownload | null> {
    const dir = this.diretorio;
    const entradas = await readdir(dir, { withFileTypes: true }).catch(
      (e: NodeJS.ErrnoException) => {
        // pasta ausente é o estado normal antes do primeiro build; só o resto
        // (permissão, disco) merece log
        if (e.code !== "ENOENT") this.logger.warn(`Falha ao ler ${dir}: ${e}`);
        return [];
      },
    );

    const extensoes = EXTENSOES[plataforma];
    // caminho de cada candidato, indexado pelo nome — `escolherInstalador` só
    // conhece nome/mtime/tamanho, não disco, então o caminho fica de fora dela
    const caminhos = new Map<string, string>();
    const candidatos: EntradaInstalador[] = [];

    for (const entrada of entradas) {
      if (!entrada.isFile()) continue;
      if (!extensoes.includes(extname(entrada.name).toLowerCase())) continue;

      const caminho = join(dir, entrada.name);
      // cinto e suspensório: `readdir` não sobe de diretório, mas um nome
      // exótico não pode acabar apontando para fora da pasta configurada
      if (caminho !== dir && !caminho.startsWith(dir + sep)) continue;

      const info = await stat(caminho).catch(() => null);
      if (!info?.isFile()) continue;

      caminhos.set(entrada.name, caminho);
      candidatos.push({ nome: entrada.name, mtime: info.mtime, tamanho: info.size });
    }

    const escolhido = escolherInstalador(candidatos, extensoes);
    if (!escolhido) return null;

    return {
      caminho: caminhos.get(escolhido.nome)!,
      filename: escolhido.nome,
      tamanho: escolhido.tamanho,
      atualizadoEm: escolhido.mtime,
    };
  }
}
