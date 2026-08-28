/**
 * A cor do avatar de quem não tem foto.
 *
 * Módulo à parte, como o `grid-layout.ts`: é função pura, e o `Avatar` é um
 * componente com JSX que o vitest da web não transforma — sem separar, esta
 * regra não teria teste.
 */

/**
 * Cores do avatar sem imagem, escolhidas de forma estável pelo id.
 *
 * Eram cinco, e com cinco a repetição salta aos olhos: dos cinco primeiros
 * usuários reais deste servidor, **quatro** caíram no mesmo rosa. Não era o
 * hash — ele distribui bem —, era o tamanho da paleta.
 *
 * Estas doze foram derivadas, não escolhidas a olho. Para cada matiz, a
 * luminosidade é a que dá **contraste 4,0 com as iniciais brancas**, resolvido
 * numericamente: luminosidade fixa em HSL não serve, porque amarelo e azul com
 * o mesmo `L` têm luminância percebida bem diferente. Por isso as doze leem
 * igual, o que as cinco antigas não faziam (variavam de 3,3 a 4,5).
 *
 * Os matizes ficam a 15° ou mais do verde-limão do accent (79°) e das cores da
 * bolinha de status — verde 154°, âmbar 35°, vermelho 359° —, que é a regra que
 * a paleta antiga já seguia (ADR-0004): o avatar não pode competir com a marca
 * nem ser confundido com o status.
 */
const PALETTE = [
  "#cd5e27", "#1c9330", "#1b8e7f", "#1f8ba0",
  "#2784cb", "#517bde", "#7272e4", "#8d69e2",
  "#aa5ae0", "#cb3fda", "#d939b9", "#db4490",
];

/**
 * Cor de fundo do avatar sem imagem, estável pelo id.
 *
 * Estável, e não sorteada a cada render, de propósito: a mesma pessoa tem de
 * aparecer da mesma cor em toda tela. Exportada porque o rail desenha a
 * conversa preenchendo um botão de 48px e não pode usar o `Avatar` (que traz o
 * próprio tamanho) — mas precisa da MESMA cor, senão a mesma pessoa aparece de
 * duas cores em duas colunas vizinhas.
 */
export function corDoAvatar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
