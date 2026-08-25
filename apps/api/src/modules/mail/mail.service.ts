import { Injectable, Logger } from "@nestjs/common";
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
 * Falha de envio **não** derruba a operação que a originou: o registro já
 * aconteceu, e o usuário pode pedir o reenvio. O erro vai para o log.
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

  /** Remetente configurado (ou um padrão legível). */
  private from(): string {
    return process.env.SMTP_FROM?.trim() || "NewDisc <nao-responda@newdisc.local>";
  }

  async enviar(email: EmailParaEnviar): Promise<void> {
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

    try {
      const transporter = await this.getTransporter();
      await transporter.sendMail({ from: this.from(), ...email });
    } catch (e) {
      // não propaga: quem chamou já concluiu a operação de negócio
      this.logger.error(`Falha ao enviar e-mail para ${email.to}: ${(e as Error).message}`);
    }
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
    const subject = "Confirme seu e-mail no NewDisc";
    const text =
      `Olá, ${nome}!\n\n` +
      "Confirme seu e-mail para liberar todos os recursos da sua conta:\n" +
      `${link}\n\n` +
      "O link vale por 24 horas. Se não foi você quem criou a conta, ignore este e-mail.";
    return { to, subject, text, html: comoHtml(subject, text, link, "Confirmar e-mail") };
  }

  /** Redefinição de senha — o link expira em 1 h. */
  redefinicao(to: string, nome: string, link: string): EmailParaEnviar {
    const subject = "Redefinir sua senha do NewDisc";
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
    const subject = "Sua senha do NewDisc foi alterada";
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
