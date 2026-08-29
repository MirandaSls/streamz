/**
 * Quem é administrador da instância, como conta pura.
 *
 * Separado do service pelo mesmo motivo de `moderation/timeout.ts`: a regra é
 * uma decisão de segurança que merece teste direto, sem Nest, sem Prisma e sem
 * `process.env`. O service (`platform-admin.service.ts`) só lê o ambiente e o
 * banco e entrega os dados prontos para estas duas funções.
 */

/** Lê a variável `PLATFORM_ADMIN_EMAILS`: minúsculas, sem espaço, sem vazios. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Dados da conta que a decisão precisa — nada além disto. */
export interface ContaParaAdmin {
  email: string | null;
  emailVerificado: boolean;
  desativada: boolean;
  excluida: boolean;
}

/**
 * A decisão inteira, em um lugar só.
 *
 * O e-mail **verificado** não é zelo extra: excluir uma conta libera o endereço
 * (`AccountService.excluir` grava `email: null`), então sem essa condição
 * bastaria registrar uma conta nova com o e-mail do admin para herdar o painel.
 */
export function ehAdminDaInstancia(lista: string[], conta: ContaParaAdmin | null): boolean {
  if (!conta || lista.length === 0) return false;
  if (conta.excluida || conta.desativada) return false;
  if (!conta.email || !conta.emailVerificado) return false;
  return lista.includes(conta.email.toLowerCase());
}

/** Dados do destinatário que a decisão de escrever precisa — nada além disto. */
export interface AlvoDeMensagem {
  id: string;
  excluida: boolean;
}

/** O que impede o painel de escrever para uma conta; `null` quando nada impede. */
export type ImpedimentoDeMensagem = "inexistente" | "si-mesmo" | "excluida";

/**
 * Para quem o painel **não** pode escrever.
 *
 * Conta desativada não entra na lista de propósito: ela volta a existir quando
 * o dono entra de novo, e a mensagem estará lá esperando — que é justamente o
 * caso de "avisar alguém que sumiu". Excluída é diferente: está anonimizada e
 * sem e-mail, não há ninguém do outro lado para ler.
 */
export function impedimentoParaMensagem(
  adminId: string,
  alvo: AlvoDeMensagem | null,
): ImpedimentoDeMensagem | null {
  if (!alvo) return "inexistente";
  if (alvo.id === adminId) return "si-mesmo";
  if (alvo.excluida) return "excluida";
  return null;
}
