"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import PainelDeChatDaCall from "@/components/voice/PainelDeChatDaCall";
import {
  ALTURA_MIN,
  LARGURA_MIN,
  LARGURA_PADRAO,
  PROPORCAO_TRANSMISSAO,
  alturaDoPalco,
  larguraDoChat,
  larguraGuardavel,
  orientacaoDaChamada,
  proporcaoDaAlturaAntiga,
  proporcaoPadrao,
  reservaDoChat,
  tetoDoChat,
  tetoDoPalco,
} from "@/components/voice/call-split-layout";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useUI } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Voz e texto dividindo a mesma coluna — **de dois jeitos**, porque o Discord
 * também tem dois (ver `call-split-layout.ts`, que guarda a decisão e a conta):
 *
 * - **Conversa direta e grupo (`vertical`)**: a chamada é uma **faixa em cima**,
 *   de altura fixa, e a conversa fica embaixo na largura toda, com o composer
 *   no lugar de sempre. É o leiaute dos prints de chamada em DM.
 * - **Canal de voz de servidor (`horizontal`)**: o palco toma a coluna e a
 *   conversa abre numa coluna de 450 à direita (`PainelDeChatDaCall`).
 *
 * **O PR #108 mandou os dois para o horizontal**, e foi o que o usuário viu na
 * print `2026-09-04 001116`: uma DM com a timeline espremida à direita e o
 * composer fora do lugar. A divisão horizontal continua certa — para o canal de
 * voz, que foi onde ela foi medida.
 *
 * Nos dois casos o tamanho é arrastável e lembrado entre sessões, porque a
 * proporção certa é a do uso e não a da chamada. O que se guarda é diferente e
 * de propósito: na vertical, **proporção** (tela maior tem de dar mais palco —
 * era esse o defeito de antes do #72); na horizontal, **pixel** (na print o
 * painel mede 450 numa janela de 3333, não uma fração dela).
 *
 * A tela cheia (ver `fullscreen.ts`) não tem nada a ver com esta divisão: o
 * elemento em tela cheia é promovido pelo compositor e ignora as medidas daqui.
 *
 * O **palco expandido** (`ui.palcoExpandido`, ver `CallStage`) tem, e é o único
 * estado de fora que esta divisão precisa conhecer: ali quem promove o palco
 * somos nós, com um `absolute inset-0` que sobe até a região de conteúdo. Duas
 * coisas têm de sair da frente, e as duas moram na divisão **vertical** — que
 * é a da conversa direta, a única cujo palco (`CallStage`) oferece o botão
 * hoje; o canal de voz (`VoicePanel`) ainda não entra neste modo, e por isso a
 * divisão horizontal ficou como estava em vez de ganhar um ramo que ninguém
 * executa e que, ligado por engano, esconderia a conversa sem botão de volta:
 *
 * - o **invólucro do palco não pode ser `relative`**, ou o `absolute` pararia
 *   nele — o palco ficaria preso na faixa de 199px que deveria ter deixado;
 * - a conversa e o divisor **somem de verdade** (`hidden`), e não só por
 *   ficarem atrás: escondido a CSS, nada ali recebe Tab, e um Tab que caísse no
 *   composer invisível seria o pior tipo de defeito de teclado. `hidden` e não
 *   desmontar, para a conversa voltar como estava quando o palco recolher.
 */

/** Enquanto a coluna não foi medida (primeiro quadro, SSR): evita salto visível. */
const ALTURA_ANTES_DE_MEDIR = 420;
const PASSO_TECLADO = 24;

/** Proporção 0–1 da coluna (divisão vertical). */
const CHAVE_PROPORCAO = "streamz:proporcao-chamada";
/**
 * A mesma preferência, **guardada à parte no celular**.
 *
 * Proporção viaja entre telas de propósito (é o ponto do #72), mas entre um
 * monitor e um telefone ela vira outra coisa: a fração que num monitor de 900
 * deixa a conversa confortável deixa a chamada com pouco mais de cem pixels num
 * iPhone. São duas preferências, não uma — e o mesmo `localStorage` atende as
 * duas com duas chaves.
 */
