"use client";

import { useEffect, useState } from "react";
import { MAX_APELIDO_NO_SERVIDOR, displayNameOf } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { Button, TextInput } from "@/components/ui/primitivos";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { useModeration } from "@/stores/moderation";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** Sigla do servidor — mesmo fallback do rail e de `PerfilDoServidorTab.tsx`. */
function acronym(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * "Editar perfil por servidor" do menu do ícone do servidor (ESPEC p5, item
 * 8; `docs/CONTRATO-MENUS.md` §5): hoje só o apelido — avatar, faixa e bio
 * por servidor não existem neste produto (nota discreta abaixo do campo).
 *
 * Mesma ressalva de `PrivacidadeDoServidorModal.tsx`: o menu que abre este
 * modal existe para qualquer servidor da barra, não só o aberto — por isso
 * busca com `membershipDe` quando não é o ativo, e só sincroniza
 * `useModeration.membership` (para a lista de membros e o composer verem sem
 * F5) quando `editarAssociacao` devolve o servidor realmente ativo.
 */
export default function PerfilPorServidorModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const user = useAuth((s) => s.user);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId));
  const membershipAtivo = useModeration((s) => s.membership);
  const membershipDe = useModeration((s) => s.membershipDe);
  const editarAssociacao = useModeration((s) => s.editarAssociacao);

  const jaTenho = membershipAtivo?.guildId === guildId ? membershipAtivo : null;
  const [nicknameAtual, setNicknameAtual] = useState<string | null | undefined>(
    jaTenho ? (jaTenho.nickname ?? null) : undefined,
  );
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [texto, setTexto] = useState(jaTenho?.nickname ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (jaTenho) return;
    let cancelado = false;
    membershipDe(guildId)
      .then((m) => {
        if (cancelado) return;
        setNicknameAtual(m.nickname ?? null);
        setTexto(m.nickname ?? "");
      })
      .catch(() => {
        if (!cancelado) setErroAoCarregar(true);
      });
    return () => {
      cancelado = true;
    };
    // só na entrada: `jaTenho` só serve para o valor inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const nomeGlobal = user ? displayNameOf(user) : "";
  const nomeResultante = texto.trim() || nomeGlobal;
  const carregado = nicknameAtual !== undefined;

  async function salvar(novoNickname: string | null) {
    if (salvando) return;
    setSalvando(true);
    try {
      await editarAssociacao(guildId, { nickname: novoNickname });
      setNicknameAtual(novoNickname);
      setTexto(novoNickname ?? "");
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar o apelido"), "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      title="Editar perfil por servidor"
      onClose={closeModal}
      footer={
        nicknameAtual ? (
          // "Redefinir" na ponta esquerda, Cancelar/Salvar na direita — mesmo
          // layout de `ApelidoDeAmigoModal.tsx`.
          <div className="flex w-full items-center justify-between">
            <Button
              variante="neutro"
              tamanho="sm"
              className="px-3"
              disabled={salvando}
              onClick={() => void salvar(null)}
            >
              Redefinir
            </Button>
            <div className="flex items-center gap-2">
              <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
              <PrimaryButton
                disabled={salvando || !carregado}
                carregando={salvando}
                onClick={() => void salvar(texto.trim() || null)}
              >
                Salvar
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            <PrimaryButton
              disabled={salvando || !carregado}
              carregando={salvando}
              onClick={() => void salvar(texto.trim() || null)}
            >
              Salvar
            </PrimaryButton>
            <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
          </>
        )
      }
    >
      <div className="flex items-center gap-2 pb-4">
        <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-background-base-lowest text-[9px] font-semibold text-text-muted">
          {guild?.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            guild && acronym(guild.name)
          )}
        </span>
        <span className="truncate text-sm text-text-muted">{guild?.name}</span>
      </div>

      {!carregado ? (
        erroAoCarregar ? (
          <p className="py-3 text-sm text-text-muted">Não foi possível carregar o seu perfil neste servidor.</p>
        ) : (
          <p className="py-3 text-sm text-text-muted">Carregando…</p>
        )
      ) : (
        <>
          <label htmlFor="apelido-no-servidor" className="mb-2 block text-xs font-semibold uppercase text-text-muted">
            Apelido do servidor
          </label>
          <TextInput
            id="apelido-no-servidor"
            autoFocus
            value={texto}
            maxLength={MAX_APELIDO_NO_SERVIDOR}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={nomeGlobal}
          />

          {/* Prévia do cartão — nome como vai aparecer na lista de membros e
              como autor de mensagem, com o apelido aplicado. */}
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border-subtle bg-background-surface-high p-3">
            {user && <Avatar user={user} size="md" surface="border-background-surface-high" />}
            <span className="min-w-0 truncate text-base font-semibold text-text-strong">
              {nomeResultante}
            </span>
          </div>

          <p className="mt-4 text-xs text-text-muted">
            Avatar, faixa e biografia por servidor ainda não existem no Streamz —
            só o apelido, por enquanto.
          </p>
        </>
      )}
    </Dialog>
  );
}
