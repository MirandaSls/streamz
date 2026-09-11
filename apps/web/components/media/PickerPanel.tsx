"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  Image as ImageIcon,
  Smile,
  Sticker as StickerIcon,
  type Icone,
} from "@/components/ui/icones";
import { Popout } from "@/components/ui/primitivos";
import type { Attachment, Sticker } from "@streamz/shared";
import EmojiPicker from "@/components/ui/EmojiPicker";
import GifPicker from "@/components/media/GifPicker";
import StickerPicker from "@/components/media/StickerPicker";
import { ALTURA_PICKER, LARGURA_PICKER } from "@/components/media/PickerChrome";
import { useEhMobile } from "@/hooks/useEhMobile";

export type PickerTab = "emoji" | "gif" | "figurinha";

const ABAS: { id: PickerTab; rotulo: string; Icone: Icone }[] = [
  { id: "emoji", rotulo: "Emoji", Icone: Smile },
  { id: "gif", rotulo: "GIF", Icone: ImageIcon },
  { id: "figurinha", rotulo: "Figurinha", Icone: StickerIcon },
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
 * (424 × 420) e cada aba só é montada na primeira visita — mas, uma vez
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
 * ### 2. A superfície continua a de antes
 *
 * Fundo `--background-base-lowest`, e não o `--background-surface-high` do
 * `Popout`. O Discord pinta este painel com `--background-surface-high`
 * (`.contentWrapper__08434` em `css-bruto/678906.8d928f079d6635f0.css`), mas os
 * cabeçalhos fixos das seções dentro dos três seletores (`h3.sticky` em
 * `EmojiPicker`, `GifPicker` e `StickerPicker`) são pintados com
 * `--background-base-lowest`: trocar só a caixa deixaria cada cabeçalho como
 * uma faixa escura sobre o painel. A troca é da onda que refizer os seletores,
 * e as duas pontas precisam mudar juntas. Raio 8 e `shadow-popout` são os do
 * `Popout`, que já eram os daqui.
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
 * Num telefone de 390px uma caixa de 424 já não cabe — e, ancorada no composer,
 * ficaria justamente debaixo do teclado. Aqui ela vira a **folha inferior** do
 * `Popout`: largura da tela, subindo do fundo, com as abas no topo e a grade
 * fluida (`EmojiPicker` troca as 9 colunas fixas por `auto-fill`). A altura é
 * 60% da tela, não os 420 fixos: em 844 de altura são ~506, e o resto continua
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
        // marca a ordem das regras no CSS gerado é que decidiria o fundo
        className="overflow-hidden !bg-background-base-lowest"
        classeNaFolha="bg-background-base-lowest"
      >
        <div
          ref={miolo}
          className="flex flex-col overflow-hidden"
          style={{
            height: ehMobile
              ? `calc(60dvh - ${ALCA_DA_FOLHA}px - env(safe-area-inset-bottom))`
              : ALTURA_PICKER,
          }}
        >
          <div role="tablist" aria-label="Tipo de mídia" className="flex shrink-0 border-b border-border-subtle">
            {ABAS.map(({ id, rotulo, Icone }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${baseId}-${id}`}
                aria-selected={tab === id}
                aria-controls={`${baseId}-${id}-painel`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => trocar(id)}
                // `px-3 py-2` com o `text-text-sm` (14px, entrelinha 18) e o
                // traço de 2 dá 36 de altura; no dedo a aba é alvo como
                // qualquer outro botão
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-text-sm font-medium transition ${
                  ehMobile ? "min-h-[44px]" : ""
                } ${
                  tab === id
                    ? "border-brand-500 text-text-strong"
                    : "border-transparent text-text-muted hover:text-text-default"
                }`}
              >
                <Icone size={16} aria-hidden="true" />
                {rotulo}
              </button>
            ))}
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
