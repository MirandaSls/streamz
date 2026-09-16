"use client";

import { useEffect, useState } from "react";
import { MAX_APELIDO_DE_AMIGO, displayNameOf } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Button, TextInput } from "@/components/ui/primitivos";
import { useFriends } from "@/stores/friends";
import { useUI } from "@/stores/ui";

/**
 * "Adicionar apelido de amigo" (ESPEC p2, item 6; `docs/CONTRATO-MENUS.md`
 * §3): só eu vejo, e só existe para quem já é amigo — a API recusa (400) para
 * quem não é, mas o item que abre este modal já não aparece nesse caso.
 *
 * O nome atual (`displayNameOf`, sem apelido nenhum) vira o placeholder do
 * campo, como no Discord — não um valor pré-preenchido, porque o campo vazio
 * também é uma opção válida (nada digitado = nada muda ao salvar).
 */
export default function ApelidoDeAmigoModal({ userId }: { userId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const amigo = useFriends((s) => s.friends.find((f) => f.id === userId));
  const apelidoAtual = useFriends((s) => s.apelidos?.[userId]);
  const definirApelido = useFriends((s) => s.definirApelido);
  const removerApelido = useFriends((s) => s.removerApelido);
  const [texto, setTexto] = useState(apelidoAtual ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setTexto(apelidoAtual ?? "");
  }, [apelidoAtual]);

  const nomeAtual = amigo ? displayNameOf(amigo) : "";

  async function onSalvar() {
    const valor = texto.trim();
    if (!valor || salvando) return;
    setSalvando(true);
    await definirApelido(userId, valor);
    setSalvando(false);
    closeModal();
  }

  async function onRedefinir() {
    if (salvando) return;
    setSalvando(true);
    await removerApelido(userId);
    setSalvando(false);
    closeModal();
  }

  return (
    <Dialog
      title="Adicionar apelido de amigo"
      description="Apelidos de amigos são visíveis apenas para você."
      onClose={closeModal}
      footer={
        apelidoAtual ? (
          // "Redefinir" na ponta esquerda, Cancelar/Salvar na direita — mesmo
          // layout de duas pontas de `RecortarImagemModal.tsx` (o
          // `flex-row-reverse` do `Modal` só empacota os filhos do lado
          // direito; o `justify-between` de um único filho é o que abre a
          // ponta esquerda para o botão de resetar).
          <div className="flex w-full items-center justify-between">
            <Button
              variante="neutro"
              tamanho="sm"
              className="px-3"
              disabled={salvando}
              onClick={() => void onRedefinir()}
            >
              Redefinir apelido
            </Button>
            <div className="flex items-center gap-2">
              <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
              <PrimaryButton
                disabled={salvando || !texto.trim()}
                carregando={salvando}
                onClick={() => void onSalvar()}
              >
                Salvar
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            <PrimaryButton
              disabled={salvando || !texto.trim()}
              carregando={salvando}
              onClick={() => void onSalvar()}
            >
              Salvar
            </PrimaryButton>
            <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
          </>
        )
      }
    >
      <TextInput
        autoFocus
        value={texto}
        maxLength={MAX_APELIDO_DE_AMIGO}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={nomeAtual}
      />
    </Dialog>
  );
}
