"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  LogOut,
  MoreVertical,
  Pencil,
  Plus,
  SendHorizonal,
  SmilePlus,
  UserCircle,
  Users,
  X,
} from "@/components/ui/icones";
import { BotaoDeIcone, Button, Popout, Tooltip } from "@/components/ui/primitivos";
import {
  Permission,
  colorRoleOf,
  customStatusOf,
  displayNameOf,
  rolesOf,
  type UserProfile,
  type UserStatus,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import TagDeBot from "@/components/ui/TagDeBot";
import { MENU_WIDTH, MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { useEhMobile } from "@/hooks/useEhMobile";
import { api } from "@/lib/api";
import { lerRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends, useRelationship } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { useCan, usePermissions } from "@/stores/permissions";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/**
 * Cartão de perfil que abre ao clicar num avatar ou nome — a "popout" do
 * Discord.
 *
 * O que a comparação com o original mudou aqui:
 *
 * - O rodapé é um **campo de texto** ("Mensagem @fulano"), não um botão que
 *   troca de tela: a popout existe justamente para falar com alguém sem sair de
 *   onde se está.
 * - Tudo que é ação de relação (adicionar amigo, bloquear, ver perfil completo,
 *   copiar id) foi para o **kebab** do canto do banner. Empilhadas como linhas
 *   de menu, elas faziam o cartão crescer mais que o conteúdo do perfil.
 * - Não existe bloco "STATUS" com o rótulo escrito: o status é a bolinha do
 *   avatar, e só.
 *
 * Um só na tela, aberto por `ui.openProfile(user, anchor)`.
 *
 * A mecânica — posição e colisão com a janela, Esc, clique fora, foco preso e
 * devolvido, folha no celular, entrada animada — é do `Popout` único
 * (`components/ui/primitivos/Popout.tsx`, onda 0.4). Este arquivo fica só com
 * o conteúdo e com o que é do cartão: onde ele encosta na âncora, a camada
 * abaixo do `ContextMenu` e o Esc que também leva o menu do cartão (ver
 * `ProfilePopoverHost`).
 */

/** 300 no print `2026-09-01 113533` (x=700..999); o conteúdo fica com 268. */
const LARGURA = 300;
/**
 * Folga entre o elemento que abriu e o cartão, quando ele nasce **ao lado**.
 * Não medido: é o número da implementação anterior, igual ao padrão do Popout.
 */
const FOLGA = 8;
/** base do cartão até o topo do rodapé, medida no print (1196,5 → 1202). */
const FOLGA_DO_RODAPE = 6;

/** "25 de agosto de 2026" — o "membro desde" não precisa da hora. */
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/**
 * O seletor de status do Discord, medido no print `2026-09-03 180020`.
 *
 * São **duas** peças, e antes eram uma só (quatro botões empilhados dentro do
 * cartão):
 *
 * 1. uma **linha** no cartão — ponto de status, o rótulo do estado atual e um
 *    chevron —, 32px de altura e raio 8, num fundo levemente mais claro;
 * 2. um **submenu** de 300 que nasce à direita dela, com as quatro escolhas.
 *
 * **Não há mais "por quanto tempo".** O Discord não pergunta duração aqui: os
 * chevrons de "Ausente", "Não perturbar" e "Invisível" existem no desenho, mas
 * o clique aplica o status na hora. Por isso eles são `chevron` (enfeite) e não
 * `submenu` — e o antigo menu de "Por 30 minutos… Até eu mudar", junto com o
 * `setTimeout` que desfazia a escolha, saiu inteiro.
 */
const OPCOES_DE_STATUS: {
  /** `null` = automático (o servidor devolve ONLINE). */
  value: UserStatus | null;
  dot: UserStatus;
  label: string;
  description?: string;
  /** o Discord desenha a setinha em três das quatro. */
  chevron?: boolean;
}[] = [
  { value: null, dot: "ONLINE", label: "Disponível" },
  { value: "IDLE", dot: "IDLE", label: "Ausente", chevron: true },
  {
    value: "DND",
    dot: "DND",
    label: "Não perturbar",
    description: "Você não receberá notificação na área de trabalho",
    chevron: true,
  },
  {
    value: "OFFLINE",
    dot: "OFFLINE",
    label: "Invisível",
    description: "Você vai aparecer Off-line",
    chevron: true,
  },
];

/**
 * Rótulo do **meu** status na linha do cartão. Difere do `STATUS_LABEL` geral
 * em OFFLINE: para os outros é "Offline"; para mim, que escolhi, é "Invisível".
 */
const ROTULO_DO_MEU_STATUS: Record<UserStatus, string> = {
  ONLINE: "Disponível",
  IDLE: "Ausente",
  DND: "Não perturbar",
  OFFLINE: "Invisível",
};

/** Largura do submenu de status: 300 no print (x=298..597, borda inclusa). */
const LARGURA_DO_SUBMENU = 300;
/** o submenu encosta na linha e entra 12px por cima do cartão, como no print. */
const SOBREPOSICAO_DO_SUBMENU = 12;
/** padding (8) + borda (1) do menu: sobe o filho para o topo alinhar com a linha. */
const TOPO_DO_SUBMENU = 9;
/** mesma pausa dos submenus do `ContextMenu`: passar o mouse por cima não abre. */
const ATRASO_DO_SUBMENU = 120;

/**
 * Aplica o status escolhido.
 *
 * Fora do componente de propósito: escolher no submenu fecha o cartão (o
 * mousedown cai fora dele), então quem termina o pedido não pode depender de o
 * `ProfilePopover` ainda estar montado.
 */
async function aplicarStatus(value: UserStatus | null) {
  try {
    useAuth.getState().setUser(await api.updateStatus(value));
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível mudar o status"), "error");
  }
}

/**
 * Abre um menu **sem** perder o cartão.
 *
 * Em geral um menu de contexto *substitui* o popover, e a store fecha o cartão
 * ao abrir o menu. Só que o kebab, o "+" de cargo e o submenu de status
 * pertencem ao cartão — fechá-lo ao abri-los deixaria o menu órfão na tela.
 *
 * **No celular o cartão cede o lugar** (`manter` falso). A folha do `Popout`
 * mora na camada 90 e o `ContextMenu` na 79/80: mantido, o cartão cobriria a
 * folha do menu com o próprio véu, e o toque no kebab pareceria não fazer
 * nada. O estado final é o de antes: lá qualquer toque no menu — item ou véu —
 * já caía fora do cartão e o fechava.
 */
function abrirMenuDoCartao(x: number, y: number, itens: MenuItem[], largura: number, manter: boolean) {
  ui.openContextMenu(x, y, itens, largura, manter);
}

export default function ProfilePopoverHost() {
  const router = useRouter();
  const popover = useUI((s) => s.popover);
  const close = useUI((s) => s.closePopover);
  const openModal = useUI((s) => s.openModal);
  const me = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const developerMode = useSettings((s) => s.developerMode);
  // cargos do membro no servidor aberto: cor do nome e chips abaixo dele
  const roles = usePermissions((s) => s.roles);
  const membros = useGuilds((s) => s.members);
  const guildAtiva = useGuilds((s) => s.activeGuildId);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  // ── d-social ── as ações do cartão dependem da relação com quem ele mostra
  const send = useFriends((s) => s.send);
  const accept = useFriends((s) => s.accept);
  const dismiss = useFriends((s) => s.dismiss);
  const removeFriend = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);
  const incoming = useFriends((s) => s.incoming);
  const relacao = useRelationship(popover?.user.id, me?.id);
  /** O miolo do cartão: a borda direita dele é onde o submenu de status encosta. */
  const ref = useRef<HTMLDivElement>(null);
  const timerDoSubmenu = useRef<number | undefined>(undefined);
  /**
   * No celular o cartão vira **folha inferior** — a do `Popout`.
   *
   * Os 300px ancorados no avatar são a forma certa onde há ponteiro e tela
   * sobrando ao lado; num telefone de 390 o cartão cobre quase a largura toda de
   * qualquer jeito, e ancorado num avatar do topo da conversa ele nasce longe do
   * polegar. Sobe do fundo, como todo popout ancorado do app faz no celular.
   *
   * Virar folha não bastava. As linhas do cartão são `h-8` (32px) e o kebab é
   * `h-7` (28). No ponteiro isso é confortável; no dedo é bem abaixo do piso de
   * 44. Só no celular eles sobem para `h-[44px]`, em px literal porque o número
   * é o piso de toque, não um passo da escala.
   */
  const ehMobile = useEhMobile();
  const [perfil, setPerfil] = useState<UserProfile | null>(null);
  const [rascunho, setRascunho] = useState("");

  const userId = popover?.user.id;

  // o perfil rico (sobre mim, banner, "membro desde") não cabe no PublicUser
  useEffect(() => {
    setPerfil(null);
    setRascunho("");
    if (!userId) return;
    let vivo = true;
    void api
      .profile(userId, guildAtiva ?? undefined)
      .then((p) => vivo && setPerfil(p))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [userId, guildAtiva]);

  useEffect(() => () => window.clearTimeout(timerDoSubmenu.current), []);

  /*
    Esc com um menu do cartão aberto (kebab, "+" de cargo, submenu de status)
    fecha os dois, como antes da migração.

    O `Popout` ouve o Esc na **captura** da `window` e para a propagação ali,
    para o Esc global do app não fechar outra camada junto. O `ContextMenuHost`
    ouve na fase de borbulhar da mesma `window`, que o `stopPropagation` da
    captura já cortou: sem este ouvinte o cartão fechava e o menu ficava órfão
    na tela. Ele também é de captura na `window` — ouvinte do mesmo nó e da
    mesma fase ainda roda depois de um `stopPropagation` (só o
    `stopImmediatePropagation` o cortaria) —, então a ordem de registro entre
    os dois não importa.
  */
  const aberto = popover !== null;
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const { contextMenu, closeContextMenu } = useUI.getState();
      if (contextMenu) closeContextMenu();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aberto]);

  if (!popover) return null;
  const isMe = me?.id === popover.user.id;
  const user = isMe && me ? me : resolveUser(profiles, popover.user);
  const status = resolveStatus(statuses, user);
  const meusCargos = membros.find((m) => m.user.id === user.id)?.roleIds ?? [];
  const cor = colorRoleOf(meusCargos, roles)?.color ?? null;
  const chips = rolesOf(meusCargos, roles);
  const atribuiveis = roles.filter((r) => !r.isDefault && !meusCargos.includes(r.id));
  const banner = perfil?.bannerUrl ?? null;

  const atividade = atividadeDe(user);

  /** Envia a mensagem sem sair da popout — o rodapé do cartão do Discord. */
  async function enviar() {
    const texto = rascunho.trim();
    if (!texto || !me) return;
    setRascunho("");
    try {
      const dm = await api.openDM(user.id);
      // a conversa passa a existir para valer: sem isto ela ficava fora da
      // coluna até chegar mensagem do outro lado
      useDMs.getState().registrar(dm);
      useMessages.getState().send({ channelId: dm.id, guildId: null, author: me, content: texto });
      ui.toast(`Mensagem enviada para @${user.username}`);
    } catch (e) {
      setRascunho(texto);
      ui.toast(errorMessage(e, "Não foi possível enviar a mensagem"), "error");
    }
  }

  /** Menção vai para o rascunho do canal aberto, como no menu do membro. */
  function mencionar() {
    const channelId = useChannels.getState().activeChannelId ?? useDMs.getState().activeId;
    if (!channelId) return;
    const atual = lerRascunho(channelId);
    const prefixo = atual && !atual.endsWith(" ") ? `${atual} ` : atual;
    salvarRascunho(channelId, `${prefixo}@${user.username} `);
    ui.toast(`@${user.username} foi para a caixa de mensagem`);
    close();
  }

  /**
   * Submenu de status, à direita da linha. `manterPopover` (via
   * `abrirMenuDoCartao`) é o que impede o cartão de sumir quando ele abre —
   * no desktop; no celular o cartão cede o lugar (ver `abrirMenuDoCartao`).
   */
  function abrirSubmenuDeStatus(linha: HTMLElement) {
    const r = linha.getBoundingClientRect();
    const direitaDoCartao = ref.current?.getBoundingClientRect().right ?? r.right;
    abrirMenuDoCartao(
      direitaDoCartao - SOBREPOSICAO_DO_SUBMENU,
      r.top - TOPO_DO_SUBMENU,
      OPCOES_DE_STATUS.flatMap((o, i) => {
        const item: MenuItem = {
          label: o.label,
          description: o.description,
          chevron: o.chevron,
          forte: true,
          icon: (
            <span className="block h-2.5 w-2.5">
              <IconeDeStatus status={o.dot} className="h-full w-full" />
            </span>
          ),
          onSelect: () => void aplicarStatus(o.value),
        };
        // separador só depois de "Disponível", como no print
        return i === 1 ? [{ separator: true } as MenuItem, item] : [item];
      }),
      LARGURA_DO_SUBMENU,
      !ehMobile,
    );
  }

  function abrirKebab(x: number, y: number) {
    const itens: MenuItem[] = [
      {
        label: "Perfil",
        onSelect: () => {
          close();
          openModal({ kind: "userProfile", userId: user.id, guildId: guildAtiva ?? undefined });
        },
      },
    ];
    if (isMe) {
      itens.push({
        label: "Editar perfil",
        onSelect: () => {
          close();
          openModal({ kind: "settings", tab: "perfil" });
        },
      });
    } else {
      itens.push({ label: "Mencionar", onSelect: mencionar });
      itens.push({ separator: true });
      if (relacao === "none") {
        itens.push({ label: "Adicionar amigo", onSelect: () => void send(user.username) });
      }
      if (relacao === "outgoing") {
        itens.push({ label: "Pedido de amizade enviado", disabled: true, onSelect: () => {} });
      }
      if (relacao === "incoming") {
        const pedido = incoming.find((r) => r.user.id === user.id);
        itens.push({
          label: "Aceitar pedido de amizade",
          disabled: !pedido,
          onSelect: () => pedido && void accept(pedido.id),
        });
        itens.push({
          label: "Recusar pedido",
          danger: true,
          disabled: !pedido,
          onSelect: () => pedido && void dismiss(pedido.id),
        });
      }
      if (relacao === "friend") {
        itens.push({
          label: "Remover amigo",
          danger: true,
          onSelect: () => {
            close();
            void removeFriend(user);
          },
        });
      }
      itens.push(
        relacao === "blocked"
          ? { label: "Desbloquear", onSelect: () => void unblock(user.id) }
          : {
              label: "Bloquear",
              danger: true,
              onSelect: () => {
                close();
                void block(user);
              },
            },
      );
    }
    if (developerMode) {
      itens.push({ separator: true });
      itens.push({
        label: "Copiar ID do usuário",
        onSelect: () => void navigator.clipboard?.writeText(user.id),
      });
    }
    abrirMenuDoCartao(x, y, itens, MENU_WIDTH_WIDE, !ehMobile);
  }

  return (
    <Popout
      aberto
      aoFechar={close}
      ancora={popover.anchor}
      /*
        Ao lado do elemento que abriu, alinhado pelo topo dele; o Popout
        espelha para a esquerda e para o alinhamento pelo rodapé quando não
        cabe, que é a regra que o cartão já tinha.

        Cartão do rodapé (`acima`): **em cima** do painel do usuário e alinhado
        pela borda esquerda dele. Medido no print `2026-09-03 180020`: cartão em
        x=10 (a mesma folga de 10 do rodapé, ou seja colado na borda da janela)
        e base 6px acima do topo do rodapé.
      */
      lado={popover.acima ? "top" : "right"}
      alinhamento="start"
      distancia={popover.acima ? FOLGA_DO_RODAPE : FOLGA}
      largura={LARGURA}
      rotulo={`Perfil de ${displayNameOf(user)}`}
      /*
        `overflow-hidden`: a faixa do banner respeita o raio da caixa.

        `!z-[75]`: a camada que o cartão tinha, **abaixo** do `ContextMenu`
        (z-80). O Popout põe a caixa na 90, por estilo em linha — e o kebab, o
        "+" de cargo e o submenu de status abrem um `ContextMenu` que tem de
        ficar por cima do cartão: na 90 o menu do kebab nasceria inteiro atrás
        dele. O `!` é o que vence o estilo em linha. Sai quando o menu entrar
        na pilha do Popout (ver a entrega do cartão 0.4-adaptar-perfil). A
        folha do celular não usa esta classe (`classeNaFolha` vazio) e fica na
        camada do Popout; lá o cartão cede o lugar ao menu
        (`abrirMenuDoCartao`).
      */
      className="overflow-hidden !z-[75]"
      classeNaFolha=""
    >
      {/*
        O fundo do cartão continua `--background-surface-higher` num miolo
        próprio, por cima do `--background-surface-high` da caixa do Popout.
        O Discord pinta o cartão com o da caixa (`.outer_c0bea0`, arquivo
        `253781.d118af6e4f0bc056.css`), mas o anel do avatar e o furo do selo
        de status são desta cor, e o `Avatar` só tem o par de selo para
        `surface-higher` — trocar agora vazaria a foto pelos recortes do selo.
        A troca é da onda 5, que redesenha o conteúdo.
      */}
      <div ref={ref} className="bg-background-surface-higher">
        <div className="relative">
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-[120px] w-full object-cover" />
          ) : (
            <div
              style={perfil?.bannerColor ? { backgroundColor: perfil.bannerColor } : undefined}
              className={`h-[60px] ${perfil?.bannerColor ? "" : "bg-brand-500"}`}
            />
          )}
          {/*
            No celular a saída visível da folha é a alça "Fechar" do Popout, por
            cima da faixa — o × que flutuava sobre o banner saiu com a folha
            própria.

            O kebab continua `<button>`: é peça desenhada sobre a imagem, não um
            botão de ícone da interface. As cores são as do botão do banner do
            Discord (`.bannerButton_fb7f94`, arquivo
            `865647.edc0e98a1a191647.css`): fundo
            `--control-overlay-secondary-background-default`, que no hover e no
            clique vai para `...-background-active`, e ícone branco (`--white`;
            aqui `--icon-overlay-light`, o mesmo branco). A forma (redondo, com
            borda) fica para a onda 5.
          */}
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              abrirKebab(r.right - MENU_WIDTH_WIDE, r.bottom + 4);
            }}
            aria-label="Mais opções"
            className={`absolute right-2 top-2 grid place-items-center rounded bg-control-overlay-secondary-background-default text-icon-overlay-light transition hover:bg-control-overlay-secondary-background-active active:bg-control-overlay-secondary-background-active ${
              ehMobile ? "h-[44px] w-[44px]" : "h-7 w-7"
            }`}
          >
            <MoreVertical size={16} />
          </button>
        </div>

        <div className="px-4 pb-4">
          <div className="-mt-10 mb-3 flex items-end justify-between">
            <div className="w-fit rounded-full border-[6px] border-background-surface-higher">
              <Avatar user={user} size="xl" status={status} surface="border-background-surface-higher" />
            </div>
            {/*
              Caixa de emblemas (Nitro, impulso, HypeSquad, desenvolvedor). O
              contrato não tem emblemas ainda — a caixa só aparece quando houver
              algum, para o leiaute já estar pronto quando `PublicUser` ganhar o
              campo.
            */}
            {EMBLEMAS.length > 0 && (
              <div className="mb-1 flex items-center gap-1 rounded-lg bg-background-base-low px-2 py-1">
                {EMBLEMAS.map((b) => (
                  <Tooltip key={b.id} rotulo={b.label}>
                    <span aria-label={b.label}>{b.icon}</span>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-background-base-low p-3">
            <div className="min-w-0">
              {/* ── j-bots ── a pílula ao lado do nome grande, como em
                  `docs/Reference/apps/tag-bot-no-perfil-do-app.png` (medida ali a
                  2×: 30/2 = os mesmos 15px da lista de membros — o Discord não
                  aumenta a pílula porque o nome é maior).
                  A linha virou `flex` para a pílula não entrar no `truncate` do
                  nome e virar reticências. O `min-w-0` no nome é o que mantém o
                  corte funcionando: sem ele um item flex não encolhe abaixo do
                  conteúdo, e um nome de 32 caracteres estouraria o cartão. Sem
                  bot, o desenho é o mesmo de antes (um item só, alinhado à
                  esquerda, mesma altura de linha) — provado no diff de 0 pixel. */}
              <div className="flex min-w-0 items-center gap-2">
                <div
                  style={cor ? { color: cor } : undefined}
                  className="min-w-0 truncate text-xl font-bold leading-6 text-text-strong"
                >
                  {displayNameOf(user)}
                </div>
                {user.bot && <TagDeBot />}
              </div>
              <div className="flex items-center gap-2 text-sm text-text-default">
                <span className="truncate">@{user.username}</span>
                {perfil?.pronouns && (
                  <span className="shrink-0 text-text-muted">{perfil.pronouns}</span>
                )}
              </div>
              {customStatusOf(user) && (
                <div className="mt-1 truncate text-sm text-text-default">{customStatusOf(user)}</div>
              )}
            </div>

            {perfil?.aboutMe && (
              <Secao titulo="Sobre mim">
                <p className="whitespace-pre-wrap break-words text-sm text-text-default">
                  {perfil.aboutMe}
                </p>
              </Secao>
            )}

            {atividade && (
              <Secao titulo="Atividade">
                <p className="text-sm text-text-default">{atividade.nome}</p>
                {atividade.detalhe && <p className="text-xs text-text-muted">{atividade.detalhe}</p>}
              </Secao>
            )}

            {perfil?.createdAt && (
              <Secao titulo="Membro desde">
                {/* a entrada no servidor exigiria um `joinedAt` em GuildMemberView;
                    enquanto não existe, só a criação da conta é verdade */}
                <span className="flex items-center gap-2 text-sm text-text-default">
                  <CalendarDays size={16} aria-hidden="true" className="text-text-muted" />
                  {DATA.format(new Date(perfil.createdAt))}
                </span>
              </Secao>
            )}

            {(chips.length > 0 || (podeCargos && atribuiveis.length > 0)) && (
              <Secao titulo={chips.length === 1 ? "Cargo" : "Cargos"}>
                <div className="flex flex-wrap gap-1">
                  {chips.map((r) => (
                    <span
                      key={r.id}
                      className="flex items-center gap-1.5 rounded-[4px] bg-input-background-default py-1 pl-2 pr-1 text-xs text-text-default"
                    >
                      {/* cargo sem cor: o Discord pinta com `--role-default`, que
                          não foi gerado em `tokens.css`; o cinza cru fica até ele
                          existir (registrado no cartão 0.4-adaptar-perfil) */}
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: r.color ?? "#8a8a8e" }}
                        className="h-3 w-3 rounded-full"
                      />
                      {r.name}
                      {podeCargos && !isMe && (
                        <button
                          type="button"
                          onClick={() => void toggleRole(user.id, r.id, false)}
                          aria-label={`Remover o cargo ${r.name}`}
                          className="grid h-4 w-4 place-items-center rounded text-text-muted transition hover:bg-status-danger hover:text-control-critical-primary-text-default"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {podeCargos && !isMe && atribuiveis.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        abrirMenuDoCartao(
                          r.left,
                          r.bottom + 4,
                          atribuiveis.map((cargo) => ({
                            label: cargo.name,
                            dot: cargo.color ?? undefined,
                            onSelect: () => void toggleRole(user.id, cargo.id, true),
                          })),
                          MENU_WIDTH,
                          !ehMobile,
                        );
                      }}
                      aria-label="Adicionar cargo"
                      className="grid h-[26px] w-6 place-items-center rounded-[4px] bg-input-background-default text-text-muted transition hover:text-text-strong"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </Secao>
            )}

            {perfil && perfil.mutualGuilds.length > 0 && !isMe && (
              <Secao titulo={`${perfil.mutualGuilds.length} servidores em comum`}>
                <div className="flex items-center gap-1 text-xs text-text-muted">
                  <Users size={14} aria-hidden="true" />
                  {perfil.mutualGuilds
                    .slice(0, 3)
                    .map((g) => g.name)
                    .join(", ")}
                </div>
              </Secao>
            )}
          </div>

          {isMe && (
            <>
              {/*
                O botão do print `113533`: 268x32, raio 8, 16 de folga das bordas
                do cartão — o `Button` primário `sm` (32, raio 8) na largura
                toda. Fica fora do cartão interno, como no Discord, e as opções
                de status e de conta vêm depois dele.

                O invólucro `flex` existe porque o `Button` é `inline-flex`: solto
                num bloco ele entraria numa linha de texto, e a entrelinha do pai
                poderia somar folga embaixo dele. 44 no celular é o piso de toque.
              */}
              <div className="mt-3 flex">
                <Button
                  variante="primario"
                  tamanho="sm"
                  larguraTotal
                  icone={<Pencil size={16} aria-hidden="true" />}
                  onClick={() => {
                    close();
                    openModal({ kind: "settings", tab: "perfil" });
                  }}
                  className="celular:h-[44px]"
                >
                  Editar perfil
                </Button>
              </div>
              {/*
                A linha de status do print `2026-09-03 180020` (x=34..285,
                y=1076..1107): 32 de altura, raio 8, fundo levemente mais claro
                que o cartão, ponto de 12 num quadro de 16 com 8 de folga até o
                rótulo (14, negrito) e o chevron no canto. Abre no clique e no
                hover, como no Discord.

                Uma diferença registrada: lá a linha mora dentro de um painel de
                268 junto com "Editar perfil", e por isso mede 252 com 8 de folga
                de cada lado; aqui "Editar perfil" continua sendo o botão de
                accent medido no #44, então a linha usa os 268 inteiros do miolo
                do cartão. (Com a raiz de 16px da ADR-0009, `h-8` agora mede os
                32 do print.)
              */}
              <button
                type="button"
                aria-haspopup="menu"
                onClick={(e) => abrirSubmenuDeStatus(e.currentTarget)}
                onPointerEnter={(e) => {
                  const el = e.currentTarget;
                  window.clearTimeout(timerDoSubmenu.current);
                  timerDoSubmenu.current = window.setTimeout(() => {
                    // com um menu já aberto o hover não faz nada: reabrir o mesmo
                    // submenu remontaria o painel e ele reapareceria piscando a
                    // cada ida e volta do mouse
                    if (useUI.getState().contextMenu) return;
                    abrirSubmenuDeStatus(el);
                  }, ATRASO_DO_SUBMENU);
                }}
                onPointerLeave={() => window.clearTimeout(timerDoSubmenu.current)}
                className={`mt-2 flex w-full items-center gap-2 rounded-lg bg-background-base-low px-2 text-left text-sm font-semibold text-text-strong transition hover:bg-interactive-background-hover ${
                  ehMobile ? "h-[44px]" : "h-8"
                }`}
              >
                <span aria-hidden="true" className="grid h-4 w-4 shrink-0 place-items-center">
                  <IconeDeStatus status={status} className="h-3 w-3" />
                </span>
                <span className="flex-1 truncate">{ROTULO_DO_MEU_STATUS[status]}</span>
                {/* 5x10 de tinta no print → 20 no nosso ativo (ver `ContextMenu`) */}
                <ChevronRight size={20} aria-hidden="true" className="shrink-0 opacity-80" />
              </button>

              {/* ordem do Discord: status → separador → personalizado → conta */}
              <div className="mt-3 flex flex-col gap-0.5 border-t border-border-subtle pt-3">
                <ItemDeMenu
                  icon={<SmilePlus size={16} />}
                  onClick={() => {
                    close();
                    openModal({ kind: "customStatus" });
                  }}
                >
                  {customStatusOf(user) ? "Editar status personalizado" : "Status personalizado"}
                </ItemDeMenu>
                {/*
                  "Mudar de conta" é a palavra do print `2026-09-03 202926`, e o
                  ícone é o pictograma de pessoa em círculo que aparece nele. A
                  linha deixou de deslogar: agora abre "Gerenciar contas", com as
                  contas do aparelho (`lib/contas.ts`).
                */}
                <ItemDeMenu
                  icon={<UserCircle size={16} />}
                  onClick={() => {
                    close();
                    openModal({ kind: "gerenciarContas" });
                  }}
                >
                  Mudar de conta
                </ItemDeMenu>
                <ItemDeMenu
                  icon={<LogOut size={16} />}
                  danger
                  onClick={() => {
                    close();
                    logout();
                    router.replace("/login");
                  }}
                >
                  Sair
                </ItemDeMenu>
              </div>
            </>
          )}

          {!isMe && relacao !== "blocked" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
              className="mt-3 flex items-center gap-1 rounded-lg bg-chat-background-default px-2"
            >
              {/*
                O campo continua `<input>` nativo: é peça interna do controle
                composto (o fundo e o arredondado são do `<form>`, que divide a
                moldura com o botão de enviar), não um `TextInput` com moldura
                própria.
              */}
              <input
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                aria-label={`Mensagem para @${user.username}`}
                placeholder={`Mensagem @${user.username}`}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-text-default outline-none placeholder:text-text-muted"
              />
              {/* `sm` (24) é a caixa do `BotaoDeIcone` para ícone de 16 em canto
                  de cartão; o botão antigo tinha 28, que não é passo do
                  primitivo. 44 no celular é o piso de toque. */}
              <BotaoDeIcone
                type="submit"
                rotulo="Enviar mensagem"
                icone={<SendHorizonal size={16} />}
                tamanho="sm"
                disabled={!rascunho.trim()}
                className="celular:h-[44px] celular:w-[44px]"
              />
            </form>
          )}
        </div>
      </div>
    </Popout>
  );
}

/**
 * Emblemas do perfil. Vazio enquanto o contrato não tiver `badges` no
 * `PublicUser`/`UserProfile` — a caixa só é desenhada quando houver algum.
 */
const EMBLEMAS: { id: string; label: string; icon: ReactNode }[] = [];

interface Atividade {
  nome: string;
  detalhe?: string;
}

/**
 * Atividade ("Jogando…") de alguém. Sempre null: o contrato não tem presença
 * rica. Fica como função para o cartão já saber se desenhar quando `PublicUser`
 * ganhar o campo — é só devolver a atividade aqui.
 */
function atividadeDe(_user: { id: string }): Atividade | null {
  return null;
}

/** Bloco titulado do cartão ("Sobre mim", "Cargos", "Membro desde"). */
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <h3 className="mb-2 text-xs font-bold uppercase text-text-subtle">{titulo}</h3>
      {children}
    </div>
  );
}

/** Linha de menu do próprio perfil (status personalizado, conta, sair). */
function ItemDeMenu({
  icon,
  onClick,
  danger = false,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  const ehMobile = useEhMobile();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[3px] px-2 text-left text-sm transition ${
        ehMobile ? "h-[44px]" : "h-8"
      } ${
        danger
          ? "text-status-danger hover:bg-status-danger hover:text-control-critical-primary-text-default"
          : "text-text-default hover:bg-interactive-background-hover hover:text-text-strong"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}
