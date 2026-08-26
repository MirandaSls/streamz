"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Camera, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { MAX_DISPLAY_NAME, displayNameOf } from "@newdisc/shared";
import { EmBreve, Section } from "@/components/settings/controls";
import { PrimaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * "Minha conta".
 *
 * >>> ARQUIVO DO AGENTE I (conta e segurança) <<<
 * Aqui está o que a tela de configurações já fazia antes de virar shell — nome
 * de exibição, avatar e sair — para nada regredir na troca. "Alterar senha",
 * "E-mail" e "2FA" são do agente I: os blocos existem, desativados, no lugar
 * exato onde a implementação dele entra. Quando ele trouxer a versão dele,
 * este arquivo é substituído inteiro; o shell não muda.
 */
export default function ContaTab() {
  const t = useT();
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
    <>
      <Section title={t("aba.conta")}>
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
                  <div className="truncate text-xl font-bold text-txt-primary">
                    {displayNameOf(user)}
                  </div>
                  <div className="truncate text-sm text-txt-muted">@{user.username}</div>
                </div>
              </div>
              {uploading && <p className="mt-2 text-xs text-txt-muted">Enviando avatar…</p>}
            </div>
          </div>
        )}

        <label
          htmlFor="displayName"
          className="mb-2 mt-5 block text-xs font-bold uppercase text-txt-secondary"
        >
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
        <div className="mt-3">
          <PrimaryButton disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </PrimaryButton>
        </div>
      </Section>

      <Section title="Segurança da conta">
        <div className="flex flex-col gap-2">
          <EmBreve>
            <span className="flex items-center gap-2">
              <KeyRound size={16} aria-hidden="true" /> Alterar senha — em breve (agente I)
            </span>
          </EmBreve>
          <EmBreve>
            <span className="flex items-center gap-2">
              <AtSign size={16} aria-hidden="true" /> E-mail da conta — em breve (agente I)
            </span>
          </EmBreve>
          <EmBreve>
            <span className="flex items-center gap-2">
              <ShieldCheck size={16} aria-hidden="true" /> Verificação em duas etapas — em breve
              (agente I)
            </span>
          </EmBreve>
        </div>
      </Section>

      <button
        type="button"
        onClick={() => {
          closeModal();
          logout();
          router.replace("/login");
        }}
        className="flex h-9 w-full items-center gap-2 rounded-[3px] px-3 text-sm font-medium text-red transition hover:bg-red hover:text-white"
      >
        <LogOut size={16} aria-hidden="true" />
        {t("config.sair")}
      </button>
    </>
  );
}
