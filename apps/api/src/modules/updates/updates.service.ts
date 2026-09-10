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
  platforms: Record<string, PlataformaDoManifesto>;
}

/**
 * O que cada plataforma traz. `signature` e `url` são do formato do Tauri;
 * `sha256` é **nosso**, e só o Android o usa.
 *
 * O atualizador do Tauri ignora campo que não conhece, então acrescentar um
 * aqui não quebra o cliente do Windows — e o Android, que é código nosso, é
 * quem o lê. A alternativa (uma segunda rota, com outro formato) custaria um
 * segundo contrato para dizer a mesma coisa.
 */
export interface PlataformaDoManifesto {
  signature: string;
  url: string;
  /** Só no Android: o digest do `.apk`, minúsculo, 64 hexadecimais. */
  sha256?: string;
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
   * - **`android-*`** é o **nosso próprio código** (`lib/atualizacao-mobile.ts`
   *   + o plugin `atualizador`), que baixa o `.apk`, confere o **sha256** e
   *   abre o instalador do sistema. O atualizador do Tauri não existe para
   *   Android, e não há como verificar minisign lá sem escrever a verificação
   *   nós mesmos — então a integridade é o digest, e a origem é o HTTPS. Por
   *   isso a `signature` vai **vazia** e o `sha256` vai preenchido: fingir uma
   *   assinatura que ninguém confere seria pior que não ter nenhuma.
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
   * O Android precisa de **três** variáveis: `ANDROID_UPDATE_VERSION`,
   * `ANDROID_UPDATE_URL` e `ANDROID_UPDATE_SHA256`.
   *
   * A URL é o **`.apk` direto** — hoje a rota `arquivo/:nome` desta mesma API,
   * que serve a pasta `updates/` aberta. Não é mais a página `/download`: o app
   * baixa sozinho, e uma página HTML não é um pacote instalável. (Quem continua
   * mandando o usuário para a página é o site, para quem ainda não tem o app.)
   *
   * **O sha256 é obrigatório, e essa é a decisão de segurança do módulo.** No
   * Windows quem recusa um pacote de estranho é a assinatura minisign, que o
   * atualizador do Tauri confere sozinho. No Android não existe atualizador do
   * Tauri e não existe verificador de minisign — teríamos de escrever um, e um
   * verificador de assinatura escrito às pressas é pior que nenhum. O que
   * sobra, e que dá para fazer certo, é o digest: a API publica o sha256 do
   * arquivo, o app calcula o do que baixou e **só chama o instalador se os dois
   * baterem**. Sem o digest configurado a resposta é 204 — o mesmo que o
   * desktop faz sem assinatura. Um `.apk` que ninguém confere não é oferecido.
   *
   * Isso protege contra o arquivo corrompido e contra a troca no caminho; não
   * protege contra quem consiga escrever no `.env` **e** na pasta `updates/`,
   * porque aí ele publica o digest do próprio pacote. Contra esse, quem protege
   * é o Android: o sistema só instala por cima um `.apk` assinado com a mesma
   * chave de release, e ela não está neste servidor de aplicação (ver
   * `docs/APPS-MOBILE.md` §5).
   *
   * Sem as três, responde "não há atualização". É o mesmo padrão de dependência
   * opcional do resto da API — e é o estado em que a instalação fica quando o
   * app passar a ser distribuído pela Play, que atualiza sozinha.
   */
  private manifestoDoAndroid(
    plataforma: string,
    atual: string,
  ): ManifestoDeAtualizacao | null {
    const versao = this.versao("ANDROID");
    const url = this.url("ANDROID");
    const sha256 = this.variavel("ANDROID", "SHA256").toLowerCase();
    if (!versao || !url || !sha256) return null;
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      // um digest truncado ou com lixo faria o app baixar 40 MB e recusar
      // sempre, em silêncio; melhor não oferecer e deixar o motivo no log de
      // quem publicou
      this.logger.warn(
        "ANDROID_UPDATE_SHA256 não é um sha256 (64 hexadecimais); a atualização do Android não será oferecida",
      );
      return null;
    }
    if (!ehMaisNova(versao, atual)) return null;

    return {
      version: versao,
      notes: this.variavel("ANDROID", "NOTES") || "Correções e melhorias.",
      pub_date: this.variavel("ANDROID", "DATE") || new Date().toISOString(),
      platforms: {
        [plataforma]: { signature: "", url, sha256 },
      },
    };
  }
}
