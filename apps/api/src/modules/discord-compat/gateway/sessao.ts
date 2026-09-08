import { Injectable } from "@nestjs/common";

/**
 * Uma sessão de bot ligada ao gateway compat, e o registro de todas elas.
 *
 * ── Lote B (gateway compat) implementa. ──
 * O lote D (`dispatch.ts`) só **consome** o registro; as assinaturas abaixo são
 * contrato e não mudam.
 */

/** Uma conexão autenticada (pós-IDENTIFY). */
export interface SessaoDoBot {
  /** o `session_id` do READY; é o que o RESUME apresenta de volta. */
  readonly id: string;
  /** cuid do `User` do bot — é por ele que o dispatch decide quem vê o quê. */
  readonly botUserId: string;
  /** cuid da `Application`. */
  readonly applicationId: string;
  /** bitfield de intents pedido no IDENTIFY (ver `INTENT` em `../tipos`). */
  readonly intents: number;

  /**
   * Manda um `op 0` (Dispatch): incrementa o `s`, guarda no buffer de replay e
   * escreve no socket. Sessão já fechada ignora em silêncio — quem chama é o
   * fan-out, e ele não pode quebrar por causa de um socket que caiu.
   */
  despachar(evento: string, dados: unknown): void;

  /** Fecha com um close code (ver `FECHAMENTO` em `../tipos`). */
  fechar(codigo: number, razao: string): void;
}

/**
 * Onde as sessões vivas moram.
 *
 * Em memória e **por instância**, como o resto do tempo real de hoje. A
 * ressalva de multi-instância está registrada como dívida no §7: enquanto a API
 * roda num contêiner só, não morde.
 */
@Injectable()
export class RegistroDeSessoes {
  registrar(_sessao: SessaoDoBot): void {
    throw new Error("F1 lote B: RegistroDeSessoes.registrar não implementado");
  }

  remover(_sessionId: string): void {
    throw new Error("F1 lote B: RegistroDeSessoes.remover não implementado");
  }

  /** Todas as sessões vivas. É por onde o `dispatch.ts` faz o fan-out. */
  todas(): SessaoDoBot[] {
    throw new Error("F1 lote B: RegistroDeSessoes.todas não implementado");
  }

  /** As sessões de um usuário-bot (um bot pode estar conectado mais de uma vez). */
  porBot(_botUserId: string): SessaoDoBot[] {
    throw new Error("F1 lote B: RegistroDeSessoes.porBot não implementado");
  }

  /** Uma sessão pelo `session_id` — o caminho do RESUME. */
  porId(_sessionId: string): SessaoDoBot | null {
    throw new Error("F1 lote B: RegistroDeSessoes.porId não implementado");
  }
}