const CHAVE_PROPORCAO_MOBILE = "streamz:proporcao-chamada:celular";
/** Chave antiga, em PIXEL absoluto — migrada na primeira medição. */
const CHAVE_ALTURA_ANTIGA = "streamz:altura-chamada";
/** Largura da conversa, em pixel (divisão horizontal). */
const CHAVE_LARGURA = "streamz:largura-chamada";

function lerProporcao(chave: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const n = Number(window.localStorage?.getItem(chave));
    return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
  } catch {
    return null;
  }
}

/** Lê e consome a altura em pixel da versão antiga, se houver. */
function migrarAlturaAntiga(disponivel: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage?.getItem(CHAVE_ALTURA_ANTIGA);
    if (!bruto) return null;
    window.localStorage?.removeItem(CHAVE_ALTURA_ANTIGA);
    return proporcaoDaAlturaAntiga(Number(bruto), disponivel);
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: string) {
  try {
    window.localStorage?.setItem(chave, valor);
  } catch {
    // storage indisponível: a medida vale só nesta sessão
  }
}

function lerLargura(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage?.getItem(CHAVE_LARGURA);
    return bruto ? larguraGuardavel(Number(bruto)) : null;
  } catch {
    return null;
  }
}

export default function CallSplit({
  chamada,
  chat,
  titulo,
  onFecharChat,
  guildId = null,
}: {
  chamada: ReactNode;
  chat: ReactNode;
  /** nome que vai no cabeçalho do painel — só a divisão horizontal desenha um. */
  titulo: string;
  onFecharChat: () => void;
  /** canal de servidor → coluna à direita; conversa direta → faixa em cima. */
  guildId?: string | null;
}) {
  return orientacaoDaChamada(guildId) === "horizontal" ? (
    <DivisaoHorizontal chamada={chamada} chat={chat} titulo={titulo} onFecharChat={onFecharChat} />
  ) : (
    <DivisaoVertical chamada={chamada} chat={chat} />
  );
}

/**
 * Metade da coluna para a chamada **no celular**.
 *
 * Os 199px de `ALTURA_PADRAO` são medidos, e são medidos num Discord de
 * computador: numa janela de 900 eles são uma faixa sobre uma conversa inteira.
 * Num iPhone a mesma faixa é quase a tela toda de conversa — e o que sobra para
 * a chamada, depois dos 88 que o `PalcoMobile` reserva à cápsula de controles,
 * são **111px de vídeo**, menos que o avatar de 80 que eles deveriam mostrar.
 * Medido em 390×844: coluna de 788, palco de 199, destaque de 111.
 *
 * Metade não é medição (não há print de chamada de DM no Discord do celular com
 * a conversa junto): é o menor número que deixa as duas coisas utilizáveis —
 * ~306 de destaque e ~394 de conversa num iPhone. Quem quiser só o palco fecha
 * a conversa pelo balão do cabeçalho, e o divisor continua arrastável.
 */
const PROPORCAO_PADRAO_MOBILE = 0.5;

/** Área de pega do divisor no telefone: 1px de linha não se acerta com o dedo. */
const PEGA_TOQUE = "border-y-[11px]";

/**
 * O invólucro do palco na divisão vertical, nos dois modos.
 *
 * **Na faixa** ele tem altura explícita, e o `maxHeight` em CSS cobre o quadro
 * entre a coluna encolher e o observador reagir: sem ele a altura de uma tela
 * grande engoliria o chat por um instante.
 *
 * **Expandido** o palco está fora do fluxo (ver o cabeçalho do arquivo): sem
 * `relative` para não prendê-lo, e sem altura para este invólucro vazio não
 * deixar uma faixa de 199px por baixo dele.
 *
 * **Sem `overflow-hidden` de propósito**, embora o transbordo do palco por cima
 * da conversa tenha sido um defeito de verdade (prints `image.pbg` e
 * `aaa.pbg`). Quem transbordava era o palco, que se media pelo próprio conteúdo
 * — a correção está lá, em `posicaoDoPalco` (`CallStage`), e é o `min-h-0` que
 * faz a altura daqui valer. Clipar seria esconder o sintoma e cortar junto os
 * popovers da barra de controles, que numa faixa de 199px sobem de propósito
 * para fora do palco (ver `VoiceControls`).
 */
