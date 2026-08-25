"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

/**
 * "Configurações do usuário". O MVP não tem edição de perfil, então o cartão só
 * mostra a conta e oferece sair — mas o lugar já é o do Discord (engrenagem no
 * rodapé), para as opções entrarem aqui quando existirem.
 */
export default function SettingsModal() {
  const router = useRouter();
  const closeModal = useUI((s) => s.closeModal);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <Dialog
      title="Minha conta"
      onClose={closeModal}
      className="w-[440px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      {user && (
        <div className="overflow-hidden rounded-lg bg-footer">
          <div className="h-[60px] bg-accent" />
          <div className="px-4 pb-4">
            <div className="-mt-8 flex items-end gap-3">
              <div className="rounded-full border-[6px] border-footer">
                <Avatar user={user} size="xl" surface="border-footer" />
              </div>
              <div className="pb-2">
                <div className="text-xl font-bold text-txt-primary">{user.username}</div>
                <div className="text-sm text-txt-muted">@{user.username}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-txt-muted">
              Editar nome, avatar e status ainda não está disponível.
            </p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          closeModal();
          logout();
          router.replace("/login");
        }}
        className="mt-4 flex h-9 w-full items-center gap-2 rounded-[3px] px-3 text-sm font-medium text-red transition hover:bg-red hover:text-white"
      >
        <LogOut size={16} aria-hidden="true" />
        Sair
      </button>
    </Dialog>
  );
}
