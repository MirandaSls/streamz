"use client";

import { useEffect, useMemo, useState } from "react";
import { displayNameOf, MAX_DM_GROUP_INVITEES, type PublicUser } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { Button, TextInput } from "@/components/ui/primitivos";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useUI } from "@/stores/ui";

/**
 * "Adicionar pessoas" a um grupo de DM.
 *
 * Só amigos aparecem — é assim no Discord, e evita que o grupo vire um caminho
 * para chegar a quem não quer ser encontrado. Quem já está no grupo some da
 * lista assim que entra.
 *
 * **Estados** (nenhum coberto antes desta entrega):
 * - **Carregando**: a store de amigos (`useFriends`) tinha `loading`/`load`
 *   prontos, mas este modal nunca chamava `load()` — quem abrisse "Adicionar
 *   pessoas" sem ter passado pela página Amigos ou por "Selecionar amigos"
 *   antes via `friends` vazio e lia "Você ainda não tem amigos", uma mentira
 *   quando a lista só não tinha chegado ainda. Corrigido com o mesmo
 *   `useEffect(() => void load(), [load])` que `CreateGroupDMModal` já tem.
 * - **Erro**: `addMember` (`stores/dms.ts`) já toasta sozinho
 *   ("Não foi possível adicionar ao grupo"); nada a fazer aqui — é o mesmo
 *   padrão que `send`/`load` da store de amigos usa.
 * - **Sem permissão** (grupo no teto): "Group DMs support up to 10 members
 *   total (including yourself)" (`suporte/api/artigos.json` #223657667) — com
 *   o grupo cheio não há ninguém para adicionar, e a busca vira uma tela morta
 *   sem dizer por quê. Agora mostra o aviso e nem desenha a busca.
 * - **Conversa sumiu**: se o canal fechou enquanto o modal estava aberto
 *   (`dm` vira `null` — outra aba te removeu, por exemplo), a lista parava de
 *   filtrar quem já está dentro (`dentro` ficava vazio) e oferecia "adicionar"
 *   todo mundo a uma conversa que não existe mais. Agora o modal diz que a
 *   conversa não existe mais e não desenha busca nem lista.
 */
export default function AddGroupMembersModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const dm = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);
  const addMember = useDMs((s) => s.addMember);
  const friends = useFriends((s) => s.friends);
  const carregandoAmigos = useFriends((s) => s.loading);
  const amigosCarregados = useFriends((s) => s.loaded);
  const loadFriends = useFriends((s) => s.load);
  const [query, setQuery] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const dentro = useMemo(() => new Set(dm?.others.map((u) => u.id) ?? []), [dm]);
  const q = query.trim().toLowerCase();
  const candidatos = friends.filter(
    (f) =>
      !dentro.has(f.id) &&
      (!q || displayNameOf(f).toLowerCase().includes(q) || f.username.toLowerCase().includes(q)),
  );
  // "up to the maximum limit" (10, incluindo quem cria) — qualquer membro
  // pode convidar, mas ninguém convida além do teto
  const capacidadeTotal = MAX_DM_GROUP_INVITEES + 1;
  const cheio = (dm?.others.length ?? 0) + 1 >= capacidadeTotal;

  async function adicionar(user: PublicUser) {
    setOcupado(user.id);
    await addMember(channelId, user.id);
    setOcupado(null);
  }

  return (
    <Dialog
      telaCheiaNoCelular
      title="Adicionar pessoas"
      description="Só amigos aparecem aqui."
      onClose={closeModal}
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      {!dm ? (
        <p className="px-1 py-3 text-sm text-text-muted">Esta conversa não existe mais.</p>
      ) : cheio ? (
        <p className="px-1 py-3 text-sm text-text-muted">
          O grupo já está no limite de {capacidadeTotal} pessoas.
        </p>
      ) : (
        <>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Buscar entre seus amigos"
            aria-label="Buscar amigo"
            classeDaCaixa="mb-2"
          />

          <div className="max-h-64 overflow-y-auto rounded bg-input-background-default/50">
            {carregandoAmigos && !amigosCarregados ? (
              // três linhas de esqueleto — sem par medido (não há print do
              // modal carregando); só empresta a forma da linha real abaixo
              <div aria-label="Carregando amigos" role="list">
                {[0, 1, 2].map((i) => (
                  <div key={i} aria-hidden="true" className="flex animate-pulse items-center gap-3 px-3 py-2">
                    <span className="h-6 w-6 shrink-0 rounded-full bg-background-base-low" />
                    <span className="h-3 w-2/5 rounded-lg bg-background-base-low" />
                  </div>
                ))}
              </div>
            ) : candidatos.length === 0 ? (
              <p className="px-3 py-3 text-sm text-text-muted">
                {friends.length === 0
                  ? "Você ainda não tem amigos para adicionar."
                  : "Todos os seus amigos já estão neste grupo."}
              </p>
            ) : (
              candidatos.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-text-default hover:bg-interactive-background-hover"
                >
                  <Avatar user={u} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{displayNameOf(u)}</span>
                    <span className="block truncate text-xs text-text-muted">@{u.username}</span>
                  </span>
                  <Button
                    variante="primario"
                    tamanho="sm"
                    disabled={ocupado === u.id}
                    onClick={() => void adicionar(u)}
                    className="shrink-0"
                  >
                    {ocupado === u.id ? "Adicionando…" : "Adicionar"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
