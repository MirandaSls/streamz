/**
 * Parar a própria transmissão de tela — a parte pura.
 *
 * Quem transmite tem três formas de captura (navegador, nativa do Windows e,
 * no futuro, outra nativa) e quatro formas de parar (o botão do app, o selo
 * "Você está ao vivo", o "Parar compartilhamento" do navegador/sistema e sair
 * da chamada). As regras que decidem o que fazer em cada caso moram aqui,
 * sem LiveKit nem Tauri, para caberem num teste.
 */

/** O que um clique no botão de tela faz agora. */
export type AcaoDoBotaoDeTela = "parar" | "seletor-nativo" | "navegador" | "indisponivel";

export interface ContextoDoBotaoDeTela {
  /** Há uma transmissão minha no ar. */
  noAr: boolean;
  /** Estamos no app Tauri. */
  tauri: boolean;
  /**
   * A captura nativa existe (`capacidades_de_tela`)? `null` enquanto o Rust
   * não respondeu — aí o seletor abre e ele mesmo espera a resposta.
   */
  nativo: boolean | null;
  /** O webview/navegador tem `getDisplayMedia`. */
  navegadorCaptura: boolean;
}

/**
 * **Parar vem antes de tudo.** O botão do celular perguntava primeiro "este
 * navegador sabe capturar?" e só depois "estou no ar?": com a transmissão no
 * ar num aparelho sem `getDisplayMedia`, o toque dizia "use o app no
 * computador" em vez de parar. Estar no ar é o único fato que importa para
 * decidir parar — de onde a captura veio não muda nada.
 *
 * Fora disso: no desktop com captura nativa, o seletor; no desktop **sem**
 * ela (macOS, Linux), o `getDisplayMedia` do webview quando existe — o
 * seletor ali só dizia "não disponível" —; no navegador, a captura direta.
 */
export function acaoDoBotaoDeTela(c: ContextoDoBotaoDeTela): AcaoDoBotaoDeTela {
  if (c.noAr) return "parar";
  if (c.tauri && c.nativo !== false) return "seletor-nativo";
  return c.navegadorCaptura ? "navegador" : "indisponivel";
}

/**
 * Uma transmissão que terminou de subir **ainda deve ir ao ar**?
 *
 * Ir ao ar leva segundos (token, captura, sala do `#tela`, publicar). Se no
 * meio disso a pessoa parou, saiu da chamada ou trocou de canal, a geração
 * mudou — e a captura que acabou de subir tem de ser desfeita na hora, em vez
 * de virar uma transmissão que ninguém consegue mais parar: com a chamada
 * encerrada, não sobra botão nenhum na tela para isso.
 */
export function inicioAindaVale(inicio: {
  geracao: number;
  canal: string | null;
  geracaoAgora: number;
  canalAgora: string | null;
}): boolean {
  return inicio.geracao === inicio.geracaoAgora && !!inicio.canal && inicio.canal === inicio.canalAgora;
}

/** O mínimo de uma faixa de mídia que parar precisa. */
export interface FaixaParavel {
  readyState: string;
  stop(): void;
}

/**
 * Encerra **todas** as faixas da captura, publicadas ou não.
 *
 * O áudio da aba/tela vem na captura mesmo quando a opção "som" está
 * desligada (o diálogo do Chrome tem a própria caixa), e só o vídeo era
 * publicado — o áudio ficava vivo, sem dono, e o navegador continuava
 * mostrando "compartilhando" depois de a pessoa parar. `stop()` também não
 * dispara `ended` (é assim na especificação), então ninguém mais o encerraria.
 *
 * Devolve quantas faixas estavam vivas.
 */
export function encerrarFaixas(faixas: readonly FaixaParavel[]): number {
  let vivas = 0;
  for (const f of faixas) {
    if (f.readyState === "ended") continue;
    vivas += 1;
    try {
      f.stop();
    } catch {
      // parar nunca falha para o usuário
    }
  }
  return vivas;
}

/** As fontes do LiveKit que são "a minha tela" (vídeo e o som dela). */
export function ehFonteDeTela(source: string, fontes: { tela: string; somDaTela: string }): boolean {
  return source === fontes.tela || source === fontes.somDaTela;
}
