"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Popout } from "@/components/ui/primitivos";
import type { Attachment, Sticker } from "@streamz/shared";
import EmojiPicker from "@/components/ui/EmojiPicker";
import GifPicker from "@/components/media/GifPicker";
import StickerPicker from "@/components/media/StickerPicker";
import { ALTURA_PICKER, LARGURA_PICKER } from "@/components/media/PickerChrome";
import { useEhMobile } from "@/hooks/useEhMobile";

export type PickerTab = "emoji" | "gif" | "figurinha";

// ordem GIF · Figurinha · Emoji: a mesma ordem, da esquerda para a direita, dos
// três botões que abrem cada seletor na barra do composer (GIF, figurinha,
// emoji — o de emoji é o mais próximo do texto, o último antes de enviar).
// Sem ícone na aba: o `.navButton__08434` do Discord (`css-bruto/
// 678906.8d928f079d6635f0.css`) é só texto — sem regra de ícone nenhuma. Os
// rótulos pt-BR do Discord não foram medidos, ficam os nomes óbvios.
const ABAS: { id: PickerTab; rotulo: string }[] = [
  { id: "gif", rotulo: "GIF" },
  { id: "figurinha", rotulo: "Figurinha" },
  { id: "emoji", rotulo: "Emoji" },
];

/**
 * Altura da alça "Fechar" que o `Popout` põe no topo da folha do celular
 * (`h-[28px]` em `components/ui/primitivos/Popout.tsx`). Descontada da altura
 * do miolo para a folha inteira continuar medindo os 60% da tela de antes.
 */
const ALCA_DA_FOLHA = 28;

/**
 * O painel único de emoji, GIF e figurinha — uma caixa só, com as três abas no
 * topo, como no Discord.
 *
 * Antes eram três popovers independentes, cada um aberto por um botão do
 * composer: trocar de mídia fechava um e abria outro, de tamanho diferente, e
 * perdia a busca que já tinha sido digitada. Aqui a caixa é sempre a mesma
 * (500 × 510, `LARGURA_PICKER`/`ALTURA_PICKER` — cartão 2j-seletor-gif-figurinha,
 * medido no print 1:1 do seletor) e cada aba só é montada na primeira visita — mas, uma vez
 * montada, **fica montada** e apenas some da tela. É isso que preserva os
 * resultados do Giphy e o termo digitado ao ir e voltar entre as abas, sem
 * pagar a busca de GIF de quem só queria um emoji.
 *
 * ## A mecânica é do `Popout`
 *
 * Portal, conta de colisão com a janela, Esc, clique fora, foco preso e
 * devolvido, folha no celular (véu, alça "Fechar", "voltar" do Android) e
 * animação de entrada vêm do `Popout` único (plano, onda 0.4). Os seletores
 * continuam em modo `embutido`, sem caixa e sem listener próprio: dois
 * ouvintes de clique fora concorrendo fariam o clique numa aba fechar o painel
 * inteiro. Aqui fica só o que é deste painel: as abas, a montagem preguiçosa, o
 * tamanho e três ajustes que o `Popout` não tinha como saber.
 *
 * ### 1. Onde ele encosta continua sendo decidido pelo CSS do consumidor
 *
 * O composer passa `className="absolute bottom-full right-2.5 mb-2"`: o canto
 * inferior direito do painel a 8px acima do composer e a 10px da borda direita
 * dele. O painel agora mora num portal, então essas classes não podem mais ir
 * na caixa (o `absolute` venceria o `fixed` do `Popout`). Elas vão num **marco**
 * — um `span` vazio, de tamanho zero, renderizado onde o painel estava — e o
 * `Popout` se ancora nele com `lado="top"`, `alinhamento="end"` e distância 0
 * (o respiro de 8 já é o `mb-2` do marco). A posição na tela é a de antes; o
 * que muda é que, sem espaço acima, a caixa agora espelha ou desliza para
 * caber, em vez de ser cortada pela janela.
 *
 * O marco tem `pointer-events-none`: o `Popout` ignora cliques dentro da
 * âncora, e um marco clicável tiraria da regra "clicar fora fecha" justamente
 * a área do composer. Assim, clicar no campo de texto fecha o painel, e o botão
 * que o abriu faz o mesmo de antes — o `mousedown` fecha e o `click` do
 * composer reabre.
 *
 * O `absolute` acompanhava o composer de graça quando ele crescia (a faixa do
 * modo lento sumindo, um anexo terminando de subir). O `Popout` só se refaz em
 * resize, scroll e quando a caixa ou a âncora mudam de **tamanho** — e o marco
 * nunca muda de tamanho, só de lugar. Por isso este arquivo observa o pai do
 * marco e, quando ele muda de tamanho, entrega ao `Popout` um objeto de âncora
 * novo (a mesma referência ao mesmo nó): a âncora por `ref` é dependência pelo
 * objeto, e objeto novo é conta nova.
 *
 * ### 2. A superfície agora é a do Discord
 *
 * Fundo `--background-surface-high` (`#242429`, `.contentWrapper__08434` em
 * `css-bruto/678906.8d928f079d6635f0.css`) — que por acaso é também o padrão
 * do `Popout` (`superficie="alta"`); a classe fica explícita aqui mesmo assim,
 * porque este painel depende do valor certo e um padrão que muda por outro
 * consumidor não pode arrastar este junto. Antes era `--background-base-lowest`
 * (`#121214`, a superfície de baixo do app, não a do popout), e os cabeçalhos
 * fixos das seções (`h3.sticky`) tinham que trocar **junto**, senão cada um
 * viraria uma faixa escura sobre o painel novo — é por isso que a troca
 * esperou o cartão que redesenha os seletores (2j-seletor-gif-figurinha,
 * fechado pelo cartão seletores-emoji-e-figurinha). `GifPicker`,
 * `StickerPicker` e `EmojiPicker` (`components/ui/EmojiPicker.tsx`) já usam
 * `--background-surface-high` no cabeçalho grudado. Raio 8 e `shadow-popout`
 * são os do `Popout`, que já eram os daqui.
 *
 * ### 3. O foco vai para a busca da aba aberta
 *
 * O `Popout` só aparece depois de posicionado (até lá fica com `visibility:
 * hidden`), e é nesse intervalo que o React aplica o `autoFocus` das buscas do
 * GIF e da figurinha — num nó invisível, onde o `focus()` não pega. Sem ajuste
 * o foco cairia no primeiro focável, que é a aba ativa. Por isso a busca da aba
 * aberta ganha `data-autofocus`, que é por onde o `Popout` escolhe quem focar
 * ao abrir. Na aba de emoji isto é novo (antes o foco ficava no botão do
 * composer); agora que o foco fica preso na caixa, ele precisa ir para algum
 * lugar dentro dela, e a busca é onde a pessoa digita. Abas abertas depois
 * montam com a caixa já visível, e o `autoFocus` delas funciona sozinho.
 *
 * ## No celular: folha inferior
 *
 * Num telefone de 390px uma caixa de 500 já não cabe — e, ancorada no composer,
 * ficaria justamente debaixo do teclado. Aqui ela vira a **folha inferior** do
 * `Popout`: largura da tela, subindo do fundo, com as abas no topo e a grade
 * fluida (`EmojiPicker` troca as 9 colunas fixas por `auto-fill`). A altura é
 * 60% da tela, não os 510 fixos: em 844 de altura são ~506, e o resto continua
 * mostrando a conversa — que é o que diferencia uma folha de um modal. O miolo
 * desconta a alça e a área segura para a folha inteira medir esses 60%, como
 * antes. Na folha o `Popout` foca a alça, não a busca: o teclado virtual
 * subiria por cima da folha que acabou de abrir.
 */
