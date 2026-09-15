"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "@/components/ui/icones";
import { displayNameOf, MAX_DM_GROUP_INVITEES, type PublicUser } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { Button, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { contactsFromDMs, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, usePresence } from "@/stores/presence";
import { useUI } from "@/stores/ui";

/**
 * "Selecionar amigos": a caixa do Discord que já chega com os **seus amigos**
 * listados — marcar um abre a conversa direta, marcar dois ou mais cria o
 * grupo. É a mesma tela para os dois casos porque, do ponto de vista de quem
 * usa, a decisão é só "com quem".
 *
 * **Título** (era "Nova mensagem"): o passo a passo oficial do Discord
 * (`suporte/api/artigos.json` #223657667, "How to Create a Group DM ›
 * Desktop/Browser") descreve literalmente essa janela — "In the **Select
 * Friends** window, scroll through your list or search by username" —, e é o
 * texto que o cartão pede. Não há print 1:1 dela; a fonte é o texto do
 * próprio artigo de suporte, não um pixel.
 *
 * **Legenda dinâmica** (era estática, "Grupos privados podem ter até N
 * membros."): o mesmo artigo, "Tip: Group DMs support up to **10 members
 * total** (including yourself)" — então a legenda agora conta quanto ainda
 * cabe, como o cartão pede ("Você pode adicionar mais N amigos"), e vira aviso
 * de limite quando chega a zero. **Não medido**: o texto exato do Discord
 * para as duas variantes (a nossa é uma tradução funcional do comportamento,
 * não um print).
 *
 * Medida no print (`docs/Reference/Captura de tela 2026-09-02 152402.png`):
 * 480 de largura com a borda de 1px (o padrão do `Dialog` desde o #59; o
 * `w-[478px]` de antes somado à borda dava 480 medidos), raio 8; título de
 * 20px com o subtítulo de 14px; busca de
 * 40px com raio 8 e a dica de 12px embaixo; linhas de 48px com avatar de 32,
 * nome de 16 e usuário de 12, e o quadrado de 20px (raio 4) à direita; rodapé
 * com "Cancelar" e o botão principal de 40px, raio 8, meio a meio.
 *
 * O nome do grupo não se escolhe aqui: no Discord ele é definido depois, nas
 * configurações do grupo, e pedir antes obriga a nomear algo que ainda não
 * existe.
 *
 * A busca por nome continua existindo para quem ainda não é amigo: aqui dá para
 * conversar com qualquer um, não só com a lista de amizades.
 *
 * **Estados**: linha desabilitada (opacidade 50%, `aria-disabled` — não
 * `disabled` nativo, senão a dica que explica o motivo nunca dispararia,
 * mesmo raciocínio do item 8 de `BotaoDeIcone.tsx`) quando o grupo já está no
 * teto e a pessoa não foi marcada; esqueleto de três linhas enquanto a busca
 * no servidor está em voo (o filtro local não espera nada, só o `found`
 * espera); aviso com "Tentar de novo" quando a busca no servidor falha, sem
 * esconder quem já apareceu pelo filtro local.
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
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState(false);
  const [tentativaBusca, setTentativaBusca] = useState(0);

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
      setBuscando(false);
      setErroBusca(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    setErroBusca(false);
    const t = window.setTimeout(() => {
      api
        .searchUsers(q)
        .then((users) => {
          if (!vivo) return;
          setFound(users);
          setBuscando(false);
        })
        .catch(() => {
          if (!vivo) return;
          setFound([]);
          setBuscando(false);
          setErroBusca(true);
        });
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [q, tentativaBusca]);

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
  // esqueleto só quando não há NADA pra mostrar ainda — o filtro local não
  // espera resposta nenhuma, então uma busca por gente já conhecida não deve
  // piscar esqueleto por cima do que já está na tela
  const mostrarEsqueleto = buscando && candidates.length === 0;

  const grupo = picks.length >= 2;
  // o limite do contrato é de convidados, além de quem cria
  const membros = MAX_DM_GROUP_INVITEES + 1;
  const limiteAtingido = picks.length >= MAX_DM_GROUP_INVITEES;
  const restantes = MAX_DM_GROUP_INVITEES - picks.length;
  const legenda = limiteAtingido
    ? `Você atingiu o limite de ${membros} pessoas no grupo.`
    : `Você pode adicionar mais ${restantes} ${restantes === 1 ? "amigo" : "amigos"}.`;

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
      telaCheiaNoCelular
      title="Selecionar amigos"
      description={legenda}
      onClose={closeModal}
      bodyClassName="pt-6"
      footer={
        <>
          <Button
            variante="primario"
            tamanho="md"
            disabled={picks.length === 0 || saving}
            onClick={submit}
            className="flex-1"
          >
            {saving ? (grupo ? "Criando…" : "Abrindo…") : grupo ? "Criar DM em grupo" : "Criar mensagem"}
          </Button>
          <Button variante="secundario" tamanho="md" onClick={closeModal} className="flex-1">
            Cancelar
          </Button>
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
              className="flex items-center gap-1 rounded-[4px] bg-input-background-default px-2 py-1 text-sm text-text-strong transition hover:bg-interactive-background-hover"
            >
              {displayNameOf(u)}
              <X size={14} aria-hidden="true" className="text-text-muted" />
            </button>
          ))}
        </div>
      )}

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        placeholder="Buscar"
        aria-label="Buscar usuário"
      />
      <p className="mt-2 text-xs text-text-muted">
        Adicione amigos, ou busque alguém pelo nome de usuário, a grupos privados.
      </p>

      <div className="-mx-2 mt-4 max-h-[480px] overflow-y-auto">
        {erroBusca && (
          <div className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-input-background-default px-3 py-2">
            <span className="text-xs text-text-muted">Não foi possível buscar no servidor.</span>
            <Button variante="link" tamanho="xs" onClick={() => setTentativaBusca((n) => n + 1)}>
              Tentar de novo
            </Button>
          </div>
        )}

        {mostrarEsqueleto ? (
          // três linhas na forma da linha real, pulsando — sem par medido
          // (não há print da busca em voo); só a proporção avatar+nome é
          // emprestada da linha real, abaixo
          <div aria-label="Buscando" role="list">
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden="true" className="flex h-12 animate-pulse items-center gap-3 px-2">
                <span className="h-8 w-8 shrink-0 rounded-full bg-background-base-low" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-2/5 rounded-lg bg-background-base-low" />
                  <span className="block h-2.5 w-1/4 rounded-lg bg-background-base-low" />
                </span>
              </div>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <p className="px-3 py-3 text-sm text-text-muted">
            {q
              ? "Ninguém com esse nome."
              : "Você ainda não tem amigos. Busque alguém pelo nome de usuário acima."}
          </p>
        ) : (
          candidates.map((u) => {
            const marcado = pickedIds.has(u.id);
            // desabilitada quando o grupo já está no teto e ela não foi
            // marcada — `aria-disabled`, não `disabled` nativo: um `<button
            // disabled>` não recebe hover no Chromium, e a dica que explica
            // "por quê" nunca apareceria (mesma razão do item 8 de
            // `BotaoDeIcone.tsx`)
            const bloqueada = limiteAtingido && !marcado;
            const linha = (
              <button
                key={u.id}
                type="button"
                role="checkbox"
                aria-checked={marcado}
                aria-disabled={bloqueada || undefined}
                onClick={() => {
                  if (!bloqueada) toggle(u);
                }}
                className={`flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition ${
                  bloqueada ? "cursor-not-allowed opacity-50" : "hover:bg-interactive-background-hover"
                }`}
              >
                <Avatar user={u} size="md" status={resolveStatus(statuses, u)} surface="border-background-base-lower" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold leading-5 text-text-strong">
                    {displayNameOf(u)}
                  </span>
                  <span className="block truncate text-xs leading-4 text-text-muted">{u.username}</span>
                </span>
                {/* o quadrado de 20px do Discord; o checkbox nativo não segue o tema */}
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border transition ${
                    marcado ? "border-brand-500 bg-brand-500 text-control-primary-text-default" : "border-channels-default"
                  }`}
                >
                  {marcado && <Check size={14} />}
                </span>
              </button>
            );
            return bloqueada ? (
              <Tooltip key={u.id} label="O grupo já está cheio">
                {linha}
              </Tooltip>
            ) : (
              linha
            );
          })
        )}
      </div>
    </Dialog>
  );
}
