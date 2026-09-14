/**
 * ── j-bots ── A pílula **BOT** ao lado do nome de uma conta de aplicativo.
 *
 * Existe uma vez porque o Discord a põe em seis superfícies (lista de membros,
 * autor da mensagem nos dois modos, barra de resposta, popover de perfil, modal
 * de perfil, participantes do grupo e tile de voz) e repetir o estilo em todas
 * elas é como uma delas acaba com um tamanho diferente das outras.
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §11.
 *
 * **BOT, e não APP.** O Discord renomeou a pílula para `APP` em abril de 2024 —
 * as capturas de `docs/Reference/apps/` mostram as duas eras lado a lado
 * (`tag-bot-na-lista-de-membros.png` é a antiga, `tag-app-na-mensagem.png` a
 * nova). Ficamos com **BOT**, por decisão do §11 e da entrega. Quem vier depois
 * e achar que isto é um erro de cópia: não é, é escolha; troque só com o
 * usuário na sala.
 *
 * **Medidas: o CSS do cliente atual** (`.botTag__82f07` na variante `rem`,
 * `css-bruto/858942.086f3*.css`), que é a régua da ADR-0009 (cliente de
 * 2026-09-11):
 *
 * | item | CSS | aqui |
 * |---|---|---|
 * | altura | `.9375rem` = 15px | `h-[15px]` |
 * | raio | `4px` | `rounded` |
 * | respiro horizontal | `0 .275rem` = 4,4px | `px-[4.4px]` |
 * | texto (`.botText__82f07`) | `.8rem` = 12,8px, `semibold`, linha `.9375rem` | `text-[12.8px] font-semibold leading-[15px]` |
 * | fundo / texto (`.botTagRegular__82f07`) | `--background-brand` / `--white` | `bg-background-brand` / `text-control-primary-text-default` |
 *
 * Antes daqui a pílula seguia `tag-bot-na-lista-de-membros.png` (10px em
 * negrito, raio 3). Aquele print é da era "BOT", **anterior** ao cliente que a
 * ADR-0009 fixou como régua — por isso ele deixou de mandar. A proporção da era
 * atual confere com o CSS em `tag-app-na-mensagem.png` (escala desconhecida,
 * só proporção): a caixa-alta do "APP" tem ~0,55 da caixa-alta do nome de 16px
 * ao lado, o que dá ~12–13px de fonte, e a pílula tem a altura da caixa-alta
 * mais os ascendentes do nome.
 *
 * O texto é **escuro** sobre o limão (`control-primary-text-default` =
 * `accent-ink`), nunca o `--white` do Discord: branco sobre Volt Lime dá 1,57:1
 * (ADR-0009, regra 2 do accent).
 *
 * Os 16px do `.px__82f07` (a variante em px) e o `✓` de aplicativo
 * **verificado** ficam de fora: não temos verificação, e um selo que não
 * significa nada seria pior que a falta dele.
 *
 * O espaço em volta (margem de 4px antes, `top:.1rem` no cabeçalho da mensagem)
 * é de quem a usa — `.botTagCozy_c19a55`/`.botTagCompact_c19a55` são regras do
 * módulo da mensagem, não da pílula.
 */

/**
 * **Um tamanho só no desktop, de propósito.** O Discord **não** redimensiona a
 * pílula por contexto: a mesma classe serve à lista de membros, ao autor da
 * mensagem e ao nome de 24px do perfil.
 *
 * No celular ela cresce para 18px de altura: a linha de membro já cresceu de
 * 42 para 60 ao redor dela, e uma pílula de 15 some a 30cm com o telefone na
 * mão. É a única medida daqui **sem** captura do Discord por trás — foi
 * decidida no aparelho emulado, e está no PR como escolha nossa. A fonte não
 * cresce junto: os 12,8px já são legíveis, e crescer só a caixa preserva a
 * largura que o nome ao lado tem para truncar.
 *
 * `caixaEstreita` desliga esse crescimento. A regra é uma só: **onde a caixa
 * em volta não cresce no celular, a pílula também não cresce.** Duas caixas se
 * encaixam nela, ambas medidas em 390×844:
 *
 * | caixa | altura | pílula de 18 | pílula de 15 |
 * |---|---|---|---|
 * | rótulo comprimido do tile de voz (`h-[20px]`) | 20px | 1px de folga | 2,5px |
 * | linha de resposta do `MessageItem` (`leading-[18px]`) | 18px | 0 | 1,5px |
 *
 * Nenhuma das duas *estoura* — o número diz que cabe. O que a captura mostra é
 * outra coisa: a pílula encosta nas bordas da caixa, os cantos arredondados dos
 * dois se cruzam e o selo lê como adesivo colado na beirada. As duas alturas
 * são fixas nos dois leiautes (nenhuma tem `celular:`), e é isso que as separa
 * das linhas que crescem com o dedo.
 */
export default function TagDeBot({
  caixaEstreita = false,
  className = "",
}: {
  /** a caixa em volta tem altura fixa no celular; não cresça dentro dela. */
  caixaEstreita?: boolean;
  className?: string;
}) {
  return (
    <span
      // `aria-label` e não só o texto: em caixa-alta o leitor de tela soletra
      // "B-O-T". O `role="img"` é o que faz o rótulo substituir o conteúdo em
      // vez de ser lido depois dele.
      role="img"
      aria-label="Conta de bot"
      className={`inline-grid h-[15px] shrink-0 select-none place-items-center rounded bg-background-brand px-[4.4px] text-[12.8px] font-semibold uppercase leading-[15px] text-control-primary-text-default ${
        caixaEstreita ? "" : "celular:h-[18px] celular:px-[5px]"
      } ${className}`}
    >
      BOT
    </span>
  );
}
