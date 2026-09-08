/**
 * Destravar o áudio no primeiro gesto — o que o iOS exige e o desktop não.
 *
 * No Safari e no Chrome do iPhone, `Audio.play()` é recusado até o documento
 * receber um gesto do usuário, e a recusa é **por elemento**: destravar um
 * `<audio>` não destrava os outros. Isso quebra justamente os sons que chegam
 * de fora — chamada recebida, mensagem nova —, que por definição acontecem sem
 * ninguém ter tocado na tela naquele instante.
 *
 * O `toque-com-gesto.ts` cobre um caso vizinho e não este: lá o toque **em
 * curso** é retomado no próximo gesto, o que serve para um som em loop. Um som
 * de uma vez só (a mensagem) não tem o que retomar — quando o gesto chega, o
 * momento já passou. Por isso aqui a estratégia é outra: no primeiro gesto da
 * sessão, tocar **todos** os arquivos em volume zero e pausar em seguida. O
 * navegador registra cada elemento como "ativado pelo usuário", e a partir daí
 * eles tocam sozinhos.
 *
 * O truque é padrão em web de áudio e tem duas regras que não dá para violar:
 *
 * 1. **`play()` tem de ser chamado dentro do próprio manipulador do gesto**,
 *    de forma síncrona. Qualquer `await` antes dele já sai da janela de
 *    ativação, e o navegador recusa de novo.
 * 2. **Volume zero, não `muted`.** Um elemento mudo não conta como reprodução
 *    para a política de autoplay em parte dos navegadores; volume 0 conta.
 *
 * Nada disto é verificável em Chromium sem cabeça, que não aplica a política do
 * iOS: **só um aparelho real prova**. O que dá para testar — e o que este
 * módulo isola — é a parte pura: quais arquivos, uma vez só, e o que acontece
 * quando um `play()` é recusado.
 */

/** O mínimo de `HTMLAudioElement` que o destravamento usa. */
export interface ElementoDestravavel {
  volume: number;
  currentTime: number;
  play: () => Promise<void>;
  pause: () => void;
}

/**
 * URLs distintas, preservando a ordem. `mudo` e `surdo` apontam para o mesmo
 * arquivo, e destravá-lo duas vezes seria uma reprodução a mais sem ganho.
 */
export function urlsDistintas(arquivos: Record<string, string>): string[] {
  return [...new Set(Object.values(arquivos))];
}

/**
 * Toca e pausa cada elemento em volume zero. Devolve quantos aceitaram tocar —
 * é o que o teste observa, já que o efeito real é invisível.
 *
 * Os `play()` saem todos **antes** de qualquer espera, de propósito: é a regra
 * 1 do cabeçalho. Um elemento que recusar não derruba os outros.
 */
export async function destravarElementos(els: ElementoDestravavel[]): Promise<number> {
  const tentativas = els.map((el) => {
    const volumeAntes = el.volume;
    el.volume = 0;
    return { el, volumeAntes, promessa: el.play() };
  });

  let destravados = 0;
  for (const { el, volumeAntes, promessa } of tentativas) {
    try {
      await promessa;
      destravados += 1;
    } catch {
      // recusado: este arquivo continuará mudo até o próximo gesto. Não é erro
      // — som de interface nunca derruba nada.
    }
    el.pause();
    el.currentTime = 0;
    el.volume = volumeAntes;
  }
  return destravados;
}
