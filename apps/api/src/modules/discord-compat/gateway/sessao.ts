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
 * O mínimo do `WebSocket` do `ws` que a sessão usa.
 *
 * Estrutural, e não `import type { WebSocket } from "ws"`, pelo mesmo motivo do
 * `RespostaHttp` em `../erros.ts`: um teste passa um objeto de três métodos e
 * inspeciona o que foi escrito, sem subir servidor nenhum.
 */
export interface SoqueteDeSaida {
  /** `WebSocket.OPEN` é 1 — ver `ABERTO` abaixo. */
  readonly readyState: number;
  send(dado: string): void;
  close(codigo?: number, razao?: string): void;
}

/** `WebSocket.OPEN`. Só escrevemos no socket neste estado. */
export const ABERTO = 1;

/**
 * Quantos dispatches a sessão guarda para o replay do RESUME (§7: "últimos
 * ~500"). É um teto de memória, não de correção: quem pedir um `seq` mais
 * antigo que o buffer leva `INVALID_SESSION` e reidentifica.
 */
export const TETO_DO_BUFFER = 500;

/**
 * Quanto tempo uma sessão sem socket ainda aceita RESUME (§7: 3 min).
 *
 * Neste intervalo ela continua no registro e continua **recebendo** dispatches:
 * eles vão para o buffer e saem no replay. É o que o Discord faz, e é o que
 * torna o RESUME útil — sem isso o bot volta com um buraco na história.
 */
export const TTL_DA_SESSAO_MS = 3 * 60_000;

/** Quadro de saída no formato do gateway (`op`, `d`, `s`, `t` sempre presentes). */
function quadro(op: number, d: unknown, s: number | null, t: string | null): string {
  return JSON.stringify({ op, d, s, t });
}

/** Um dispatch já serializado, esperando o replay. */
interface QuadroGuardado {
  s: number;
  texto: string;
}

/** O que a sessão precisa saber de si mesma no momento em que nasce. */
export interface DadosDaSessao {
  id: string;
  botUserId: string;
  applicationId: string;
  intents: number;
  /** chamado quando a sessão morre de vez (TTL vencido ou `fechar`). */
  aoEncerrar?: (sessao: SessaoWs) => void;
}

/**
 * A sessão de verdade: um socket, um contador de sequência e um buffer de
 * replay.
 *
 * O socket é **trocável**: no RESUME a mesma sessão passa a atender por outra
 * conexão, mantendo `id`, `s` e buffer. É justamente isso que o RESUME é.
 */
export class SessaoWs implements SessaoDoBot {
  readonly id: string;
  readonly botUserId: string;
  readonly applicationId: string;
  readonly intents: number;

  private soquete: SoqueteDeSaida | null = null;
  private sequencia = 0;
  private readonly buffer: QuadroGuardado[] = [];
  private encerrada = false;
  private relogioDeExpiracao: ReturnType<typeof setTimeout> | null = null;
  private readonly aoEncerrar?: (sessao: SessaoWs) => void;

  constructor(dados: DadosDaSessao) {
    this.id = dados.id;
    this.botUserId = dados.botUserId;
    this.applicationId = dados.applicationId;
    this.intents = dados.intents;
    this.aoEncerrar = dados.aoEncerrar;
  }

  /** O `s` do último dispatch. É o que o RESUME compara. */
  get sequenciaAtual(): number {
    return this.sequencia;
  }

  /** Tem socket vivo agora? (falso durante a janela de RESUME.) */
  get ligada(): boolean {
    return !this.encerrada && this.soquete !== null && this.soquete.readyState === ABERTO;
  }

  get morta(): boolean {
    return this.encerrada;
  }

  despachar(evento: string, dados: unknown): void {
    if (this.encerrada) return;

    // Serializa **antes** de incrementar: um `bigint` no payload lança
    // `TypeError` aqui (o que é o certo — ver a regra 6 do CONTRATO-F1), e a
    // sequência não pode ficar com um buraco por causa disso.
    const proximo = this.sequencia + 1;
    const texto = quadro(0, dados, proximo, evento);

    this.sequencia = proximo;
    this.buffer.push({ s: proximo, texto });
    if (this.buffer.length > TETO_DO_BUFFER) this.buffer.shift();

    this.escrever(texto);
  }

