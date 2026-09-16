"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight } from "@/components/ui/icones";
import { Divider } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";
import { isReacoes, isSlider, isSubmenu, useUI, type MenuItem } from "@/stores/ui";

/**
 * Barra arrastável dentro do menu (o volume de um participante).
 *
 * O menu não fecha ao mexer: arrastar é um ajuste contínuo, e fechar a cada
 * movimento tornaria impossível ouvir o resultado enquanto se regula.
 */
function ItemDeslizante({ item }: { item: Extract<MenuItem, { slider: object }> }) {
  const { min, max, step, onChange, format } = item.slider;
  // estado local: os itens do menu são montados uma vez, então o `value` da
  // definição está congelado no momento em que o menu abriu — sem isso a barra
  // não andaria enquanto o mouse arrasta
  const [value, setValue] = useState(item.slider.value);
  return (
    <div
      className="px-2 py-1.5"
      // o menu-pai fecha no mousedown de fora; aqui o arraste é "dentro"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-text-subtle">
        <span className="flex items-center gap-2">
          {item.icon ? <span className="shrink-0 opacity-80">{item.icon as ReactNode}</span> : null}
          {item.label}
        </span>
        <span className="tabular-nums text-text-muted">
          {format ? format(value) : String(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        aria-label={item.label}
        onChange={(e) => {
          const v = Number(e.target.value);
          setValue(v);
          onChange(v);
        }}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-brand-500"
      />
    </div>
  );
}

/**
 * Largura dos menus do Discord, medida nos prints: 220 no menu do servidor
 * (`124207`, x=116..335) e 222 no menu de mensagem (`124022`, x=992..1213),
 * borda de 1px incluída. Antes eram duas larguras (188 e 220); os dois prints
 * dizem que é uma só.
 */
export const MENU_WIDTH = 220;
/** Mesma largura: fica exportado porque os chamadores ainda distinguem os dois. */
export const MENU_WIDTH_WIDE = MENU_WIDTH;

const EDGE = 8;
/**
 * O submenu abre depois de uma pausa: passar o mouse por cima a caminho de
 * outro item não dispara. Exportado porque os menus de áudio do rodapé
 * (`components/voice/menus-de-audio.tsx`) abrem no hover com a mesma pausa —
 * dois tempos diferentes para o mesmo gesto seriam sentidos como um defeito.
 */
export const SUBMENU_DELAY = 120;

export interface Colocacao {
  x: number;
  y: number;
  /** origem da animação, para o menu crescer a partir do ponto de ancoragem. */
  origem: string;
}

/**
 * Coloca a caixa dentro da janela **invertendo** o lado quando não couber, em
 * vez de só empurrar: perto da borda de baixo, empurrar faria o menu cobrir o
 * próprio cursor. `alternativoX` é para onde o menu vai quando espelha — o
 * cursor no caso do menu raiz, a borda esquerda do item no caso de um submenu.
 *
 * Exportada: os menus de áudio do rodapé abrem submenu ao lado e precisam da
 * mesma regra de espelhar na borda da janela.
 */
export function colocar(
  x: number,
  y: number,
  largura: number,
  altura: number,
  alternativoX: number,
): Colocacao {
  let espelhaX = false;
  let espelhaY = false;
  let px = x;
  let py = y;

  if (px + largura > window.innerWidth - EDGE) {
    px = alternativoX - largura;
    espelhaX = true;
    if (px < EDGE) px = Math.max(EDGE, window.innerWidth - largura - EDGE);
  }
  if (py + altura > window.innerHeight - EDGE) {
    py = y - altura;
    espelhaY = true;
    if (py < EDGE) py = Math.max(EDGE, window.innerHeight - altura - EDGE);
  }
  return {
    x: Math.max(EDGE, px),
    y: Math.max(EDGE, py),
    origem: `${espelhaX ? "right" : "left"} ${espelhaY ? "bottom" : "top"}`,
  };
}

/** Índice do próximo item selecionável na direção dada (dá a volta). */
function proximo(items: MenuItem[], de: number, passo: number): number {
  for (let i = 1; i <= items.length; i++) {
    const idx = (de + passo * i + items.length * 2) % items.length;
    const item = items[idx];
    // separador, barra deslizante e fileira de reações não são alvos de seta:
    // a fileira anda com Tab, que é como se percorre um grupo horizontal
    if ("separator" in item || isSlider(item) || isReacoes(item)) continue;
    if (!item.disabled) return idx;
  }
  return de;
}

/**
 * A fileira de reações rápidas do topo do menu.
 *
 * Botão quadrado, sem rótulo e sem o hover de accent dos itens de texto: aqui o
 * realce precisa deixar o emoji visível, e um fundo limão embaixo de um emoji
 * colorido tira a legibilidade dos dois.
 */
function FileiraDeReacoes({
  item,
  onClose,
  cedoDemais = () => false,
}: {
  item: Extract<MenuItem, { reacoes: unknown[] }>;
  onClose: () => void;
  /** carência do primeiro toque da folha — ver `nascidaEm` no `Painel`. */
  cedoDemais?: () => boolean;
}) {
  return (
    <div role="group" aria-label="Reações rápidas" className="mb-1 flex items-center gap-1 px-1 py-1">
      {item.reacoes.map((r) => (
        <button
          key={r.chave}
          type="button"
          role="menuitem"
          aria-label={`Reagir com ${r.rotulo}`}
          onClick={() => {
            if (cedoDemais()) return;
            onClose();
            r.onSelect();
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[3px] outline-none transition hover:bg-interactive-background-hover focus-visible:bg-interactive-background-hover"
        >
          {r.nodo as React.ReactNode}
        </button>
      ))}
    </div>
  );
}

function Painel({
  items,
  largura,
  x,
  y,
  alternativoX,
  onClose,
  autoFoco,
  folha = false,
}: {
  items: MenuItem[];
  largura: number;
  x: number;
  y: number;
  alternativoX: number;
  onClose: () => void;
  autoFoco: boolean;
  /**
   * **Folha inferior** em vez de caixa ancorada — o menu no celular.
   *
   * Um menu de contexto nasce onde o ponteiro está porque o ponteiro é preciso
   * e a mão não cobre nada. No telefone as duas coisas são falsas: o menu
   * nasceria embaixo do dedo que o abriu, e uma caixa de 220px no meio da tela
   * fica longe do polegar. As duas plataformas resolvem igual — a lista sobe do
   * fundo, na largura inteira. O conteúdo (itens, ícones, permissões) é
   * exatamente o mesmo; muda a moldura.
   */
  folha?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState<Colocacao | null>(null);
  const [foco, setFoco] = useState<number>(-1);
  const [aberto, setAberto] = useState<number | null>(null);
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /**
   * Quando esta folha nasceu — a **carência do primeiro toque**.
   *
   * O toque longo abre a folha com o dedo ainda na tela, e a folha nasce
   * debaixo dele: ao soltar, o `click` cai no item que por acaso ficou naquele
   * ponto. Medido: segurar uma mensagem abria a folha e disparava "Criar
   * Tópico" sozinho. Onde o ponto do dedo cai no véu, o efeito é o oposto e
   * igualmente ruim — a folha fecha no mesmo gesto que a abriu.
   *
   * 400ms é a folga entre os 450ms do toque longo e um segundo toque de
   * verdade. Vale só na folha: no desktop o menu nasce do `mouseup` do botão
   * direito, e não há dedo em cena.
   *
   * **O carimbo é renovado a cada menu, e não só na montagem.** `openContextMenu`
   * *troca* o menu da store em vez de passar por `null` (ver `stores/ui.ts`), e
   * um item que abre outro menu faz `onClose()` seguido de `openContextMenu()`
   * no mesmo manipulador — o React junta os dois numa renderização só, o
   * `Painel` não desmonta e o `useRef` guardaria a hora do menu *anterior*. Com
   * o carimbo velho a carência já teria vencido e a folha nova nasceria
   * desprotegida: era o toque que atravessa de volta, pelo caminho do kebab do
   * cartão de perfil. Renovar no efeito que já mede a posição custa uma linha e
   * vale para os dois casos, o de montar e o de reaproveitar.
   */
  const nascidaEm = useRef(Date.now());
  const cedoDemais = () => folha && Date.now() - nascidaEm.current < 400;

  useLayoutEffect(() => {
    nascidaEm.current = Date.now();
    const h = ref.current?.offsetHeight ?? 0;
    setPos(colocar(x, y, largura, h, alternativoX));
  }, [x, y, largura, alternativoX, items]);

  useEffect(() => {
    if (!autoFoco) return;
    const primeiro = proximo(items, -1, 1);
    setFoco(primeiro);
  }, [autoFoco, items]);

  useEffect(() => {
    if (foco >= 0) botoes.current[foco]?.focus();
  }, [foco]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const agendarSubmenu = useCallback((i: number, el: HTMLElement, temFilho: boolean) => {
    window.clearTimeout(timer.current);
    if (!temFilho) {
      timer.current = window.setTimeout(() => setAberto(null), SUBMENU_DELAY);
      return;
    }
    const r = el.getBoundingClientRect();
    timer.current = window.setTimeout(() => {
      setAncora(r);
      setAberto(i);
    }, SUBMENU_DELAY);
  }, []);

  function aoTeclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setFoco((f) => proximo(items, f, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      setFoco(proximo(items, e.key === "Home" ? -1 : 0, e.key === "Home" ? 1 : -1));
    } else if (e.key === "ArrowRight") {
      const item = items[foco];
      if (item && isSubmenu(item) && !item.disabled) {
        e.preventDefault();
        e.stopPropagation();
        const el = botoes.current[foco];
        if (el) setAncora(el.getBoundingClientRect());
        setAberto(foco);
      }
    } else if (e.key === "ArrowLeft") {
      if (aberto !== null) {
        e.preventDefault();
        e.stopPropagation();
        setAberto(null);
        botoes.current[foco]?.focus();
      }
    }
  }

  return (
    <>
      {folha && (
        /*
          O véu é o alvo de "fechar" mais fácil do telefone: tudo que não é a
          folha. **Ele fecha por conta própria**, e isso não é redundância com o
          `mousedown` de fora do `ContextMenuHost`: o véu mora *dentro* da raiz
          que aquele ouvinte usa como "dentro do menu", e cobre a tela inteira —
          ou seja, sem este `onMouseDown` nenhum toque na tela era "fora", e a
          folha só saía pelo Esc (que num telefone não existe) ou escolhendo um
          item. Era o defeito de "abri o + e não consigo mais sair".
        */
        <div
          aria-hidden="true"
          onMouseDown={() => {
            if (cedoDemais()) return;
            onClose();
          }}
          className="anim-overlay fixed inset-0 z-[79] bg-black/60"
        />
      )}
      <div
        ref={ref}
        role="menu"
        onKeyDown={aoTeclado}
        style={
          folha
            ? undefined
            : {
                left: pos?.x ?? x,
                top: pos?.y ?? y,
                width: largura,
                transformOrigin: pos?.origem ?? "left top",
              }
        }
        className={
          folha
            ? // `min-h-11` em cada item: 44px é o alvo de toque, e os itens do
              // menu do desktop têm 32 porque lá o ponteiro acerta 32.
              //
              // A fileira de reações (`[role=group]>button`) ganha, só aqui,
              // três coisas que o botão de 32px do desktop não tem: alvo de
              // 44 (idem acima), `rounded-full` e o fundo
              // `--background-surface-highest` — círculo preenchido, como os
              // sete alvos de `discord-mobile-menu-mensagem.png` (o desktop
              // é `rounded-[3px]` sem fundo em repouso, e continua assim: o
              // seletor abaixo só existe dentro da classe da folha, então o
              // botão do menu ancorado nunca o recebe). A especificidade do
              // seletor composto (classe + atributo + tipo) supera a classe
              // solta `h-8`/`w-8`/`rounded-[3px]` escrita no próprio botão em
              // `FileiraDeReacoes`, então não foi preciso tocar naquele
              // componente nem no menu de desktop que ele também atende.
              "anim-folha fixed inset-x-0 bottom-0 z-[80] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-background-surface-higher p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-popout [&_[role=menuitem]]:min-h-[44px] [&_[role=menuitemcheckbox]]:min-h-[44px] [&_[role=menuitemradio]]:min-h-[44px] [&_[role=group]]:gap-2 [&_[role=group]>button]:h-[44px] [&_[role=group]>button]:w-[44px] [&_[role=group]>button]:rounded-full [&_[role=group]>button]:bg-background-surface-highest [&_[role=group]>button]:text-2xl"
            : // `.menu_c1e9c4` (css-bruto/858942…): fundo, borda 1px cheia (sem
              // opacidade extra — o token já carrega o alfa) e `box-shadow:
              // var(--shadow-high)` só, sem o `--shadow-border` do `shadow-popout`
              // (aqui a borda já é real). `max-height: calc(100vh - 32px)` é
              // `--custom-menu-viewport-padding` (16px) nos dois lados; o padding
              // 8×8 sai daqui e vai para o rolador interno (`.scroller_c1e9c4`).
              `fixed z-[80] flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-lg border border-border-subtle bg-background-surface-higher shadow-shadow-high anim-menu ${
                pos ? "" : "invisible"
              }`
        }
        onContextMenu={(e) => e.preventDefault()}
      >
        {folha && (
          /*
            A alça do topo, como na captura `discord-mobile-menu-mensagem.png`
            — e aqui ela é **botão de verdade**, com rótulo "Fechar": é a saída
            visível da folha, ao lado do véu e do voltar do Android. Fica
            `sticky` porque a folha rola por dentro e a saída não pode subir
            junto com a lista. Sem `role`, como a barra de volume logo abaixo:
            não é um item de menu e não entra na navegação por setas.
          */
          <button
            type="button"
            onClick={() => {
              if (cedoDemais()) return;
              onClose();
            }}
            aria-label="Fechar"
            className="sticky top-0 z-10 -mt-1 mb-1 flex h-[28px] w-full shrink-0 items-center justify-center bg-background-surface-higher"
          >
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-normal" />
          </button>
        )}
        {(() => {
          /*
            Estado vazio: nenhum print/CSS documenta isso (o Discord nunca
            abre um menu sem item), mas um chamador que monta a lista de
            forma assíncrona (ex.: um submenu de cargos enquanto a permissão
            ainda não resolveu) pode passar `items: []` antes de preenchê-la.
            Sem isto a caixa aparecia como uma tira vazia (só o padding do
            rolador), o que parece quebrado. Fallback contido aqui — não muda
            a API de quem chama. Texto não é do Discord: não medido.
          */
          if (items.length === 0) {
            const vazio = (
              <div
                role="presentation"
                className="px-2 py-3 text-center text-xs text-text-muted"
              >
                Nada por aqui
              </div>
            );
            return folha ? (
              vazio
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-2">{vazio}</div>
            );
          }
          const linhas = items.map((item, i) => {
          if ("separator" in item) {
            // `.separator_c1e9c4`: 1px `--border-subtle`, margem de 8 nos
            // quatro lados (`margin: var(--custom-menu-separator-margin, 8px)`,
            // não só vertical — o padding do rolador já dá o resto do respiro).
            // `Divider` sem `rotulo` é um `<hr>` puro — `role="separator"` é o
            // papel ARIA implícito do elemento, sem precisar declará-lo.
            return <Divider key={i} margem={8} />;
          }
          if (isSlider(item)) {
            return <ItemDeslizante key={i} item={item} />;
          }
          if (isReacoes(item)) {
            return (
              <FileiraDeReacoes key={i} item={item} onClose={onClose} cedoDemais={cedoDemais} />
            );
          }
          const filho = isSubmenu(item);
          const marcado = !filho && item.checked === true;
          const controle = !filho ? item.control : undefined;
          // item-pai de submenu também tem `description` (segunda linha, ex.:
          // "Config. de notificação" > "Nada" no print p5) — só `control`
          // (rádio/checkbox) e `checked` são exclusivos do item-folha.
          const descricao = item.description;
          const forte = !filho && item.forte === true;
          /*
            `.colorDefault_c1e9c4`/`.colorDanger_c1e9c4` (css-bruto/858942…): o
            limão saiu do hover comum — hoje é `--interactive-background-hover`
            (cinza translúcido, igual ao `.focused_c1e9c4`), com
            `--background-mod-subtle` no `:active` (pressionado), igual ao
            `.item_c1e9c4:hover`/`:active` de lá. Perigo continua com o texto
            `--text-feedback-critical` também no fundo `--background-feedback-
            critical` do hover/foco/pressionado — o token certo, não
            `--status-danger` (esse é a bolinha de status, outra coisa).

            "Convidar para o servidor" **não** vira cor de marca: medido no
            print `124207` desse item, texto #f0f0f0 e ícone #aaabb1 — a mesma
            cor de um item comum, sem destaque nenhum. O Discord não pinta
            item de menu com o accent; o `text-brand-500` que existia aqui foi
            tirado, e `forte` (status do cartão de perfil) cai no mesmo texto
            e no mesmo hover do item comum, que já eram idênticos entre si.
          */
          const cor = item.danger
            ? "text-text-feedback-critical hover:bg-background-feedback-critical focus:bg-background-feedback-critical active:bg-background-feedback-critical"
            : // rótulo `--text-strong` (`.colorDefault_c1e9c4 .label_c1e9c4`),
              // não `--text-subtle` — o item comum já nasce no texto forte.
              "text-text-strong hover:bg-interactive-background-hover focus:bg-interactive-background-hover active:bg-background-mod-subtle";
          // fundo do item-pai quando o submenu dele está aberto: o mesmo do
          // hover/foco de cada categoria, sem repintar o texto (a categoria já
          // define a cor certa em `cor`, inclusive a de perigo).
          const corAberta = item.danger
            ? "bg-background-feedback-critical"
            : "bg-interactive-background-hover";
          return (
            <button
              key={i}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role={
                controle === "radio"
                  ? "menuitemradio"
                  : controle === "checkbox"
                    ? "menuitemcheckbox"
                    : "menuitem"
              }
              aria-checked={controle ? marcado : undefined}
              aria-haspopup={filho ? "menu" : undefined}
              aria-expanded={filho ? aberto === i : undefined}
              tabIndex={foco === i ? 0 : -1}
              disabled={item.disabled}
              onPointerEnter={(e) => {
                setFoco(i);
                agendarSubmenu(i, e.currentTarget, filho && !item.disabled);
              }}
              onClick={(e) => {
                // o `click` do dedo que ainda estava na tela quando a folha
                // subiu não é escolha de ninguém (ver `nascidaEm`)
                if (cedoDemais()) return;
                if (filho) {
                  setAncora(e.currentTarget.getBoundingClientRect());
                  setAberto((a) => (a === i ? null : i));
                  return;
                }
                onClose();
                item.onSelect();
              }}
              /*
                `.labelContainer_c1e9c4`: `min-height:32px; padding:8px` — o
                item de uma linha fecha em exatamente 32 (`min-h-8` + `p-2`) e
                cresce para o de duas linhas (rótulo + descrição). A escada de
                duas/três linhas do 15,5px antigo (36/52/68) não foi remedida
                na base de 16px — não medido.

                Raio: `.item_c1e9c4{border-radius:2px}` em repouso,
                `.focused_c1e9c4{border-radius:4px}` no hover/foco (e travado
                em 4 enquanto o submenu do item está aberto). Desabilitado:
                `.disabled_c1e9c4{opacity:.5}`, não .4.

                Anel de foco: `.keyboard-mode .colorDefault_c1e9c4.focused_c1e9c4
                {outline:2px solid var(--border-focus);outline-offset:-2px}`
                (css-bruto/858942…) — só existe para o item comum navegado por
                teclado, não para o item de perigo (o arquivo não tem a regra
                equivalente para `.colorDanger_c1e9c4`) nem para o hover de
                mouse (por isso `focus-visible`, não `focus`). `border-focus`
                é o azul do anel de teclado do Discord, que a ADR-0009 mantém
                azul — não é marca. `group`: o ícone do item (abaixo) clareia
                junto no hover/foco do botão.
              */
              className={`group flex min-h-8 w-full items-center gap-2 whitespace-nowrap p-2 text-left text-sm outline-none disabled:opacity-50 ${cor} ${
                item.danger
                  ? ""
                  : "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus"
              } ${
                aberto === i
                  ? `${corAberta} rounded-[4px]`
                  : "rounded-[2px] hover:rounded-[4px] focus:rounded-[4px]"
              }`}
            >
              {item.icon ? (
                // Quadro de 20px (`.iconContainer_c1e9c4{width:20px;height:20px}`,
                // css-bruto/858942…), e o ícone preenche o quadro inteiro
                // (`.icon_c1e9c4{height:100%;width:100%}`, mesmo arquivo) — não
                // 16 dentro de 20. Revisão visual mediu o glifo em 19-20px nos
                // prints 1:1 (`124207`: user-plus em y158-176; `101733`:
                // engrenagem em x133-152) contra os ~16px que saíam do svg em
                // 4×4 dentro do quadro de 5×5 daqui. Cor fixa
                // `--interactive-icon-default` (#abacb2 medido ali, contra
                // #f0f0f0 do rótulo ao lado): o ícone comum **não** segue a cor
                // do item, fica sempre nesse cinza — antes herdava o
                // `text-text-strong` do item a 80% de opacidade, daí "quase
                // branco". No hover/foco ele clareia para `--interactive-text-
                // active` (#fbfbfb): `.colorDefault_c1e9c4.focused_c1e9c4:not(
                // .checkboxContainer_c1e9c4) path{fill:var(--interactive-text-
                // active)}` (css-bruto/858942…) — daí `group-hover`/`group-
                // focus` (o `group` está no `<button>`, acima). Perigo
                // (`item.danger`) continua herdando o vermelho do item (não é
                // o que este cartão mediu); `forte` é o ícone à parte do
                // seletor de status, com cor própria.
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center [&>svg]:h-5 [&>svg]:w-5 ${
                    forte
                      ? ""
                      : item.danger
                        ? "opacity-80"
                        : "text-interactive-icon-default group-hover:text-interactive-text-active group-focus:text-interactive-text-active"
                  }`}
                >
                  {item.icon as ReactNode}
                </span>
              ) : null}
              {!filho && item.dot && (
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: item.dot }}
                  className="h-2 w-2 shrink-0 rounded-full"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block ${forte ? "font-semibold" : "font-medium"}`}>
                  {item.label}
                </span>
                {descricao && (
                  // `.subtext_c1e9c4`: `margin-top:2px`, cor `--text-muted`
                  // fixa (não opacidade sobre a cor do item — herdaria o
                  // `text-strong` do rótulo). `whitespace-normal` porque a
                  // descrição do "Não perturbar" ocupa duas linhas.
                  <span className="mt-0.5 block whitespace-normal text-xs font-normal leading-4 text-text-muted">
                    {descricao}
                  </span>
                )}
              </span>
              {controle === "checkbox" && (
                // marcado: `--text-brand`, não a cor do item (`current`) — é o
                // que `.check_c1e9c4{color:var(--text-brand)}` faz no focado
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border ${
                    marcado ? "border-text-brand bg-text-brand" : "border-current opacity-60"
                  }`}
                >
                  {marcado && (
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-background-surface-higher">
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              )}
              {controle === "radio" && (
                // mesma regra do checkbox: marcado usa `--text-brand`, não `current`
                <span
                  aria-hidden="true"
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                    marcado ? "border-text-brand" : "border-current opacity-60"
                  }`}
                >
                  {marcado && <span className="h-2 w-2 rounded-full bg-text-brand" />}
                </span>
              )}
              {/*
                O chevron do item que só *parece* ter submenu (seletor de
                status) fica no mesmo lugar do de verdade. Tamanhos medidos pelo
                desenho do glifo no print `2026-09-03 180020`: 6x12 de tinta no
                seletor de status (= 24 no nosso ativo, que pinta 25% x 50% da
                caixa) contra os 16 dos menus de botão direito já medidos.
              */}
              {(filho || (!filho && item.chevron)) && (
                <ChevronRight size={forte ? 24 : 16} className="shrink-0 opacity-80" />
              )}
            </button>
          );
          });
          // `.scroller_c1e9c4{padding-block:8px;padding-inline:8px}`: o padding
          // do menu fixo mora no rolador interno, não na caixa — é o que deixa
          // a caixa cortar em `max-h-[calc(100vh-32px)]` sem cortar o padding
          // junto. A folha já rola sozinha (mobile, fora do escopo daqui).
          return folha ? (
            linhas
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">{linhas}</div>
          );
        })()}
      </div>
      {aberto !== null && ancora && isSubmenu(items[aberto]) && (
        <Painel
          items={(items[aberto] as Extract<MenuItem, { submenu: MenuItem[] }>).submenu}
          largura={largura}
          // submenu encosta no item, com 4px de sobreposição, como no Discord;
          // sobe o padding (8) e a borda (1) para o primeiro filho alinhar com o pai
          // (x/y/alternativoX são ignorados por `Painel` quando `folha` é true,
          // abaixo — a folha nunca é ancorada)
          x={ancora.right - 4}
          y={ancora.top - 9}
          alternativoX={ancora.left + 4}
          onClose={onClose}
          autoFoco={false}
          /*
            **O bug que este cartão fecha.** Sem propagar `folha`, o parâmetro
            caía no padrão (`false`) e o submenu nascia como caixa flutuante de
            220px ancorada no ponto do toque — no meio da tela, longe do
            polegar, do jeito que o desktop abre e o celular nunca deveria (as
            capturas `discord-mobile-menu-mensagem*.png` não têm menu nenhum
            flutuando: todo submenu é outra folha inteira, do mesmo tipo,
            simplesmente empilhada por cima da primeira — o `z-[80]`/`z-[79]`
            de cada `Painel` novo nasce depois do anterior na árvore, então
            pinta por cima sem precisar de nada além de repetir `folha`).
          */
          folha={folha}
        />
      )}
    </>
  );
}

/**
 * Menu de contexto (botão direito) no estilo do Discord: caixa de 220 em
 * `--background-surface-higher`, borda 1px `--border-subtle`, raio 8, sombra
 * `--shadow-high`, com o padding de 8×8 no rolador interno (`max-height:
 * calc(100vh - 32px)`, `.menu_c1e9c4`/`.scroller_c1e9c4` em
 * `css-bruto/858942.086f3345af1722be.css`). Item de uma linha com
 * `min-height:32px` e `padding:8px` (`.labelContainer_c1e9c4`), rótulo
 * `--text-strong`, hover/foco em `--interactive-background-hover` (cinza —
 * o limão saiu daqui), pressionado `--background-mod-subtle`, raio 2 em
 * repouso e 4 no hover/foco. Item com `description` vira de duas linhas
 * (rótulo 14/20 + descrição 12/16, `--text-muted`, 2px acima) — a escada de
 * altura de duas/três linhas não foi remedida na base de 16px, não medido.
 * Separador 1px `--border-subtle` com margem de 8 nos quatro lados; grupo
 * (título 14/20 peso 500 `--text-muted`) não existe no modelo de itens hoje.
 * Um só na tela, aberto por `ui.openContextMenu(x, y, items, largura)`.
 * Medidas de layout gerais (largura 220, caixa de marcar de 20 à direita)
 * confirmadas também nos prints `124207` e `124022`.
 *
 * Fecha com Esc, clique fora, rolagem ou redimensionamento — qualquer coisa que
 * deixaria o menu solto longe do que o abriu.
 */
export default function ContextMenuHost() {
  const menu = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  const raiz = useRef<HTMLDivElement>(null);
  // no celular o menu é folha inferior, e ela não é ancorada em nada
  const ehMobile = useEhMobile();

  /*
    O "voltar" do Android desfaz a folha, como desfaz qualquer camada do
    celular (é o mesmo hook do cartão de perfil e do seletor de emoji). Sem
    ele o voltar atravessava a folha e desfazia a tela **de baixo**, deixando
    o menu aberto por cima de outra coisa.
  */
  useVoltarNoCelular(ehMobile && menu !== null, close);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    // Rolagem e redimensionamento fecham o menu ancorado porque ele ficaria
    // solto longe do que o abriu. A folha não tem âncora: fechá-la na rolagem
    // significaria que rolar a **própria folha** a fecha, e o teclado do
    // celular, que dispara `resize`, também.
    if (!ehMobile) {
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, close, ehMobile]);

  if (!menu) return null;

  return (
    <div ref={raiz}>
      <Painel
        items={menu.items}
        largura={menu.width ?? MENU_WIDTH}
        x={menu.x}
        y={menu.y}
        alternativoX={menu.x}
        onClose={close}
        autoFoco={!ehMobile}
        folha={ehMobile}
      />
    </div>
  );
}
