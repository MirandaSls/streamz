"use client";

import { useState } from "react";
import { ShieldCheck, User } from "lucide-react";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import ContaTab from "@/components/settings/ContaTab";
import SegurancaTab from "@/components/settings/SegurancaTab";
import { useUI } from "@/stores/ui";

/**
 * Configurações do usuário.
 *
 * Duas abas — "Minha conta" (perfil, e-mail, senha, encerrar) e "Segurança"
 * (2FA, códigos de recuperação, sessões). O conteúdo mora em
 * `components/settings/*`, e não aqui, porque a frente de configurações traz um
 * *shell* de nove abas que consome exatamente esses mesmos componentes: quando
 * as duas branches se encontrarem, este modal sai e as abas ficam.
 */
const ABAS = [
  { id: "conta", rotulo: "Minha conta", icone: User, Componente: ContaTab },
  { id: "seguranca", rotulo: "Segurança", icone: ShieldCheck, Componente: SegurancaTab },
] as const;

export default function SettingsModal() {
  const closeModal = useUI((s) => s.closeModal);
  const [abaAtiva, setAbaAtiva] = useState<(typeof ABAS)[number]["id"]>("conta");
  const aba = ABAS.find((a) => a.id === abaAtiva) ?? ABAS[0];

  return (
    <Dialog
      title="Configurações"
      onClose={closeModal}
      className="w-[560px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div role="tablist" aria-label="Configurações" className="mb-4 flex gap-1">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === abaAtiva}
            onClick={() => setAbaAtiva(id)}
            className={`flex h-8 items-center gap-1.5 rounded-[3px] px-3 text-sm font-medium transition ${
              id === abaAtiva
                ? "bg-accent text-white"
                : "text-txt-normal hover:bg-hov hover:text-txt-primary"
            }`}
          >
            <Icone size={16} aria-hidden="true" />
            {rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        <aba.Componente />
      </div>
    </Dialog>
  );
}
