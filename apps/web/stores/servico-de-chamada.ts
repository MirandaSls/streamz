import type { VoiceStatus } from "./voice";

/**
 * A decisão "o serviço de primeiro plano do Android deve estar ligado agora?".
 *
 * Por que ela mora aqui, pura, e não dentro da store: é a mesma disciplina de
 * `voice-saida.ts` e `voice-retomada.ts`. A store tem `set`, `get`, um `Room` do
 * LiveKit e um webview do Tauri por perto; nada disso cabe num teste de
 * `environment: "node"`. O que cabe é uma função que recebe um objeto simples e
 * devolve o que fazer — e é ela que carrega as regras que valem a pena travar.
 *
 * O que este módulo **não** faz: falar com o Tauri. Quem chama `invoke` é
 * `lib/desktop.ts`; aqui só se decide.
 */

/** O recorte da store de voz que a decisão precisa. */
export interface SituacaoDeVoz {
  /**
   * `true` só no app Android. É a única plataforma com serviço de primeiro
   * plano: no Windows quem segura a call com a janela escondida é a bandeja, no
   * iOS é o `UIBackgroundModes: audio`, e no navegador não há o que segurar.
   */
  ehAndroid: boolean;
  status: VoiceStatus;
  channelId: string | null;
  guildId: string | null;
  channelName: string;
}

export type AcaoDoServicoDeChamada =
  | { acao: "iniciar"; titulo: string; texto: string }
  | { acao: "parar" }
  | { acao: "nada" };

/**
 * O texto da notificação persistente.
 *
 * O nome do canal só existe em call de servidor; DM e grupo entram com
 * `channelName: ""` (a store não guarda o título da conversa, que a barra de
 * voz resolve olhando a lista de DMs). Em vez de arrastar a lista inteira para
 * cá, a notificação de DM fica sem o "em #canal" — dizer "em #" seria pior do
 * que não dizer.
 */
export function textoDaChamada(situacao: Pick<SituacaoDeVoz, "guildId" | "channelName">): {
  titulo: string;
  texto: string;
} {
  const canal = situacao.guildId ? situacao.channelName || "voz" : "";
  return {
    titulo: canal ? `Streamz — em chamada em #${canal}` : "Streamz — em chamada",
    texto: "Toque para voltar à chamada",
  };
}

/**
 * O que fazer agora, olhando só para o estado atual — a função é idempotente de
 * propósito, para poder ser chamada a cada mudança da store sem guardar
 * histórico. Quem evita repetir a mesma ordem é o chamador — a assinatura de
 * `useVoice` no fim de `stores/voice.ts`, que compara `chaveDaAcao`.
 *
 * As três regras, e o porquê de cada uma:
 *
 * 1. **Fora do Android, nada.** Nem `parar`: mandar parar um serviço que não
 *    existe seria uma chamada de IPC por mudança de estado da voz, no desktop e
 *    no navegador, para nada.
 * 2. **Sem `channelId`, parar.** `channelId: null` é o único sinal de "saí da
 *    sala" — `sairDaSalaAtual` é por onde passam os sete motivos de saída
 *    (`voice-saida.ts`), e todos zeram este campo.
 * 3. **`connected` liga; o resto, nada.** `connecting` ainda não segurou
 *    microfone nenhum, e ligar ali daria uma notificação antes da call. E
 *    `error` **não desliga**: a queda de mídia (`RoomEvent.Disconnected`) deixa
 *    `channelId` de pé, com a barra de "tentar de novo" na tela e o
 *    `reconnect()` a caminho; derrubar o serviço ali faria a notificação piscar
 *    a cada reconexão — e, pior, entregaria o processo ao sistema justamente no
 *    momento em que ele precisa de fôlego para voltar.
 */
export function decidirServicoDeChamada(situacao: SituacaoDeVoz): AcaoDoServicoDeChamada {
  if (!situacao.ehAndroid) return { acao: "nada" };
  if (!situacao.channelId) return { acao: "parar" };
  if (situacao.status !== "connected") return { acao: "nada" };
  return { acao: "iniciar", ...textoDaChamada(situacao) };
}

/**
 * A chave que diz se duas decisões são a mesma ordem. Serve para o chamador não
 * repetir `iniciar` a cada re-render — mas **repetir quando o texto muda**, que
 * é o caso de ser movido de canal sem sair da chamada.
 */
export function chaveDaAcao(acao: AcaoDoServicoDeChamada): string {
  return acao.acao === "iniciar" ? `iniciar|${acao.titulo}|${acao.texto}` : acao.acao;
}
