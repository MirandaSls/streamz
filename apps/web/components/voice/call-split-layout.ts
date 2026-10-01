/**
 * A conta da divisão entre palco e conversa (ver `CallSplit`).
 *
 * Módulo à parte pelo mesmo motivo do `grid-layout.ts`: é aritmética pura sobre
 * a área disponível, testável sem montar componente nenhum.
 *
 * **São duas divisões, e a escolha é do contexto — não do gosto.** O Discord
 * usa leiautes diferentes para os dois lugares onde voz e texto dividem a mesma
 * coluna, e o PR #108 apagou essa diferença ao mandar tudo para o painel da
 * direita:
 *
 * - **Conversa direta (DM e grupo): faixa em cima.** O palco é uma tira no topo
 *   e a conversa continua embaixo, na largura toda, com o composer no lugar de
 *   sempre. É o que os prints de chamada em DM mostram (ver `PROPORCAO_PADRAO`).
 *   Faz sentido: numa DM o que se olha é a conversa, e a chamada é um adereço
 *   dela — espremer a timeline numa coluna de 450 refluiria todo anexo.
 * - **Canal de voz de servidor: coluna à direita.** Ali o palco é a tela, e a
 *   conversa é que é o adereço (ver `PainelDeChatDaCall`, medido na print
 *   `2026-09-03 203909`).
 */

/** Onde a conversa fica em relação ao palco. */
export type OrientacaoDaChamada = "vertical" | "horizontal";

/**
 * Qual das duas divisões vale para esta chamada.
 *
 * A pergunta é só uma — **é canal de servidor?** —, e é por isso que ela mora
 * numa função em vez de num `?:` dentro do JSX: o erro do #108 foi justamente
 * não haver lugar onde essa decisão estivesse escrita e pudesse ser testada.
 */
export function orientacaoDaChamada(guildId: string | null | undefined): OrientacaoDaChamada {
  return guildId ? "horizontal" : "vertical";
}

// ── divisão vertical (conversa direta): faixa em cima, conversa embaixo ──────

/** Piso da conversa: sem ele o palco esmagaria o composer contra a timeline. */
export const RESERVA_CHAT_MIN = 180;
/** Fatia da coluna reservada à conversa quando há altura de sobra. */
export const RESERVA_CHAT_PROPORCAO = 0.28;
/**
 * Piso da faixa do palco, em **pixel**: 199px.
 *
 * A medida vem de **quatro** prints de chamada em DM, em janelas pequenas:
 * `2026-08-31 123800` (714), `160122` (718), `160106` (788) e `103419` (914).
 * Nos quatro a faixa preta do palco mede **exatamente 199px**. Isso serviu de
 * altura inicial **fixa** por um tempo, mas era leitura de janela menor: o print
 * de 2026-10-01 (Discord numa coluna de 810px) mostra o palco com ~410px, ou
 * seja ~50% da coluna, avatares no centro e controles embaixo. Por isso o
 * padrão voltou a ser proporcional (`PROPORCAO_PADRAO`) e os 199px ficaram só
 * como o piso (`ALTURA_MIN`), que é onde a conta da grade ainda fecha.
 *
 * O redimensionamento pelo usuário continua guardado como **proporção** — o que
 * muda é só de onde ele parte quando não há preferência salva.
 */
export const ALTURA_PADRAO = 199;

/**
 * O palco não encolhe abaixo da faixa medida.
 *
 * O piso era 200 — um número redondo escolhido a olho, e **acima** da faixa que
 * o Discord de fato desenha, o que tornava a medida inalcançável (o `limitar`
 * empurrava 199 para 200). Agora o piso é a própria faixa, e 199 é onde a conta
 * da grade ainda fecha: numa área de 1042 de largura (1058 menos os 8+8 de
 * `FOLGA_DO_PALCO`) três tiles numa fileira pedem 192 de altura em 16:9, e eles
 * cabem nos 199. Abaixo disso quem manda passa a ser a altura, e os tiles
 * encolhem por baixo do que o Discord desenha. Para cima o divisor continua
 * livre.
 *
 * A faixa agora **reserva 96px** para a fileira de controles, conforme
 * `folgaDaGrade` em `CallStage` que aplica `pb-24` em todos os modos desktop.
 * No piso de 199, sobram assim ~103px de área útil para o palco. O piso não
 * foi aumentado junto — os tiles encolhem, e o "Chamando" mostra dois avatares
 * xl de 80px lado a lado; subir o piso é decisão separada.
 */