  fechar(codigo: number, razao: string): void {
    const soquete = this.soquete;
    this.encerrar();
    if (!soquete) return;
    try {
      // A razão viaja no quadro de close e o protocolo limita o quadro inteiro
      // a 125 bytes; cortamos para não estourar e virar um close sem motivo.
      soquete.close(codigo, razao.slice(0, 110));
    } catch {
      // socket já em pedaços: não há o que fazer, e não é erro nosso.
    }
  }

  /** Escreve um quadro cru (op != 0). Sessão sem socket ignora em silêncio. */
  enviar(texto: string): void {
    this.escrever(texto);
  }

  /** Passa a atender por este socket — no IDENTIFY e de novo no RESUME. */
  atender(soquete: SoqueteDeSaida): void {
    if (this.encerrada) return;
    this.soquete = soquete;
    if (this.relogioDeExpiracao) {
      clearTimeout(this.relogioDeExpiracao);
      this.relogioDeExpiracao = null;
    }
  }

  /**
   * O socket caiu sem `fechar`: a sessão fica de pé, sem socket, até o TTL.
   *
   * `unref()` para o relógio não segurar o processo no ar — um bot que
   * desconectou não pode atrasar o `SIGTERM` em três minutos.
   */
  desatar(): void {
    if (this.encerrada) return;
    this.soquete = null;
    if (this.relogioDeExpiracao) return;
    this.relogioDeExpiracao = setTimeout(() => this.encerrar(), TTL_DA_SESSAO_MS);
    this.relogioDeExpiracao.unref?.();
  }

  /**
   * O buffer ainda cobre tudo que veio depois de `desde`?
   *
   * Falso quando o bot ficou fora tempo demais e o começo do buraco já saiu do
   * buffer — aí a resposta certa é `INVALID_SESSION` e reidentificar, não um
   * replay com furo no meio.
   */
  podeReproduzir(desde: number): boolean {
    if (this.encerrada) return false;
    if (desde > this.sequencia) return false; // `seq` do futuro: não é nossa sessão
    if (desde === this.sequencia) return true; // nada a repor
    const primeiro = this.buffer[0];
    return primeiro !== undefined && primeiro.s <= desde + 1;
  }

  /** Reescreve no socket tudo que tem `s > desde`. */
  reproduzir(desde: number): number {
    let repostos = 0;
    for (const guardado of this.buffer) {
      if (guardado.s <= desde) continue;
      this.escrever(guardado.texto);
      repostos += 1;
    }
    return repostos;
  }

  private escrever(texto: string): void {
    const soquete = this.soquete;
    if (!soquete || soquete.readyState !== ABERTO) return;
    try {
      soquete.send(texto);
    } catch {
      // O fan-out do lote D não pode quebrar por causa de um socket que caiu
      // entre o `readyState` e o `send`.
    }
  }

  private encerrar(): void {
    if (this.encerrada) return;
    this.encerrada = true;
    this.soquete = null;
    if (this.relogioDeExpiracao) {
      clearTimeout(this.relogioDeExpiracao);
      this.relogioDeExpiracao = null;
    }
    this.buffer.length = 0;
    this.aoEncerrar?.(this);
  }
}

/**
 * Onde as sessões vivas moram.
 *
 * Em memória e **por instância**, como o resto do tempo real de hoje. A
 * ressalva de multi-instância está registrada como dívida no §7: enquanto a API
 * roda num contêiner só, não morde.
 *
 * Uma sessão desconectada mas ainda dentro do TTL **continua aqui** e continua
 * saindo em `todas()`: é ela que acumula no buffer o que o bot vai receber no
 * replay. Quem despacha não precisa saber a diferença — `despachar` de uma
 * sessão sem socket só enche o buffer.
 */
@Injectable()
export class RegistroDeSessoes {
  private readonly sessoes = new Map<string, SessaoDoBot>();

  registrar(sessao: SessaoDoBot): void {
    this.sessoes.set(sessao.id, sessao);
  }

  remover(sessionId: string): void {
    this.sessoes.delete(sessionId);
  }

  /** Todas as sessões vivas. É por onde o `dispatch.ts` faz o fan-out. */
  todas(): SessaoDoBot[] {
    return [...this.sessoes.values()];
  }

  /** As sessões de um usuário-bot (um bot pode estar conectado mais de uma vez). */
  porBot(botUserId: string): SessaoDoBot[] {
    return this.todas().filter((s) => s.botUserId === botUserId);
  }

  /** Uma sessão pelo `session_id` — o caminho do RESUME. */
  porId(sessionId: string): SessaoDoBot | null {
    return this.sessoes.get(sessionId) ?? null;
  }
}