export default function PickerPanel({
  tab,
  onTab,
  className = "",
  termoGif,
  guildId,
  onClose,
  onPickEmoji,
  onGif,
  onSticker,
}: {
  tab: PickerTab;
  onTab: (t: PickerTab) => void;
  /**
   * Onde o painel encosta, em CSS relativo ao pai (ver "Onde ele encosta"):
   * aplicado ao marco invisível que serve de âncora, não à caixa.
   */
  className?: string;
  termoGif?: string;
  guildId?: string | null;
  onClose: () => void;
  onPickEmoji: (texto: string, custom?: { name: string; id: string }) => void;
  onGif: (attachment: Attachment) => void;
  onSticker: (sticker: Sticker) => void;
}): JSX.Element {
  const baseId = useId();
  const ehMobile = useEhMobile();
  const marco = useRef<HTMLSpanElement>(null);
  const miolo = useRef<HTMLDivElement>(null);
  const [ancora, setAncora] = useState<RefObject<HTMLElement | null>>(marco);

  // a aba inicial já conta como visitada; as outras entram ao serem abertas
  const [visitadas, setVisitadas] = useState<PickerTab[]>([tab]);

  function trocar(destino: PickerTab) {
    setVisitadas((atual) => (atual.includes(destino) ? atual : [...atual, destino]));
    onTab(destino);
  }

  // composer mudou de tamanho: o marco mudou de lugar (ver "Onde ele encosta")
  useEffect(() => {
    const pai = marco.current?.parentElement;
    if (!pai || typeof ResizeObserver === "undefined") return;
    // o observador chama uma vez ao começar a observar; essa medida o `Popout`
    // já fez sozinho
    let primeira = true;
    const observador = new ResizeObserver(() => {
      if (primeira) {
        primeira = false;
        return;
      }
      setAncora({ current: marco.current });
    });
    observador.observe(pai);
    return () => observador.disconnect();
  }, []);

  // de layout, e não comum: precisa estar marcado antes de o `Popout` ficar
  // visível e escolher quem focar (ver "O foco vai para a busca")
  useLayoutEffect(() => {
    miolo.current
      ?.querySelector<HTMLInputElement>('[role="tabpanel"]:not([hidden]) input')
      ?.setAttribute("data-autofocus", "");
  }, []);

  return (
    <>
      <span ref={marco} aria-hidden="true" className={`pointer-events-none ${className}`} />
      <Popout
        // quem abre o painel é o composer montá-lo; fechar é desmontá-lo
        aberto
        aoFechar={onClose}
        ancora={ancora}
        lado="top"
        alinhamento="end"
        distancia={0}
        largura={LARGURA_PICKER}
        rotulo="Emoji, GIF e figurinha"
        // `!`: a superfície do `Popout` vem antes na mesma string, e sem a
        // marca a ordem das regras no CSS gerado é que decidiria o fundo.
        // `--background-surface-high`: ver "A superfície agora é a do
        // Discord" acima.
        className="overflow-hidden !bg-background-surface-high"
        classeNaFolha="bg-background-surface-high"
      >
        <div
          ref={miolo}
          // `.contentWrapper__08434`: grid de duas linhas (30px as abas, o
          // resto o conteúdo), `grid-row-gap:12px`, `padding-top:16px` — a
          // linha de 30 é exatamente a altura do `.navButton__08434`
          // (padding 8×12 + entrelinha 14). Sem `fr` na segunda linha: uma
          // única linha `auto` num grid de altura definida recebe o espaço
          // que sobra (passo "Maximize Tracks" do algoritmo de grid), o que
          // aqui faz o mesmo papel do `flex-1` de antes.
          className="grid overflow-hidden"
          style={{
            height: ehMobile
              ? `calc(60dvh - ${ALCA_DA_FOLHA}px - env(safe-area-inset-bottom))`
              : ALTURA_PICKER,
            gridTemplateRows: "30px auto",
            rowGap: 12,
            paddingTop: 16,
          }}
        >
          {/* `.nav__08434` (padding 0 16) > `.navList__08434` (flex, 8px entre itens) */}
          <div className="px-4">
            <div role="tablist" aria-label="Tipo de mídia" className="flex items-center gap-2">
              {ABAS.map(({ id, rotulo }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`${baseId}-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`${baseId}-${id}-painel`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => trocar(id)}
                  // `.navButton__08434`: sem ícone, 14px peso 600 entrelinha
                  // 14 (por isso o tamanho é literal — o par mais próximo do
                  // sistema, `text-text-sm`, vem com entrelinha 18), padding
                  // 8×12, raio 8 (`rounded-lg` = `--radius-sm`, ver
                  // `Popout.tsx:32`). Repouso `--text-default`; hover
                  // `--control-secondary-background-hover` +
                  // `--interactive-text-hover`; `:active` (mouse apertado)
                  // `--control-secondary-background-active` +
                  // `--interactive-text-active`. Ativa (`.navButtonActive__08434`)
                  // `--background-mod-normal` + `--text-strong`; hover/active
                  // dela escurece para `--background-mod-strong` +
                  // `--interactive-text-active`.
                  className={`rounded-lg px-3 py-2 text-[14px] font-semibold leading-[14px] transition-colors ${
                    ehMobile ? "min-h-[44px]" : ""
                  } ${
                    tab === id
                      ? "bg-background-mod-normal text-text-strong hover:bg-background-mod-strong hover:text-interactive-text-active active:bg-background-mod-strong active:text-interactive-text-active"
                      : "text-text-default hover:bg-control-secondary-background-hover hover:text-interactive-text-hover active:bg-control-secondary-background-active active:text-interactive-text-active"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          {ABAS.map(({ id }) => (
            <div
              key={id}
              role="tabpanel"
              id={`${baseId}-${id}-painel`}
              aria-labelledby={`${baseId}-${id}`}
              hidden={tab !== id}
              className={tab === id ? "flex min-h-0 flex-1 flex-col" : ""}
            >
              {visitadas.includes(id) && (
                <>
                  {id === "emoji" && (
                    <EmojiPicker
                      embutido
                      guildId={guildId}
                      onClose={onClose}
                      onPick={onPickEmoji}
                    />
                  )}
                  {id === "gif" && (
                    <GifPicker
                      embutido
                      termoInicial={termoGif}
                      onClose={onClose}
                      onEscolher={onGif}
                    />
                  )}
                  {id === "figurinha" && (
                    <StickerPicker
                      embutido
                      guildId={guildId}
                      onClose={onClose}
                      onEscolher={onSticker}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </Popout>
    </>
  );
}
