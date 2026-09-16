"use client";

import { useEffect, useState } from "react";
import { MAX_NOTA_DE_USUARIO } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { TextArea } from "@/components/ui/primitivos";
import { useNotas } from "@/stores/notas";
import { useUI } from "@/stores/ui";

/**
 * "Adicionar nota" / "Editar nota" (ESPEC p2, item 5; `docs/CONTRATO-MENUS.md`
 * §2): texto privado sobre um usuário, visível só para mim — nunca para a
 * pessoa anotada, nem para ninguém em servidor comum.
 *
 * O título muda para "Editar nota" quando já existe uma (mesmo texto do
 * Discord); o rótulo de quem abre o modal ("Nota"/"Adicionar nota (em
 * breve)") é decisão de cada lugar que chama (`ProfilePopover`,
 * `DMProfilePanel`, `UserProfileModal`).
 */
export default function NotaDeUsuarioModal({ userId }: { userId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const notaSalva = useNotas((s) => s.nota(userId));
  const salvar = useNotas((s) => s.salvar);
  const carregar = useNotas((s) => s.load);
  const [texto, setTexto] = useState(notaSalva);
  const [salvando, setSalvando] = useState(false);

  // a aba pode ter aberto o modal antes do boot terminar de carregar
  // `minhasNotas` (`hooks/useRealtime.ts`) — `load` é idempotente, e o efeito
  // abaixo preenche o campo se a nota chegar depois da primeira renderização
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    setTexto(notaSalva);
    // só quando a nota carregada muda, não a cada tecla digitada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notaSalva]);

  async function onSalvar() {
    if (salvando) return;
    setSalvando(true);
    const ok = await salvar(userId, texto);
    setSalvando(false);
    if (ok) closeModal();
  }

  return (
    <Dialog
      title={notaSalva ? "Editar nota" : "Adicionar nota"}
      description="Visível apenas para você"
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton disabled={salvando} carregando={salvando} onClick={() => void onSalvar()}>
            Salvar
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <TextArea
        autoFocus
        rows={4}
        contador
        value={texto}
        maxLength={MAX_NOTA_DE_USUARIO}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Clique para adicionar uma nota"
      />
    </Dialog>
  );
}
