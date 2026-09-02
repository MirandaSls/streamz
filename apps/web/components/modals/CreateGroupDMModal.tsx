"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "@/components/ui/icones";
import { displayNameOf, MAX_DM_GROUP_INVITEES, type PublicUser } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { contactsFromDMs, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, usePresence } from "@/stores/presence";
import { useUI } from "@/stores/ui";

/**
 * "Nova mensagem": a caixa do Discord que já chega com os **seus amigos**
 * listados — marcar um abre a conversa direta, marcar dois ou mais cria o
 * grupo. É a mesma tela para os dois casos porque, do ponto de vista de quem
 * usa, a decisão é só "com quem".
 *
 * Medida no print (`docs/Reference/Captura de tela 2026-09-02 152402.png`):
 * 478 de largura, raio 8; título de 20px com o subtítulo de 14px; busca de
 * 40px com raio 8 e a dica de 12px embaixo; linhas de 48px com avatar de 32,
 * nome de 16 e usuário de 12, e o quadrado de 20px (raio 4) à direita; rodapé
 * com "Cancelar" e "Criar mensagem" de 40px, raio 8, meio a meio.
 *
 * O nome do grupo não se escolhe aqui: no Discord ele é definido depois, nas
 * configurações do grupo, e pedir antes obriga a nomear algo que ainda não
 * existe.
 *
 * A busca por nome continua existindo para quem ainda não é amigo: aqui dá para
 * conversar com qualquer um, não só com a lista de amizades.
 */
export default function CreateGroupDMModal() {
  const closeModal = useUI((s) => s.closeModal);
  const channels = useDMs((s) => s.channels);
  const createGroup = useDMs((s) => s.createGroup);
  const openWith = useDMs((s) => s.openWith);
  const friends = useFriends((s) => s.friends);
  const loadFriends = useFriends((s) => s.load);
  const statuses = usePresence((s) => s.statuses);

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PublicUser[]>([]);
  const [picks, setPicks] = useState<PublicUser[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  // amigos primeiro; quem só tem conversa aberta (e não é amigo) vem depois,
  // porque continuar uma conversa existente é tão comum quanto começar uma
  const conhecidos = useMemo(() => {
    const porId = new Map<string, PublicUser>();
    for (const u of friends) porId.set(u.id, u);
    for (const u of contactsFromDMs(channels)) if (!porId.has(u.id)) porId.set(u.id, u);
    return Array.from(porId.values());
  }, [friends, channels]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let vivo = true;
    const t = window.setTimeout(() => {
      api
        .searchUsers(q)
        .then((users) => vivo && setFound(users))
        .catch(() => vivo && setFound([]));
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [q]);

  // com busca curta a lista é filtrada em memória; a partir de 2 letras o
  // servidor completa com quem ainda não está em nenhuma das listas locais
  const filtrados = q
    ? conhecidos.filter(
        (u) =>
          displayNameOf(u).toLowerCase().includes(q.toLowerCase()) ||
          u.username.toLowerCase().includes(q.toLowerCase()),
      )
    : conhecidos;
  const conhecidosIds = new Set(conhecidos.map((u) => u.id));
  const candidates = [...filtrados, ...found.filter((u) => !conhecidosIds.has(u.id))];
  const pickedIds = new Set(picks.map((u) => u.id));

  const grupo = picks.length >= 2;
  // o limite do contrato é de convidados, além de quem cria
  const membros = MAX_DM_GROUP_INVITEES + 1;

  function toggle(u: PublicUser) {
    setPicks((prev) => {
      if (prev.some((x) => x.id === u.id)) return prev.filter((x) => x.id !== u.id);
      if (prev.length >= MAX_DM_GROUP_INVITEES) return prev;
      return [...prev, u];
    });
  }

  async function submit() {
    if (picks.length === 0 || saving) return;
    setSaving(true);
    // uma pessoa é conversa direta; duas ou mais, grupo
    if (!grupo) {
      await openWith(picks[0].id);
      setSaving(false);
      closeModal();
      return;
    }
    const ok = await createGroup(picks.map((u) => u.id));
    setSaving(false);
    if (ok) closeModal();
  }

  return (
    <Dialog
      title="Nova mensagem"
      description={`Grupos privados podem ter até ${membros} membros.`}
      onClose={closeModal}
      className="w-[478px]"
      bodyClassName="px-6 pt-6"
      footer={
        <>
          <button
            type="button"
            disabled={picks.length === 0 || saving}
            onClick={submit}
            className="h-10 flex-1 rounded-lg bg-accent text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Abrindo…" : "Criar mensagem"}
          </button>
          <button
            type="button"
            onClick={closeModal}
            className="h-10 flex-1 rounded-lg bg-border-strong text-sm font-medium text-txt-normal transition hover:bg-border-strong-hover"
          >
            Cancelar
          </button>
        </>
      }
    >
      {picks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {picks.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u)}
              aria-label={`Remover ${displayNameOf(u)}`}
              className="flex items-center gap-1 rounded-[4px] bg-rail px-2 py-1 text-sm text-txt-primary transition hover:bg-hov"
            >
              {displayNameOf(u)}
              <X size={14} aria-hidden="true" className="text-txt-muted" />
            </button>
          ))}
        </div>
      )}

      {/* a borda em accent no foco vem do estilo global de campos */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        placeholder="Buscar"
        aria-label="Buscar usuário"
        className="h-10 w-full rounded-lg bg-rail px-3 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mt-2 text-xs text-txt-muted">
        Adicione amigos, ou busque alguém pelo nome de usuário, a grupos privados.
      </p>

      <div className="-mx-2 mt-4 max-h-[480px] overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">
            {q
              ? "Ninguém com esse nome."
              : "Você ainda não tem amigos. Busque alguém pelo nome de usuário acima."}
          </p>
        ) : (
          candidates.map((u) => {
            const marcado = pickedIds.has(u.id);
            return (
              <button
                key={u.id}
                type="button"
                role="checkbox"
                aria-checked={marcado}
                onClick={() => toggle(u)}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hov"
              >
                <Avatar user={u} size="md" status={resolveStatus(statuses, u)} surface="border-chat" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold leading-5 text-txt-primary">
                    {displayNameOf(u)}
                  </span>
                  <span className="block truncate text-xs leading-4 text-txt-muted">{u.username}</span>
                </span>
                {/* o quadrado de 20px do Discord; o checkbox nativo não segue o tema */}
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border transition ${
                    marcado ? "border-accent bg-accent text-accent-ink" : "border-txt-faint"
                  }`}
                >
                  {marcado && <Check size={14} />}
                </span>
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
