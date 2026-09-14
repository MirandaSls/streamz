"use client";

import MessagePreview from "@/components/chat/MessagePreview";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { useMessages } from "@/stores/messages";
import type { Modal } from "@/stores/ui";

/**
 * Substitui o `confirm()` do browser: mesmo fluxo, mas acessível e no tema.
 *
 * Quando o modal traz `preview` (o id de uma mensagem), a caixa mostra a
 * **mensagem em si** — avatar, nome, hora e conteúdo — e não só a frase "a
 * mensagem some para todo mundo". É a diferença entre confirmar no escuro e
 * conferir que se está apagando a certa.
 *
 * ## Foco inicial (regra do `Modal`, aplicada aqui)
 *
 * `Modal` só olha `[data-autofocus]`; quem decide qual botão é o padrão é
 * quem chama, aqui. Sem nenhum `autoFocus`, o foco cai no primeiro focável do
 * modal inteiro — o **×** do cabeçalho, antes do rodapé no DOM — e Enter
 * fecharia como "Cancelar" mesmo numa confirmação inofensiva. Por isso:
 * `danger` foca o botão seguro (Cancelar), como já estava; **sem** `danger`
 * o padrão agora é o primário (Confirmar), que é o que falta pedir de novo
 * no teclado sem clicar. Sem print de foco do Discord para confirmar o par
 * exato — ver "nao_verificado".
 *
 * ## Estados
 *
 * - **Vazio/erro de carregamento**: `preview` aponta para uma mensagem que
 *   saiu da janela de retenção do client (`useMessages` não a acha mais) —
 *   mostra o aviso "Não foi possível carregar a prévia" no lugar do cartão.
 * - **Carregando / erro de rede / sem permissão**: não existem *aqui*. O
 *   `confirm()` de `stores/ui.ts` resolve local e imediato (`resolve(true)`
 *   fecha o modal) — quem chama (`await ui.confirm(...)`) é quem faz a
 *   chamada de rede **depois** de fechado, e mostra o próprio erro (toast) ou
 *   nem abre o modal quando falta permissão. Inventar um spinner ou uma
 *   mensagem de erro aqui seria simular um estado que o componente nunca
 *   tem — ver §6.6 do PROCESSO.
 * - **Hover / foco / desabilitado** dos botões: do `Button` (`primitivos/
 *   Button.tsx`), já medido lá — este arquivo só escolhe a variante.
 */
export default function ConfirmDialog({
  modal,
}: {
  modal: Extract<Modal, { kind: "confirm" }>;
}) {
  const mensagem = useMessages((s) => {
    const id = modal.preview;
    if (!id) return null;
    for (const slice of Object.values(s.byChannel)) {
      const achada = slice.items.find((m) => m.id === id);
      if (achada) return achada;
    }
    return s.threadItems.find((m) => m.id === id) ?? null;
  });

  return (
    <Dialog
      title={modal.title}
      description={modal.message}
      onClose={() => modal.resolve(false)}
      footer={
        <>
          <PrimaryButton
            danger={modal.danger}
            autoFocus={!modal.danger}
            onClick={() => modal.resolve(true)}
          >
            {modal.confirmLabel}
          </PrimaryButton>
          <SecondaryButton autoFocus={modal.danger} onClick={() => modal.resolve(false)}>
            Cancelar
          </SecondaryButton>
          {modal.preview && (
            // Equivalente ao checkbox "Não perguntar de novo" do Discord
            // (124114, alinhado com os botões) — mas essa caixa lembraria a
            // escolha entre confirmações futuras, e isso pede estado
            // persistido que `confirm()` (`stores/ui.ts`) não tem; fora da
            // lista deste cartão (não é `components/modals/*`). O que já
            // existe é o atalho por teclado (segurar shift ao clicar em
            // apagar, `MessageItem.tsx`), então a dica descreve ele — não
            // inventa o toggle. `text-text-xs` é o token de 12px/16 (a escala
            // de `tailwind.config.ts`), não o `text-xs` solto do Tailwind
            // (12px/16 também, mas por coincidência — não é o mesmo token).
            <p className="mr-auto max-w-[240px] text-text-xs text-text-muted">
              Dica: você pode segurar shift ao clicar em apagar mensagem para pular esta
              confirmação.
            </p>
          )}
        </>
      }
    >
      {modal.preview &&
        (mensagem ? (
          // o mesmo cartão dos painéis de fixadas/busca: não existe uma segunda
          // versão da mensagem para envelhecer sozinha
          <div className="max-h-[240px] overflow-y-auto rounded-[5px] border border-border-subtle">
            <MessagePreview message={mensagem} />
          </div>
        ) : (
          // a mensagem pode ter saído da janela de retenção enquanto o modal abria
          <p className="rounded-[5px] border border-border-subtle p-3 text-text-sm text-text-muted">
            Não foi possível carregar a prévia desta mensagem.
          </p>
        ))}
    </Dialog>
  );
}
