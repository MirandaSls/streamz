import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

  isConfigured(): boolean {
    return Boolean(this.versao() && this.url() && this.assinatura());
  }

  private versao(): string {
    return this.config.get<string>("DESKTOP_UPDATE_VERSION")?.trim() ?? "";
  }

  private url(): string {
    return this.config.get<string>("DESKTOP_UPDATE_URL")?.trim() ?? "";
  }

  private assinatura(): string {
    return this.config.get<string>("DESKTOP_UPDATE_SIGNATURE")?.trim() ?? "";
  }

  /**
   * O manifesto para quem está em `atual`, ou `null` quando não há nada a
   * oferecer — seja porque não configuramos, seja porque ele já está em dia.
   *
   * `plataforma` chega do próprio Tauri como `<target>-<arch>` (ex.:
   * `windows-x86_64`). Publicamos só Windows hoje; pedir de outra plataforma
   * responde "nada" em vez de oferecer um `.exe` para um Mac.
   */
  manifesto(plataforma: string, atual: string): ManifestoDeAtualizacao | null {
    if (!this.isConfigured()) return null;
    if (!plataforma.startsWith("windows-")) return null;

    const versao = this.versao();
    if (!ehMaisNova(versao, atual)) return null;

    return {
      version: versao,
      notes: this.config.get<string>("DESKTOP_UPDATE_NOTES")?.trim() || "Correções e melhorias.",
      pub_date: this.config.get<string>("DESKTOP_UPDATE_DATE")?.trim() || new Date().toISOString(),
      platforms: {
        [plataforma]: { signature: this.assinatura(), url: this.url() },
      },
    };
  }
}