export const ALTURA_MIN = ALTURA_PADRAO;

/**
 * Fatia inicial do palco: metade da coluna (410 de 810px no print de
 * 2026-10-01). O piso `ALTURA_MIN` e o teto `tetoDoPalco` continuam valendo.
 */
export const PROPORCAO_PADRAO = 0.5;

/**
 * A proporção inicial do palco nesta coluna. Hoje não depende da altura — o
 * parâmetro fica para não mexer nos chamadores, e porque o piso/teto é aplicado
 * em `alturaDoPalco`.
 */
export function proporcaoPadrao(_disponivel: number): number {
  return PROPORCAO_PADRAO;
}
/** Com transmissão o palco começa maior: 16:9 numa faixa baixa vira miniatura. */
export const PROPORCAO_TRANSMISSAO = 0.68;

/** Faixa em que uma altura salva na versão em pixel ainda conta como preferência. */
const MIGRACAO_MIN = 0.2;
const MIGRACAO_MAX = 0.85;

export const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Quanto a conversa reserva numa coluna de `altura`. */
export function reservaDoChat(altura: number): number {
  return Math.max(RESERVA_CHAT_MIN, altura * RESERVA_CHAT_PROPORCAO);
}

/** Maior altura que o palco pode ter sem engolir a conversa. */
export function tetoDoPalco(altura: number): number {
  return Math.max(ALTURA_MIN, altura - reservaDoChat(altura));
}

/** Altura do palco, em pixel, para uma proporção guardada e uma coluna medida. */
export function alturaDoPalco(proporcao: number, disponivel: number): number {
  return limitar(proporcao * disponivel, ALTURA_MIN, tetoDoPalco(disponivel));
}

/**
 * Converte a altura em pixel da versão antiga para proporção.
 *
 * Migrar com tolerância — e não descartar — é o que não quebra quem já tinha
 * arrastado o divisor: 300px ajustados num notebook viram "aquela fração da
 * coluna", que é o que a pessoa quis dizer. Fora de uma faixa sensata o valor é
 * ignorado, porque pixel salvo numa janela minúscula não é preferência, é
 * acidente.
 */
export function proporcaoDaAlturaAntiga(px: number, disponivel: number): number | null {
  if (!Number.isFinite(px) || px <= 0 || disponivel <= 0) return null;
  const proporcao = px / disponivel;
  return proporcao >= MIGRACAO_MIN && proporcao <= MIGRACAO_MAX ? proporcao : null;
}

// ── divisão horizontal (canal de voz): palco à esquerda, conversa à direita ──

/** Largura da coluna de conversa. Medido: 363px na print ÷ 0,8075 = 450. */
export const LARGURA_PADRAO = 450;
/**
 * Piso da conversa: abaixo disto o composer perde os botões da direita e a
 * timeline quebra todo anexo. Não medido — é o menor que ainda se lê.
 */
export const LARGURA_MIN = 320;
/** Piso do palco na divisão horizontal. Não medido. */
export const PALCO_MIN = 360;

/** Maior largura que a conversa pode ter sem engolir o palco. */
export function tetoDoChat(disponivel: number): number {
  return Math.max(LARGURA_MIN, disponivel - PALCO_MIN);
}

/** Largura da conversa, em pixel, para uma preferência e uma coluna medida. */
export function larguraDoChat(desejada: number, disponivel: number): number {
  if (disponivel <= 0) return LARGURA_PADRAO;
  // coluna estreita demais para os dois: a conversa cede, mas não desaparece —
  // quem abriu o painel quer lê-lo
  return limitar(desejada, Math.min(LARGURA_MIN, disponivel), tetoDoChat(disponivel));
}

/**
 * Converte uma largura salva para o que se guarda de fato.
 *
 * Fora de uma faixa sensata o valor é ignorado: largura salva numa janela
 * minúscula não é preferência, é acidente.
 */
export function larguraGuardavel(px: number): number | null {
  if (!Number.isFinite(px)) return null;
  return px >= LARGURA_MIN && px <= 1200 ? px : null;
}
