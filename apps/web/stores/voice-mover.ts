/**
 * Arrastar um participante de um canal de voz para outro — a parte pura.
 *
 * Duas decisões moram aqui porque as duas erram calado dentro do componente:
 *
 * - **Onde o realce pode acender** (`podeSoltarEm`). O alvo tem de ser canal de
 *   voz, tem de ser outro canal, e quem arrasta precisa da permissão. Um realce
 *   aceso sobre um canal de texto promete um movimento que a API vai recusar.
 * - **O que fazer com o `voice.moved` que chegou** (`decidirMovido`). O evento
 *   pode chegar atrasado: se eu já saí da voz, ou já estou no destino, refazer a
 *   conexão do LiveKit derrubaria uma sala boa por nada.
 *
 * Quem faz o efeito é `stores/voice.ts`; aqui não há `Room`, `fetch` nem som.
 */

/** O participante que está sendo arrastado e de onde ele saiu. */
export interface ArrastoDeMembro {
  userId: string;
  deChannelId: string;
}

/** O mínimo que se precisa saber do canal sob o cursor. */
export interface CanalAlvo {
  id: string;
  type: string;
}

/**
 * O canal sob o cursor aceita este participante?
 *
 * `podeMover` é `MOVE_MEMBERS` já calculada (a mesma conta da API). Sem ela a
 * função devolve `false` sempre — a UI de quem não pode mover não acende nada,
 * em vez de acender e tomar 403 no `drop`.
 */
export function podeSoltarEm(
  arrasto: ArrastoDeMembro | null,
  canal: CanalAlvo,
  podeMover: boolean,
): boolean {
  if (!arrasto || !podeMover) return false;
  if (canal.type !== "VOICE") return false;
  return canal.id !== arrasto.deChannelId;
}

/**
 * `voice.moved` chegou: troco de sala ou deixo como está?
 *
 * `"trocar"` só quando eu ainda estou exatamente no canal de onde o servidor
 * diz que me tirou. Fora disso o evento é notícia velha — sair da voz e voltar
 * mais rápido que o evento é raro, mas refazer a sala por cima de uma conexão
 * boa é uma queda de áudio de verdade.
 */
export function decidirMovido(
  evento: { channelId: string; deChannelId: string },
  meuCanalAtual: string | null,
): "trocar" | "ignorar" {
  if (!meuCanalAtual) return "ignorar";
  if (meuCanalAtual === evento.channelId) return "ignorar";
  if (meuCanalAtual !== evento.deChannelId) return "ignorar";
  return "trocar";
}
