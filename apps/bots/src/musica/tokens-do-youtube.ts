/**
 * Rodízio de contas do YouTube — o mesmo esquema do Vocard
 * (`voicelink/ratelimit.py`, estratégia `LoadBalance`).
 *
 * O YouTube recusa tocar para IP de datacenter ("This video requires login",
 * "Sign in to confirm you're not a bot"): sem uma conta logada, a busca
 * funciona e o áudio não sai. O plugin do Lavalink aceita um *refresh token*
 * OAuth de uma conta Google (`POST /youtube`), e o bot guarda uma lista deles:
 *
 * - troca de conta a cada `maxPedidos` faixas, para nenhuma concentrar o uso;
 * - quando o YouTube barra a conta ativa, ela fica de molho por `molhoMs` e a
 *   próxima livre assume.
 *
 * Aqui só a contabilidade, sem rede: quem manda o token ao Lavalink é o
 * `servico.ts`. Os tokens vêm de `YOUTUBE_REFRESH_TOKENS` (um por linha ou
 * separados por vírgula) e são gerados com `scripts/gerar-token-do-youtube.sh`.
 * **Contas descartáveis**: o próprio plugin avisa que a conta pode ser banida.
 */

export interface OpcoesDoRodizio {
  /** Faixas por conta antes de trocar. Vocard: 30. */
  maxPedidos?: number;
  /** Quanto tempo uma conta barrada fica fora. Vocard: 3 h. */
  molhoMs?: number;
  agora?: () => number;
}

interface Conta {
  token: string;
  pedidos: number;
  barradaAte: number;
}

export class RodizioDeTokens {
  private readonly contas: Conta[];
  private indiceAtivo: number;
  private readonly maxPedidos: number;
  private readonly molhoMs: number;
  private readonly agora: () => number;

  constructor(tokens: string[], opcoes: OpcoesDoRodizio = {}) {
    this.contas = [...new Set(tokens)].map((token) => ({ token, pedidos: 0, barradaAte: 0 }));
    this.indiceAtivo = this.contas.length ? 0 : -1;
    this.maxPedidos = opcoes.maxPedidos ?? 30;
    this.molhoMs = opcoes.molhoMs ?? 3 * 60 * 60 * 1000;
    this.agora = opcoes.agora ?? Date.now;
  }

  get quantidade(): number {
    return this.contas.length;
  }

  /** O token que o Lavalink deveria estar usando agora (ou `null` sem contas). */
  get ativo(): string | null {
    return this.indiceAtivo >= 0 ? this.contas[this.indiceAtivo]!.token : null;
  }

  /**
   * Conta uma faixa na conta ativa. Devolve o token novo quando é hora de
   * trocar (e há para quem trocar); `null` quando fica tudo como está.
   */
  registrarFaixa(): string | null {
    if (this.indiceAtivo < 0) return null;
    const conta = this.contas[this.indiceAtivo]!;
    conta.pedidos += 1;
    if (conta.pedidos < this.maxPedidos) return null;
    conta.pedidos = 0;
    return this.trocar();
  }

  /**
   * O YouTube barrou a conta ativa. Ela sai por `molhoMs`; devolve o token da
   * próxima livre, ou `null` se não sobrou nenhuma.
   */
  barrarAtiva(): string | null {
    if (this.indiceAtivo < 0) return null;
    this.contas[this.indiceAtivo]!.barradaAte = this.agora() + this.molhoMs;
    return this.trocar();
  }

  private trocar(): string | null {
    const agora = this.agora();
    for (let passo = 1; passo < this.contas.length; passo++) {
      const indice = (this.indiceAtivo + passo) % this.contas.length;
      if (this.contas[indice]!.barradaAte <= agora) {
        this.indiceAtivo = indice;
        return this.contas[indice]!.token;
      }
    }
    return null;
  }
}

/** Lê `YOUTUBE_REFRESH_TOKENS`: vírgula, espaço ou quebra de linha separam. */
export function tokensDoAmbiente(valor = process.env.YOUTUBE_REFRESH_TOKENS): string[] {
  return (valor ?? "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * A falha é o YouTube recusando a conta/IP (e não uma faixa quebrada)?
 *
 * As frases são as que o `youtube-plugin` 1.18.2 devolve no `TrackExceptionEvent`;
 * "This content isn’t available." é a que o Vocard usa para barrar a conta.
 */
export function ehBloqueioDoYoutube(mensagem: string | undefined | null): boolean {
  if (!mensagem) return false;
  return /requires login|confirm you.re not a bot|content isn.t available|All clients failed/i.test(
    mensagem,
  );
}
