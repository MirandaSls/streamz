/**
 * Abrir um canal de voz **entra na chamada?** Depende de quem abriu.
 *
 * É o par do `voice-saida.ts`: lá está o que sair de uma sala faz conforme o
 * motivo; aqui, o que abrir um canal faz conforme a origem. Os dois existem
 * pelo mesmo motivo — a decisão estava espalhada por componentes (um
 * `useEffect` de montagem no `VoicePanel`) e por isso ninguém conseguia dizer,
 * lendo, o que cada caminho fazia.
 *
 * O histórico, curto e caro:
 *
 * - Até o #130 o `VoicePanel` chamava `connect` **ao montar**. Clicar no canal
 *   entrava — certo —, mas *qualquer* coisa que montasse o painel também
 *   entrava: um link da caixa de entrada, a busca rápida, o histórico das
 *   setas, o F5.
 * - O #131 tirou o efeito inteiro e pôs a `VistaDoCanalDeVoz` no lugar. Aí
 *   clicar no canal deixou de entrar — e é o defeito que o usuário relatou na
 *   0.0.22: "ao clicar na call não está entrando; antes entrava".
 *
 * As duas versões erravam pela mesma razão: montar um painel não é uma
 * intenção, é uma consequência. A intenção está na **origem** do clique, e é
 * ela que viaja até a store (`useChannels.select(canal, origem)`).
 */

/** De onde veio a abertura do canal. */
export type OrigemDaAbertura =
  /**
   * Clique na linha do canal, na coluna de canais. **A única que entra.** É o
   * que o Discord faz: o canal de voz não é uma tela para visitar, é a sala.
   *
   * Entrar não é sempre trocar a coluna 3: se ela estiver num chat de texto,
   * o clique entra na call e deixa o chat na tela — ver `deveTrocarATela`.
   */
  | "clique"
  /**
   * Balão de conversa da mesma linha (e o menu de contexto, se um dia ganhar
   * "Ver canal"): abre a conversa do canal com a vista ao lado, sem entrar.
   * Quem clica no balão pediu para **ler**, não para abrir o microfone.
   */
  | "balao"
  /**
   * Link, busca rápida, histórico das setas, canal recém-criado, "voltar para
   * a call". Navegar até um lugar não é decidir entrar nele — era exatamente
   * isso que o efeito de montagem fazia sem perguntar.
   */
  | "navegacao"
  /**
   * Boot depois do F5. Quem refaz (ou não) a conexão é a
   * `retomarSeReconectando`, com a regra dela em `voice-retomada.ts`; aqui o
   * `select` só põe o canal na tela e não pode entrar por conta própria.
   */
  | "retomada";

/**
 * Padrão de quem não diz de onde veio: **não entra**.
 *
 * A escolha é deliberada. Entrar abre o microfone para outras pessoas, e um
 * call site novo que esqueceu de declarar a origem deve errar para o lado de
 * não fazer barulho — não para o lado de conectar sozinho.
 */
export const ORIGEM_PADRAO: OrigemDaAbertura = "navegacao";

export interface AberturaDeCanal {
  origem: OrigemDaAbertura;
  /** canal de texto não tem sala: a pergunta só existe para o de voz. */
  ehCanalDeVoz: boolean;
  /** já estou conectado (ou conectando) **neste** canal. */
  jaConectadoAqui: boolean;
}

/**
 * Entrar na chamada ao abrir o canal?
 *
 * `jaConectadoAqui` é a idempotência do #122, escrita aqui em vez de só dentro
 * do `connect`: clicar de novo no canal em que já se está não pode refazer a
 * sala — o LiveKit não aceita duas conexões com a mesma identidade e derrubaria
 * a primeira, que era a "queda de alguns segundos" que também levava a tela
 * compartilhada junto. O `connect` mantém a guarda dele; esta é a mesma regra
 * num lugar que se lê e se testa.
 */
export function deveEntrarNaChamada({
  origem,
  ehCanalDeVoz,
  jaConectadoAqui,
}: AberturaDeCanal): boolean {
  if (!ehCanalDeVoz || jaConectadoAqui) return false;
  return origem === "clique";
}

export interface CliqueNoCanal extends AberturaDeCanal {
  /** a coluna 3 mostra agora a conversa de um canal de texto (não um palco nem a vista de um canal de voz). */
  chatDeTextoNaTela: boolean;
}

/**
 * Abrir o canal também troca o que a coluna 3 mostra?
 *
 * Pedido do dono do produto: entrar numa call não é pedir para largar a
 * leitura. Se a pessoa está lendo um chat de texto e clica num canal de voz,
 * ela entra na chamada (`deveEntrarNaChamada`) mas continua vendo o chat —
 * o palco (a grade da call) não aparece sozinho. Só quando ela clica de
 * novo no canal em que já está — `jaConectadoAqui` true, `deveEntrarNaChamada`
 * vira false — é que o clique deixa de ser "entrar" e vira o pedido explícito
 * de ver o palco, e aí a tela troca.
 *
 * Fora desse caso (a coluna já mostra um palco, a vista de outro canal de
 * voz, ou é canal de texto) nada muda: o comportamento de hoje continua,
 * abre o canal clicado.
 */
export function deveTrocarATela(clique: CliqueNoCanal): boolean {
  if (deveEntrarNaChamada(clique) && clique.chatDeTextoNaTela) return false;
  return true;
}
