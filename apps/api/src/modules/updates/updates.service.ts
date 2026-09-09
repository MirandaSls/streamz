import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { caminhoDoInstalador } from "./arquivo";
import { ehMaisNova } from "./versao";

/**
 * O manifesto que o atualizador do Tauri espera. O formato é dele, não nosso —
 * daí o `snake_case` no `pub_date` e a chave de plataforma no formato
 * `<os>-<arch>`.
 */
export interface ManifestoDeAtualizacao {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

/**
 * De onde o app de desktop descobre que existe versão nova.
 *
 * Os dados vêm do **ambiente**, não do banco nem do repositório: publicar uma
 * versão passa a ser trocar três variáveis e reiniciar a API, sem rebuild de
 * imagem. É o mesmo padrão das dependências opcionais (R2, LiveKit, SMTP) —
 * sem configuração, o serviço responde "não há atualização" em vez de quebrar.
 *
 * A assinatura fica aqui porque é ela que o cliente verifica contra a chave
 * pública embutida no app: sem assinatura válida o Tauri recusa o pacote, que é
 * exatamente o que impede alguém que assuma este endpoint de empurrar um
 * executável qualquer.
 */
@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Pasta de onde o instalador é servido.
   *
   * Separada da pasta de `downloads` de propósito: aquela é protegida por
   * senha, e o atualizador não sabe autenticar — ele é um cliente cego que só
   * segue a URL do manifesto. O que garante que o pacote é nosso não é o
   * segredo do endereço, é a assinatura.
   */
  diretorio(): string {
    return this.config.get<string>("UPDATE_DIR")?.trim() || "updates";
  }

  /** Caminho no disco do instalador pedido, ou `null` se o nome não presta. */
  arquivo(nome: string): string | null {
    return caminhoDoInstalador(this.diretorio(), nome);
  }

  isConfigured(): boolean {
    return Boolean(this.versao() && this.url() && this.assinatura());
  }

  private variavel(prefixo: string, nome: string): string {
    return this.config.get<string>(`${prefixo}_UPDATE_${nome}`)?.trim() ?? "";
  }

  private versao(prefixo = "DESKTOP"): string {
    return this.variavel(prefixo, "VERSION");
  }

  private url(prefixo = "DESKTOP"): string {
    return this.variavel(prefixo, "URL");
  }

  private assinatura(): string {
    return this.variavel("DESKTOP", "SIGNATURE");
  }

  /**
   * O manifesto para quem está em `atual`, ou `null` quando não há nada a
   * oferecer — seja porque não configuramos, seja porque ele já está em dia.
   *
   * `plataforma` chega como `<target>-<arch>` (ex.: `windows-x86_64`). Dois
   * clientes usam esta rota, e eles são bem diferentes:
   *
   * - **`windows-*`** é o atualizador do Tauri, um cliente cego que baixa e
   *   instala sozinho. O formato da resposta é dele, a assinatura é
   *   obrigatória e é ela — não o sigilo do endereço — que impede alguém que
   *   assuma este endpoint de empurrar um executável qualquer.
   * - **`android-*`** é o **nosso próprio código** (`lib/atualizacao-mobile.ts`),
   *   que só compara versões e mostra um card "Baixar atualização". O
   *   atualizador do Tauri não existe para Android, então **nada é baixado nem
   *   instalado automaticamente**: o card abre `streamz.chat/download` no
   *   navegador e quem instala o `.apk` é o usuário, à mão, com o Android
   *   perguntando se confia na origem. Por isso a `signature` vai vazia —
   *   não há nada que ela pudesse proteger aqui, e fingir que há seria pior.
   *
   * Pedir de qualquer outra plataforma (macOS, Linux) responde "nada" em vez
   * de oferecer um `.exe` para um Mac.
   */
  manifesto(plataforma: string, atual: string): ManifestoDeAtualizacao | null {
    if (plataforma.startsWith("windows-")) return this.manifestoDoDesktop(plataforma, atual);
    if (plataforma.startsWith("android-")) return this.manifestoDoAndroid(plataforma, atual);
    return null;
  }

  private manifestoDoDesktop(
    plataforma: string,
    atual: string,
  ): ManifestoDeAtualizacao | null {
    if (!this.isConfigured()) return null;

    const versao = this.versao();
    if (!ehMaisNova(versao, atual)) return null;

    return {
      version: versao,
      notes: this.variavel("DESKTOP", "NOTES") || "Correções e melhorias.",
      pub_date: this.variavel("DESKTOP", "DATE") || new Date().toISOString(),
      platforms: {
        [plataforma]: { signature: this.assinatura(), url: this.url() },
      },
    };
  }

  /**
   * O Android não tem assinatura no manifesto (ver acima) e por isso só precisa
   * de duas variáveis: `ANDROID_UPDATE_VERSION` e `ANDROID_UPDATE_URL`. A URL
   * é para onde mandar o usuário — hoje `https://streamz.chat/download`, não o
   * `.apk` direto: a página é que pede a senha de acesso enquanto o app for
   * fechado.
   *
   * Sem as duas, responde "não há atualização", como o desktop. É o mesmo
   * padrão de dependência opcional do resto da API.
   */
  private manifestoDoAndroid(
    plataforma: string,
    atual: string,
  ): ManifestoDeAtualizacao | null {
    const versao = this.versao("ANDROID");
    const url = this.url("ANDROID");
    if (!versao || !url) return null;
    if (!ehMaisNova(versao, atual)) return null;

    return {
      version: versao,
      notes: this.variavel("ANDROID", "NOTES") || "Correções e melhorias.",
      pub_date: this.variavel("ANDROID", "DATE") || new Date().toISOString(),
      platforms: {
        [plataforma]: { signature: "", url },
      },
    };
  }
}
