"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HeaderIcon } from "@/components/chat/HeaderBar";
import { Popout, TextInput } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";

/**
 * Botão da toolbar do cabeçalho que abre um painel ancorado abaixo dele —
 * o padrão das fixadas, das threads e da caixa de entrada no Discord.
 *
 * A mecânica é do `Popout` (`components/ui/primitivos/Popout.tsx`): portal
 * preso à janela, colisão com a borda, Esc, clique fora, foco preso e
 * devolvido, folha inferior no celular e a entrada animada. O que fica aqui é
 * o que é só deste painel:
 *
 * - **Alinhado pela direita do botão** (`alinhamento="end"`), espelhando para
 *   a esquerda quando não cabe — a conta de espelho agora é a do `Popout`. No
 *   print 1:1 da caixa de entrada (`Captura de tela 2026-09-01 113500.png`) o
 *   glifo do ícone ocupa x 1098–1113 (centro 1105,5) e a caixa termina em
 *   x=1117: a borda direita da caixa é a de um botão de 24 centrado no glifo.
 *   O `HeaderIcon` passou a ter a caixa de 32 do `.iconWrapper__9293f` (cartão
 *   cabecalho-do-canal), então **no cabeçalho do canal** o painel termina 4px
 *   mais à direita do que antes — é a borda do botão de verdade do Discord
 *   (nenhum print mede painel de fixadas/threads, fica "não medido"). Na barra
 *   de título, onde o print acima vale, a caixa de 24 volta com `botaoCompacto`.
 * - **Altura fixa** (600, ou 466 na caixa de entrada — a do mesmo print, caixa
 *   de y=37 a y=502), limitada pelo espaço abaixo do botão. Com `max-h` o
 *   painel mudava de tamanho a cada item que chegava; no Discord ele tem
 *   sempre a mesma caixa e é o conteúdo que rola dentro. O teto é calculado
 *   do botão, e não mais um `100vh - 80px` fixo: o `Popout` troca de lado
 *   quando a caixa não cabe embaixo, e numa janela baixa um painel de 600
 *   iria parar ao lado do ícone.
 * - **Sem caret.** A setinha que ligava o painel ao ícone saiu: no mesmo
 *   print a coluna x=1105 vai da barra de título (#121214, y 25–32) direto
 *   para a sombra e a borda da caixa (y 33–36), sem triângulo.
 * - **Fundo** é o do `Popout`, `--background-surface-high`: o print mede
 *   #242429 no miolo da caixa (x=900 y=200 e x=700 y=450), que é esse token, e
 *   não o `--background-surface-higher` (#28282d) que este arquivo usava.
 *
 * `onOpen` é onde o conteúdo carrega, para a lista só ir ao servidor quando
 * alguém realmente abre o painel.
 */

/**
 * Distância entre o botão e o painel. Coerente com o print (glifo termina em
 * y=24, a borda da caixa está em y=36), mas o tamanho do botão âncora do
 * Discord não foi medido, então o 8 é "não medido" — é o mesmo padrão do
 * `Popout`.
 */
const FOLGA = 8;
/** Margem até a borda da janela: a mesma do `Popout` (8, não medida). */
const BORDA = 8;
/**
 * A folha do celular do `Popout` tem teto de 85dvh e uma alça de 28px por
 * cima do conteúdo; o painel desconta os dois para só o corpo rolar, e não a
 * folha inteira (o cabeçalho com a busca subiria junto).
 */
const TETO_NA_FOLHA = "calc(85dvh - 28px)";

/**
 * Um clique no menu de contexto aberto de dentro do painel (o seletor
 * "Threads Ativas ▾", o menu de um item) não é clique fora. O `ContextMenu`
 * ainda não entra na pilha de camadas do `Popout`, então sem isto escolher
 * "Threads Arquivadas" fechava o painel que devia mostrar a lista trocada.
 */
function ehMenuDeContexto(alvo: Element): boolean {
  return alvo.closest('[role="menu"]') !== null;
}

