"use client";

import { useRef, useState } from "react";
import { Camera, Crown, Settings, Trash2, UserMinus, UserPlus, Users } from "@/components/ui/icones";
import { MAX_DM_GROUP_INVITEES, MAX_DM_GROUP_NAME, displayNameOf } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import JanelaDeConfiguracoes, { type ItemDeMenu } from "@/components/ui/JanelaDeConfiguracoes";
import { BotaoDeIcone, Button, Campo, TextInput, Tooltip } from "@/components/ui/primitivos";
import { RegistrarAlteracoes, useControleDeAlteracoes } from "@/components/ui/alteracoes";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import { useAuth } from "@/stores/auth";
import { dmTitle, useDMs } from "@/stores/dms";
import { ui, useUI } from "@/stores/ui";

type Aba = "geral" | "convites";

const ROTULO: Record<Aba, string> = {
  geral: "Visão geral",
  convites: "Convites",
};

/**
 * Configurações do grupo de DM — cartão 6y-grupo (redesenho de paridade sobre
 * a versão de vocabulário anterior). Qualquer participante pode mudar nome e
 * ícone, como no Discord; só o dono (`dm.ownerId`) remove gente — o mesmo par
 * de regras que `DMMemberList.tsx` já usa na coluna de membros da conversa.
 *
 * **Sem print 1:1 desta tela.** Nenhuma captura do acervo mostra a versão
 * atual (pós-refresh 2025) das configurações de um grupo de DM — só a
 * caixa antiga "Edit Group" (`referencias-discord/suporte/imagens/
 * discord-basics/223657667-group-chat-and-calls/20.png` e `22.png`: avatar
 * central com lápis no canto, campo do nome embaixo, "Cancel"/"Save"),
 * escala desconhecida e de uma interface que o Discord já substituiu. Pela
 * regra de autoridade (§7 da ADR-0009), isso vale só para ORDEM/PRESENÇA, não
 * para pixel — e nem para ordem, aqui: essa caixa é um modal de edição rápida
 * fora da moldura de configurações, não a tela `JanelaDeConfiguracoes` que
 * este arquivo usa.
 *
 * Por isso o padrão emprestado é de dentro da própria moldura: **nome antes
 * do ícone**, como `ChannelSettingsModal.tsx` (nome do canal é o primeiro
 * campo) e `PerfilDoServidorTab.tsx` (nome do servidor antes do bloco
 * "Ícone", medido no print `Captura de tela 2026-09-04 100541.png`); e
 * **avatar ao lado de um par de botões com texto** (não o distintivo de
 * câmera sobre o avatar que `ContaTab.tsx`/`CriarServidorModal.tsx` usam),
 * como `PerfilTab.tsx` faz para a foto do usuário — o distintivo sobre o
 * avatar é o desenho de cartão de identidade (com faixa), e esta aba não tem
 * faixa nem cartão, é lista de campos como as outras duas.
 */
