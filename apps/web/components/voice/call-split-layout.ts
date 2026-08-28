/**
 * A conta da divisão entre palco e conversa (ver `CallSplit`).
 *
 * Módulo à parte pelo mesmo motivo do `grid-layout.ts`: é aritmética pura sobre
 * a área disponível, testável sem montar componente nenhum — e foi a falta
 * dela, com três constantes em pixel absoluto no lugar, que fazia a tela maior
 * dar mais chat em vez de mais palco.
 */

/** O palco nunca some de vez: menos que isso não cabe nem um rosto. */
export const ALTURA_MIN = 200;
/** Piso da conversa: sem ele o palco esmagaria o composer contra a timeline. */
export const RESERVA_CHAT_MIN = 180;
/** Fatia da coluna reservada à conversa quando há altura de sobra. */
export const RESERVA_CHAT_PROPORCAO = 0.28;
/** Fatia inicial do palco. */
export const PROPORCAO_PADRAO = 0.5;
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
