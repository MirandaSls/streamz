/**
 * "Dá para instalar este site como app, e devo oferecer isso agora?"
 *
 * O arquivo tem duas metades e a divisão é proposital:
 *
 *  - as funções **puras** do topo (`avisoDeInstalacao`,
 *    `deveRegistrarServiceWorker`), que são a decisão inteira e têm teste em
 *    `instalacao.test.ts`;
 *  - os leitores de ambiente do fim, que só transformam `navigator`,
 *    `matchMedia` e `localStorage` no registro que as puras recebem.
 *
 * A razão de separar é que **a decisão é o que erra**, e ela erra em cenários
 * que ninguém consegue montar num teste de componente aqui: iPhone em Safari,
 * app já instalado, WebView do Tauri. O ambiente do vitest deste pacote é
 * `node` com dois ou três stubs (ver `vitest.config.ts`), então um teste que
 * dependesse de DOM não existiria — mas uma tabela de sete booleanos existe, e
 * é ela que trava o comportamento.
 *
 * Este módulo **não importa nada** de propósito: nem `lib/desktop`, nem
 * `hooks/useEhMobile`. Quem chama já sabe as respostas (`isTauri()`,
 * `ehMobileAgora()`) e passa; assim o teste roda sem arrastar meia aplicação
 * para dentro dele.
 */

/** Onde a dispensa do aviso fica guardada. Em português, como o resto. */
export const CHAVE_DE_DISPENSA = "streamz:instalacao-dispensada";

/** O que o app sabe sobre onde está rodando, na hora de decidir o aviso. */
export type AmbienteDeInstalacao = {
  /** Estamos dentro do app de desktop (Tauri)? */
  ehTauri: boolean;
  /** A janela é de celular (`ehMobileAgora()`)? */
  ehMobile: boolean;
  /** O app já está instalado — aberto pelo ícone, e não pela aba. */
  jaInstalado: boolean;
  /** iPhone/iPad (inclui o iPad que se declara "Macintosh" com toque). */
  ehIOS: boolean;
  /** Safari de verdade — não o Chrome/Firefox/Edge do iOS. */
  ehSafari: boolean;
  /** O Chrome já ofereceu o `beforeinstallprompt` e o evento está guardado. */
  temPedidoDoChrome: boolean;
  /** A pessoa já dispensou o aviso alguma vez neste aparelho. */
  dispensado: boolean;
};

/**
 * Qual aviso mostrar: o do Chrome (com botão que instala), o do iOS (só
 * instrução) ou nenhum.
 *
 *  - `"chrome"` — há um `beforeinstallprompt` guardado; o botão chama
 *    `prompt()` e o sistema faz o resto.
 *  - `"ios"` — o Safari **não** tem `beforeinstallprompt` e nunca vai ter: lá
 *    instalar é um item do menu de compartilhar, e a única coisa que dá para
 *    fazer é ensinar o caminho.
 *  - `null` — todo o resto.
 *
 * A ordem das guardas é a ordem do dano:
 *
 *  1. **Tauri primeiro.** O app de desktop embute esta mesma web; oferecer
 *     "instalar o app" a quem acabou de instalar o app é o pior dos casos, e
 *     dentro do WebView2 não existe nem `beforeinstallprompt` nem menu de
 *     compartilhar para seguir a instrução.
 *  2. **Já instalado.** Quem abriu pelo ícone está vendo o app instalado; o
 *     aviso ali é ruído puro.
 *  3. **Dispensado.** "Agora não" tem de valer para sempre, e não até o
 *     próximo recarregamento.
 *  4. **Só no celular.** No computador a instalação existe, mas o ganho é
 *     pequeno e nós já entregamos um app de desktop de verdade — o botão
 *     "Baixar para Windows" de `/download` é a resposta lá.
 *
 * Fora do iOS, sem o evento do Chrome não há aviso: seria uma promessa que o
 * botão não cumpre (Firefox do Android instala por um item de menu que muda de
 * versão para versão, e o navegador que já instalou não emite mais o evento).
 */
export function avisoDeInstalacao(a: AmbienteDeInstalacao): "chrome" | "ios" | null {
  if (a.ehTauri) return null;
  if (a.jaInstalado) return null;
  if (a.dispensado) return null;
  if (!a.ehMobile) return null;
  if (a.temPedidoDoChrome) return "chrome";
  if (a.ehIOS && a.ehSafari) return "ios";
  return null;
}

