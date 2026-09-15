"use client";

/**
 * ── onda 3 ── O corpo de uma resposta adiada (callback 5, flag `LOADING`):
 * "<bot> está pensando…" com os três pontos pulsando.
 *
 * O `content` da mensagem nesse estado é o texto provisório `TEXTO_PENSANDO` do
 * servidor, e a tela **não** o mostra (contrato da onda 3, §1.3): quem lê vê o
 * estado, e a primeira edição do bot troca tudo de uma vez, sem "(editado)".
 *
 * Medidas:
 * - Pontos: `.pulsingEllipsis__46696` (`css-bruto/362698.047b6f205fd7bdc1.css`)
 *   — caixa de 28px com os pontos centralizados, cada ponto 6×6, raio 3px,
 *   `margin-right: 2px`, animação `spinner-pulsing-ellipsis` de 1,4s com +0,2s e
 *   +0,4s. É a mesma animação que o `Button` em `carregando` já usa
 *   (`anim-pulso-do-botao` em `app/globals.css`). A cor do Discord é
 *   `--primary-100`, que não é token semântico aqui; o mais próximo é
 *   `--text-default` (os pontos saem mais claros que o texto, como na imagem).
 * - Texto: cor `--text-muted` e o corpo da mensagem (16px), pela imagem
 *   `desenvolvedores/imagens/mensagens-de-bot/antigo-bot-pensando.png`. O
 *   espaço entre os pontos e o texto (8px) é proporção dessa imagem: avatar de
 *   90px nela = 40px aqui (×2,25), e 18px de pontos a texto → 8px. Nenhum
 *   print 1:1 tem esse estado.
 */
export default function PensandoDoBot({ nome }: { nome: string }) {
  return (
    <span className="inline-flex items-center text-text-muted" role="status">
      <span aria-hidden="true" className="mr-2 inline-flex w-[28px] shrink-0 items-center justify-center text-text-default">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="mr-[2px] inline-block h-[6px] w-[6px] rounded-[3px] bg-current anim-pulso-do-botao"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </span>
      <span>{nome} está pensando…</span>
    </span>
  );
}