export default function GroupSettingsModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const me = useAuth((s) => s.user);
  const dm = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);
  const rename = useDMs((s) => s.rename);
  const updateIcon = useDMs((s) => s.updateIcon);
  const removeMember = useDMs((s) => s.removeMember);

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
  const souDono = dm.ownerId === me?.id;
  // "Group DMs support up to 10 members total (including yourself)"
  // (suporte/api/artigos.json #223657667) — a mesma fórmula de
  // `AddGroupMembersModal.tsx`/`DMMemberList.tsx`, para o botão "Adicionar"
  // ficar cinza aqui também, e não só nos outros dois lugares que já sabem do
  // teto.
  const capacidadeTotal = MAX_DM_GROUP_INVITEES + 1;
  const cheio = dm.others.length + 1 >= capacidadeTotal;

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
        <div className="space-y-6">
          <Campo
            rotulo="Nome do grupo"
            htmlFor="groupName"
            ajuda="Vazio = usar os nomes dos participantes."
          >
            <TextInput
              id="groupName"
              value={name}
              maxLength={MAX_DM_GROUP_NAME}
              disabled={salvando}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void salvar();
                }
              }}
              placeholder={dm.others.map((u) => u.username).join(", ")}
            />
          </Campo>

          {/* Divisória + cabeçalho de bloco: o mesmo par (`mt-10`/`h-px
              bg-border-subtle`) de `PerfilDoServidorTab.tsx` entre "Nome" e
              "Ícone" — a única medida real disponível para esse espaçamento,
              já que não há print desta tela. */}
          <div aria-hidden="true" className="h-px bg-border-subtle" />

          <div>
            <h2 className="text-text-md font-semibold text-text-strong">Ícone do grupo</h2>
            <p className="mt-1 flex items-center gap-1 text-text-sm text-text-muted">
              <Users size={14} aria-hidden="true" />
              {dm.others.length + 1} participantes
            </p>
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
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <GroupAvatar iconUrl={dm.iconUrl} members={dm.others} size="xl" />
              <div className="flex items-center gap-2">
                <Button
                  variante="primario"
                  tamanho="sm"
                  icone={<Camera size={16} aria-hidden="true" />}
                  disabled={enviando}
                  onClick={() => fileRef.current?.click()}
                  className="celular:h-[44px]"
                >
                  {enviando ? "Enviando…" : dm.iconUrl ? "Trocar ícone" : "Escolher ícone"}
                </Button>
                {/* A API (`lib/api.ts`) só tem `updateGroupIcon`: dá para trocar,
                    não para remover — diferente do servidor (`removeGuildIcon`)
                    e do perfil do usuário (`removeAvatar`). O Discord real
                    remove ("Changing or Removing the Group DM Icon",
                    suporte #223657667); aqui o botão fica visível e cinza com
                    a dica (em breve) em vez de sumir ou fingir que funciona
                    (§6.6 do PROCESSO) — `desabilitado`/`motivoDesabilitado`
                    é o par do `BotaoDeIcone` para isso (item 8 do cabeçalho
                    dele): mantém a dica onde `disabled` nativo a mataria. */}
                {dm.iconUrl && (
                  <BotaoDeIcone
                    rotulo="Remover ícone do grupo"
                    icone={<Trash2 size={16} aria-hidden="true" />}
                    tamanho="lg"
                    comFundo
                    tom="perigo"
                    desabilitado
                    motivoDesabilitado="Ainda não dá para remover o ícone do grupo (em breve)."
                    onClick={() => {}}
                    className="celular:h-[44px] celular:w-[44px]"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {aba === "convites" && (
        <div className="space-y-6">
          {/*
            Ordem e presença do popout real do Discord ("Select Friends",
            catálogo `suporte/imagens/discord-basics/
            360004851252-instant-invite-102-group-invites/01.png`, recente,
            2026-09, escala desconhecida): lista de amigos para adicionar
            direto primeiro, link de convite depois. Aqui os dois viram dois
            blocos em vez de um popout só, porque "adicionar" já é um modal
            de busca próprio (`AddGroupMembersModal.tsx`) que este cartão não
            reabre.
          */}
          <div>
            <h2 className="text-text-md font-semibold text-text-strong">Adicionar ao grupo</h2>
            <p className="mt-1 text-text-sm text-text-muted">
              Só amigos aparecem na busca — quem entra vem de dentro do Streamz.
            </p>
            <div className="mt-3">
              {cheio ? (
                // mesma frase e mesma fórmula de `DMMemberList.tsx`
                <Tooltip rotulo={`O grupo já está no limite de ${capacidadeTotal} pessoas.`}>
                  <Button variante="primario" icone={<UserPlus size={18} aria-hidden="true" />} disabled>
                    Adicionar amigos ao grupo
                  </Button>
                </Tooltip>
              ) : (
                <Button
                  variante="primario"
                  icone={<UserPlus size={18} aria-hidden="true" />}
                  onClick={() => ui.openModal({ kind: "addGroupMembers", channelId })}
                >
                  Adicionar amigos ao grupo
                </Button>
              )}
            </div>
          </div>

          <div className="h-px bg-border-subtle" />

          <div>
            {/*
              O Discord real gera link (`https://discord.gg/CÓDIGO`, expira em
              48h, o dono revoga o de qualquer pessoa — suporte
              #360004851252, "Instant Invite 102 - Group Invites"). Não existe
              rota nenhuma para isso em `packages/shared`/`lib/api.ts`: nem
              criar, nem listar, nem revogar. Por §6.6 do PROCESSO, o controle
              fica visível e cinza com "(em breve)" em vez de a tela negar que
              o Discord tem essa peça (o texto antigo, "Grupos não têm link de
              convite", estava descrevendo o Streamz como se fosse regra do
              Discord).
            */}
            <h2 className="text-text-md font-semibold text-text-strong">Link de convite</h2>
            <p className="mt-1 text-text-sm text-text-muted">
              No Discord, qualquer participante gera um link que expira em 48 horas. Aqui ainda não.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <TextInput
                value=""
                disabled
                readOnly
                aria-label="Link de convite do grupo"
                placeholder="streamz.chat/convite/…"
                classeDaCaixa="flex-1"
              />
              <Tooltip rotulo="Gerar link de convite (em breve)">
                <Button variante="secundario" disabled>
                  Copiar
                </Button>
              </Tooltip>
            </div>
          </div>

          <div className="h-px bg-border-subtle" />

          <div>
            {/* mesma pauta do cabeçalho "Membros — N" de `DMMemberList.tsx`
                (`.eyebrow` 12px bold caixa-alta, tracking 0.02em) — é a
                mesma informação, cabeçalho de lista, não rótulo de campo. */}
            <h3 className="text-text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
              Participantes — {dm.others.length + 1}
            </h3>
            {dm.others.length === 0 ? (
              <p className="mt-2 text-text-sm text-text-muted">Só você está neste grupo.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {dm.others.map((u) => {
                  const dono = dm.ownerId === u.id;
                  const nome = displayNameOf(u);
                  return (
                    <li
                      key={u.id}
                      className="group flex items-center gap-3 rounded-[3px] px-2 py-1.5 hover:bg-interactive-background-hover"
                    >
                      <Avatar user={u} size="md" surface="border-background-base-lower" />
                      <span className="flex min-w-0 flex-1 items-center gap-1">
                        <span className="min-w-0">
                          <span className="block truncate text-text-sm text-text-strong">{nome}</span>
                          <span className="block truncate text-text-xs text-text-muted">@{u.username}</span>
                        </span>
                        {dono && (
                          // par medido em `DMMemberList.tsx`:
                          // `.ownerIcon__5d473{color:var(--text-feedback-warning)}`
                          <Tooltip rotulo="Criou o grupo">
                            <Crown
                              size={14}
                              className="shrink-0 text-text-feedback-warning"
                              aria-label="Criou o grupo"
                            />
                          </Tooltip>
                        )}
                      </span>
                      {/* sem permissão = sem botão: só o dono remove, como em
                          `DMMemberList.tsx` (`souDono`) — o não-dono nem vê o
                          alvo, em vez de ver e ganhar um aviso ao clicar. */}
                      {souDono && u.id !== me?.id && (
                        <BotaoDeIcone
                          rotulo={`Remover ${nome} do grupo`}
                          icone={<UserMinus size={16} aria-hidden="true" />}
                          tamanho="sm"
                          tom="perigo"
                          onClick={() => void removeMember(channelId, u)}
                          className="opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 celular:opacity-100"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </JanelaDeConfiguracoes>
  );
}
