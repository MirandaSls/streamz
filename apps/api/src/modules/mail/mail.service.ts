import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Transporter } from "nodemailer";

/**
 * Envio de e-mail transacional (verificação de conta, redefinição de senha).
 *
 * Dois provedores, escolhidos pelo ambiente:
 *
 * - **console** (padrão, sem `SMTP_URL`): imprime o assunto e o link no log da
 *   API. Não é um "stub que não faz nada" — é o caminho de validação suportado
 *   em dev: o fluxo inteiro (registrar → clicar no link → verificar) roda sem
 *   servidor de e-mail nenhum, bastando copiar o link do terminal.
 * - **smtp** (`SMTP_URL=smtp://usuario:senha@host:587`): envia de verdade via
 *   nodemailer.
 *
 * Duas políticas de erro, e a escolha é de quem chama:
 *
 *  - `enviar` engole a falha (loga): o e-mail é efeito colateral de uma
 *    operação que já aconteceu — o registro não pode falhar por causa do SMTP;
 *  - `enviarOuFalhar` propaga como 503: a entrega **é** a operação, e responder
 *    sucesso sem ter entregado faz a interface mentir.
 */

/** Um e-mail pronto para sair: o mesmo objeto nos dois provedores. */
export interface EmailParaEnviar {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** criado sob demanda: sem SMTP_URL nunca chegamos a carregar o nodemailer. */
  private transporter?: Transporter;

  /** true quando há SMTP configurado; false = provedor `console`. */
  isConfigured(): boolean {
    return !!process.env.SMTP_URL?.trim();
  }

  /** Nome do provedor em uso — a UI mostra "não configurado" quando é console. */
  provider(): "smtp" | "console" {
    return this.isConfigured() ? "smtp" : "console";
  }

  /**
   * Derruba a rota com `503` quando não há como entregar o e-mail.
   *
   * O padrão do R2/LiveKit é "sem credencial, 503". Aqui ele vale **só em
   * produção**: em dev o provedor `console` imprime o link no log, e é assim
   * que o fluxo inteiro (registrar → clicar → verificar) é testado sem
   * servidor de e-mail nenhum. Responder 503 em dev tornaria o recurso
   * impossível de exercitar nesta máquina.
   */
  exigirEntrega(): void {
    if (this.isConfigured()) return;
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException(
        "Envio de e-mail (SMTP) não configurado. Ver PENDENCIAS.md.",
      );
    }
  }

  /** Remetente configurado (ou um padrão legível). */
  private from(): string {
    return process.env.SMTP_FROM?.trim() || "Streamz <nao-responda@streamz.local>";
  }

  /**
   * Envia e **engole** a falha (só loga).
   *
   * É o certo quando o e-mail é efeito colateral de uma operação que já
   * aconteceu: no registro, a conta foi criada, e derrubar a resposta por causa
   * do SMTP faria o usuário achar que o cadastro falhou. Ele pede o reenvio
   * depois.
   *
   * Quando a entrega **é** a operação, use `enviarOuFalhar`.
   */
  async enviar(email: EmailParaEnviar): Promise<void> {
    try {
      await this.entregar(email);
    } catch (e) {
      this.logger.error(`Falha ao enviar e-mail para ${email.to}: ${(e as Error).message}`);
    }
  }

  /**
   * Envia e **propaga** a falha.
   *
   * Para a rota cuja única razão de existir é entregar a mensagem — o
   * "reenviar verificação" da tela de conta. Engolir ali faz a interface
   * mentir: aparece "e-mail enviado", nada chega, e a pessoa repete o clique
   * indefinidamente sem nunca saber que o provedor recusou. Foi exatamente o
   * que aconteceu aqui com o domínio do remetente não verificado na Resend: a
   * API logava `550 ... domain is not verified` e respondia `{ok:true}`.
   */
  async enviarOuFalhar(email: EmailParaEnviar): Promise<void> {
    try {
      await this.entregar(email);
    } catch (e) {
      this.logger.error(`Falha ao enviar e-mail para ${email.to}: ${(e as Error).message}`);
      throw new ServiceUnavailableException(
        "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.",
      );
    }
  }

  /** O envio de verdade, sem política de erro — quem chama decide. */
  private async entregar(email: EmailParaEnviar): Promise<void> {
    if (!this.isConfigured()) {
      // o link é a única coisa que importa em dev — vai destacado no log
      this.logger.log(
        [
          "",
          "┌── e-mail (provedor console; defina SMTP_URL para enviar de verdade)",
          `│ para: ${email.to}`,
          `│ assunto: ${email.subject}`,
          ...email.text.split("\n").map((l) => `│ ${l}`),
          "└──",
        ].join("\n"),
      );
      return;
    }
    const transporter = await this.getTransporter();
    await transporter.sendMail({ from: this.from(), ...email });
  }

  private async getTransporter(): Promise<Transporter> {
    if (!this.transporter) {
      const nodemailer = await import("nodemailer");
      this.transporter = nodemailer.createTransport(process.env.SMTP_URL as string);
    }
    return this.transporter;
  }

  /** Verificação de e-mail — o link expira em 24 h. */
  verificacao(to: string, nome: string, link: string): EmailParaEnviar {
    const subject = "Confirme seu e-mail no Streamz";
    const text =
      `Olá, ${nome}!\n\n` +
      "Confirme seu e-mail para liberar todos os recursos da sua conta:\n" +
      `${link}\n\n` +
      "O link vale por 24 horas. Se não foi você quem criou a conta, ignore este e-mail.";
    return { to, subject, text, html: comoHtml(subject, text, link, "Confirmar e-mail") };
  }

  /** Redefinição de senha — o link expira em 1 h. */
  redefinicao(to: string, nome: string, link: string): EmailParaEnviar {
    const subject = "Redefinir sua senha do Streamz";
    const text =
      `Olá, ${nome}!\n\n` +
      "Recebemos um pedido para redefinir sua senha:\n" +
      `${link}\n\n` +
      "O link vale por 1 hora e só pode ser usado uma vez. " +
      "Se não foi você, ignore este e-mail — sua senha continua a mesma.";
    return { to, subject, text, html: comoHtml(subject, text, link, "Redefinir senha") };
  }

  /** Aviso de senha alterada — não tem link, é só o alerta. */
  senhaAlterada(to: string, nome: string): EmailParaEnviar {
    const subject = "Sua senha do Streamz foi alterada";
    const text =
      `Olá, ${nome}!\n\n` +
      "A senha da sua conta acabou de ser alterada e as outras sessões foram encerradas.\n\n" +
      "Se não foi você, redefina a senha agora mesmo pela tela de login.";
    return { to, subject, text, html: comoHtml(subject, text, null, null) };
  }
}

/** HTML mínimo e sem imagens: passa em qualquer cliente e não vira spam. */
function comoHtml(
  titulo: string,
  texto: string,
  link: string | null,
  rotuloBotao: string | null,
): string {
  const corpo = texto
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const botao =
    link && rotuloBotao
      ? `<p style="margin:24px 0"><a href="${escaparHtml(link)}" style="background:#5865f2;border-radius:3px;color:#fff;display:inline-block;font-weight:500;padding:12px 20px;text-decoration:none">${escaparHtml(rotuloBotao)}</a></p>`
      : "";
  return (
    `<div style="background:#313338;color:#dbdee1;font-family:Helvetica,Arial,sans-serif;padding:24px">` +
    `<h1 style="color:#f2f3f5;font-size:20px;margin:0 0 16px">${escaparHtml(titulo)}</h1>` +
    `${corpo}${botao}</div>`
  );
}

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
