"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "@/components/ui/icones";
import { MAX_DM_GROUP_NAME } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { TextInput } from "@/components/ui/primitivos";
import { GroupAvatar } from "@/components/ui/Avatar";
import { useDMs } from "@/stores/dms";
import { useUI } from "@/stores/ui";

/**
 * "Editar grupo": a caixa pequena do Discord (título, avatar central com lápis
 * no canto, nome, Cancelar/Salvar lado a lado). É a edição rápida aberta pelo
 * menu da conversa e pelo botão do cabeçalho do grupo; a tela cheia com abas
 * continua em `GroupSettingsModal.tsx`.
 *
 * Nome e ícone só vão ao servidor no "Salvar": o ícone escolhido ganha uma
 * prévia local (object URL) e Cancelar/X/Esc descartam os dois sem rastro.
 */
export default function EditarGrupoModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const dm = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);
  const rename = useDMs((s) => s.rename);
  const updateIcon = useDMs((s) => s.updateIcon);

  const [name, setName] = useState(dm?.name ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // a prévia é um object URL: liberar quando troca ou o modal fecha
  useEffect(() => {
    if (!arquivo) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  if (!dm) {
    return (
      <Dialog title="Editar grupo" onClose={closeModal}>
        <p className="text-sm text-text-muted">Conversa não encontrada.</p>
      </Dialog>
    );
  }

  async function salvar() {
    if (salvando || !dm) return;
    setSalvando(true);
    const nome = name.trim();
    if (nome !== (dm.name ?? "")) {
      const ok = await rename(channelId, nome || null);
      // rename já avisa o erro por toast; manter a caixa aberta para tentar de novo
      if (!ok) {
        setSalvando(false);
        return;
      }
    }
    if (arquivo) await updateIcon(channelId, arquivo);
    setSalvando(false);
    closeModal();
  }

  return (
    <Dialog
      title="Editar grupo"
      onClose={closeModal}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <SecondaryButton full onClick={closeModal} disabled={salvando}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton onClick={() => void salvar()} disabled={salvando} carregando={salvando}>
            Salvar
          </PrimaryButton>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setArquivo(f);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-[110px] w-[110px]">
          <GroupAvatar iconUrl={previa ?? dm.iconUrl} members={dm.others} seed={dm.id} className="!h-[110px] !w-[110px]" />
          <button
            type="button"
            aria-label="Escolher ícone do grupo"
            disabled={salvando}
            onClick={() => fileRef.current?.click()}
            className="absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full border-2 border-background-base-low bg-background-mod-strong text-white transition-colors hover:bg-interactive-background-hover disabled:opacity-60"
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        </div>
        <TextInput
          value={name}
          maxLength={MAX_DM_GROUP_NAME}
          disabled={salvando}
          aria-label="Nome do grupo"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void salvar();
            }
          }}
          placeholder={dm.others.map((u) => u.username).join(", ")}
          classeDaCaixa="w-full"
        />
      </div>
    </Dialog>
  );
}
