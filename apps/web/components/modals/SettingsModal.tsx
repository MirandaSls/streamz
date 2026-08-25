"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LogOut } from "lucide-react";
import { MAX_DISPLAY_NAME, displayNameOf } from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import PerfilTab from "@/components/settings/PerfilTab";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * "Minha conta" — a tela de configurações do usuário do Discord, no que o MVP
 * cobre: avatar (upload), nome de exibição e sair.
 */
export default function SettingsModal() {
  const router = useRouter();
  const closeModal = useUI((s) => s.closeModal);
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = (user?.displayName ?? "") !== displayName.trim();

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      setUser(await api.updateProfile({ displayName: displayName.trim() || null }));
      ui.toast("Perfil salvo.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      setUser(await api.updateAvatar(file));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível trocar o avatar"), "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      title="Minha conta"
      onClose={closeModal}
      className="w-[720px]"
      footer={
        <>
          <PrimaryButton disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>
        </>
      }
    >
      {user && (
        <div className="overflow-hidden rounded-lg bg-footer">
          <div className="h-[60px] bg-accent" />
          <div className="px-4 pb-4">
            <div className="-mt-8 flex items-end gap-3">
              <div className="relative rounded-full border-[6px] border-footer">
                <Avatar user={user} size="xl" surface="border-footer" />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAvatar(f);
                    e.target.value = "";
                  }}
                />
                <Tooltip label="Trocar avatar">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    aria-label="Trocar avatar"
                    className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-panel text-txt-primary shadow-high hover:bg-hov disabled:opacity-50"
                  >
                    <Camera size={16} />
                  </button>
                </Tooltip>
              </div>
              <div className="min-w-0 pb-2">
                <div className="truncate text-xl font-bold text-txt-primary">{displayNameOf(user)}</div>
                <div className="truncate text-sm text-txt-muted">@{user.username}</div>
              </div>
            </div>
            {uploading && <p className="mt-2 text-xs text-txt-muted">Enviando avatar…</p>}
          </div>
        </div>
      )}

      <label htmlFor="displayName" className="mb-2 mt-5 block text-xs font-bold uppercase text-txt-secondary">
        Nome de exibição
      </label>
      <input
        id="displayName"
        value={displayName}
        maxLength={MAX_DISPLAY_NAME}
        onChange={(e) => setDisplayName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={user?.username}
        className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mt-1 text-xs text-txt-muted">
        É o nome que aparece nas mensagens. Vazio = usar @{user?.username}.
      </p>

      {/* ── d-social ── perfil rico; o shell de abas definitivo é do agente E */}
      <div className="mt-6 border-t border-[#3f4147] pt-5">
        <PerfilTab />
      </div>

      <button
        type="button"
        onClick={() => {
          closeModal();
          logout();
          router.replace("/login");
        }}
        className="mt-5 flex h-9 w-full items-center gap-2 rounded-[3px] px-3 text-sm font-medium text-red transition hover:bg-red hover:text-white"
      >
        <LogOut size={16} aria-hidden="true" />
        Sair
      </button>
    </Dialog>
  );
}