export function involucroDoPalco(
  expandido: boolean,
  altura: number,
  disponivel: number,
): { className: string; style: CSSProperties | undefined } {
  if (expandido) return { className: "flex min-h-0 flex-1 flex-col", style: undefined };
  return {
    className: "relative flex min-h-0 shrink-0 flex-col",
    style: {
      height: altura,
      maxHeight: `calc(100% - ${Math.round(reservaDoChat(disponivel || ALTURA_ANTES_DE_MEDIR))}px)`,
    },
  };
}

/** Conversa direta: faixa de chamada em cima, conversa embaixo. */
function DivisaoVertical({ chamada, chat }: { chamada: ReactNode; chat: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  /** Altura real da coluna; recalculada a cada mudança de tamanho, não só na montagem. */
  const [disponivel, setDisponivel] = useState(0);
  const [proporcao, setProporcao] = useState<number | null>(null);
  const ehMobile = useEhMobile();
  // mesma conta do `CallStage` (lá está o porquê de o celular ficar de fora):
  // os dois precisam concordar no mesmo quadro, ou o palco se promove sem a
  // conversa sair da frente — ou o contrário
  const expandido = useUI((s) => s.palcoExpandido) && !ehMobile;
  const chave = ehMobile ? CHAVE_PROPORCAO_MOBILE : CHAVE_PROPORCAO;
  const ehMobileRef = useRef(ehMobile);
  ehMobileRef.current = ehMobile;
  const chaveRef = useRef(chave);
  chaveRef.current = chave;

  // alguém transmitindo pede palco maior — mas só decide a proporção INICIAL:
  // quem já arrastou o divisor mandou, e ligar uma transmissão não pode
  // desfazer a escolha da pessoa
  const transmitindo = useVoice((s) => {
    const id = s.channelId;
    return !!id && (s.states[id] ?? []).some((e) => e.screen);
  });
  const transmitindoRef = useRef(transmitindo);
  transmitindoRef.current = transmitindo;

  // a coluna muda de tamanho com a janela, com o abrir/fechar de painéis e no
  // zoom do navegador: medir só na montagem era o que congelava o palco no
  // tamanho da primeira renderização
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entrada]) => setDisponivel(entrada.contentRect.height));
    ro.observe(el);
    setDisponivel(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // a preferência só existe no browser: decidir depois da primeira medição
  // evita que o HTML do servidor e o da hidratação discordem
  useEffect(() => {
    if (proporcao !== null || disponivel <= 0) return;
    setProporcao(
      lerProporcao(chaveRef.current) ??
        // a chave em pixel é do desktop e sempre foi: no celular ela não migra
        (ehMobileRef.current ? null : migrarAlturaAntiga(disponivel)) ??
        (transmitindoRef.current
          ? PROPORCAO_TRANSMISSAO
          : ehMobileRef.current
            ? PROPORCAO_PADRAO_MOBILE
            : proporcaoPadrao(disponivel)),
    );
  }, [disponivel, proporcao]);

  const disponivelRef = useRef(disponivel);
  disponivelRef.current = disponivel;

  const altura =
    disponivel > 0 && proporcao !== null
      ? alturaDoPalco(proporcao, disponivel)
      : ALTURA_ANTES_DE_MEDIR;

  /** Grava a nova altura como fração da coluna — é isso que viaja entre telas. */
  const aplicarAltura = useCallback((px: number, persistir: boolean) => {
    const total = disponivelRef.current;
    if (total <= 0) return;
    const nova = alturaDoPalco(px / total, total) / total;
    setProporcao(nova);
    if (persistir) guardar(chaveRef.current, nova.toFixed(4));
  }, []);

  const comecarArraste = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const topo = raiz.current?.getBoundingClientRect().top ?? 0;
      const mover = (ev: PointerEvent) => aplicarAltura(ev.clientY - topo, false);
      const soltar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        document.body.style.cursor = "";
        aplicarAltura(ev.clientY - topo, true);
      };
      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [aplicarAltura],
  );

  const pelasTeclas = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const delta = e.key === "ArrowUp" ? -PASSO_TECLADO : e.key === "ArrowDown" ? PASSO_TECLADO : 0;
      if (delta === 0) return;
      e.preventDefault();
      aplicarAltura(altura + delta, true);
    },
    [altura, aplicarAltura],
  );

  return (
    <div ref={raiz} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background-base-lower">
      {/* as duas medidas e o porquê de cada uma estão em `involucroDoPalco` */}
      <div {...involucroDoPalco(expandido, altura, disponivel)}>{chamada}</div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar a chamada"
        aria-valuenow={Math.round(altura)}
        aria-valuemin={ALTURA_MIN}
        aria-valuemax={Math.round(tetoDoPalco(disponivel || ALTURA_ANTES_DE_MEDIR))}
        tabIndex={0}
        onPointerDown={comecarArraste}
        onKeyDown={pelasTeclas}
        // A linha desenhada continua com 1px; o que muda no telefone é a **área
        // de pega**: `border-y-2` dá 5px de alvo, e 5px não se acerta com o
        // dedo — o divisor existia e não era arrastável. O `bg-clip-content`
        // mantém a borda transparente, então nada disso aparece na tela.
        className={`h-px shrink-0 cursor-row-resize border-transparent bg-border-subtle bg-clip-content transition-colors hover:bg-brand-500 focus-visible:bg-brand-500 focus-visible:outline-none ${
          ehMobile ? PEGA_TOQUE : "border-y-2"
        } ${expandido ? "hidden" : ""}`}
      />

      {/* `hidden` no lugar de `flex`, e não os dois na mesma classe: as duas
          declaram `display`, e qual vence sairia da ordem do CSS gerado, não
          da ordem em que estão escritas aqui. */}
      <div className={expandido ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}>{chat}</div>
    </div>
  );
}

