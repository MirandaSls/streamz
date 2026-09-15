"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerUpRight, Pin, X } from "@/components/ui/icones";
import { HeaderIcon } from "@/components/chat/HeaderBar";
import MessagePreview, { AcaoDoCartao } from "@/components/chat/MessagePreview";
import { Popout } from "@/components/ui/primitivos";
import { goToMessage } from "@/stores/messages-navigate";
import { usePins } from "@/stores/messages-pins";
import { ui, useUI } from "@/stores/ui";

/** Mesma largura/altura/folga fixas do `HeaderPopover` (cartão cabecalho-do-canal). */
const LARGURA = 420;
const ALTURA = 600;
const FOLGA = 8;
const BORDA = 8;

/**
 * Botão "Mensagens fixadas" do cabeçalho e a lista que ele abre, como no
 * Discord: a mensagem inteira em cada cartão e, no hover, "saltar" e "×" no
 * canto — no original nenhuma ação fica escrita por extenso no cartão.
 *
 * **Controlado por `stores/ui.ts` (`fixadasAbertasEm`/`openPins`/`closePins`),
 * não por um `useState` local.** É o que deixa o Ctrl+P
 * (`useKeyboardShortcuts.ts`) e o link "Ver mensagens fixadas" de um aviso do
 * sistema (`SystemMessageItem.tsx`) abrirem o mesmo painel que o alfinete do
 * cabeçalho — um estado só de dentro deste componente não enxergaria nenhum
 * dos dois. Por isso o botão e a caixa aqui são montados direto sobre o
 * `Popout` (o mesmo primitivo que o `HeaderPopover` usa por baixo), em vez de
 * delegar a ele: o `HeaderPopover` não expõe abrir/fechar de fora, só o
 * clique no próprio botão.
 */
export default function PinsPopover({
  channelId,
  guildId,
  canPin,
}: {
  channelId: string;
  guildId: string | null;
  /** quem não pode fixar também não desafixa — o botão nem aparece. */
  canPin: boolean;
}) {
  const items = usePins((s) => s.items);
  const loading = usePins((s) => s.loading);
  const load = usePins((s) => s.load);
  const unpin = usePins((s) => s.unpin);

  const aberto = useUI((s) => s.fixadasAbertasEm) === channelId;
  const ancoraRef = useRef<HTMLDivElement>(null);
  const [alturaMaxima, setAlturaMaxima] = useState<number | undefined>(undefined);

  // teto de altura pelo espaço abaixo do botão — a mesma conta do `HeaderPopover`
  const medirAlturaMaxima = useCallback(() => {
    const r = ancoraRef.current?.getBoundingClientRect();
    setAlturaMaxima(r ? Math.max(0, Math.floor(window.innerHeight - r.bottom - FOLGA - BORDA)) : undefined);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    medirAlturaMaxima();
    void load(channelId);
    window.addEventListener("resize", medirAlturaMaxima);
    return () => window.removeEventListener("resize", medirAlturaMaxima);
  }, [aberto, channelId, load, medirAlturaMaxima]);

  function fechar() {
    ui.closePins();
  }

  return (
    <div ref={ancoraRef} className="relative">
      <HeaderIcon
        label="Mensagens fixadas"
        active={aberto}
        semTooltip={aberto}
        // 21 para 18,5 de tinta (bbox do caminho: 70,5 do quadro de 80), a
        // mesma dos vizinhos do cabeçalho (`Users` a 22 → 18,3; Discord 18)
        onClick={() => (aberto ? ui.closePins() : ui.openPins(channelId))}
      >
        <Pin size={21} />
      </HeaderIcon>

      <Popout
        aberto={aberto}
        aoFechar={fechar}
        ancora={ancoraRef}
        lado="bottom"
        alinhamento="end"
        distancia={FOLGA}
        largura={LARGURA}
        rotulo="Mensagens Fixadas"
        className="!z-[39] overflow-hidden"
      >
        {aberto && (
          <div
            style={{ height: ALTURA, maxHeight: alturaMaxima }}
            className="flex flex-col"
          >
            <header className="shrink-0 border-b border-border-subtle">
              <div className="flex items-center gap-2 p-4">
                <span aria-hidden="true" className="shrink-0 text-text-subtle">
                  <Pin size={21} />
                </span>
                <h2 className="min-w-0 truncate font-semibold text-text-strong">Mensagens Fixadas</h2>
                {items.length > 0 && (
                  <span className="shrink-0 rounded-full bg-input-background-default px-1.5 text-xs font-semibold text-text-muted">
                    {items.length}
                  </span>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading && <p className="p-4 text-center text-sm text-text-muted">Carregando…</p>}

              {!loading && items.length === 0 && (
                <div className="p-6 text-center">
                  <Pin size={32} aria-hidden="true" className="mx-auto mb-2 text-channels-default" />
                  <p className="text-sm text-text-muted">
                    Este canal ainda não tem mensagens fixadas.
                  </p>
                  <p className="mt-2 text-xs text-channels-default">
                    Você pode fixar uma mensagem pelo menu de contexto dela.
                  </p>
                </div>
              )}

              {items.map((p) => (
                <MessagePreview
                  key={p.message.id}
                  message={p.message}
                  className="mb-2 last:mb-0"
                  acoes={
                    <>
                      <AcaoDoCartao
                        label="Saltar"
                        onClick={() => {
                          fechar();
                          void goToMessage({ guildId, channelId, messageId: p.message.id });
                        }}
                      >
                        <CornerUpRight size={16} />
                      </AcaoDoCartao>
                      {canPin && (
                        // `unpin` já pede confirmação antes de tirar da lista
                        <AcaoDoCartao
                          label="Desafixar"
                          danger
                          onClick={() => void unpin(channelId, p.message.id)}
                        >
                          <X size={16} />
                        </AcaoDoCartao>
                      )}
                    </>
                  }
                />
              ))}
            </div>
          </div>
        )}
      </Popout>
    </div>
  );
}
