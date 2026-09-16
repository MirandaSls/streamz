import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { caminhoDoInstalador } from "./arquivo";
import {
  MANIFESTO_MACOS,
  lerManifestoMacos,
  type ManifestoMacosPublicado,
} from "./publicacao";
import { ehMaisNova } from "./versao";

/**
 * O manifesto que o atualizador do Tauri espera. O formato é dele, não nosso —
 * daí o `snake_case` no `pub_date` e a chave de plataforma no formato
 * `<os>-<arch>` (ou `<os>-<arch>-<instalador>`, que o cliente procura primeiro;
 * ver `UpdatesService.alvoDoTauri`).
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
 * aqui não quebra o cliente de desktop — e o Android, que é código nosso, é
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
 * O prefixo das variáveis de cada sistema que o atualizador do Tauri atende.
 *
 * `DESKTOP` é o Windows por razão histórica: foi o único desktop que se
 * atualizava sozinho, e renomear para `WINDOWS_UPDATE_*` custaria mexer no
 * `.env` de todo servidor já publicado para ganhar só estética.
 */
export type PrefixoDoDesktop = "DESKTOP" | "MACOS" | "LINUX";

/**
 * Para onde vai um pedido do atualizador do Tauri: de quais variáveis ler e sob
 * qual chave de `platforms` responder.
 */
interface AlvoDoTauri {
  prefixo: PrefixoDoDesktop;
  chave: string;
}

/** De onde saiu a versão de um desktop: o que o manifesto precisa. */
interface FonteDoDesktop {
  versao: string;
  url: string;
  assinatura: string;
  notas: string;
  data: string;
  origem: "manifesto" | "ambiente";
}