/** Canal de voz: palco à esquerda, conversa numa coluna de 450 à direita. */
function DivisaoHorizontal({
  chamada,
  chat,
  titulo,
  onFecharChat,
}: {
  chamada: ReactNode;
  chat: ReactNode;
  titulo: string;
  onFecharChat: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [disponivel, setDisponivel] = useState(0);
  const [desejada, setDesejada] = useState<number | null>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entrada]) => setDisponivel(entrada.contentRect.width));
    ro.observe(el);
    setDisponivel(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (desejada !== null) return;
    setDesejada(lerLargura() ?? LARGURA_PADRAO);
  }, [desejada]);

  const disponivelRef = useRef(disponivel);
  disponivelRef.current = disponivel;

  const largura = larguraDoChat(desejada ?? LARGURA_PADRAO, disponivel);

  const aplicar = useCallback((px: number, persistir: boolean) => {
    const nova = larguraDoChat(px, disponivelRef.current);
    setDesejada(nova);
    if (persistir) guardar(CHAVE_LARGURA, String(Math.round(nova)));
  }, []);

  const comecarArraste = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const direita = raiz.current?.getBoundingClientRect().right ?? 0;
      const mover = (ev: PointerEvent) => aplicar(direita - ev.clientX, false);
      const soltar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        document.body.style.cursor = "";
        aplicar(direita - ev.clientX, true);
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [aplicar],
  );

  const pelasTeclas = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      // seta para a esquerda alarga a conversa: ela cresce **para** a esquerda
      const delta =
        e.key === "ArrowLeft" ? PASSO_TECLADO : e.key === "ArrowRight" ? -PASSO_TECLADO : 0;
      if (delta === 0) return;
      e.preventDefault();
      aplicar(largura + delta, true);
    },
    [largura, aplicar],
  );

  return (
    <div ref={raiz} className="flex min-h-0 min-w-0 flex-1 bg-background-base-lower">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{chamada}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar a conversa"
        aria-valuenow={Math.round(largura)}
        aria-valuemin={LARGURA_MIN}
        aria-valuemax={Math.round(tetoDoChat(disponivel || LARGURA_PADRAO * 3))}
        tabIndex={0}
        onPointerDown={comecarArraste}
        onKeyDown={pelasTeclas}
        className="w-px shrink-0 cursor-col-resize border-x-2 border-transparent bg-border-subtle bg-clip-content transition-colors hover:bg-brand-500 focus-visible:bg-brand-500 focus-visible:outline-none"
      />

      <PainelDeChatDaCall titulo={titulo} largura={largura} onFechar={onFecharChat}>
        {chat}
      </PainelDeChatDaCall>
    </div>
  );
}
