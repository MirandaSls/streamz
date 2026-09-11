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
 * **Medidas @1x** (`tag-bot-na-lista-de-membros.png`, lidas com `getpixel`; a
 * mesma pílula em `tag-bot-no-perfil-do-app.png`, que está a 2×, mede 30/2 = 15
 * — o Discord usa **um só tamanho**, mesmo ao lado do nome de 24px do perfil):
 *
 * | item | medido |
 * |---|---|
 * | altura da pílula | 15px |
 * | caixa-alta das letras | 7px → fonte de 10px em negrito |
 * | respiro horizontal | 3px à esquerda, 4px à direita → `px-[4px]` |
 * | raio | 3px (o topo recua 2px na primeira linha) |
 * | largura só com "BOT" | 25px |
 *
 * Os 37px da captura incluem o `✓` de aplicativo **verificado**, que é outra
 * coisa: não temos verificação, e um selo que não significa nada seria pior que
 * a falta dele.
 *
 * Tudo em px literal, e não na escala do Tailwind, porque **todo número aqui
 * significa alguma coisa**: a raiz do app é 15,5px e `h-4` entregaria 15,5 —
 * perto, mas por acidente, e `text-[10px]` viraria 10,3. Regra do §6.3 do
 * processo.
 *
 * A cor é a de destaque do produto (`accent` sobre `accent-ink`), que é o que o
 * blurple `#5865F2` é lá: a única mancha saturada de uma coluna cinza.
 */

/**
 * **Um tamanho só no desktop, de propósito.** A tentação era um tamanho por
 * superfície (o rótulo do tile de voz tem 20px de altura, o nome do popover de
 * perfil tem 24px de linha). A medição diz que não: a pílula mede 15px na lista
 * de membros, 15px no autor da mensagem e 15px ao lado do nome de 24px do
 * perfil — o Discord **não** a redimensiona por contexto.
 *
 * No celular ela cresce para 18px: 10px de texto é legível a 40cm com o mouse
 * na mão e não é a 30cm com o telefone na mão, e a linha de membro já cresceu
 * de 42 para 60 ao redor dela. É a única medida daqui **sem** captura do
 * Discord por trás — foi decidida no aparelho emulado, e está no PR como
 * escolha nossa.
 *
 * `caixaEstreita` desliga esse crescimento. A regra é uma só: **onde a caixa
 * em volta não cresce no celular, a pílula também não cresce.** Duas caixas se
 * encaixam nela, ambas medidas em 390×844:
 *
 * | caixa | altura | pílula de 18 | pílula de 15 |
 * |---|---|---|---|
 * | rótulo comprimido do tile de voz (`h-[20px]`) | 20px | 1px de folga | 2,5px |
 * | barra de resposta do `MessageItem` (`leading-[18px]`) | 18px | 0 | 1,5px |
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
      className={`inline-grid h-[15px] shrink-0 select-none place-items-center rounded-[3px] bg-brand-500 px-[4px] text-[10px] font-bold uppercase leading-none tracking-[0.02em] text-control-primary-text-default ${
        caixaEstreita ? "" : "celular:h-[18px] celular:px-[5px] celular:text-[11px]"
      } ${className}`}
    >
      BOT
    </span>
  );
}
