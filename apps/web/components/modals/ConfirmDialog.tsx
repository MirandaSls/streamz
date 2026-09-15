"use client";

import { useState } from "react";
import MessagePreview from "@/components/chat/MessagePreview";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Checkbox } from "@/components/ui/primitivos/Checkbox";
import { lembrarConfirmacao } from "@/lib/confirmacao-lembrada";
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
 *
 * ## Rodapé (print 1:1 `docs/Reference/Captura de tela 2026-08-31 124114.png`)
 *
 * No Discord o rodapé é **uma linha só**: os dois botões de 40 à direita e,
 * quando a confirmação pode ser lembrada, o checkbox 20×20 com "Não perguntar
 * de novo" em 16px à esquerda, centrado na altura dos botões (caixa y 400–419,
 * botões y 391–428), 12 entre o quadrado e o texto (x 425–444, texto em 457),
 * e 24 do botão até a borda de baixo (y 430–453). A dica do shift morava
 * aqui, em 12px com `max-w-[240px]`, e quebrava em 3 linhas — a linha do
 * rodapé crescia para 48 e a folga de baixo para 28 (captura
 * `saida/desktop/modal-confirmacao.png`, y 606–650). Agora ela vai para o
 * corpo, embaixo da prévia, e o rodapé fica com a altura dos botões.
 *
 * O checkbox só aparece com `chaveDeLembrar`: marcar e **confirmar** grava a
 * escolha (`lib/confirmacao-lembrada.ts`); marcar e cancelar não grava nada,
 * porque "não perguntar de novo" sobre algo que se desistiu de fazer seria
 * pular uma confirmação que a pessoa acabou de usar para desistir.
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
  const [naoPerguntar, setNaoPerguntar] = useState(false);

  function confirmar() {
    if (modal.chaveDeLembrar && naoPerguntar) lembrarConfirmacao(modal.chaveDeLembrar);
    modal.resolve(true);
  }

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
            onClick={confirmar}
          >
            {modal.confirmLabel}
          </PrimaryButton>
          <SecondaryButton autoFocus={modal.danger} onClick={() => modal.resolve(false)}>
            Cancelar
          </SecondaryButton>
          {modal.chaveDeLembrar && (
            // último filho num rodapé `flex-row-reverse`: fica na ponta
            // esquerda, e o `mr-auto` o afasta dos botões, como no 124114
            <Checkbox
              className="mr-auto"
              marcado={naoPerguntar}
              aoMudar={setNaoPerguntar}
              rotulo="Não perguntar de novo"
            />
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
      {modal.preview && (
        // O atalho de teclado que já existe (segurar shift ao clicar em
        // apagar, `MessageItem.tsx`). Fica no corpo, logo abaixo da prévia, e
        // não no rodapé: lá ele quebrava em 3 linhas e empurrava os botões
        // (ver "Rodapé" acima). Posição e espaçamento "não medido" — nenhum
        // print nosso mostra a dica no Discord.
        <p className="mt-2 text-text-xs text-text-muted">
          Dica: você pode segurar shift ao clicar em apagar mensagem para pular esta
          confirmação.
        </p>
      )}
    </Dialog>
  );
}
