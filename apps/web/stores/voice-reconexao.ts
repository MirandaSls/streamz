import type { VoiceStateEvent } from "@streamz/shared";

/**
 * O estado de voz depois de o socket voltar.
 *
 * Durante a queda gente entrou e saiu das salas sem o cliente ver, então o
 * que havia na store não serve mais e é recarregado. O erro era **zerar antes
 * de ter a resposta** e só recarregar o servidor ativo: numa chamada de
 * conversa os outros participantes sumiam de `states`, o palco desmontava e a
 * sala ficava muda com a mídia conectada — e depois ninguém os trazia de
 * volta, porque o `voice.join` reemitido só difunde o **meu** estado.
 *
 * Aqui a troca é feita de uma vez, com as respostas na mão. Cada recarga
 * cobre um escopo (os canais de um servidor, ou uma sala só); o que a resposta
 * cobre é substituído, o que não foi pedido some, e o escopo cuja resposta
 * falhou fica como estava — melhor um participante velho na tela do que o
 * palco piscando vazio.
 */
export type Recarga =
  | { escopo: "servidor"; guildId: string; estados: VoiceStateEvent[] | null }
  | { escopo: "sala"; channelId: string; estados: VoiceStateEvent[] | null };

export function estadosAposReconexao(
  atual: Record<string, VoiceStateEvent[]>,
  recargas: readonly Recarga[],
): Record<string, VoiceStateEvent[]> {
  const proximo: Record<string, VoiceStateEvent[]> = {};
  for (const r of recargas) {
    if (r.estados === null) {
      // falhou: preserva o que já se sabia desse escopo
      for (const [channelId, lista] of Object.entries(atual)) {
        if (pertence(r, channelId, lista)) proximo[channelId] = lista;
      }
      continue;
    }
    // a resposta é a verdade do escopo, inclusive as salas que esvaziaram
    for (const [channelId, lista] of Object.entries(proximo)) {
      if (pertence(r, channelId, lista)) delete proximo[channelId];
    }
    for (const e of r.estados) (proximo[e.channelId] ??= []).push(e);
  }
  return proximo;
}

function pertence(r: Recarga, channelId: string, lista: VoiceStateEvent[]): boolean {
  return r.escopo === "sala" ? r.channelId === channelId : lista[0]?.guildId === r.guildId;
}
