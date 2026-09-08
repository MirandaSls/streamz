"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Image as ImageIcon,
  Smile,
  Sticker as StickerIcon,
  type Icone,
} from "@/components/ui/icones";
import type { Attachment, Sticker } from "@streamz/shared";
import EmojiPicker from "@/components/ui/EmojiPicker";
import GifPicker from "@/components/media/GifPicker";
import StickerPicker from "@/components/media/StickerPicker";
import {
  ALTURA_PICKER,
  LARGURA_PICKER,
  useFecharFora,
} from "@/components/media/PickerChrome";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

export type PickerTab = "emoji" | "gif" | "figurinha";

const ABAS: { id: PickerTab; rotulo: string; Icone: Icone }[] = [
  { id: "emoji", rotulo: "Emoji", Icone: Smile },
  { id: "gif", rotulo: "GIF", Icone: ImageIcon },
  { id: "figurinha", rotulo: "Figurinha", Icone: StickerIcon },
];

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
 * A caixa é dona do Escape e do clique fora; os seletores entram em modo
 * `embutido`, sem caixa e sem listener próprio — dois listeners concorrendo
 * fariam o clique numa aba fechar o painel inteiro.
 *
 * ## No celular: folha inferior
 *
 * No desktop o painel nasce colado no composer (`absolute bottom-full
 * right-2.5`), porque é de lá que ele foi aberto e há tela sobrando à direita.
 * Num telefone de 390px uma caixa de 424 já não cabe — e, ancorada no composer,
 * ficaria justamente debaixo do teclado. Aqui ela vira **folha inferior**:
 * largura da tela, subindo do fundo, com as abas no topo e a grade fluida
 * (`EmojiPicker` troca as 9 colunas fixas por `auto-fill`). A altura é 60% da
 * tela, não os 420 fixos: em 844 de altura são ~506, e o resto continua
 * mostrando a conversa — que é o que diferencia uma folha de um modal.
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
  className?: string;
  termoGif?: string;
  guildId?: string | null;
  onClose: () => void;
  onPickEmoji: (texto: string, custom?: { name: string; id: string }) => void;
  onGif: (attachment: Attachment) => void;
  onSticker: (sticker: Sticker) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const ehMobile = useEhMobile();
  // vale nas duas formas: `ref` aponta para o nó da folha (que mora no portal),
  // então o toque dentro dela continua sendo "dentro" e o véu é "fora"
  useFecharFora(ref, onClose);
  useVoltarNoCelular(ehMobile, onClose);

  // a aba inicial já conta como visitada; as outras entram ao serem abertas
  const [visitadas, setVisitadas] = useState<PickerTab[]>([tab]);

  function trocar(destino: PickerTab) {
    setVisitadas((atual) => (atual.includes(destino) ? atual : [...atual, destino]));
    onTab(destino);
  }

  const miolo = (
    <>
      <div role="tablist" aria-label="Tipo de mídia" className="flex shrink-0 border-b border-black/30">
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
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? "border-accent text-txt-primary"
                : "border-transparent text-txt-muted hover:text-txt-normal"
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
    </>
  );

  if (ehMobile) {
    if (typeof document === "undefined") return <></>;
    return createPortal(
      <div
        className="anim-overlay fixed inset-0 z-[95] flex flex-col justify-end bg-black/70"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={ref}
          role="dialog"
          aria-label="Emoji, GIF e figurinha"
          className="anim-folha flex h-[60dvh] max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-panel pb-[env(safe-area-inset-bottom)] shadow-high"
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-1 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border-strong"
          />
          {miolo}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji, GIF e figurinha"
      style={{ width: LARGURA_PICKER, height: ALTURA_PICKER }}
      className={`anim-menu z-[70] flex flex-col overflow-hidden rounded-lg bg-panel shadow-high ${className}`}
    >
      {miolo}
    </div>
  );
}
