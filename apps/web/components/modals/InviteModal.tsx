"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Hash } from "lucide-react";
import {
  INVITE_EXPIRY_OPTIONS,
  INVITE_USES_OPTIONS,
  WS_EVENTS,
  displayNameOf,
  type InviteInfo,
  type PublicUser,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { Select, ToggleLinha } from "@/components/ui/controls";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useChannels } from "@/stores/channels";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { resolveStatus, usePresence } from "@/stores/presence";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** URL pública do convite — é o que se cola em qualquer lugar. */
export function inviteUrl(code: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/invite/${code}`;
}

/** "7 dias", "3 horas", "12 minutos" — o quanto ainda falta para expirar. */
function faltamAte(iso: string, agora = Date.now()): string {
  const ms = new Date(iso).getTime() - agora;
  if (!Number.isFinite(ms) || ms <= 0) return "menos de um minuto";
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * "Convidar amigos para <servidor>": a lista de **amigos** com um botão cada, o
 * link colável embaixo e as opções atrás de "Editar link de convite".
 *
 * As opções abrem numa segunda caixa por cima desta, e não inline: é o que o
 * Discord faz, e agora que os modais empilham a de baixo continua no lugar.
 */
export default function InviteModal({
  guildId,
  code: initialCode,
}: {
  guildId: string;
  code?: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const friends = useFriends((s) => s.friends);
  const loadFriends = useFriends((s) => s.load);
  const statuses = usePresence((s) => s.statuses);
  const channels = useChannels((s) => s.channels);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const [copied, setCopied] = useState(false);
  const [editando, setEditando] = useState(false);
  const [convidados, setConvidados] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  // opções (o valor 0 é "nunca"/"sem limite", como nas listas do contrato)
  const [expiresInMinutes, setExpiresInMinutes] = useState(INVITE_EXPIRY_OPTIONS[5].minutes);
  const [maxUses, setMaxUses] = useState(0);
  const [temporary, setTemporary] = useState(false);
  const [channelId, setChannelId] = useState("");

  const textos = channels.filter((c) => c.type === "TEXT");
  const destino = textos.find((c) => c.id === channelId) ?? textos[0] ?? null;

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

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
      setEditando(false);
      ui.toast("Novo link de convite gerado.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível gerar o convite"), "error");
    }
  }

  /**
   * Manda o link na conversa direta com o amigo.
   *
   * Abre a conversa pela API em vez de `useDMs.openWith`: aquele muda a coluna
   * para o modo DM, e convidar de dentro do servidor não pode tirar ninguém de
   * onde estava.
   */
  async function convidar(amigo: PublicUser) {
    if (!url) return;
    try {
      const dm = await api.openDM(amigo.id);
      emit(WS_EVENTS.MESSAGE_CREATE, { channelId: dm.id, content: url });
      setConvidados((prev) => [...prev, amigo.id]);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar o convite"), "error");
    }
  }

  const termo = busca.trim().toLowerCase();
  const lista = friends.filter(
    (f) =>
      !termo ||
      displayNameOf(f).toLowerCase().includes(termo) ||
      f.username.toLowerCase().includes(termo),
  );

  return (
    <>
      <Dialog title={`Convidar amigos para ${guild?.name ?? "o servidor"}`} onClose={closeModal}>
        {destino && (
          <p className="mb-3 flex items-center gap-1 text-sm text-txt-muted">
            <Hash size={16} aria-hidden="true" className="shrink-0" />
            {destino.name}
          </p>
        )}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar amigo"
          placeholder="Buscar amigos"
          className="mb-3 h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
        />

        <div role="list" className="max-h-64 overflow-y-auto">
          {lista.length === 0 ? (
            <p className="px-2 py-3 text-sm text-txt-muted">
              {friends.length === 0
                ? "Você ainda não tem amigos aqui. Copie o link abaixo e mande do jeito que preferir."
                : "Nenhum amigo com esse nome."}
            </p>
          ) : (
            lista.map((amigo) => {
              const convidado = convidados.includes(amigo.id);
              return (
                <div
                  key={amigo.id}
                  role="listitem"
                  className="flex h-[42px] items-center gap-3 rounded px-2 hover:bg-hov"
                >
                  <Avatar
                    user={amigo}
                    size="md"
                    status={resolveStatus(statuses, amigo)}
                    surface="border-chat"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-txt-normal">
                    {displayNameOf(amigo)}
                  </span>
                  <button
                    type="button"
                    disabled={convidado || !url}
                    onClick={() => void convidar(amigo)}
                    className={`flex h-8 w-[92px] shrink-0 items-center justify-center gap-1 rounded-[3px] text-sm font-medium transition ${
                      convidado
                        ? "cursor-default border border-border-strong text-txt-muted"
                        : "bg-accent text-accent-ink hover:bg-accent-hover disabled:opacity-50"
                    }`}
                  >
                    {convidado && <Check size={14} aria-hidden="true" />}
                    {convidado ? "Convidado" : "Convidar"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
          Ou mande um link de convite para um amigo
        </p>
        {/* input + botão num container só: no Discord os dois são uma peça */}
        <div className="flex h-10 items-center overflow-hidden rounded-[3px] bg-rail pl-2.5">
          <input
            value={url || "gerando…"}
            readOnly
            aria-label="Link do convite"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent text-sm text-txt-normal outline-none"
          />
          <button
            type="button"
            disabled={!url}
            onClick={() => void copiar()}
            className="mr-1 flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
          >
            {copied && <Check size={16} aria-hidden="true" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p aria-live="polite" className="mt-2 text-xs text-txt-muted">
          {invite?.expiresAt
            ? `Seu link expira em ${faltamAte(invite.expiresAt)}. `
            : "Seu link não expira. "}
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="font-medium text-txt-link hover:underline"
          >
            Editar link de convite
          </button>
        </p>
      </Dialog>

      {editando && (
        <Dialog
          title="Configurações do link de convite"
          onClose={() => setEditando(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => void regerar()}
                className="h-[38px] min-w-24 rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
              >
                Gerar novo link
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="h-[38px] min-w-24 rounded-[3px] px-4 text-sm font-medium text-txt-normal transition hover:underline"
              >
                Cancelar
              </button>
            </>
          }
        >
          <Select
            semDivisoria
            label="Expirar depois de"
            value={String(expiresInMinutes)}
            options={INVITE_EXPIRY_OPTIONS.map((o) => ({
              value: String(o.minutes),
              label: o.label,
            }))}
            onChange={(v) => setExpiresInMinutes(Number(v))}
          />

          <div className="mt-4">
            <Select
              semDivisoria
              label="Número máximo de usos"
              value={String(maxUses)}
              options={INVITE_USES_OPTIONS.map((o) => ({ value: String(o.uses), label: o.label }))}
              onChange={(v) => setMaxUses(Number(v))}
            />
          </div>

          {textos.length > 0 && (
            <div className="mt-4">
              <Select
                semDivisoria
                label="Canal de destino"
                value={channelId}
                options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
                onChange={setChannelId}
                emptyLabel="Padrão do servidor"
              />
            </div>
          )}

          <div className="mt-2 border-t border-border pt-1">
            <ToggleLinha
              checked={temporary}
              onChange={setTemporary}
              titulo="Conceder acesso de membro temporário"
              hint="Quem entrar por este link sai do servidor ao se desconectar, a menos que ganhe um cargo."
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
