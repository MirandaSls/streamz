"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Settings2 } from "lucide-react";
import {
  INVITE_EXPIRY_OPTIONS,
  INVITE_USES_OPTIONS,
  WS_EVENTS,
  displayNameOf,
  type InviteInfo,
} from "@newdisc/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** URL pública do convite — é o que se cola em qualquer lugar. */
export function inviteUrl(code: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/invite/${code}`;
}

/**
 * "Convidar amigos", como no Discord: o link no topo, a lista de conversas com
 * botão "Convidar" (manda o link na DM) e as opções de expiração/usos atrás de
 * "Editar convite".
 *
 * As conversas fazem o papel da lista de amigos enquanto o módulo social não
 * existe: convidar alguém é mandar o link para uma conversa que já existe.
 */
export default function InviteModal({ guildId, code: initialCode }: { guildId: string; code?: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const dms = useDMs((s) => s.channels);
  const refreshDMs = useDMs((s) => s.refreshList);
  const channels = useChannels((s) => s.channels);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [convidados, setConvidados] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  // opções (o valor 0 é "nunca"/"sem limite", como nas listas do contrato)
  const [expiresInMinutes, setExpiresInMinutes] = useState(INVITE_EXPIRY_OPTIONS[5].minutes);
  const [maxUses, setMaxUses] = useState(0);
  const [temporary, setTemporary] = useState(false);
  const [channelId, setChannelId] = useState("");

  const textos = channels.filter((c) => c.type === "TEXT");

  useEffect(() => {
    void refreshDMs();
  }, [refreshDMs]);

  // cria um convite assim que o modal abre (sem código pronto), como o Discord
  useEffect(() => {
    if (initialCode) return;
    let ativo = true;
    void api
      .createInvite(guildId, { expiresInMinutes: INVITE_EXPIRY_OPTIONS[5].minutes })
      .then((i) => {
        if (!ativo) return;
        setInvite(i);
        setCode(i.code);
      })
      .catch((e) => ativo && ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error"));
    return () => {
      ativo = false;
    };
  }, [guildId, initialCode]);

  const url = useMemo(() => (code ? inviteUrl(code) : ""), [code]);

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      // sem permissão de área de transferência o link continua selecionável
      setCopied(false);
    }
  }

  async function regerar() {
    try {
      const novo = await api.createInvite(guildId, {
        expiresInMinutes,
        maxUses,
        temporary,
        channelId: channelId || null,
      });
      setInvite(novo);
      setCode(novo.code);
      setCopied(false);
      setEditing(false);
      ui.toast("Novo link de convite gerado.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível gerar o convite"), "error");
    }
  }

  /** Manda o link do convite na conversa — é o "Convidar" da lista de amigos. */
  function convidar(dmChannelId: string) {
    if (!url) return;
    emit(WS_EVENTS.MESSAGE_CREATE, { channelId: dmChannelId, content: url });
    setConvidados((prev) => [...prev, dmChannelId]);
  }

  const lista = dms.filter((d) => dmTitle(d).toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Dialog
      title="Convidar amigos"
      description="Quem abrir este link entra no servidor."
      onClose={closeModal}
      className="w-[460px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar conversa"
        placeholder="Buscar conversa"
        className="mb-3 h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />

      <div role="list" className="max-h-64 overflow-y-auto">
        {lista.length === 0 ? (
          <p className="px-2 py-3 text-sm text-txt-muted">
            Nenhuma conversa por aqui ainda. Copie o link abaixo e mande do jeito que preferir.
          </p>
        ) : (
          lista.map((d) => {
            const convidado = convidados.includes(d.id);
            const outro = d.others[0];
            return (
              <div
                key={d.id}
                role="listitem"
                className="flex h-[42px] items-center gap-3 rounded px-2 hover:bg-hov"
              >
                {outro ? (
                  <Avatar user={outro} size="md" surface="border-chat" />
                ) : (
                  <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-rail" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-txt-normal">
                  {outro ? displayNameOf(outro) : dmTitle(d)}
                </span>
                <button
                  type="button"
                  disabled={convidado || !url}
                  onClick={() => convidar(d.id)}
                  className={`h-8 rounded-[3px] px-3 text-sm font-medium transition ${
                    convidado
                      ? "cursor-default border border-[#4e5058] text-txt-muted"
                      : "bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                  }`}
                >
                  {convidado ? "Convidado" : "Convidar"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        <Link2 size={14} aria-hidden="true" />
        Ou mande um link de convite
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all truncate rounded-[3px] bg-rail px-3 py-2 font-mono text-sm text-txt-normal">
          {url || "gerando…"}
        </code>
        <button
          type="button"
          disabled={!url}
          onClick={() => void copiar()}
          className="flex h-9 items-center gap-1.5 rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {copied && <Check size={16} aria-hidden="true" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-txt-muted">
        {invite?.expiresAt
          ? `O convite expira em ${new Date(invite.expiresAt).toLocaleString("pt-BR")}.`
          : "Este convite não expira."}
      </p>

      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        aria-expanded={editing}
        className="mt-3 flex items-center gap-1.5 text-sm font-medium text-txt-link hover:underline"
      >
        <Settings2 size={16} aria-hidden="true" />
        {editing ? "Ocultar opções" : "Editar convite"}
      </button>

      {editing && (
        <div className="mt-3 flex flex-col gap-3 rounded-[3px] bg-rail/50 p-3">
          <label className="text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
            Expira em
            <select
              value={expiresInMinutes}
              onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-[3px] bg-rail px-2 text-sm font-normal normal-case text-txt-normal outline-none"
            >
              {INVITE_EXPIRY_OPTIONS.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
            Número máximo de usos
            <select
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-[3px] bg-rail px-2 text-sm font-normal normal-case text-txt-normal outline-none"
            >
              {INVITE_USES_OPTIONS.map((o) => (
                <option key={o.uses} value={o.uses}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
            Canal de destino
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="mt-1 h-9 w-full rounded-[3px] bg-rail px-2 text-sm font-normal normal-case text-txt-normal outline-none"
            >
              <option value="">Padrão do servidor</option>
              {textos.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-txt-normal">
            <input
              type="checkbox"
              checked={temporary}
              onChange={(e) => setTemporary(e.target.checked)}
              className="accent-accent"
            />
            Convite temporário
          </label>

          <button
            type="button"
            onClick={() => void regerar()}
            className="h-9 rounded-[3px] bg-accent text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            Gerar novo link
          </button>
        </div>
      )}
    </Dialog>
  );
}