export default function HeaderPopover({
  label,
  icon,
  badge,
  title,
  tituloControle,
  contagem,
  action,
  busca,
  largura = 420,
  altura = 600,
  distancia = FOLGA,
  cabecalho,
  botaoCompacto = false,
  corpoClassName = "p-2",
  evento,
  modoTela = false,
  onOpen,
  children,
}: {
  label: string;
  icon: ReactNode;
  /**
   * Selo desenhado por cima do canto do botão (o badge de não lidas da caixa
   * de entrada). Fica **fora** do `HeaderIcon` porque este é o botão de toda a
   * toolbar, e o selo é assunto de um painel só; a âncora é a caixa `relative`
   * que já envolve o botão.
   */
  badge?: ReactNode;
  /** título do painel — vira o rótulo acessível quando há `tituloControle`. */
  title: string;
  /** substitui o título escrito (o seletor "Threads Ativas ▾"). */
  tituloControle?: (fechar: () => void) => ReactNode;
  /** número ao lado do título (fixadas, threads). */
  contagem?: number;
  /** botão à direita do título (ex.: "marcar tudo como lido"). */
  action?: ReactNode;
  /** campo de busca do cabeçalho do painel. */
  busca?: { valor: string; aoMudar: (valor: string) => void; placeholder: string };
  largura?: number;
  /** altura fixa do painel (600 nas fixadas e threads; 466 na caixa de entrada). */
  altura?: number;
  /**
   * Distância entre o botão e o painel — o padrão é o `FOLGA` de sempre (8,
   * não medido). A caixa de entrada da barra de título passa 0: no print 1:1
   * (`Captura de tela 2026-09-02 152351.png`) o painel começa em y=36 com o
   * ícone saindo em y≈31 da barra de título, sem folga nenhuma; com o FOLGA
   * padrão o nosso painel nascia 8px mais baixo que o Discord (y=44), embora
   * largura, altura, abas e sublinhado batessem pixel a pixel com o resto do
   * mesmo print.
   */
  distancia?: number;
  /**
   * **Slot do cabeçalho.** Substitui o cabeçalho padrão inteiro — a linha de
   * título (ícone + título + contagem + `action`) **e** o campo de `busca`, que
   * mora dentro dele — pelo que o chamador desenhar: a caixa de entrada tem
   * controles e abas próprios, e o painel de Threads monta o dele.
   *
   * Aceita um nó pronto ou uma função que recebe o `fechar` (para um × ou um
   * item que fecha o painel). O resto do painel não muda com o slot:
   * - **foco ao abrir** (desktop): o efeito abaixo procura `[data-autofocus]`
   *   em toda a moldura, slot incluído — um cabeçalho próprio com busca põe o
   *   atributo no campo dele e o foco cai lá; sem nenhum, o foco vai para a
   *   caixa do `Popout`, como no padrão;
   * - **fechar**: Esc, clique fora e o clique no botão continuam do `Popout`
   *   e deste componente; a função recebe o mesmo `fechar` do corpo;
   * - **altura e rolagem**: o slot é `shrink-0` por conta de quem desenha (o
   *   corpo é que rola); a borda de baixo do padrão não vem junto.
   */
  cabecalho?: ReactNode | ((fechar: () => void) => ReactNode);
  /**
   * Botão na caixa de 24 (`HeaderIcon compacto`) em vez da de 32 — a barra de
   * título do desktop, onde o print `113500` mede o painel pela caixa de 24.
   */
  botaoCompacto?: boolean;
  /** classes do corpo rolável; o padrão é o `p-2` das listas de cartões. */
  corpoClassName?: string;
  /** nome de um evento no `window` que abre o painel (o atalho Ctrl+I). */
  evento?: string;
  /**
   * **Painel sem popover**: sem botão, sempre aberto, preenchendo o pai.
   *
   * É o que a aba "Notificações" do celular usa. Lá a caixa de entrada é uma
   * *tela*, não uma caixa pendurada num ícone de cabeçalho — e o cabeçalho de
   * ferramentas onde esse ícone mora não existe no leiaute de abas. Sem este
   * modo, o mesmo conteúdo teria de ser recriado no `components/mobile/`, com
   * duas listas de menções para manter em sincronia.
   *
   * Aqui não há foco preso, Esc nem clique-fora: nada disso faz sentido numa
   * tela que não cobre outra.
   */
  modoTela?: boolean;
  onOpen?: () => void;
  /** recebe o fechador para que um item da lista possa fechar o painel. */
  children: (fechar: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** espaço abaixo do botão, medido ao abrir e a cada resize. */
  const [alturaMaxima, setAlturaMaxima] = useState<number | undefined>(undefined);
  const ancoraRef = useRef<HTMLDivElement>(null);
  const molduraRef = useRef<HTMLDivElement>(null);
  const ehMobile = useEhMobile();

  const fechar = useCallback(() => setOpen(false), []);

  const medirAlturaMaxima = useCallback(() => {
    const r = ancoraRef.current?.getBoundingClientRect();
    // `floor`: o `Popout` compara com a altura em px inteiros (`offsetHeight`),
    // e meio pixel arredondado para cima já contaria como "não cabe embaixo".
    // `distancia`, não o `FOLGA` fixo: o teto tem que descontar o mesmo vão
    // que o `Popout` vai usar de verdade (a caixa de entrada passa 0).
    setAlturaMaxima(r ? Math.max(0, Math.floor(window.innerHeight - r.bottom - distancia - BORDA)) : undefined);
  }, [distancia]);

  // o teto é medido no mesmo evento que abre, e não num efeito depois: o
  // `Popout` escolhe o lado pela altura do primeiro quadro, e um painel que
  // nascesse com 600 numa janela baixa iria para o lado antes de encolher
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const abrir = useCallback(() => {
    medirAlturaMaxima();
    setOpen(true);
    onOpenRef.current?.();
  }, [medirAlturaMaxima]);

  // o atalho abre este painel; o primeiro montado a ouvir fica com o evento
  useEffect(() => {
    if (!evento) return;
    function aoEvento(e: Event) {
      e.stopImmediatePropagation();
      abrir();
    }
    window.addEventListener(evento, aoEvento);
    return () => window.removeEventListener(evento, aoEvento);
  }, [evento, abrir]);

  useEffect(() => {
    if (!open || ehMobile) return;
    window.addEventListener("resize", medirAlturaMaxima);
    return () => window.removeEventListener("resize", medirAlturaMaxima);
  }, [open, ehMobile, medirAlturaMaxima]);

  /*
    Foco ao abrir, no desktop: o campo de busca quando existe; senão a própria
    caixa. O `Popout` cairia no primeiro focável, e nas fixadas esse é o
    "Saltar" de um cartão — um botão que só existe no hover, e que o foco
    faria aparecer. Um quadro depois porque o `Popout` nasce invisível até
    medir a posição, e `focus()` não pega em `visibility: hidden`. Na folha do
    celular fica a regra do `Popout` (foco na alça, sem levantar o teclado).
  */
  useEffect(() => {
    if (!open || ehMobile) return;
    const quadro = requestAnimationFrame(() => {
      const moldura = molduraRef.current;
      if (!moldura) return;
      const alvo =
        moldura.querySelector<HTMLElement>("[data-autofocus]") ??
        moldura.closest<HTMLElement>("[data-popout]");
      alvo?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(quadro);
  }, [open, ehMobile]);

  if (modoTela) return <ComoTela {...{ icon, title, tituloControle, contagem, action, busca, cabecalho, corpoClassName, onOpen, children }} />;

  return (
    <div ref={ancoraRef} className="relative">
      <HeaderIcon
        label={label}
        active={open}
        semTooltip={open}
        compacto={botaoCompacto}
        onClick={() => (open ? fechar() : abrir())}
      >
        {icon}
      </HeaderIcon>
      {badge}

      <Popout
        aberto={open}
        aoFechar={fechar}
        ancora={ancoraRef}
        lado="bottom"
        alinhamento="end"
        distancia={distancia}
        largura={largura}
        rotulo={title}
        focarAoAbrir={ehMobile}
        ehDeDentro={ehMenuDeContexto}
        /*
          `!z-[39]` passa por cima do `zIndex` 90 que o `Popout` põe inline. Com
          90 o painel cobriria as camadas que ele mesmo abre e que ainda não
          entraram na pilha do `Popout`: o `ContextMenu` (z-80) do seletor de
          threads nasceria **atrás** do painel, e o confirm de "Desafixar"
          (`Dialog`, z-50) ficaria por baixo dele. 39 é logo abaixo da camada 40
          (barra de título, chamada recebida, avisos do PWA), que ficava por
          cima do painel antigo, e acima de todo o resto do app (≤ z-30).
        */
        className="!z-[39] overflow-hidden"
        classeNaFolha=""
      >
        {open ? (
          <div
            ref={molduraRef}
            style={{
              height: altura,
              maxHeight: ehMobile ? TETO_NA_FOLHA : alturaMaxima,
            }}
            className="flex flex-col"
          >
            {cabecalho != null && cabecalho !== false ? (
              desenharSlot(cabecalho, fechar)
            ) : (
              <CabecalhoPadrao
                icon={icon}
                title={title}
                tituloControle={tituloControle}
                contagem={contagem}
                action={action}
                busca={busca}
                fechar={fechar}
              />
            )}
            <div className={`min-h-0 flex-1 overflow-y-auto ${corpoClassName}`}>
              {children(fechar)}
            </div>
          </div>
        ) : null}
      </Popout>
    </div>
  );
}

/** O slot `cabecalho` nas duas formas: nó pronto ou função do `fechar`. */
function desenharSlot(cabecalho: ReactNode | ((fechar: () => void) => ReactNode), fechar: () => void): ReactNode {
  return typeof cabecalho === "function" ? cabecalho(fechar) : cabecalho;
}

/**
 * O cabeçalho de fábrica do painel — o mesmo no popover e no `modoTela`.
 *
 * Caixa do `.header__0aee3` (o cabeçalho do popout de fixadas,
 * `css-bruto/sob-demanda/f7dc7e191961bace.css`):
 * `border-bottom:1px solid var(--border-subtle);padding:16px`. Antes era uma
 * linha de 48 (`h-12 px-4`) fechada por `shadow-elevation-low`, que na nossa
 * `fixadas.png` desenhava uma linha **escura** (#19191d em y=92, x=1300) onde o
 * Discord tem uma linha **mais clara** que o fundo (`--border-subtle` #94949c1f
 * sobre #242429 ≈ #313136).
 *
 * Com `busca` (o painel de Threads de fábrica) a linha de título perde os 16 de
 * baixo e o campo leva 16 embaixo, para a borda não colar no campo: "não
 * medido" — nenhum print mostra o painel de threads, e o cartão de Threads deve
 * trocar este cabeçalho pelo slot `cabecalho`.
 */
function CabecalhoPadrao({
  icon,
  title,
  tituloControle,
  contagem,
  action,
  busca,
  fechar,
}: {
  icon: ReactNode;
  title: string;
  tituloControle?: (fechar: () => void) => ReactNode;
  contagem?: number;
  action?: ReactNode;
  busca?: { valor: string; aoMudar: (valor: string) => void; placeholder: string };
  fechar: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-border-subtle">
      <div className={`flex items-center gap-2 ${busca ? "px-4 pt-4" : "p-4"}`}>
        <span aria-hidden="true" className="shrink-0 text-text-subtle">
          {icon}
        </span>
        {tituloControle ? (
          tituloControle(fechar)
        ) : (
          <h2 className="min-w-0 truncate font-semibold text-text-strong">{title}</h2>
        )}
        {contagem !== undefined && contagem > 0 && (
          <span className="shrink-0 rounded-full bg-input-background-default px-1.5 text-xs font-semibold text-text-muted">
            {contagem}
          </span>
        )}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {busca && (
        <div className="px-4 pb-4 pt-2">
          {/* `sm` (32) é o tamanho do campo de busca de lista do Discord
              (`.searchBar_c322aa`, ver o cabeçalho do `TextInput`); o campo
              antigo tinha 28, que não saiu de medida nenhuma */}
          <TextInput
            tamanho="sm"
            data-autofocus
            value={busca.valor}
            onChange={(e) => busca.aoMudar(e.target.value)}
            type="search"
            aria-label={busca.placeholder}
            placeholder={busca.placeholder}
          />
        </div>
      )}
    </header>
  );
}

/**
 * O mesmo painel, mas como **tela**: sem botão que o abra, sem moldura
 * flutuante e sem largura fixa. Ver `modoTela`.
 */
function ComoTela({
  icon,
  title,
  tituloControle,
  contagem,
  action,
  busca,
  cabecalho,
  corpoClassName,
  onOpen,
  children,
}: {
  icon: ReactNode;
  title: string;
  tituloControle?: (fechar: () => void) => ReactNode;
  contagem?: number;
  action?: ReactNode;
  busca?: { valor: string; aoMudar: (valor: string) => void; placeholder: string };
  cabecalho?: ReactNode | ((fechar: () => void) => ReactNode);
  corpoClassName: string;
  onOpen?: () => void;
  children: (fechar: () => void) => ReactNode;
}) {
  // no popover a carga é disparada pelo clique que abre; aqui a tela já nasce
  // aberta, e a montagem é o equivalente
  const carregar = useRef(onOpen);
  carregar.current = onOpen;
  useEffect(() => {
    carregar.current?.();
  }, []);

  // nada a fechar: a tela é a aba inteira. Quem quiser sair troca de aba.
  const fechar = useCallback(() => {}, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-base-lowest" role="region" aria-label={title}>
      {cabecalho != null && cabecalho !== false ? (
        desenharSlot(cabecalho, fechar)
      ) : (
        <CabecalhoPadrao
          icon={icon}
          title={title}
          tituloControle={tituloControle}
          contagem={contagem}
          action={action}
          busca={busca}
          fechar={fechar}
        />
      )}
      <div className={`min-h-0 flex-1 overflow-y-auto ${corpoClassName}`}>{children(fechar)}</div>
    </div>
  );
}
