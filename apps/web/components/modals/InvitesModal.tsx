"use client";

import InvitesPanel from "@/components/modals/InvitesPanel";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * Convites do servidor como caixa de diálogo — o atalho do menu do servidor.
 * O conteúdo é o mesmo `InvitesPanel` da aba "Convites" das configurações, para
 * não existirem duas listas de convite que envelhecem diferente.
 *
 * Sem `className`: o `Dialog` já cai no "médio" do Discord, 480 (ver o
 * cabeçalho de `components/modals/Dialog.tsx`) — o `w-[480px]` explícito que
 * este arquivo tinha era o mesmo número, duplicado. Carregando/vazio/erro são
 * do `InvitesPanel` (fora desta lista de arquivos); aqui só a caixa e o
 * rodapé.
 */
export default function InvitesModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      telaCheiaNoCelular
      title="Convites"
      onClose={closeModal}
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <InvitesPanel guildId={guildId} />
    </Dialog>
  );
}
