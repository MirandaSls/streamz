/**
 * A hierarquia de cargos, do lado do bot — puro, sem rede.
 *
 * A regra é a do Streamz e é a mesma para gente e para bot
 * (`GuildsService.assertPodeMexerNoCargo`): **ninguém mexe num cargo igual ou
 * acima do seu**. O dono do servidor é a exceção, e um bot nunca é dono.
 *
 * Por que o bot confere isso **antes** de tentar: a API responde `50013
 * Missing Permissions`, que no discord.js vira um `DiscordAPIError` no meio de
 * um `catch`. Quem administra o servidor lê "Missing Permissions" e vai
 * procurar a caixinha que esqueceu de marcar — quando o problema é a **ordem**
 * dos cargos, que é outra tela. Conferir aqui é o que permite dizer a frase
 * certa: "arraste o meu cargo para cima do @Streamer".
 */

/** O que se sabe dos dois cargos na hora de decidir. */
export interface Hierarquia {
  /** `position` do cargo que se quer dar. */
  posicaoDoAlvo: number;
  /** `position` do cargo mais alto do bot; `null` se ele não tem cargo nenhum. */
  posicaoDoBot: number | null;
  /** O bot é dono do servidor? (Não acontece, mas a regra tem a exceção.) */
  botEhDono?: boolean;
}

/** O bot consegue dar/tirar este cargo? */
export function podeMexerNoCargo(h: Hierarquia): boolean {
  if (h.botEhDono) return true;
  if (h.posicaoDoBot === null) return false;
  // `>=` e não `>`: cargo na **mesma** posição também é recusado pela API.
  return h.posicaoDoAlvo < h.posicaoDoBot;
}

/**
 * A frase que o bot responde quando não consegue.
 *
 * Diz o que fazer, e não só o que deu errado — é a diferença entre um recado
 * útil e um "Missing Permissions".
 */
export function explicarHierarquia(nomeDoAlvo: string, nomeDoCargoDoBot: string | null): string {
  if (nomeDoCargoDoBot === null) {
    return (
      `Não consigo mexer no cargo **${nomeDoAlvo}**: eu não tenho cargo nenhum neste servidor. ` +
      "Peça a quem administra para me instalar com a permissão de gerenciar cargos."
    );
  }
  return (
    `Não consigo dar o cargo **${nomeDoAlvo}**: ele está **acima** (ou na mesma altura) do meu ` +
    `cargo mais alto, o **${nomeDoCargoDoBot}**. Nas configurações do servidor, arraste o meu ` +
    `cargo para cima de **${nomeDoAlvo}** e tente de novo.`
  );
}

/** A frase de quem esqueceu de dar `MANAGE_ROLES` ao bot. */
export const SEM_GERENCIAR_CARGOS =
  "Não tenho a permissão **Gerenciar cargos** neste servidor, então não consigo dar cargo a " +
  "ninguém. Reinstale-me pela tela “Adicionar ao servidor” marcando essa permissão.";