/** O que `estadoDoDesktop` conta para quem publicou. */
export interface EstadoDoDesktop {
  ativo: boolean;
  versao: string | null;
  origem: "manifesto" | "ambiente" | null;
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
 *
 * **Exceção do macOS**: `POST /updates/macos` (ver `PublicacaoMacosService`)
 * grava `<UPDATE_DIR>/macos.json`, e esse arquivo, quando existe e é válido,
 * **tem precedência** sobre `MACOS_UPDATE_*` do ambiente — é o que deixa
 * publicar o Mac sem editar o `.env` nem recriar a API. É relido quando muda
 * (cache por mtime/tamanho). Para voltar ao ambiente, apague o arquivo.
 */
@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);

  /** Último `macos.json` lido, pela assinatura (mtime + tamanho) do arquivo. */
  private cacheMacos: { marca: string; manifesto: ManifestoMacosPublicado | null } | null = null;

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

  /**
   * Se o desktop de um sistema tem versão, URL **e** assinatura configuradas.
   *
   * Sem argumento continua respondendo pelo **Windows** (`DESKTOP_*`), que era
   * tudo o que este método dizia antes de macOS e Linux se atualizarem — quem
   * já o chamava assim não muda de resposta.
   */
  isConfigured(prefixo: PrefixoDoDesktop = "DESKTOP"): boolean {
    return this.fonteDoDesktop(prefixo) !== null;
  }

  /** Se o desktop tem atualização ativa, em qual versão e de onde ela vem. */
  estadoDoDesktop(prefixo: PrefixoDoDesktop): EstadoDoDesktop {
    const fonte = this.fonteDoDesktop(prefixo);
    return { ativo: !!fonte, versao: fonte?.versao ?? null, origem: fonte?.origem ?? null };
  }

  /**
   * O `macos.json` publicado pela rota, ou `null` (ausente ou inválido).
   *
   * Síncrono de propósito — o `manifesto` inteiro é síncrono — e barato: um
   * `stat` por consulta, e a leitura só quando mtime ou tamanho mudam. O
   * arquivo é gravado por `rename`, então nunca é lido pela metade.
   */
  manifestoMacosPublicado(): ManifestoMacosPublicado | null {
    const caminho = join(this.diretorio(), MANIFESTO_MACOS);
    let marca: string;
    try {
      const info = statSync(caminho);
      marca = `${info.mtimeMs}:${info.size}`;
    } catch {
      this.cacheMacos = null;
      return null;
    }
    if (this.cacheMacos?.marca === marca) return this.cacheMacos.manifesto;

    let manifesto: ManifestoMacosPublicado | null = null;
    try {
      manifesto = lerManifestoMacos(JSON.parse(readFileSync(caminho, "utf8")));
    } catch {
      manifesto = null;
    }
    if (!manifesto) {
      this.logger.warn(`${caminho} existe mas não é um manifesto válido; usando MACOS_UPDATE_* do ambiente`);
    }
    this.cacheMacos = { marca, manifesto };
    return manifesto;
  }

  /**
   * Versão, URL e assinatura de um desktop — do `macos.json` (só macOS) ou
   * do ambiente —, ou `null` se falta alguma das três.
   */
  private fonteDoDesktop(prefixo: PrefixoDoDesktop): FonteDoDesktop | null {
    if (prefixo === "MACOS") {
      const publicado = this.manifestoMacosPublicado();
      if (publicado) {
        return {
          versao: publicado.version,
          url: publicado.url,
          assinatura: publicado.signature,
          notas: publicado.notes,
          data: publicado.pubDate,
          origem: "manifesto",
        };
      }
    }
    const versao = this.versao(prefixo);
    const url = this.url(prefixo);
    const assinatura = this.assinatura(prefixo);
    if (!versao || !url || !assinatura) return null;
    return {
      versao,
      url,
      assinatura,
      notas: this.variavel(prefixo, "NOTES"),
      data: this.variavel(prefixo, "DATE"),
      origem: "ambiente",
    };
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

  private assinatura(prefixo: PrefixoDoDesktop = "DESKTOP"): string {
    return this.variavel(prefixo, "SIGNATURE");
  }

  /**
   * O manifesto para quem está em `atual`, ou `null` quando não há nada a
   * oferecer — seja porque não configuramos, seja porque ele já está em dia.
   *
   * `plataforma` chega como `<target>-<arch>` (ex.: `windows-x86_64`). Dois
   * clientes usam esta rota, e eles são bem diferentes:
   *
   * - **Desktop (`windows-*`, `darwin-*`, `linux-*`)** é o atualizador do
   *   Tauri, um cliente cego que baixa e instala sozinho. O formato da resposta
   *   é dele, a assinatura é obrigatória e é ela — não o sigilo do endereço —
   *   que impede alguém que assuma este endpoint de empurrar um executável
   *   qualquer. Cada sistema recebe **o próprio pacote**, lido das próprias
   *   variáveis (`DESKTOP_*` no Windows, `MACOS_*`, `LINUX_*`), e nunca o de
   *   outro: um `.exe` oferecido a um Mac seria baixado inteiro e recusado
   *   todo dia. Ver `alvoDoTauri` para quais arquiteturas cada um aceita.
   * - **`android-*`** é o **nosso próprio código** (`lib/atualizacao-mobile.ts`
   *   + o plugin `atualizador`), que baixa o `.apk`, confere o **sha256** e
   *   abre o instalador do sistema. O atualizador do Tauri não existe para
   *   Android, e não há como verificar minisign lá sem escrever a verificação
   *   nós mesmos — então a integridade é o digest, e a origem é o HTTPS. Por
   *   isso a `signature` vai **vazia** e o `sha256` vai preenchido: fingir uma
   *   assinatura que ninguém confere seria pior que não ter nenhuma.
   *
   * Qualquer outra coisa (iOS, arquitetura para a qual não publicamos pacote)
   * responde "nada" em vez de oferecer o pacote errado.
   *
   * `tipoDePacote` é o `{{bundle_type}}` que o endpoint do `tauri.conf.json`
   * manda desde o plugin 2.10 (`appimage`, `deb`, `rpm`, `msi`, `nsis`, `app`
   * ou `unknown`) — `undefined` para quem já tinha o app instalado antes desta
   * mudança, que continua chamando sem o parâmetro. Ver `pacoteIncompativel`
   * para a única coisa que ele decide: recusar o pacote que o instalador do
   * cliente não sabe aplicar por cima do que já está no disco.
   */
  manifesto(
    plataforma: string,
    atual: string,
    tipoDePacote?: string,
  ): ManifestoDeAtualizacao | null {
    if (plataforma.startsWith("android-")) return this.manifestoDoAndroid(plataforma, atual);
    const alvo = this.alvoDoTauri(plataforma);
    if (!alvo || this.pacoteIncompativel(alvo, tipoDePacote)) return null;
    return this.manifestoDoDesktop(alvo, atual);
  }

  /**
   * Se o pacote que este servidor ofereceria é de um formato que o instalador
   * do cliente não sabe aplicar.
   *
   * A chave sufixada (`linux-x86_64-appimage`) já protege o `.deb`/`.rpm` de
   * baixar o AppImage por engano — mas hoje isso acontece como **erro** de
   * checagem (a chave não bate com nenhuma das que o cliente procura), que o
   * app engole em silêncio. Com o `bundle_type` dá para responder a coisa
   * certa, "não há atualização" (`null` → 204), em vez de uma checagem que
   * falha.
   *
   * - **Linux**: veio um tipo e não é `appimage` (ex.: `deb`, `rpm`) → o
   *   `.deb`/`.rpm` instalado não sabe reinstalar por cima com um AppImage; o
   *   dele se atualiza baixando o pacote novo pela página, não sozinho. No
   *   Linux `install_inner` escolhe `install_deb`/`install_rpm`/
   *   `install_appimage` pelo `bundle_type` do binário **instalado**, não pelos
   *   bytes baixados — cada um confere o formato (`infer::archive::is_deb`
   *   etc.) e devolve `InvalidUpdaterFormat` se não bater, sem cair para outro
   *   instalador. A regra de isolar por formato aqui é real.
   * - **Windows**: **não isola por `bundle_type`.** Conferido no
   *   `tauri-plugin-updater` 2.11.0 (`plugins/updater/src/updater.rs`,
   *   `extract` → `extract_exe`): o Windows decide NSIS ou MSI pelos **bytes
   *   baixados** (`infer::app::is_exe`/`infer::archive::is_msi`), não pelo que
   *   está instalado. Um cliente instalado via MSI que recebe o `.exe` NSIS
   *   (é o único pacote que publicamos, `DESKTOP_UPDATE_URL`) roda-o
   *   normalmente — o `msiexec` nunca entra em cena. `msi`, `nsis`, ausente ou
   *   `unknown` recebem todos o mesmo manifesto.
   * - **macOS**: o `bundle_type` sempre vem `app` — não há formato alternativo
   *   a isolar, então este método não mexe nele.
   *
   * Ausente (app de antes desta mudança, ou endpoint sem o parâmetro) ou
   * `unknown` (bundler não gravou o marcador) mantêm o comportamento de
   * sempre: oferecer o pacote e deixar a chave sufixada proteger quem não
   * bate.
   */
  private pacoteIncompativel(alvo: AlvoDoTauri, tipoDePacote?: string): boolean {
    if (!tipoDePacote || tipoDePacote === "unknown") return false;
    if (alvo.prefixo === "LINUX") return tipoDePacote !== "appimage";
    return false;
  }

  /**
   * Qual pacote de desktop atende a plataforma pedida, ou `null` se nenhum.
   *
   * O atualizador do Tauri monta `{{target}}` e `{{arch}}` em **tempo de
   * compilação** (`cfg!(target_os)`/`cfg!(target_arch)`) e procura no
   * `platforms` a chave `<os>-<arch>-<instalador>` e, se não achar,
   * `<os>-<arch>`. Daí cada caso:
   *
   * - **Windows** aceita qualquer arquitetura, como sempre aceitou — não mudar
   *   isso é a garantia de que ninguém que já atualizava deixa de atualizar.
   * - **macOS** é build **universal** (`universal-apple-darwin`): um binário
   *   gordo com as duas fatias, cada uma compilada para a sua arquitetura. O
   *   Mac com Apple Silicon roda a fatia `aarch64` e pede `darwin/aarch64`; o
   *   Intel (ou o app aberto pelo Rosetta) pede `darwin/x86_64`. Ninguém pede
   *   `darwin-universal` — isso só existiria com um alvo customizado no
   *   plugin, que não usamos. As duas chaves recebem o **mesmo**
   *   `Streamz.app.tar.gz`, que é justamente o que serve às duas.
   * - **Linux** só `x86_64`, que é o único AppImage que publicamos. E a chave
   *   da resposta é **`linux-x86_64-appimage`**, não `linux-x86_64`: desde o
   *   plugin 2.10 quem instalou pelo `.deb` (ou `.rpm`) também consulta esta
   *   rota, com o mesmo `linux/x86_64` na URL, e o instalador dele confere se
   *   os bytes são um `.deb` — um AppImage seria baixado inteiro e recusado
   *   (`InvalidUpdaterFormat`) a cada abertura. Com a chave sufixada, o cliente
   *   do `.deb` procura `linux-x86_64-deb` e `linux-x86_64`, não acha nenhuma
   *   e a checagem falha **antes** de baixar (o app trata falha de checagem
   *   como "nada a fazer"); o do AppImage procura `linux-x86_64-appimage`
   *   primeiro e acha. O tipo de pacote vem de um marcador que o bundler grava
   *   no binário de cada formato.
   */
  private alvoDoTauri(plataforma: string): AlvoDoTauri | null {
    if (plataforma.startsWith("windows-")) return { prefixo: "DESKTOP", chave: plataforma };
    if (plataforma === "darwin-aarch64" || plataforma === "darwin-x86_64") {
      return { prefixo: "MACOS", chave: plataforma };
    }
    if (plataforma === "linux-x86_64") return { prefixo: "LINUX", chave: "linux-x86_64-appimage" };
    return null;
  }

  /**
   * Um só caminho para os três desktops: mudam o prefixo das variáveis e a
   * chave da resposta, e mais nada. Em particular, a regra "sem assinatura não
   * oferece" vale igual para todos — o cliente dos três é o mesmo atualizador
   * cego, e nos três ele recusaria o pacote depois de baixá-lo.
   */
  private manifestoDoDesktop(
    { prefixo, chave }: AlvoDoTauri,
    atual: string,
  ): ManifestoDeAtualizacao | null {
    const fonte = this.fonteDoDesktop(prefixo);
    if (!fonte || !ehMaisNova(fonte.versao, atual)) return null;

    return {
      version: fonte.versao,
      notes: fonte.notas || "Correções e melhorias.",
      pub_date: fonte.data || new Date().toISOString(),
      platforms: {
        [chave]: { signature: fonte.assinatura, url: fonte.url },
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
