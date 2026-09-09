"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";
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
import { ui, useUI, type MenuItem, type Popover } from "@/stores/ui";

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
 */

/** 300 no print `2026-09-01 113533` (x=700..999); o conteúdo fica com 268. */
const LARGURA = 300;
/** folga entre o elemento que abriu e o cartão. */
const FOLGA = 8;
const BORDA = 8;
/** base do cartão até o topo do rodapé, medida no print (1196,5 → 1202). */
const FOLGA_DO_RODAPE = 6;

/** "25 de agosto de 2026" — o "membro desde" não precisa da hora. */
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

const FOCALIZAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

interface Colocacao {
  x: number;
  y: number;
}

/**
 * Abre um menu **sem** perder o cartão.
 *
 * Em geral um menu de contexto *substitui* o popover, e a store fecha o cartão
 * ao abrir o menu. Só que o kebab, o "+" de cargo e a duração do status
 * pertencem ao cartão — fechá-lo ao abri-los deixaria o menu órfão na tela.
 */
function abrirMenuDoCartao(
  _popover: Popover,
  x: number,
  y: number,
  itens: MenuItem[],
  largura: number,
) {
  ui.openContextMenu(x, y, itens, largura, true);
}

/**
 * Ao lado do elemento e **alinhado a ele**: à direita se couber, senão à
 * esquerda; alinhado pelo topo, e pelo rodapé quando o cartão passaria da
 * janela. Antes o topo era o `anchor.y` cru com um clamp — perto do rodapé o
 * cartão descolava do que o abriu.
 */
