import type { VoiceStateEvent } from "@streamz/shared";

/** De quem é o silêncio que o ícone mostra: vermelho se do servidor, cinza se da própria pessoa. */
export type OrigemDoSilencio = "servidor" | "proprio";

export interface IconesDeSilencio {
  /** microfone cortado; `null` sem ícone. */
  microfone: OrigemDoSilencio | null;
  /** fone cortado; `null` sem ícone. */
  fone: OrigemDoSilencio | null;
}

/**
 * Quais ícones de silêncio vão à direita do nome de um participante na lista
 * de voz da barra lateral.
 *
 * O do **servidor** (imposto por um moderador) vence o da própria pessoa e
 * aparece sempre, em vermelho: é a informação que muda o que a sala pode
 * esperar dela. "Desativar áudio no servidor" também tira o microfone (a API
 * não lhe dá permissão de publicar, `voice.service.ts`), então a surdez de
 * servidor mostra os dois ícones vermelhos, e não só o fone.
 *
 * O da própria pessoa fica no ícone único de antes: com o fone cortado, o
 * microfone cortado ao lado repetiria a mesma notícia em cinza.
 */
export function iconesDeSilencio(
  e: Pick<VoiceStateEvent, "muted" | "deafened" | "serverMute" | "serverDeaf">,
): IconesDeSilencio {
  const fone: OrigemDoSilencio | null = e.serverDeaf ? "servidor" : e.deafened ? "proprio" : null;
  const microfone: OrigemDoSilencio | null =
    e.serverMute || e.serverDeaf ? "servidor" : e.muted && !fone ? "proprio" : null;
  return { microfone, fone };
}
