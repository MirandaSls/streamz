"use client";

import { useEffect, type MouseEvent } from "react";
import { CornerUpRight, Hash, Pin, X } from "@/components/ui/icones";
import MessagePreview from "@/components/chat/MessagePreview";
import { EstadoCarregando, EstadoVazio } from "@/components/mobile/entradas/pecas";
import { goToMessage } from "@/stores/messages-navigate";
import { usePins } from "@/stores/messages-pins";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * A aba "Fixadas" dos detalhes do canal no celular.
 *
 * Os dados são os do `PinsPopover` do desktop — a mesma store (`usePins`),
 * carregada ao abrir e mantida ao vivo por `message.pinned`/`unpinned`. O
 * popover em si não é reaproveitado porque ele **é** um botão de cabeçalho com
 * uma caixa pendurada (`HeaderPopover`), e aqui a lista é o corpo de uma aba;
 * ver "faltando" do cartão 8d.
 *
 * A forma é a do Discord do celular, e não a do cartão do desktop:
 *
 * - **a mensagem no leiaute da timeline**, sob um cabeçalho `# canal` — o
 *   quadro 90 de `suporte/.../pin-messages-faq/14.gif` mostra `# rules` e, logo
 *   abaixo, avatar, nome colorido, hora e o texto inteiro. É a peça do
 *   resultado de busca (`MessagePreview variante="resultado"`), que já desenha
 *   exatamente isso;
 * - **tocar leva à mensagem** (`pin-messages-faq/16.gif`: "Jump to Message"
 *   depois de tocar numa fixada). As ações de canto do desktop ("Saltar", "×")
 *   só aparecem no hover, que o dedo não tem;
 * - **desafixar é pelo toque longo** (`pin-messages-faq/20.gif`: "Unpin Message"
 *   no menu que se abre segurando a mensagem). O `AreaDeToqueLongo` do shell
 *   dispara o `contextmenu` no cartão, e o menu sobe como folha.
 *
 * Estado de erro: **não há** como distinguir "falhou" de "não há fixadas" —
 * a store zera a lista nos dois casos e só avisa por toast
 * (`stores/messages-pins.ts`, `load`). Registrado em "faltando".
 */
export default function ListaDeFixadas({
  channelId,
  guildId,
  nomeDoCanal,
  podeFixar,
  aoSaltar,
}: {
  channelId: string;
  guildId: string | null;
  /** o `# nome` do cabeçalho do grupo; `null` numa conversa direta. */
  nomeDoCanal: string | null;
  /** quem não pode fixar também não desafixa (a mesma regra do desktop). */
  podeFixar: boolean;
  /** fecha as entradas antes de a conversa rolar até a mensagem. */
  aoSaltar: () => void;
}) {
  const items = usePins((s) => s.items);
  const loading = usePins((s) => s.loading);
  const doCanal = usePins((s) => s.channelId === channelId);

  useEffect(() => {
    void usePins.getState().load(channelId);
  }, [channelId]);

  function saltar(messageId: string) {
    aoSaltar();
    void goToMessage({ guildId, channelId, messageId });
  }

  function abrirMenu(e: MouseEvent, messageId: string) {
    e.preventDefault();
    const itens: MenuItem[] = [
      { label: "Ir para a mensagem", icon: <CornerUpRight size={18} />, onSelect: () => saltar(messageId) },
    ];
    if (podeFixar) {
      // `unpin` já pede confirmação antes de tirar da lista
      itens.push({
        label: "Desafixar mensagem",
        icon: <X size={18} />,
        danger: true,
        onSelect: () => void usePins.getState().unpin(channelId, messageId),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, itens);
  }

  // a store é única no app: enquanto ela ainda guarda outro canal, é carregando
  if (loading || !doCanal) return <EstadoCarregando texto="Carregando fixadas…" />;

  if (items.length === 0) {
    return (
      <EstadoVazio
        icone={<Pin size={40} />}
        titulo="Este canal ainda não tem mensagens fixadas."
        dica={podeFixar ? "Segure uma mensagem e toque em Fixar Mensagem." : undefined}
      />
    );
  }

  return (
    <div className="px-4 pb-4 pt-4">
      {nomeDoCanal && (
        <p className="mb-2 flex min-w-0 items-center font-semibold text-text-strong">
          <Hash size={16} aria-hidden="true" className="mr-1 shrink-0" />
          <span className="truncate">{nomeDoCanal}</span>
        </p>
      )}
      {items.map((p) => (
        <div key={p.message.id} onContextMenu={(e) => abrirMenu(e, p.message.id)}>
          <MessagePreview
            message={p.message}
            variante="resultado"
            className="mb-2"
            aoAbrir={() => saltar(p.message.id)}
          />
        </div>
      ))}
    </div>
  );
}
