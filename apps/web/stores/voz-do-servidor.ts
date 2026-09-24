import type { VoiceStateEvent } from "@streamz/shared";

/**
 * Silêncio imposto pelo servidor ("silenciar/desativar áudio no servidor")
 * visto pelo lado de quem publica o microfone: as contas puras que
 * `stores/voice.ts` usa para decidir quando tirar a faixa da sala e quando
 * devolvê-la.
 *
 * Mora fora da store para ser testável sem `Room` nem zustand, e não reusa
 * `silencioDoServidorDe` (`hooks/useSilencioDoServidor.ts`) porque aquele
 * arquivo importa `useVoice` — importá-lo daqui para dentro da store fecharia
 * um ciclo de módulos.
 */

/**
 * `TrackSource.MICROPHONE` do `@livekit/protocol`. Número, e não o enum, para
 * este arquivo não puxar o protocolo inteiro: o valor é do fio (protobuf) e não
 * muda sem quebrar todos os clientes do LiveKit.
 */
export const FONTE_MICROFONE = 2;

/** O pedaço de `ParticipantPermission` do LiveKit que decide o microfone. */
export interface PermissaoDePublicacao {
  canPublish?: boolean;
  canPublishSources?: readonly number[];
}

/**
 * O LiveKit me deixa publicar o microfone **agora**?
 *
 * Sem permissão conhecida (sala ainda conectando) a resposta é sim: quem nega
 * de fato é o servidor, e travar por falta de notícia deixaria mudo quem nunca
 * foi silenciado. `canPublishSources` vazio quer dizer "todas as fontes" — é a
 * convenção do LiveKit, não ausência de fonte.
 */
export function podePublicarMicrofone(permissao: PermissaoDePublicacao | undefined): boolean {
  if (!permissao) return true;
  if (permissao.canPublish === false) return false;
  const fontes = permissao.canPublishSources ?? [];
  return fontes.length === 0 || fontes.includes(FONTE_MICROFONE);
}

/**
 * O microfone fica travado pelo servidor?
 *
 * `serverDeaf` entra junto de `serverMute` de propósito: no Discord, "desativar
 * áudio" de um membro o impede de ouvir **e** de falar (é o texto da própria
 * permissão "Ensurdecer membros"). Quem não ouve a sala e continua falando
 * nela é justamente o que o moderador quis cortar.
 *
 * A permissão do LiveKit soma à conta por dois motivos: o `voice.state` e o
 * `ParticipantPermissionsChanged` chegam por caminhos diferentes e em qualquer
 * ordem, e só se pode republicar depois de o LiveKit liberar a fonte — antes
 * disso o `publishTrack` é recusado e viraria toast de erro.
 */
export function microfoneTravado(
  silencio: { serverMute: boolean; serverDeaf: boolean },
  permissao: PermissaoDePublicacao | undefined,
): boolean {
  return silencio.serverMute || silencio.serverDeaf || !podePublicarMicrofone(permissao);
}

/** O meu silêncio de servidor no canal em que estou — ausente = não silenciado. */
export function meuSilencio(
  estados: readonly VoiceStateEvent[] | undefined,
  meuId: string | null | undefined,
): { serverMute: boolean; serverDeaf: boolean } {
  // pelo `userId`, não pela posição: a lista é reordenada a cada entrada/saída
  const meu = meuId ? estados?.find((e) => e.user.id === meuId) : undefined;
  return { serverMute: meu?.serverMute ?? false, serverDeaf: meu?.serverDeaf ?? false };
}

/**
 * O que fazer com o microfone ao reavaliar a trava.
 *
 * Só as **transições** agem: o `voice.state` é reemitido a cada mudo, vídeo ou
 * entrada de alguém, e fechar/reabrir a faixa a cada um deles seria um
 * "entrou/saiu" de microfone para a sala inteira.
 */
export function transicaoDaTrava(antes: boolean, agora: boolean): "fechar" | "reabrir" | null {
  if (antes === agora) return null;
  return agora ? "fechar" : "reabrir";
}
