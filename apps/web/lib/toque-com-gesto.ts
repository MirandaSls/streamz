/**
 * Tocar um `<audio>` de toque mesmo quando a política de autoplay recusa a
 * primeira tentativa.
 *
 * O toque de chamada é o **único** som do app que precisa começar sem nenhum
 * gesto: quando o telefone toca, a pessoa pode não ter encostado na janela
 * desde que ela abriu (o app vive na bandeja). Chromium — e portanto o WebView2
 * do desktop — só libera `play()` com som depois que o documento recebeu uma
 * ativação do usuário; antes disso a promise é rejeitada com `NotAllowedError`
 * e o `.catch(() => {})` que existia aqui engolia tudo: chamada na tela,
 * silêncio absoluto.
 *
 * O desktop resolve isso na raiz, passando `--autoplay-policy=
 * no-user-gesture-required` ao WebView2 (`apps/desktop/src-tauri/src/main.rs`).
 * Este módulo é a rede de segurança para o resto: o navegador, onde a flag não
 * existe, e uma instalação com um runtime do WebView2 antigo. Se `play()` for
 * recusado, ficamos à espera do **próximo** gesto — o primeiro clique ou tecla
 * na janela — e tocamos ali, que é o instante exato em que o navegador passa a
 * permitir.
 *
 * A espera é cancelável de propósito: sem `pararToqueEm`, um gesto dado depois
 * de a chamada acabar ressuscitaria o toque com a tela já vazia.
 */

/** O mínimo de `window` que este módulo usa — é o que o teste substitui. */
export interface AlvoDeGesto {
  addEventListener: (
    tipo: string,
    ouvinte: () => void,
    opcoes?: { capture?: boolean },
  ) => void;
  removeEventListener: (tipo: string, ouvinte: () => void, capture?: boolean) => void;
}

/** O mínimo de `HTMLAudioElement` que este módulo usa. */
export interface ElementoDeToque {
  currentTime: number;
  play: () => Promise<void>;
  pause: () => void;
}

/**
 * Gestos que o Chromium aceita como ativação do documento. `capture: true`
 * porque um `stopPropagation` no caminho (menus, modais) não pode nos cegar.
 */
const GESTOS = ["pointerdown", "keydown", "touchstart"] as const;

/** Uma espera por elemento: rearmar em cima da anterior vazaria ouvintes. */
const esperas = new Map<ElementoDeToque, () => void>();

/**
 * Toca do começo. Se o autoplay recusar, arma a retomada no próximo gesto.
 *
 * Devolve a promise da tentativa só para os testes; quem chama não precisa
 * esperar — som de interface nunca bloqueia o fluxo da chamada.
 */
export function tocarToqueEm(el: ElementoDeToque, alvo: AlvoDeGesto | null): Promise<void> {
  cancelarEspera(el);
  el.currentTime = 0;
  return el.play().catch(() => {
    if (alvo) armarEspera(el, alvo);
  });
}

/** Para o toque e desarma qualquer espera por gesto pendente. */
export function pararToqueEm(el: ElementoDeToque): void {
  cancelarEspera(el);
  el.pause();
  el.currentTime = 0;
}

/** Quantas esperas estão armadas — para o teste provar que não vazam. */
export function esperasArmadas(): number {
  return esperas.size;
}

function armarEspera(el: ElementoDeToque, alvo: AlvoDeGesto): void {
  const retomar = () => {
    cancelarEspera(el);
    void el.play().catch(() => {});
  };
  const cancelar = () => {
    esperas.delete(el);
    for (const gesto of GESTOS) alvo.removeEventListener(gesto, retomar, true);
  };
  esperas.set(el, cancelar);
  for (const gesto of GESTOS) alvo.addEventListener(gesto, retomar, { capture: true });
}

function cancelarEspera(el: ElementoDeToque): void {
  esperas.get(el)?.();
}
