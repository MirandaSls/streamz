/**
 * A conta da **vista do canal de voz** — o canal de voz na coluna sem que eu
 * esteja na chamada (ver `VistaDoCanalDeVoz`, que lista como se chega lá).
 *
 * Módulo à parte pelo mesmo motivo do `call-split-layout.ts`: são decisões de
 * texto e de estado, testáveis sem montar componente nenhum. Duas moram aqui:
 *
 * 1. **Quantas pessoas estão em voz**, em português que muda de número.
 * 2. **Se o painel de conversa está aberto**, canal a canal.
 *
 * Medido na print `docs/Reference/Captura de tela 2026-09-04 102429.png`
 * (1919×1079, 1:1 — a coluna de canais mede 294px na print e 294px aqui, ver
 * `ChannelSidebar`), servidor "Notas", canal de voz "Geral" aberto sem entrar.
 */

/**
 * O painel de conversa do canal de voz nasce **aberto**.
 *
 * Na print o canal acabou de ser aberto e a coluna da direita já está lá, com
 * o balão do cabeçalho aceso. Ele era `false` desde o #108, quando a conversa
 * do canal de voz ainda era uma novidade que interrompia o palco; agora o palco
 * vazio não tem o que interromper — o que a pessoa quer ver ao abrir um canal
 * de voz sem gente é justamente o que foi dito nele.
 */
export const CHAT_ABERTO_POR_PADRAO = true;

/**
 * O balão é lembrado **por canal**, não uma vez para o app inteiro.
 *
 * Fechar a conversa do canal de voz de um servidor não é um pedido sobre todos
 * os canais de voz que existem: dois canais têm dois usos (um é sala de estar,
 * outro é sala de reunião) e a pessoa arruma cada um do seu jeito. Canal
 * ausente do mapa = ninguém mexeu nele = `CHAT_ABERTO_POR_PADRAO`.
 */
export type ChatPorCanal = Record<string, boolean>;

/** O painel está aberto neste canal? */
export function chatDoCanalAberto(
  mapa: ChatPorCanal,
  channelId: string | null | undefined,
): boolean {
  if (!channelId) return CHAT_ABERTO_POR_PADRAO;
  return mapa[channelId] ?? CHAT_ABERTO_POR_PADRAO;
}

/** Grava a escolha da pessoa para um canal. Devolve um mapa novo. */
export function definirChatDoCanal(
  mapa: ChatPorCanal,
  channelId: string | null | undefined,
  aberto: boolean,
): ChatPorCanal {
  if (!channelId) return mapa;
  // já é o valor guardado: devolver o MESMO mapa evita re-render de quem só
  // observa esta fatia da store
  if (mapa[channelId] === aberto) return mapa;
  return { ...mapa, [channelId]: aberto };
}

/** Alterna o balão do canal, partindo do padrão quando ninguém mexeu nele. */
export function alternarChatDoCanal(
  mapa: ChatPorCanal,
  channelId: string | null | undefined,
): ChatPorCanal {
  if (!channelId) return mapa;
  return definirChatDoCanal(mapa, channelId, !chatDoCanalAberto(mapa, channelId));
}

/** Canal apagado: tirar do mapa evita guardar preferência de coisa que não existe. */
export function esquecerChatDoCanal(
  mapa: ChatPorCanal,
  channelId: string | null | undefined,
): ChatPorCanal {
  if (!channelId || !(channelId in mapa)) return mapa;
  const { [channelId]: _removido, ...resto } = mapa;
  return resto;
}

/**
 * Quantos avatares o palco vazio mostra antes de virar "+N".
 *
 * **Não medido**: a print do usuário é de um canal vazio, e não há print de
 * canal de voz cheio visto de fora. Oito é o que cabe em duas fileiras de
 * avatares de 80 na largura do palco desta print (1057px) sem apertar.
 */
export const LIMITE_DE_AVATARES = 8;

/** Quantas pessoas sobram além dos avatares desenhados. */
export function alemDosAvatares(total: number): number {
  return Math.max(0, total - LIMITE_DE_AVATARES);
}

/**
 * O subtítulo do palco vazio.
 *
 * "Ninguém está em voz" está medido na print, letra por letra. O plural e o
 * singular seguem a mesma frase — o Discord troca o número no mesmo lugar, e
 * "1 pessoas" seria o defeito clássico de concatenar contagem com texto.
 */
export function textoDePresenca(quantidade: number): string {
  if (!Number.isFinite(quantidade) || quantidade <= 0) return "Ninguém está em voz";
  const n = Math.floor(quantidade);
  return n === 1 ? "1 pessoa em voz" : `${n} pessoas em voz`;
}