function posicionar(
  anchor: { x: number; y: number; width: number; height: number },
  altura: number,
  acima = false,
): Colocacao {
  /*
    Cartão do rodapé: **em cima** do painel do usuário e alinhado pela borda
    esquerda dele. Ancorado no botão do nome, o nosso nascia à direita dele — no
    meio da coluna de conversas — e com uma folga que o Discord não tem. Medido
    no print `2026-09-03 180020`: cartão em x=10 (a mesma folga de 10 do rodapé,
    ou seja colado na borda da janela) e base 6px acima do topo do rodapé.
  */
  if (acima) {
    const y = anchor.y - altura - FOLGA_DO_RODAPE;
    return {
      x: Math.max(BORDA, Math.min(anchor.x, window.innerWidth - LARGURA - BORDA)),
      y: Math.max(BORDA, y),
    };
  }
  let x = anchor.x + anchor.width + FOLGA;
  if (x + LARGURA > window.innerWidth - BORDA) x = anchor.x - LARGURA - FOLGA;
  if (x < BORDA) x = Math.max(BORDA, window.innerWidth - LARGURA - BORDA);

  let y = anchor.y;
  if (y + altura > window.innerHeight - BORDA) y = anchor.y + anchor.height - altura;
  return { x, y: Math.max(BORDA, Math.min(y, window.innerHeight - altura - BORDA)) };
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
  const ref = useRef<HTMLDivElement>(null);
  const timerDoSubmenu = useRef<number | undefined>(undefined);
  /**
   * No celular o cartão vira **folha inferior**.
   *
   * Os 300px ancorados no avatar são a forma certa onde há ponteiro e tela
   * sobrando ao lado; num telefone de 390 o cartão cobre quase a largura toda de
   * qualquer jeito, e ancorado num avatar do topo da conversa ele nasce longe do
   * polegar. Sobe do fundo, como todo popover ancorado do app faz no celular
   * (`components/ui/PopoverFlutuante.tsx`). O cartão não ganha alça: ele começa
   * com a faixa do banner, que precisa encostar nos cantos arredondados.
   *
   * Virar folha não bastava. As linhas do cartão são `h-8`, que sobre a raiz de
   * 15,5px do app medem **31px** (todo `rem` do Tailwind sai 3% menor que o
   * nominal), e o kebab e o enviar são `h-7` = 27. No ponteiro isso é
   * confortável; no dedo é bem abaixo do piso de 44. Só no celular eles sobem
   * para `h-[44px]` — **literal**, porque numa classe de escala "44" não seria
   * 44 (`h-11` daria 42,6).
   */
  const ehMobile = useEhMobile();
  const [pos, setPos] = useState<Colocacao | null>(null);
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

  useLayoutEffect(() => {
    if (!popover) {
      setPos(null);
      return;
    }
    setPos(posicionar(popover.anchor, ref.current?.offsetHeight ?? 0, popover.acima));
  }, [popover, perfil]);

  useEffect(() => () => window.clearTimeout(timerDoSubmenu.current), []);

  useEffect(() => {
    if (!popover) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [popover, close]);

  useVoltarNoCelular(ehMobile && popover !== null, close);

  if (!popover) return null;
  // cópia já estreitada: `abrirKebab` é declaração de função e não herda o
  // estreitamento de `popover` feito acima
  const cartao = popover;
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
   * `abrirMenuDoCartao`) é o que impede o cartão de sumir quando ele abre.
   */
  function abrirSubmenuDeStatus(linha: HTMLElement) {
    const r = linha.getBoundingClientRect();
    const direitaDoCartao = ref.current?.getBoundingClientRect().right ?? r.right;
    abrirMenuDoCartao(
      cartao,
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
    abrirMenuDoCartao(cartao, x, y, itens, MENU_WIDTH_WIDE);
  }

  /** Tab preso no cartão: ele é um diálogo, não um balão de leitura. */
  function prenderFoco(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const nos = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCALIZAVEL) ?? []).filter(
      (no) => no.offsetParent !== null,
    );
    if (nos.length === 0) return;
    const primeiro = nos[0];
    const ultimo = nos[nos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <>
      {ehMobile && (
        <div
          aria-hidden="true"
          onMouseDown={close}
          className="anim-overlay fixed inset-0 z-[74] bg-black/70"
        />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${displayNameOf(user)}`}
        onKeyDown={prenderFoco}
        style={ehMobile ? undefined : { left: pos?.x ?? 0, top: pos?.y ?? 0, width: LARGURA }}
        className={
          ehMobile
            ? "anim-folha fixed inset-x-0 bottom-0 z-[75] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-overlay pb-[env(safe-area-inset-bottom)] shadow-high"
            : `fixed z-[75] overflow-hidden rounded-lg bg-overlay shadow-high anim-menu ${
                pos ? "" : "invisible"
              }`
        }
      >
        <div className="relative">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="h-[120px] w-full object-cover" />
        ) : (
          <div
            style={perfil?.bannerColor ? { backgroundColor: perfil.bannerColor } : undefined}
            className={`h-[60px] ${perfil?.bannerColor ? "" : "bg-accent"}`}
          />
        )}
        {ehMobile && (
          /*
            A saída visível da folha, no espelho do kebab.

            No desktop o cartão sai com Esc e com um clique em qualquer lugar
            fora dele, que é o gesto de sempre de um popover ancorado — e por
            isso ele nunca teve um ×. No celular ele vira folha, e as duas
            saídas que sobravam eram o véu (que ninguém garante que a pessoa
            saiba tocar) e o "voltar" do Android (que não existe no navegador do
            iPhone). O cartão continua começando pela faixa do banner, sem alça:
            este botão flutua **sobre** a faixa, na mesma moldura escura do
            kebab, então não empurra nada e não muda o desenho do cartão.
          */
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="absolute left-2 top-2 grid h-[44px] w-[44px] place-items-center rounded bg-black/40 text-white/90 transition hover:bg-black/60"
          >
            <X size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            abrirKebab(r.right - MENU_WIDTH_WIDE, r.bottom + 4);
          }}
          aria-label="Mais opções"
          className={`absolute right-2 top-2 grid place-items-center rounded bg-black/40 text-white/90 transition hover:bg-black/60 ${
            ehMobile ? "h-[44px] w-[44px]" : "h-7 w-7"
          }`}
        >
          <MoreVertical size={16} />
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="-mt-10 mb-3 flex items-end justify-between">
          <div className="w-fit rounded-full border-[6px] border-overlay">
            <Avatar user={user} size="xl" status={status} surface="border-overlay" />
          </div>
          {/*
            Caixa de emblemas (Nitro, impulso, HypeSquad, desenvolvedor). O
            contrato não tem emblemas ainda — a caixa só aparece quando houver
            algum, para o leiaute já estar pronto quando `PublicUser` ganhar o
            campo.
          */}
          {EMBLEMAS.length > 0 && (
            <div className="mb-1 flex items-center gap-1 rounded-lg bg-footer px-2 py-1">
              {EMBLEMAS.map((b) => (
                <span key={b.id} title={b.label} aria-label={b.label}>
                  {b.icon}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-footer p-3">
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
                className="min-w-0 truncate text-xl font-bold leading-6 text-txt-primary"
              >
                {displayNameOf(user)}
              </div>
              {user.bot && <TagDeBot />}
            </div>
            <div className="flex items-center gap-2 text-sm text-txt-normal">
              <span className="truncate">@{user.username}</span>
              {perfil?.pronouns && (
                <span className="shrink-0 text-txt-muted">{perfil.pronouns}</span>
              )}
            </div>
            {customStatusOf(user) && (
              <div className="mt-1 truncate text-sm text-txt-normal">{customStatusOf(user)}</div>
            )}
          </div>

          {perfil?.aboutMe && (
            <Secao titulo="Sobre mim">
              <p className="whitespace-pre-wrap break-words text-sm text-txt-normal">
                {perfil.aboutMe}
              </p>
            </Secao>
          )}

          {atividade && (
            <Secao titulo="Atividade">
              <p className="text-sm text-txt-normal">{atividade.nome}</p>
              {atividade.detalhe && <p className="text-xs text-txt-muted">{atividade.detalhe}</p>}
            </Secao>
          )}

          {perfil?.createdAt && (
            <Secao titulo="Membro desde">
              {/* a entrada no servidor exigiria um `joinedAt` em GuildMemberView;
                  enquanto não existe, só a criação da conta é verdade */}
              <span className="flex items-center gap-2 text-sm text-txt-normal">
                <CalendarDays size={16} aria-hidden="true" className="text-txt-muted" />
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
                    className="flex items-center gap-1.5 rounded-[4px] bg-void py-1 pl-2 pr-1 text-xs text-txt-normal"
                  >
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
                        className="grid h-4 w-4 place-items-center rounded text-txt-muted transition hover:bg-red hover:text-white"
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
                        popover,
                        r.left,
                        r.bottom + 4,
                        atribuiveis.map((cargo) => ({
                          label: cargo.name,
                          dot: cargo.color ?? undefined,
                          onSelect: () => void toggleRole(user.id, cargo.id, true),
                        })),
                        MENU_WIDTH,
                      );
                    }}
                    aria-label="Adicionar cargo"
                    className="grid h-[26px] w-6 place-items-center rounded-[4px] bg-void text-txt-muted transition hover:text-txt-primary"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </Secao>
          )}

          {perfil && perfil.mutualGuilds.length > 0 && !isMe && (
            <Secao titulo={`${perfil.mutualGuilds.length} servidores em comum`}>
              <div className="flex items-center gap-1 text-xs text-txt-muted">
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
              do cartão. Fica fora do cartão interno, como no Discord, e as
              opções de status e de conta vêm depois dele.
            */}
            <button
              type="button"
              onClick={() => {
                close();
                openModal({ kind: "settings", tab: "perfil" });
              }}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-ink transition hover:bg-accent-hover ${
                ehMobile ? "h-[44px]" : "h-8"
              }`}
            >
              <Pencil size={16} aria-hidden="true" />
              Editar perfil
            </button>
            {/*
              A linha de status do print `2026-09-03 180020` (x=34..285,
              y=1076..1107): 32 de altura, raio 8, fundo levemente mais claro
              que o cartão, ponto de 12 num quadro de 16 com 8 de folga até o
              rótulo (14, negrito) e o chevron no canto. Abre no clique e no
              hover, como no Discord.

              Duas diferenças registradas. (1) Lá a linha mora dentro de um
              painel de 268 junto com "Editar perfil", e por isso mede 252 com 8
              de folga de cada lado; aqui "Editar perfil" continua sendo o botão
              de accent medido no #44, então a linha usa os 268 inteiros do
              miolo do cartão. (2) `h-8` dá 31 e não 32: a raiz do app é de
              15,5px e todo o `rem` do Tailwind encolhe 3%.
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
              className={`mt-2 flex w-full items-center gap-2 rounded-lg bg-footer px-2 text-left text-sm font-semibold text-txt-primary transition hover:bg-hov ${
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
            <div className="mt-3 flex flex-col gap-0.5 border-t border-border pt-3">
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
            className="mt-3 flex items-center gap-1 rounded-lg bg-input px-2"
          >
            <input
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              aria-label={`Mensagem para @${user.username}`}
              placeholder={`Mensagem @${user.username}`}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-txt-normal outline-none placeholder:text-txt-muted"
            />
            <button
              type="submit"
              disabled={!rascunho.trim()}
              aria-label="Enviar mensagem"
              className={`grid shrink-0 place-items-center rounded text-txt-secondary transition hover:text-txt-primary disabled:opacity-40 ${
                ehMobile ? "h-[44px] w-[44px]" : "h-7 w-7"
              }`}
            >
              <SendHorizonal size={16} />
            </button>
          </form>
        )}
        </div>
      </div>
    </>
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
    <div className="mt-3 border-t border-border pt-3">
      <h3 className="mb-2 text-xs font-bold uppercase text-txt-secondary">{titulo}</h3>
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
          ? "text-red hover:bg-red hover:text-white"
          : "text-txt-normal hover:bg-hov hover:text-txt-primary"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}
