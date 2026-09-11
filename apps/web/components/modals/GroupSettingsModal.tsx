"use client";

import { useRef, useState } from "react";
import { Camera, Settings, UserPlus, Users } from "@/components/ui/icones";
import { MAX_DM_GROUP_NAME, displayNameOf } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import JanelaDeConfiguracoes, { type ItemDeMenu } from "@/components/ui/JanelaDeConfiguracoes";
import { Rotulo } from "@/components/ui/controls";
import { RegistrarAlteracoes, useControleDeAlteracoes } from "@/components/ui/alteracoes";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { dmTitle, useDMs } from "@/stores/dms";
import { ui, useUI } from "@/stores/ui";

type Aba = "geral" | "convites";

const ROTULO: Record<Aba, string> = {
  geral: "Visão geral",
  convites: "Convites",
};

/**
 * Configurações do grupo de DM — **tela cheia**, na mesma moldura das
 * configurações de canal e de servidor. Qualquer participante pode mudar nome e
 * ícone, como no Discord.
 */
export default function GroupSettingsModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const dm = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);
  const rename = useDMs((s) => s.rename);
  const updateIcon = useDMs((s) => s.updateIcon);

  const [aba, setAba] = useState<Aba>("geral");
  const [name, setName] = useState(dm?.name ?? "");
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alteracoes = useControleDeAlteracoes();

  if (!dm) {
    return (
      <Dialog title="Grupo" onClose={closeModal}>
        <p className="text-sm text-text-muted">Conversa não encontrada.</p>
      </Dialog>
    );
  }

  const dirty = (dm.name ?? "") !== name.trim();

  async function salvar() {
    if (!dirty || salvando) return;
    setSalvando(true);
    await rename(channelId, name.trim() || null);
    setSalvando(false);
  }

  async function enviarIcone(file: File) {
    setEnviando(true);
    await updateIcon(channelId, file);
    setEnviando(false);
  }

  const itens: ItemDeMenu[] = [
    { id: "geral", label: ROTULO.geral, icon: <Settings size={18} aria-hidden="true" /> },
    { id: "convites", label: ROTULO.convites, icon: <UserPlus size={18} aria-hidden="true" /> },
  ];

  return (
    <JanelaDeConfiguracoes
      titulo={dmTitle(dm)}
      cabecalho={dmTitle(dm)}
      grupos={[{ id: "grupo", itens }]}
      abaId={aba}
      onAba={(id) => setAba(id as Aba)}
      tituloAba={ROTULO[aba]}
      controle={alteracoes}
      onClose={closeModal}
    >
      <RegistrarAlteracoes dirty={dirty} salvar={salvar} redefinir={() => setName(dm.name ?? "")} />

      {aba === "geral" && (
        <>
          <div className="flex items-center gap-4">
            <div className="relative">
              <GroupAvatar iconUrl={dm.iconUrl} members={dm.others} size="xl" />
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
                  className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-background-base-lowest text-text-strong shadow-popout hover:bg-interactive-background-hover disabled:opacity-50"
                >
                  <Camera size={16} />
                </button>
              </Tooltip>
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-strong">{dmTitle(dm)}</p>
              <p className="flex items-center gap-1 text-sm text-text-muted">
                <Users size={14} aria-hidden="true" />
                {dm.others.length + 1} participantes
              </p>
              {enviando && <p className="mt-1 text-xs text-text-muted">Enviando ícone…</p>}
            </div>
          </div>

          <div className="mt-6">
            <Rotulo htmlFor="groupName">Nome do grupo</Rotulo>
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
              className="h-10 w-full rounded-[3px] bg-input-background-default px-2.5 text-text-default outline-none placeholder:text-text-muted"
            />
            <p className="mt-1 text-xs text-text-muted">
              Vazio = usar os nomes dos participantes.
            </p>
          </div>
        </>
      )}

      {aba === "convites" && (
        <>
          <p className="mb-4 text-sm text-text-muted">
            Grupos não têm link de convite: quem entra é adicionado por alguém que já está dentro.
          </p>
          <button
            type="button"
            onClick={() => ui.openModal({ kind: "addGroupMembers", channelId })}
            className="flex h-10 items-center gap-2 rounded-[3px] bg-brand-500 px-4 text-sm font-medium text-control-primary-text-default transition hover:bg-control-primary-background-hover"
          >
            <UserPlus size={18} aria-hidden="true" />
            Adicionar amigos ao grupo
          </button>

          <div className="mt-6">
            <Rotulo>Participantes</Rotulo>
            <ul className="flex flex-col">
              {dm.others.map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-[3px] px-2 py-1.5">
                  <Avatar user={u} size="md" surface="border-background-base-lower" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-strong">
                      {displayNameOf(u)}
                    </span>
                    <span className="block truncate text-xs text-text-muted">@{u.username}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </JanelaDeConfiguracoes>
  );
}
