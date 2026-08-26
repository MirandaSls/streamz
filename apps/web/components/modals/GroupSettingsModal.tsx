"use client";

import { useRef, useState } from "react";
import { Camera, Users } from "lucide-react";
import { MAX_DM_GROUP_NAME } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Tooltip from "@/components/ui/Tooltip";
import { dmTitle, useDMs } from "@/stores/dms";
import { useUI } from "@/stores/ui";

/** Nome e ícone do grupo de DM — qualquer participante pode mudar, como no Discord. */
export default function GroupSettingsModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const dm = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);
  const rename = useDMs((s) => s.rename);
  const updateIcon = useDMs((s) => s.updateIcon);

  const [name, setName] = useState(dm?.name ?? "");
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!dm) {
    return (
      <Dialog title="Grupo" onClose={closeModal} className="w-[440px]">
        <p className="text-sm text-txt-muted">Conversa não encontrada.</p>
      </Dialog>
    );
  }

  const dirty = (dm.name ?? "") !== name.trim();

  async function salvar() {
    if (!dirty || salvando) return;
    setSalvando(true);
    const ok = await rename(channelId, name.trim() || null);
    setSalvando(false);
    if (ok) closeModal();
  }

  async function enviarIcone(file: File) {
    setEnviando(true);
    await updateIcon(channelId, file);
    setEnviando(false);
  }

  return (
    <Dialog
      title="Configurações do grupo"
      onClose={closeModal}
      className="w-[440px]"
      footer={
        <>
          <PrimaryButton disabled={!dirty || salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          {dm.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dm.iconUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-full bg-accent text-accent-ink">
              <Users size={36} />
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviarIcone(f);
              e.target.value = "";
            }}
          />
          <Tooltip label="Trocar ícone">
            <button
              type="button"
              disabled={enviando}
              onClick={() => fileRef.current?.click()}
              aria-label="Trocar ícone do grupo"
              className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-panel text-txt-primary shadow-high hover:bg-hov disabled:opacity-50"
            >
              <Camera size={16} />
            </button>
          </Tooltip>
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-txt-primary">{dmTitle(dm)}</p>
          <p className="text-sm text-txt-muted">{dm.others.length + 1} participantes</p>
          {enviando && <p className="mt-1 text-xs text-txt-muted">Enviando ícone…</p>}
        </div>
      </div>

      <label htmlFor="groupName" className="mb-2 mt-5 block text-xs font-bold uppercase text-txt-secondary">
        Nome do grupo
      </label>
      <input
        id="groupName"
        value={name}
        maxLength={MAX_DM_GROUP_NAME}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void salvar();
          }
        }}
        placeholder={dm.others.map((u) => u.username).join(", ")}
        className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mt-1 text-xs text-txt-muted">
        Vazio = usar os nomes dos participantes.
      </p>
    </Dialog>
  );
}
