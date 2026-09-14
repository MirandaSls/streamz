"use client";

import {
  Children,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "@/components/ui/icones";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

/**
 * Modal do Discord — a base de todos os modais do app (o `Dialog` de
 * `components/modals/Dialog.tsx` é um invólucro deste, com a API antiga).
 *
 * ## Qual modal do Discord
 *
 * O CSS dele tem duas famílias. A `ModalV2` (`.root__49fc1`, larguras
 * 442/602/800, `--border-normal`) é a que o cabeçalho provisório citava. Os
 * quatro modais que existem nos prints 1:1 — confirmação (`Captura de tela
 * 2026-08-31 124114.png`), "Nova mensagem" (`2026-09-02 152402.png`, a janela
 * canônica de 1919×1079), convite (`2026-09-04 101009.png`) e seletor de tela
 * (`2026-08-31 123946.png`) — **não** são dela: medem 480 e 960 de largura e
 * borda `--border-subtle`, que é a família nova, `.container__8a031` e irmãos
 * em `css-bruto/362698.047b6f205fd7bdc1.css`. Pela ADR-0009 (item 7) o print
 * manda, e o componente segue a `8a031`, com o `.padding-size-sm__8a031`.
 *
 * ## Medidas (print > CSS; cada número com a origem)
 *
 * - **Larguras** (`.size-*__8a031`, borda incluída): `pequeno` 400 (`size-sm`,
 *   altura máx. `min(720px,100%)`), `medio` **480** (`size-md`, altura máx.
 *   `min(800px,100%)`), `grande` 680 (`size-lg`), `enorme` 960 (`size-xl`);
 *   `livre` deixa a largura com o `className`. Padrão `medio`, porque é o que
 *   os prints mostram: borda em x=720/1199 na linha y=500 do 152402, em
 *   x=400/879 (y=350) do 124114 e em x=238/717 do 101009 — 480 nos três. O
 *   seletor de tela do 123946 mede 960. A altura máxima de 800 também saiu do
 *   print: a "Nova mensagem" transborda e para em y=116…915 (coluna x=960).
 *   Nenhum print mostra 400 nem 680 — esses dois vêm só do CSS.
 * - **Raio 12** (`rounded-xl` = `--radius-md`). O `design.md` (#59) tinha
 *   medido 8, e o print desmente: no 152402 a borda chega à cor cheia na linha
 *   de cima em x=732 (720 + 12) e na coluna da esquerda em y=128 (116 + 12); no
 *   124114, em x=412 e y=281 (400/269 + 12). O CSS (`--custom-border-radius:
 *   var(--radius-md)`) concorda, então não sobra divergência.
 * - **Caixa**: fundo `#242429` nos três prints = `--background-surface-high`
 *   (o `.container__8a031`; tem o mesmo valor de `--modal-background`). Borda
 *   de 1px `#323237` = `--border-subtle` (`#94949c1f`) sobre esse fundo; a
 *   `--border-normal` da `ModalV2` daria `#3b3b41`. Sombra `--shadow-high` (do
 *   CSS; o véu escuro não deixa medir no print). Texto herdado
 *   `--text-default`.
 * - **Véu**: `--background-scrim` (`#000000b8`), `fixed inset-0`. Folga de 24
 *   até a borda da janela (`.outerContainer__8a031`, `padding: … var(--space-24)`).
 * - **Ritmo vertical** (`.padding-size-sm__8a031`): a caixa tem 8 em cima e 16
 *   embaixo; cada seção tem 16 em cima, 24 dos lados e 8 embaixo. Aqui isso vira
 *   cabeçalho `pt-6` (8 + 16) e `pb-2`, respiro de 16 antes do corpo
 *   (`.bodySpacerTop__8a031`), 8 depois dele (`.bodySpacerBottom__8a031`), e
 *   rodapé `pt-4` e `pb-6` (8 + 16). Conferido: o topo da versal do título fica
 *   a 29 da borda interna nos três prints (24 + ~5 da entrelinha); o campo de
 *   busca começa 24 abaixo do subtítulo no 152402 e no 101009 (8 + 16); do texto
 *   ao botão são 24 no 124114; do botão à borda de baixo, 24 (124114 y=430–453,
 *   152402 y=891–914).
 * - **Título**: versal de 14px nos três prints (152402 "N" y=146–159, 124114
 *   "V" y=299–312, 101009 "C" y=129–142) → 20px, `heading-lg`. Peso 700: a
 *   haste mede 2,53–2,58px a 20px (0,128 em), contra 1,90px a 16px (0,119 em)
 *   do negrito do markdown (`strong` = `--font-weight-bold`, 700) e 1,25–1,33px
 *   (0,08 em) do regular, os três no mesmo 124114. Cor `#fbfbfb` =
 *   `--text-strong`.
 * - **Subtítulo**: versal de 11px (152402 "G" y=177–187, 101009 "O"
 *   y=160–170) → 16px, `text-md`, regular (haste de 1,25px), cor `#abacb2` =
 *   `--text-subtle` (o `Dialog` antigo usava `--text-muted`, `#96979e`). A
 *   versal dele fica 31px abaixo da do título nos dois prints: 8 entre as
 *   linhas.
 * - **Fechar**: glifo de 16×16 a 20 da borda interna de cima e da direita nos
 *   três prints (152402 x=1163–1178 y=137–152; 124114 x=843–858 y=290–305;
 *   101009 x=681–696 y=120–135), cor `#abacb2`. O `.headerTrailing__8a031`
 *   puxa a ponta direita para 8 da borda (`margin-right: calc((24px - 8px) *
 *   -1)`, `margin-top: -16px`); o `X` de 24 desenha um glifo de 16, então o
 *   ícone começa em 16 e o botão tem 40 — o `md` só-ícone do `Button`
 *   (`.icon-only_a22cb0`: `--control-icon-only-*`, raio 8). Hover e
 *   pressionado vêm do CSS; o print só mostra o repouso.
 * - **Rodapé**: botões `md` de 40 (124114 coluna x=700 y=390–429; 152402
 *   y=851–890), 8 entre eles (124114 linha y=395: "Cancelar" 645–744, vão
 *   745–752, "Confirmar" 753–854; `.actionBarTrailing__8a031{gap: var(--space-8)}`),
 *   24 da direita (855–878). Fundo = o do corpo, sem faixa
 *   (`--modal-footer-background` é igual ao da caixa).
 * - **Separador de rolagem**: quando o corpo transborda, uma linha de 1px
 *   `--border-subtle` de borda a borda separa o corpo do rodapé (152402 y=826,
 *   x=720–1199, e daí 24 até o botão; 101009 y=757); rolado para baixo, outra
 *   aparece sob o cabeçalho (`.bodySpacerTopBorder__8a031`, só CSS — nenhum
 *   print mostra lista rolada).
 * - **Corpo**: 24 dos lados. Com barra de rolagem o lado direito cai para 16
 *   e o sulco da barra (8, `globals.css`) fica reservado — é o
 *   `.has-webkit-scrollbar .bodyInner__8a031{padding-inline-end: …}` do
 *   Discord, e mantém o conteúdo a 24 da borda com ou sem barra (152402: a
 *   caixa de seleção termina a 24 da borda, 101009: o "Convidar" também, com a
 *   barra à mostra).
 * - **Entrada/saída**: não está no CSS; `anim-overlay` + `anim-modal`.
 *
 * ## Comportamento
 *
 * `role="dialog"` + `aria-modal`, foco inicial no `[data-autofocus]` (ou no que
 * já estiver focado dentro, ou no primeiro focável), Tab preso, Esc e clique
 * no véu fecham, e o foco volta para quem abriu.
 *
 * **Sempre num portal para o `body`**, e isso não é preferência de organização:
 * `position: fixed` se mede pela viewport *só enquanto* nenhum ancestral tiver
 * `transform`, `filter`, `backdrop-filter`, `perspective` ou `contain` — nesse
 * caso o ancestral vira o bloco de contenção e o `inset-0` passa a valer para a
 * caixa dele. Foi o que aconteceu com o seletor de tela, aberto de dentro da
 * barra de controles da chamada (`-translate-x-1/2 backdrop-blur`): o modal
 * nascia ancorado na pílula de controles e saía da tela.
 *
 * **Celular.** Todo modal ocupa a largura da tela (menos a folga) e o teto
 * sobe para `92dvh`: nenhuma largura de desktop cabe num telefone de 390px, e
 * uma regra só vale mais que uma largura por modal (o Discord faz o mesmo
 * abaixo de 485px, `.root__49fc1{width:100%}`). Com `telaCheiaNoCelular` a
 * caixa vira a tela inteira, com barra de 56 e seta de voltar — ver a prop.
 */
export type TamanhoDeModal = "pequeno" | "medio" | "grande" | "enorme" | "livre";

export interface ModalProps {
  aoFechar: () => void;
  /** Título (e nome acessível). Obrigatório mesmo com `ocultarCabecalho`. */
  titulo: ReactNode;
  /** Linha de 16px abaixo do título; vira a descrição acessível do diálogo. */
  subtitulo?: ReactNode;
  /** Padrão `medio` (480, o dos prints). */
  tamanho?: TamanhoDeModal;
  rodape?: ReactNode;
  /**
   * Sem cabeçalho visível (o título continua para leitor de tela): quick
   * switcher, perfil e seletor de tela não têm título escrito no Discord. O
   * corpo passa a ter 16 em volta, e quem quer encostar pede `semPadding`.
   */
  ocultarCabecalho?: boolean;
  /** Padrão `true`. */
  mostrarFechar?: boolean;
  /**
   * Corpo sem padding nenhum: perfil e boas-vindas pintam a caixa inteira
   * (faixa de cor até a borda) e cuidam do próprio respiro. Também tira os
   * respiros e os separadores de rolagem do corpo.
   */
  semPadding?: boolean;
  /** Padrão `true` (`.container__8a031` tem `--shadow-high` sempre). */
  comSombra?: boolean;
  /** Padrão `centro`. `topo` fica a 10% da altura (quick switcher). */
  alinhamento?: "centro" | "topo";
  /**
   * No celular esta caixa vira **tela cheia**, com barra de 56 e seta de voltar.
   *
   * É um interruptor por modal, e não uma regra automática por largura, porque
   * a diferença é de conteúdo e não de aritmética: os modais largos (criar
   * canal, convite, perfil, recorte de imagem, emojis, enquete) são *tarefas* —
   * no Discord do celular ocupam a tela inteira e têm um "voltar". Os pequenos
   * (confirmar, prompt, expulsar, banir, castigo) são *perguntas de uma linha*:
   * viram cartão centrado nas duas plataformas, e esticá-los até 844px de
   * altura só afastaria a pergunta do botão que a responde.
   *
   * Só muda a moldura — o conteúdo de cada modal fica como está.
   */
  telaCheiaNoCelular?: boolean;
  /**
   * Título e subtítulo centrados, como no "Criar um servidor" do Discord:
   * `.headerCentered__8a031{text-align:center}` e
   * `.headerCentered__8a031 .headerSubtitleWrapper__8a031{justify-content:center}`
   * (`css-bruto/362698.047b6f205fd7bdc1.css`).
   *
   * Com o ×, o recuo de 60 vale **dos dois lados**. O Discord monta o
   * cabeçalho com um `.headerLeadingSpacer__8a031` à esquerda, com as mesmas
   * regras do `.headerTrailing__8a031` da direita (o `max-height:0` do
   * centrado só achata a altura dele), e assim o texto fica no centro da
   * caixa e não no centro do espaço que o × deixou. Só vale no cartão; na tela
   * cheia do celular o título é o da barra de 56. Padrão `false`.
   */
  cabecalhoCentralizado?: boolean;
  /**
   * Classe da caixa no desktop (largura livre, altura). No celular é ignorada:
   * lá a largura é sempre a da tela (ver o cabeçalho).
   */
  className?: string;
  /** Classe do elemento que rola (o corpo). */
  classeDoCorpo?: string;
  children?: ReactNode;
}

// `w-full` + teto: a caixa estica até o teto e encolhe com a janela, como o
// `width:100%` + `max-width` do `.container__8a031`.
const LARGURA: Record<TamanhoDeModal, string> = {
  pequeno: "w-full max-w-[400px]",
  medio: "w-full max-w-[480px]",
  grande: "w-full max-w-[680px]",
  enorme: "w-full max-w-[960px]",
  livre: "max-w-full",
};

// `.size-sm/.size-md__8a031` têm teto próprio; os maiores só o da janela
// (`.maxHeightViewport__8a031{max-height:100%}`). O 100% é a área do véu menos
// a folga de 24.
const ALTURA_MAXIMA: Record<TamanhoDeModal, string> = {
  pequeno: "max-h-[min(720px,100%)]",
  medio: "max-h-[min(800px,100%)]",
  grande: "max-h-full",
  enorme: "max-h-full",
  livre: "max-h-full",
};

const FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// `useLayoutEffect` avisa na pré-renderização (a web é exportada estática);
// lá não há o que medir, então o efeito comum basta.
const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Onde o corpo está na rolagem: dá para rolar para cima (`rolado`) e ainda há
 * conteúdo abaixo (`maisAbaixo`). Acompanha rolagem, mudança de tamanho da
 * caixa e mudança de conteúdo — a lista que chega depois do primeiro quadro
 * (amigos, convites) também precisa acender o separador.
 */
function usePosicaoDaRolagem(ligado: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [rolado, setRolado] = useState(false);
  const [maisAbaixo, setMaisAbaixo] = useState(false);

  useEfeitoDeLeiaute(() => {
    const el = ref.current;
    if (!ligado || !el) return;
    const medir = () => {
      setRolado(el.scrollTop > 0);
      // 1px de tolerância: com zoom fracionário o `scrollTop` não chega ao
      // inteiro e o separador ficaria aceso com a lista já no fim
      setMaisAbaixo(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const tamanho = new ResizeObserver(medir);
    tamanho.observe(el);
    const conteudo = new MutationObserver(medir);
    conteudo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener("scroll", medir);
      tamanho.disconnect();
      conteudo.disconnect();
    };
  }, [ligado]);

  return { ref, rolado, maisAbaixo };
}

export function Modal({
  aoFechar,
  titulo,
  subtitulo,
  tamanho = "medio",
  rodape,
  ocultarCabecalho = false,
  mostrarFechar = true,
  semPadding = false,
  comSombra = true,
  alinhamento = "centro",
  telaCheiaNoCelular = false,
  cabecalhoCentralizado = false,
  className = "",
  classeDoCorpo = "",
  children,
}: ModalProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  const ehMobile = useEhMobile();
  /** tela cheia mesmo: sem véu à volta, com barra de voltar e áreas seguras. */
  const cheio = ehMobile && telaCheiaNoCelular;
  const idTitulo = useId();
  const idSubtitulo = useId();
  // `document` não existe na pré-renderização; o portal só pode ser criado
  // depois de montar no cliente (a web é exportada estática para o desktop).
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  /*
    O "voltar" do Android fecha **qualquer** modal do celular, e não só a tela
    cheia. O cartão centrado saía pelo × e pelo toque no véu; o voltar, que é o
    gesto mais usado do aparelho, atravessava a caixa e ia desfazer a camada de
    baixo — a conversa fechava com o "Criar um servidor" ainda no ar. A regra do
    celular é uma só: sai primeiro o que está por cima.
  */
  useVoltarNoCelular(ehMobile && montado, aoFechar);

  useEffect(() => {
    if (!montado) return;
    const anterior = document.activeElement as HTMLElement | null;
    const painel = painelRef.current;
    // `data-autofocus` deixa o modal escolher o alvo (ex.: um confirm
    // destrutivo abre com o foco em "Cancelar", não no botão que apaga). Sem
    // ele, um `autoFocus` do conteúdo já focou o campo durante a montagem, e
    // roubar esse foco para o × desfaria a escolha de quem escreveu o modal.
    const jaDentro =
      painel && document.activeElement && painel.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
    const alvo =
      painel?.querySelector<HTMLElement>("[data-autofocus]") ??
      jaDentro ??
      painel?.querySelector<HTMLElement>(FOCAVEL) ??
      painel;
    alvo?.focus();
    // devolve o foco para o botão que abriu o modal
    return () => anterior?.focus?.();
    // depende de `montado` porque na primeira passada o painel ainda não existe
  }, [montado]);

  // sem corpo (um confirm sem prévia) o subtítulo encosta direto no rodapé;
  // `toArray` descarta `false`/`null` que um `{cond && ...}` deixa para trás
  const temCorpo = Children.toArray(children).length > 0;
  const temRodape = rodape != null && rodape !== false;
  /** o ritmo do Discord (respiros e separadores) só vale na moldura completa. */
  const ritmoDoDiscord = !cheio && !ocultarCabecalho && !semPadding;
  const rolagem = usePosicaoDaRolagem(montado && temCorpo && ritmoDoDiscord);

  function aoTeclar(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      aoFechar();
      return;
    }
    if (event.key !== "Tab") return;
    const nos = Array.from(painelRef.current?.querySelectorAll<HTMLElement>(FOCAVEL) ?? []).filter(
      (no) => no.offsetParent !== null,
    );
    if (nos.length === 0) return;
    const primeiro = nos[0];
    const ultimo = nos[nos.length - 1];
    if (event.shiftKey && document.activeElement === primeiro) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primeiro.focus();
    }
  }

  if (!montado) return null;

  return createPortal(
    <div
      className={`anim-overlay fixed inset-0 z-50 flex bg-background-scrim ${
        cheio
          ? // sem folga: a caixa É a tela
            "items-stretch"
          : `justify-center ${alinhamento === "topo" ? "items-start" : "items-center"} ${
              ehMobile
                ? // as áreas seguras entram como folga: o topo do modal não pode
                  // cair atrás do entalhe nem o rodapé atrás da barra de gestos
                  "px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-[calc(env(safe-area-inset-top)+8px)]"
                : alinhamento === "topo"
                  ? "p-6 pt-[10vh]"
                  : "p-6"
            }`
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={subtitulo ? idSubtitulo : undefined}
        tabIndex={-1}
        onKeyDown={aoTeclar}
        /* `max-w-full` NÃO entra aqui: ele e o `max-w-[…]` do tamanho são a
           mesma propriedade, e quem vence é a ordem no CSS gerado, não a ordem
           no atributo — com os dois juntos a caixa esticava para a janela
           inteira (1872px na captura da bancada, contra os 480 medidos no
           print). Cada ramo declara o seu teto. */
        className={`anim-modal relative flex flex-col overflow-hidden bg-background-surface-high text-text-default outline-none ${
          cheio
            ? "h-[100dvh] w-full pt-[env(safe-area-inset-top)]"
            : `rounded-xl border border-border-subtle ${comSombra ? "shadow-shadow-high" : ""} ${
                ehMobile ? "max-h-[92dvh] w-full max-w-full" : `${ALTURA_MAXIMA[tamanho]} ${LARGURA[tamanho]} ${className}`
              }`
        }`}
      >
        {/* cabeçalho fica fora da área rolável: no Discord ele não sobe junto */}
        {cheio ? (
          /* barra de 56 com a seta de voltar à esquerda — o cabeçalho de tela
             do app de celular (`components/mobile/pecas.tsx`), e não o título
             de 20/700 com o × no canto, que é a forma do cartão. Vale também
             para quem pediu `ocultarCabecalho`: sem barra não haveria como sair.
             56 e 44 literais: são as medidas de toque do app de celular, não
             passos da escala. */
          <header className="flex h-[56px] shrink-0 items-center gap-1 border-b border-border-subtle bg-background-base-lowest pl-1 pr-2">
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Voltar"
              className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg text-interactive-icon-default transition-colors active:bg-interactive-background-hover"
            >
              <ArrowLeft size={24} />
            </button>
            <h2 id={idTitulo} className="min-w-0 flex-1 truncate text-text-md font-semibold text-text-strong">
              {titulo}
            </h2>
          </header>
        ) : ocultarCabecalho ? (
          <h2 id={idTitulo} className="sr-only">
            {titulo}
          </h2>
        ) : (
          /* com o ×, o título quebra antes dele: 24 da borda + os 36 que o
             `.headerTrailing__8a031` ocupa (12 de recuo + 40 do botão − 16 de
             margem negativa) = 60 */
          <header
            className={`shrink-0 pt-6 ${mostrarFechar ? "pr-[60px]" : "pr-6"} ${
              cabecalhoCentralizado ? `text-center ${mostrarFechar ? "pl-[60px]" : "pl-6"}` : "pl-6"
            } ${temCorpo || temRodape ? "pb-2" : "pb-6"}`}
          >
            <h2 id={idTitulo} className="text-heading-lg font-bold text-text-strong">
              {titulo}
            </h2>
            {subtitulo ? (
              <p id={idSubtitulo} className="mt-2 text-text-md text-text-subtle">
                {subtitulo}
              </p>
            ) : null}
          </header>
        )}
        {cheio && subtitulo ? (
          <p id={idSubtitulo} className="shrink-0 px-4 pt-4 text-text-md text-text-subtle">
            {subtitulo}
          </p>
        ) : null}
        {mostrarFechar && !cheio ? (
          /*
            40×40 a 8 da borda interna (o ícone de 24 fica a 16 e o glifo a 20,
            como nos prints — ver o cabeçalho). No celular o alvo vai a 44 e o
            glifo **continua 24**: cresce a área, não o desenho (a regra do
            `BotaoDeToque` de `components/mobile/pecas.tsx`), e o recuo cai 2
            para o glifo não sair do lugar. Pesa mais do que na média porque,
            num modal que não vira tela cheia — confirmar, prompt, "quem
            votou" —, este × é o único jeito de sair sem escolher.

            Botão escrito aqui e não o `Button`: o primitivo ainda não tem a
            variante só-ícone (`.icon-only_a22cb0`) — as classes abaixo são as
            dela, token por token.
          */
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className={`absolute z-10 grid place-items-center rounded-lg border border-transparent text-control-icon-only-icon-default transition-colors duration-150 ease-out hover:border-control-icon-only-border-hover hover:bg-control-icon-only-background-hover hover:text-control-icon-only-icon-hover active:border-control-icon-only-border-active active:bg-control-icon-only-background-active active:text-control-icon-only-icon-active ${
              ehMobile ? "right-[6px] top-[6px] h-[44px] w-[44px]" : "right-2 top-2 h-[40px] w-[40px]"
            }`}
          >
            <X size={24} />
          </button>
        ) : null}
        {temCorpo ? (
          ritmoDoDiscord ? (
            /* os respiros ficam FORA do elemento que rola, como os
               `.bodySpacerTop/Bottom__8a031`: o separador marca a borda da
               área de rolagem, e o conteúdo rolado não sobe até o título */
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative h-4 shrink-0">
                {rolagem.rolado ? (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-border-subtle" />
                ) : null}
              </div>
              <div
                ref={rolagem.ref}
                className={`min-h-0 flex-1 overflow-y-auto ${
                  ehMobile ? "px-6" : "pl-6 pr-4 [scrollbar-gutter:stable]"
                } ${classeDoCorpo}`}
              >
                {children}
              </div>
              {/* 8 antes do rodapé, ou 24 sem rodapé (8 + os 16 da caixa) */}
              <div className={`relative shrink-0 ${temRodape ? "h-2" : "h-6"}`}>
                {rolagem.maisAbaixo ? (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-px h-px bg-border-subtle" />
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className={`min-h-0 flex-1 overflow-y-auto ${
                cheio ? `overscroll-contain ${semPadding ? "" : "p-4"}` : semPadding ? "" : "p-4"
              } ${classeDoCorpo}`}
            >
              {children}
            </div>
          )
        ) : null}
        {temRodape ? (
          /*
            `flex-row-reverse`: o primeiro filho (o primário) fica na ponta
            direita, que é a ordem que os 29 modais já escrevem.

            `[&>button]:min-h-[44px]` no celular pega também os rodapés que não
            usam `PrimaryButton`/`SecondaryButton` — "Nova mensagem" e as
            configurações do link de convite escrevem o próprio botão. Um
            fragmento não cria nó, então o `>` continua alcançando os filhos de
            um `<>…</>`.
          */
          <div
            className={`flex shrink-0 flex-row-reverse items-center gap-2 ${ehMobile ? "[&>button]:min-h-[44px]" : ""} ${
              cheio
                ? // rodapé colado no fim da tela, acima da barra de gestos, com
                  // os botões esticados: é onde o polegar está
                  "border-t border-border-subtle px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 [&>button]:flex-1"
                : `px-6 pb-6 ${
                    temCorpo
                      ? // no ritmo do Discord o respiro de 8 do corpo + 16 = 24;
                        // fora dele (corpo de 16 ou sem padding) os 8 de antes
                        ritmoDoDiscord
                        ? "pt-4"
                        : "pt-2"
                      : // sem corpo: 8 do cabeçalho + 16 = 24, como no 124114
                        ocultarCabecalho
                        ? "pt-6"
                        : "pt-4"
                  }`
            }`}
          >
            {rodape}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