/**
 * Registrar o service worker aqui?
 *
 * Três condições, e a primeira é a que importa: **nunca dentro do Tauri**. A
 * CSP do app desktop (`apps/desktop/src-tauri/tauri.conf.json`) até
 * permitiria o worker (`worker-src 'self' blob:`), mas o conteúdo lá é servido
 * por um protocolo de asset próprio, não por `http(s)` de uma origem segura —
 * o `navigator.serviceWorker` não é o caminho de nada ali, e um SW rodando
 * dentro do app instalado seria uma segunda camada de cache entre o WebView e
 * arquivos que já estão em disco.
 *
 * Só em produção porque em `next dev` o servidor recompila e serve rotas que
 * não existem no `out/`; um SW no meio disso só atrapalha depuração.
 *
 * E só onde o navegador tem a API — o que exclui, entre outros, aba anônima de
 * alguns navegadores e qualquer contexto não seguro.
 */
export function deveRegistrarServiceWorker(a: {
  ehTauri: boolean;
  producao: boolean;
  temSuporte: boolean;
}): boolean {
  return !a.ehTauri && a.producao && a.temSuporte;
}

// ── Leitura do ambiente ────────────────────────────────────────────────────

/**
 * O app está aberto **como app** (ícone da tela de início), e não numa aba?
 *
 * Dois caminhos porque nenhum cobre os dois sistemas: `display-mode:
 * standalone` é o do spec e responde no Android e no iOS moderno;
 * `navigator.standalone` é a propriedade antiga da Apple, que continua sendo a
 * única resposta em iOS mais velho. `minimal-ui` entra junto porque é o modo
 * que alguns navegadores dão quando o manifesto pede `standalone` e eles não
 * fazem tela cheia — continua sendo um app instalado.
 */
export function jaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const daApple = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (daApple === true) return true;
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

/**
 * iPhone ou iPad.
 *
 * O segundo termo existe porque **o iPad mente**: desde o iPadOS 13 o Safari
 * dele se declara "Macintosh; Intel Mac OS X" no `userAgent`, e só o
 * `maxTouchPoints` desmente. Sem esse termo o iPad ficaria sem aviso nenhum —
 * não tem `beforeinstallprompt` (é Safari) e não seria reconhecido como iOS.
 */
export function ehIOS(ua: string, plataforma: string, pontosDeToque: number): boolean {
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /mac/i.test(plataforma) && pontosDeToque > 1;
}

/**
 * Safari de verdade.
 *
 * No iOS **todo** navegador roda em cima do WebKit, então "é Safari?" não é
 * uma pergunta sobre motor: é sobre qual app está na frente. Chrome (`CriOS`),
 * Firefox (`FxiOS`), Edge (`EdgiOS`) e Opera (`OPiOS`) do iPhone não têm o
 * item "Adicionar à Tela de Início" no menu de compartilhar deles — a
 * instrução seria falsa.
 *
 * A checagem é pela **ausência** das marcas dos outros porque o `Safari/…` no
 * fim do `userAgent` não quer dizer nada: ele aparece no Chrome do iPhone
 * (`CriOS/126 … Safari/604.1`) **e** no Chrome do Android
 * (`Chrome/126 … Safari/537.36`) — foi esse o caso que o teste pegou. Por isso
 * a lista tem também as marcas de fora do iOS: se algum dia o `ehIOS` deixar
 * de blindar esta chamada, o Android continua não sendo Safari.
 */
export function ehSafari(ua: string): boolean {
  if (/crios|fxios|edgios|opios|mercury/i.test(ua)) return false;
  if (/chrome|chromium|android|edg\/|opr\/|firefox|samsungbrowser/i.test(ua)) return false;
  return /safari/i.test(ua);
}

/** A dispensa guardada. `localStorage` pode lançar (aba anônima, cookie bloqueado). */
export function dispensaGuardada(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DE_DISPENSA) === "1";
  } catch {
    return false;
  }
}

/** Guarda a dispensa. Falhar aqui só significa que o aviso volta na próxima. */
export function guardarDispensa(): void {
  try {
    window.localStorage.setItem(CHAVE_DE_DISPENSA, "1");
  } catch {
    // sem armazenamento, o aviso reaparece — degradado, não quebrado
  }
}
