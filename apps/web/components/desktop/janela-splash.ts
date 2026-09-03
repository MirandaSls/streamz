/**
 * A janelinha de abertura e atualização do app de desktop — a do Discord.
 *
 * Aqui ficam só as partes puras (modo, frase, porcentagem, tempos), para o
 * componente `JanelaSplash` cuidar de janela, evento e rede. É o que dá para
 * testar sem Tauri: no servidor não existe WebView2, e a única forma de provar
 * o resto é num Windows (ver §5 do docs/PROCESSO-DE-DESENVOLVIMENTO.md).
 *
 * **As medidas da janela** saíram de `docs/Reference/open.jpg` e
 * `docs/Reference/discord update.jpg` com Pillow (§6.3), e estão no
 * `JanelaSplash.tsx`, junto do JSX que as usa.
 */

/** Como a janelinha foi aberta. */
export type ModoDaSplash =
  /** o app está subindo: checar, atualizar se houver, e entregar o app. */
  | "abertura"
  /** o app já estava aberto e a pessoa clicou na setinha da barra de título. */
  | "atualizar";

/** O que a janelinha está fazendo agora. */
export type EstadoDaSplash = "verificando" | "baixando" | "instalando";

/**
 * Mínimo de tempo no ar (ms). Sem isto, quando a checagem volta em 80ms a
 * janelinha pisca — aparece e some antes de dar para ler, e o que fica é a
 * impressão de defeito. O Discord tem a mesma carência.
 */
export const EXIBICAO_MINIMA = 600;

/**
 * Teto da checagem (ms). Rede caída, DNS pendurado, servidor sem responder: o
 * `check()` do plugin ficaria esperando o timeout do sistema e a pessoa ficaria
 * olhando "Verificando atualizações…" sem app. Atualização é conveniência —
 * passou disto, o app abre.
 */
export const LIMITE_DA_CHECAGEM = 8000;

/**
 * Nome do evento que a janelinha manda para a janela principal quando a
 * atualização não deu certo. Quem ouve é o `useAtualizacao`, que vira um toast:
 * a splash não tem espaço para explicar nada, e some logo em seguida.
 */
export const EVENTO_DE_ERRO_DA_SPLASH = "splash:erro";

/** Rótulo da janela principal no Tauri (`tauri.conf.json`). */
export const JANELA_PRINCIPAL = "main";
/** Rótulo da janelinha (idem, e o mesmo que a capability `splash` cobre). */
export const JANELA_SPLASH = "splash";

/**
 * De onde sai o modo: a janelinha da abertura é criada pelo
 * `tauri.conf.json` sem busca nenhuma; a da setinha é criada com
 * `splash/?modo=atualizar`. Qualquer outro valor cai em `"abertura"` — um
 * parâmetro errado não pode mudar o caminho do boot.
 */
export function modoDaSplash(busca: string): ModoDaSplash {
  const modo = new URLSearchParams(busca).get("modo");
  return modo === "atualizar" ? "atualizar" : "abertura";
}

/**
 * Progresso do download em 0..100, ou `null` quando não dá para saber.
 *
 * O servidor pode não mandar `Content-Length` (aí `total` é 0) ou mentir nele
 * (aí `baixado` passa do total): nos dois casos a barra não pode ir além de
 * 100% nem voltar. Sem total, a frase sai sem porcentagem e a barra fica no
 * começo — é honesto e não fica pulando.
 */
export function porcentagemDoDownload(baixado: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  const bruta = (Math.max(0, baixado) / total) * 100;
  return Math.min(100, Math.round(bruta));
}

/**
 * A linha embaixo do símbolo. Uma frase por estado, como no Discord
 * ("Checking for updates…", "Downloading update 12 of 15…"): quem abriu o app
 * não quer relatório, quer saber que alguma coisa está acontecendo.
 */
export function fraseDaSplash(estado: EstadoDaSplash, porcentagem: number | null): string {
  if (estado === "instalando") return "Instalando…";
  if (estado === "baixando") {
    return porcentagem === null
      ? "Baixando atualização…"
      : `Baixando atualização… ${porcentagem}%`;
  }
  return "Verificando atualizações…";
}

/** Quanto ainda falta para a exibição mínima (ms), dado o instante da abertura. */
export function esperaQueFalta(abertura: number, agora: number): number {
  return Math.max(0, EXIBICAO_MINIMA - (agora - abertura));
}
