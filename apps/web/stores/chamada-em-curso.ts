import type { CallPhase } from "@/stores/call-machine";

/**
 * "Já estou nesta chamada?" — a pergunta que o botão de ligar e a store fazem.
 *
 * Existe porque a resposta estava em lugar nenhum e o resultado era um clique
 * duplo no telefone virar duas chamadas: `startCall` refazia tudo (nova
 * `Room` do LiveKit com a **mesma identidade**, que o servidor de mídia
 * derruba de propósito), e o que o usuário via era entrar, cair e voltar —
 * levando junto a transmissão de tela, que morre com a sala.
 *
 * A decisão é pura e mora fora da store por dois motivos:
 *
 * 1. a UI e a store precisam da **mesma** resposta — o botão cinza e o clique
 *    ignorado não podem discordar, senão volta a existir um clique que parece
 *    proibido e mesmo assim age;
 * 2. é onde cada corrida ganha um teste sem browser (`chamada-em-curso.test.ts`).
 *
 * Duas fontes dizem se a chamada é minha e está de pé, e as duas importam:
 *
 * - **a conexão** (`channelId` + `status`): entrar num canal de voz e entrar
 *   numa chamada de conversa são o mesmo caminho de mídia;
 * - **a máquina da chamada** (`fase` + `canalDaChamada`): entre o clique e o
 *   `POST /dms/:id/call` a fase já é `outgoing`, e é justamente essa janela de
 *   milissegundos que o segundo clique aproveitava.
 *
 * `error` fica **de fora**: uma chamada que falhou tem de poder ser tentada de
 * novo — é o botão "tentar de novo" da faixa vermelha.
 */

/** Estado de voz reduzido ao que decide "já estou nesta chamada". */
export interface ConexaoDeChamada {
  /** canal em que estou (ou entrando) — de conversa ou de servidor. */
  channelId: string | null;
  status: "idle" | "connecting" | "connected" | "error";
  fase: CallPhase;
  /** canal da chamada que a máquina está seguindo. */
  canalDaChamada: string | null;
}

/**
 * A chamada desta conversa já é minha e está em curso (saindo ou de pé)?
 *
 * É a guarda de `startCall`/`acceptCall`/`connect`: um segundo pedido para o
 * mesmo canal não faz nada.
 */
export function jaNaChamada(estado: ConexaoDeChamada, channelId: string): boolean {
  const conectando =
    estado.channelId === channelId &&
    (estado.status === "connecting" || estado.status === "connected");
  const chamando =
    estado.canalDaChamada === channelId &&
    (estado.fase === "outgoing" || estado.fase === "active");
  return conectando || chamando;
}

/**
 * O botão de ligar/vídeo desta conversa fica cinza?
 *
 * Tudo o que `jaNaChamada` cobre, mais o telefone **tocando para mim** nesta
 * conversa: com o cartão de "atender/recusar" na tela, ligar de volta para
 * quem já está te ligando só criaria uma segunda chamada no mesmo canal.
 */
export function botaoDeChamadaBloqueado(estado: ConexaoDeChamada, channelId: string): boolean {
  if (jaNaChamada(estado, channelId)) return true;
  return estado.canalDaChamada === channelId && estado.fase === "incoming";
}

/** Tooltip do botão cinza — uma frase só, igual nos dois botões. */
export const CHAMADA_EM_ANDAMENTO = "Chamada em andamento";
