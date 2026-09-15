"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Clock,
  MessageSquare,
  Pencil,
  PhoneCall,
  SendHorizonal,
  UserCheck,
  UserPlus,
} from "@/components/ui/icones";
import { BotaoDeIcone, Button, Popout, Tooltip } from "@/components/ui/primitivos";
import {
  Permission,
  customStatusOf,
  displayNameOf,
  highestPosition,
  rolesOf,
  type UserProfile,
  type UserStatus,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import TagDeBot from "@/components/ui/TagDeBot";
import { MENU_WIDTH, MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { CabecalhoDoPerfil } from "@/components/ui/perfil/CabecalhoDoPerfil";
import { PainelDaMinhaConta } from "@/components/ui/perfil/PainelDaMinhaConta";
import { PilulasDeCargo } from "@/components/ui/perfil/PilulasDeCargo";
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
import { anchorOf, ui, useUI, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Cartão de perfil que abre ao clicar num avatar ou nome — a "popout" do
 * Discord (onda 5, cartão 5a).
 *
 * ## Forma (medida)
 *
 * A caixa é a do `Popout`: 300 de largura (`--custom-user-profile-popout-width`,
 * `css-bruto/253781.d118af6e4f0bc056.css`; x=1343–1643 no print 1:1
 * `2026-08-31 101804`), `--background-surface-high` (#242429 no print), raio 8
 * e `var(--shadow-border), var(--shadow-high)`. O cartão é pintado **com a cor
 * da caixa** (`.outer_c0bea0`), sem miolo de outra cor.
 *
 * Por dentro, três blocos em coluna com 8 entre eles e 4 embaixo
 * (`.user-profile-popout .inner_c0bea0`):
 *
 * 1. **cabeçalho** — banner, avatar, balão (`perfil/CabecalhoDoPerfil`);
 * 2. **corpo** — respiro 4 · 16 · 8 e 12 entre as peças (`.body__5be3e`,
 *    `css-bruto/352421.53a7850ecf997a57.css`): nome, usuário e pronomes, bio,
 *    atividade, cargos e, no meu cartão aberto pelo rodapé, os painéis;
 * 3. **rodapé** — respiro 0 · 16 · 12, que some quando vazio (`.footer__5be3e`
 *    e `.footer__5be3e:empty`): "Editar perfil" no meu cartão, o campo de
 *    mensagem no dos outros.
 *
 * A conta fecha com os prints. Em `101804` o botão "Editar perfil" começa em
 * y=497, 8 + 8 abaixo da linha de cargo (y=457–480), e acaba em 528, com 16 + 1
 * até a base da caixa (545). Em `2026-09-03 180020`, sem rodapé, o último painel
 * acaba em 1175 e a caixa em 1196: 8 do corpo + 8 do espaço + 4 + 1. O pixel a
 * mais nos dois é da borda (`--shadow-border`).
 *
 * **O corpo é contínuo**: sem traços entre as seções e sem rótulos em caixa
 * alta. Nenhum dos prints 1:1 (`101804`, `113603`, `113533`, `180020`) tem
 * "SOBRE MIM", "MEMBRO DESDE" ou "CARGOS"; a bio vem solta e o que é cartão
 * (atividade, "Coleção de jogos") é um bloco de `--background-surface-highest`
 * com respiro 12 (`.card__5be3e`; 40 de altura em y=403–442 no `101804`). Por
 * isso, **no desktop**, "Membro desde" e "Servidores em comum" saíram do
 * cartão: continuam no perfil completo (`UserProfileModal`), que abre pelo
 * avatar. **No celular é diferente** (cartão 8g, onda 8): não há um perfil
 * completo separado — o mesmo `Popout` vira a folha inteira, e
 * `discord-mobile-perfil.png` mostra "DISCORD MEMBER SINCE", "Mutual Servers"
 * e "Mutual Friends" direto nela, com legenda em caixa alta. Essas seções, a
 * fileira de ações (Mensagem/Ligar/Adicionar amigo) e o "SOBRE MIM" em caixa
 * alta entram só em `ehMobile`, mais abaixo — o desktop não ganha nenhum
 * pixel novo.
 *
 * **O nome não leva a cor do cargo.** No print `113603` o "Md" é verde na lista
 * de membros e #dadadb no cartão; em `101804` o traço do "M" é #efeff1 cheio
 * (coluna x=1365, y=300–313), o `--text-default`, em 20px negrito
 * (`text-heading-lg`). O usuário vem sem "@" (mesmo print, "mdsls").
 *
 * ## Mecânica
 *
 * Posição, colisão, Esc, clique fora, foco preso e devolvido, folha no celular
 * e entrada animada são do `Popout` único (`components/ui/primitivos/Popout.tsx`).
 * Este arquivo fica com o conteúdo, com onde o cartão encosta na âncora, com a
 * camada abaixo do `ContextMenu` e com o Esc que também leva o menu do cartão.
 */

/** 300 no print `2026-08-31 101804` (x=1343..1643) e no CSS do Discord. */
const LARGURA = 300;
/**
 * Folga entre o elemento que abriu e o cartão, quando ele nasce **ao lado**.
 * Não medido: é o número da implementação anterior, igual ao padrão do Popout.
 */
const FOLGA = 8;
/** base do cartão até o topo do rodapé, medida no print `180020` (1196,5 → 1202). */
const FOLGA_DO_RODAPE = 6;

/**
 * O submenu de status do Discord, medido no print `2026-09-03 180020`: 300 de
 * largura, nascendo à direita da linha de status. **Não há "por quanto
 * tempo"**: os chevrons de "Ausente", "Não perturbar" e "Invisível" existem no
 * desenho, mas o clique aplica o status na hora — por isso são `chevron`
 * (enfeite) e não `submenu`.
 */
const OPCOES_DE_STATUS: {
  /** `null` = automático (o servidor devolve ONLINE). */
  value: UserStatus | null;
  dot: UserStatus;
  label: string;
  description?: string;
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

/** Largura do submenu de status: 300 no print (x=298..597, borda inclusa). */
const LARGURA_DO_SUBMENU = 300;
/** o submenu encosta na linha e entra 12px por cima do cartão, como no print. */
const SOBREPOSICAO_DO_SUBMENU = 12;
/** padding (8) + borda (1) do menu: sobe o filho para o topo alinhar com a linha. */
const TOPO_DO_SUBMENU = 9;
/** mesma pausa dos submenus do `ContextMenu`: passar o mouse por cima não abre. */
const ATRASO_DO_SUBMENU = 120;
/**
 * Camada do cartão: **abaixo** do `ContextMenu` (véu 79, menu 80), porque o
 * kebab, o "+" de cargo e o submenu de status abrem um menu que tem de ficar
 * por cima dele. Na camada padrão do Popout (90) o menu nasceria atrás.
 */
const CAMADA = 75;

/**
 * "25 de agosto de 2026" — a mesma formatação de "membro desde" do perfil
 * completo (`UserProfileModal.DATA_SELO`), copiada aqui porque aquele const
 * não é exportado e os dois arquivos não podem depender um do outro sem sair
 * da lista de arquivos deste cartão.
 */
const DATA_MEMBRO_DESDE = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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
 * folha do menu com o próprio véu, e o toque no kebab pareceria não fazer nada.
 */
function abrirMenuDoCartao(x: number, y: number, itens: MenuItem[], largura: number, manter: boolean) {
  ui.openContextMenu(x, y, itens, largura, manter);
}

type EstadoDoPerfil = "carregando" | "pronto" | "erro";

export default function ProfilePopoverHost() {
  const popover = useUI((s) => s.popover);
  const close = useUI((s) => s.closePopover);
  const openModal = useUI((s) => s.openModal);
  const me = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const developerMode = useSettings((s) => s.developerMode);
  // cargos do membro no servidor aberto: as pílulas do corpo
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
   * No celular o cartão vira **folha inferior** — a do `Popout`. Os alvos de
   * toque sobem para 44 (`celular:h-[44px]` nas peças), em px literal porque o
   * número é o piso de toque, não um passo da escala.
   */
  const ehMobile = useEhMobile();
  const [perfil, setPerfil] = useState<UserProfile | null>(null);
  const [estado, setEstado] = useState<EstadoDoPerfil>("carregando");
  /** Soma um a cada "Tentar de novo": é a dependência que refaz o pedido. */
  const [tentativa, setTentativa] = useState(0);
  const [rascunho, setRascunho] = useState("");

  const userId = popover?.user.id;

  // o rascunho é da pessoa, não do pedido: "Tentar de novo" não o apaga
  useEffect(() => {
    setRascunho("");
  }, [userId]);

  // o perfil rico (bio, banner, pronomes) não cabe no PublicUser
  useEffect(() => {
    setPerfil(null);
    setEstado("carregando");
    if (!userId) return;
    let vivo = true;
    void api
      .profile(userId, guildAtiva ?? undefined)
      .then((p) => {
        if (!vivo) return;
        setPerfil(p);
        setEstado("pronto");
      })
      .catch(() => {
        if (vivo) setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [userId, guildAtiva, tentativa]);

  useEffect(() => () => window.clearTimeout(timerDoSubmenu.current), []);

  /*
    Esc com um menu do cartão aberto (kebab, "+" de cargo, submenu de status)
    fecha os dois.

    O `Popout` ouve o Esc na **captura** da `window` e para a propagação ali. O
    `ContextMenuHost` ouve na fase de borbulhar, que o `stopPropagation` da
    captura já cortou: sem este ouvinte o cartão fechava e o menu ficava órfão.
    Ele também é de captura na `window` — ouvinte do mesmo nó e da mesma fase
    ainda roda depois de um `stopPropagation` —, então a ordem de registro entre
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
  const nome = displayNameOf(user);
  const meusCargos = membros.find((m) => m.user.id === user.id)?.roleIds ?? [];
  const chips = rolesOf(meusCargos, roles);
  // Teto de quem olha: só oferece cargo estritamente abaixo do meu mais alto —
  // é a mesma conta de `assertPodeMexerNoCargo` (dono = MAX_SAFE_INTEGER, vê
  // todos). Sem isso o "+" listaria cargo que a API recusaria ao confirmar.
  const meuMembro = membros.find((m) => m.user.id === me?.id);
  const meuTeto = highestPosition(
    { isOwner: meuMembro?.role === "OWNER", roleIds: meuMembro?.roleIds ?? [] },
    roles,
  );
  const atribuiveis = roles.filter(
    (r) => !r.isDefault && !meusCargos.includes(r.id) && r.position < meuTeto,
  );
  const statusPersonalizado = customStatusOf(user) || null;
  /** Aberto pelo painel do usuário: o meu cartão ganha os painéis do print `180020`. */
  const peloRodape = Boolean(popover.acima);
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

  /**
   * Botão "Mensagem" da fileira de ações do celular (`discord-mobile-perfil.png`):
   * fecha a folha e leva para a conversa — o mesmo par `closeModal` + `openWith`
   * que o botão "Enviar mensagem" do perfil completo já usa
   * (`UserProfileModal.tsx`). No desktop este cartão não tem esse botão (o
   * rodapé já é o campo de mensagem embutido, `enviar()` acima); a fileira só
   * existe em `ehMobile`.
   */
  function abrirConversa() {
    close();
    void useDMs.getState().openWith(user.id);
  }

  /**
   * Botão "Ligar" da mesma fileira: liga a chamada de voz da conversa, como o
   * telefone do cabeçalho de `DMView.tsx` (`startCall(dm.id, false)`) — a
   * capacidade já existe no app, só não tinha entrada no cartão de perfil.
   * Sem vídeo: o cartão desta onda só pede "ligar" (ver "faltando" na
   * entrega) — a captura mostra também "Video Call", que fica para outra
   * rodada.
   *
   * `startCall` já tem a guarda de "já estou nesta chamada?" por dentro
   * (`jaNaChamada`, `stores/chamada-em-curso.ts`), então um clique duplo aqui
   * não abre uma segunda sala.
   */
  async function ligar() {
    try {
      const dm = await api.openDM(user.id);
      useDMs.getState().registrar(dm);
      close();
      await useVoice.getState().startCall(dm.id, false);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível iniciar a chamada"), "error");
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

  function abrirPerfilCompleto() {
    close();
    openModal({ kind: "userProfile", userId: user.id, guildId: guildAtiva ?? undefined });
  }

  function editarPerfil() {
    close();
    openModal({ kind: "settings", tab: "perfil" });
  }

  /**
   * Submenu de status, à direita da linha. `manter` (via `abrirMenuDoCartao`)
   * é o que impede o cartão de sumir quando ele abre — no desktop.
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

  function passarNoStatus(linha: HTMLElement) {
    window.clearTimeout(timerDoSubmenu.current);
    timerDoSubmenu.current = window.setTimeout(() => {
      // com um menu já aberto o hover não faz nada: reabrir o mesmo submenu
      // remontaria o painel e ele reapareceria piscando a cada ida e volta
      if (useUI.getState().contextMenu) return;
      abrirSubmenuDeStatus(linha);
    }, ATRASO_DO_SUBMENU);
  }

  /** O kebab só existe no cartão dos outros (ver `CabecalhoDoPerfil`). */
  function abrirKebab(botao: HTMLElement) {
    const r = botao.getBoundingClientRect();
    const itens: MenuItem[] = [
      { label: "Perfil", onSelect: abrirPerfilCompleto },
      { label: "Mencionar", onSelect: mencionar },
      // a nota sobre a pessoa é do Discord e não existe no app (§6.6)
      { label: "Adicionar nota (em breve)", disabled: true, onSelect: () => {} },
      { separator: true },
    ];
    if (relacao === "none") {
      itens.push({ label: "Adicionar amigo", onSelect: () => void send(user.username) });
    }
    if (relacao === "outgoing") {
      itens.push({ label: "Pedido de amizade enviado", disabled: true, onSelect: () => {} });
    }
    if (relacao === "incoming") {
      const pedido = incoming.find((p) => p.user.id === user.id);
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
    if (developerMode) {
      itens.push({ separator: true });
      itens.push({
        label: "Copiar ID do usuário",
        onSelect: () => void navigator.clipboard?.writeText(user.id),
      });
    }
    abrirMenuDoCartao(r.right - MENU_WIDTH_WIDE, r.bottom + 4, itens, MENU_WIDTH_WIDE, !ehMobile);
  }

  function abrirMenuDeCargos(botao: HTMLElement) {
    const r = botao.getBoundingClientRect();
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
  }

  // O próprio dono também "veste" cargo em si mesmo (print `101804`); a API
  // aceita alvo igual ao ator aqui (`assign`/`unassign` usam `assertCanModerate`
  // + `assertPodeMexerNoCargo`, sem o `assertCanActOn` que bloqueia castigo/
  // expulsão/banimento contra si mesmo) — por isso sem `&& !isMe`.
  const podeMexerNosCargos = podeCargos;

  return (
    <Popout
      aberto
      aoFechar={close}
      ancora={popover.anchor}
      /*
        Ao lado do elemento que abriu, alinhado pelo topo dele; o Popout
        espelha quando não cabe.

        Cartão do rodapé (`acima`): **em cima** do painel do usuário e alinhado
        pela borda esquerda dele. Medido no print `2026-09-03 180020`: cartão em
        x=10 e base 6px acima do topo do rodapé.
      */
      lado={popover.acima ? "top" : "right"}
      alinhamento="start"
      distancia={popover.acima ? FOLGA_DO_RODAPE : FOLGA}
      largura={LARGURA}
      rotulo={`Perfil de ${nome}`}
      camada={CAMADA}
      // `overflow-hidden`: o banner respeita o raio da caixa
      className="overflow-hidden"
      classeNaFolha=""
      // a folha usa a mesma superfície do cartão: o anel do avatar e o furo do
      // selo são dessa cor, e numa folha de outra cor eles apareceriam
      fundoDaFolha="bg-background-surface-high"
    >
      <div ref={ref} className="flex flex-col gap-2 pb-1">
        <CabecalhoDoPerfil
          user={user}
          nome={nome}
          status={status}
          bannerUrl={perfil?.bannerUrl ?? null}
          bannerCor={perfil?.bannerColor ?? null}
          carregando={estado === "carregando"}
          statusPersonalizado={statusPersonalizado}
          aoEditarStatus={
            isMe
              ? () => {
                  close();
                  openModal({ kind: "customStatus" });
                }
              : undefined
          }
          aoAbrirPerfil={abrirPerfilCompleto}
          aoAbrirKebab={isMe ? undefined : abrirKebab}
          ehMobile={ehMobile}
        />

        <div aria-busy={estado === "carregando"} className="flex flex-col gap-3 px-4 pb-2 pt-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* ── j-bots ── a pílula ao lado do nome grande, como em
                `docs/Reference/apps/tag-bot-no-perfil-do-app.png`. O `min-w-0`
                no nome mantém o corte: sem ele um item flex não encolhe abaixo
                do conteúdo e um nome de 32 caracteres estouraria o cartão. */}
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 truncate text-heading-lg font-bold text-text-default">{nome}</h2>
              {user.bot && <TagDeBot />}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-text-sm text-text-default">
              <span className="min-w-0 truncate">{user.username}</span>
              {perfil?.pronouns && (
                <>
                  <span aria-hidden="true" className="text-text-muted">
                    •
                  </span>
                  <span className="min-w-0 truncate text-text-muted">{perfil.pronouns}</span>
                </>
              )}
              {/*
                Emblemas (Nitro, impulso, HypeSquad…) ficam na linha do usuário,
                como no print `101804`. O contrato não tem emblemas: a lista é
                vazia e nada é desenhado.
              */}
              {EMBLEMAS.map((b) => (
                <Tooltip key={b.id} rotulo={b.label}>
                  <span aria-label={b.label}>{b.icon}</span>
                </Tooltip>
              ))}
            </div>
          </div>

          {/*
            Fileira de ações do celular — `discord-mobile-perfil.png` (escala
            ≈2,0 ±4%, MEDIDAS.md §1): a foto mostra três botões de ícone-sobre-
            rótulo (Message/Voice Call/Video Call), evenly distribuídos, com um
            traço acima separando do bloco de nome. A ±4% da captura não dá px
            fino, mas presença/ordem são robustas a ela (é a regra da própria
            MEDIDAS.md: "medi só o que é robusto a esse erro"), e é isso que
            fica: dois botões (sem vídeo, ver "faltando" na entrega), largura
            igual, alvo de 44 (`BotaoDeAcaoDoPerfil`, min-h-[44px] literal — piso
            de toque, não medida). No desktop este cartão não tinha fileira de
            ações; ela só existe em `ehMobile`, então nenhum pixel do desktop
            muda. Some com a pessoa bloqueada, como o composer embutido do
            desktop já fazia.
          */}
          {ehMobile && !isMe && relacao !== "blocked" && (
            <div className="grid grid-cols-2 gap-1 border-t border-border-subtle pt-3">
              <BotaoDeAcaoDoPerfil
                icone={<MessageSquare size={20} aria-hidden="true" />}
                rotulo="Mensagem"
                onClick={abrirConversa}
              />
              {relacao === "friend" && (
                <BotaoDeAcaoDoPerfil icone={<PhoneCall size={20} aria-hidden="true" />} rotulo="Ligar" onClick={() => void ligar()} />
              )}
              {relacao === "none" && (
                <BotaoDeAcaoDoPerfil
                  icone={<UserPlus size={20} aria-hidden="true" />}
                  rotulo="Adicionar amigo"
                  onClick={() => void send(user.username)}
                />
              )}
              {relacao === "outgoing" && (
                <BotaoDeAcaoDoPerfil icone={<Clock size={20} aria-hidden="true" />} rotulo="Pedido enviado" disabled />
              )}
              {relacao === "incoming" && (
                <BotaoDeAcaoDoPerfil
                  icone={<UserCheck size={20} aria-hidden="true" />}
                  rotulo="Aceitar pedido"
                  onClick={() => {
                    const pedido = incoming.find((p) => p.user.id === user.id);
                    if (pedido) void accept(pedido.id);
                  }}
                />
              )}
            </div>
          )}

          {/*
            "SOBRE MIM" só no celular: nenhum dos quatro prints 1:1 do cartão
            desktop tem rótulo de seção (cabeçalho do arquivo, acima), mas a
            tela do celular usa a legenda em caixa alta como padrão de seção —
            é a mesma classe já usada em `DMMemberList.tsx`/`GifPicker.tsx`
            (`text-xs font-bold uppercase tracking-[0.02em]`, a "eyebrow" do
            CSS do Discord `font-size:12px;font-weight:700;letter-spacing:
            .02em;text-transform:uppercase`), não um número tirado desta
            captura.
          */}
          {ehMobile && perfil?.aboutMe && (
            <p className="text-text-xs font-bold uppercase tracking-[0.02em] text-text-muted">Sobre mim</p>
          )}
          {perfil?.aboutMe && (
            <p className="whitespace-pre-wrap break-words text-text-sm text-text-default">{perfil.aboutMe}</p>
          )}

          {estado === "erro" && (
            <p role="status" className="text-text-xs text-text-muted">
              Não foi possível carregar o perfil.{" "}
              <button
                type="button"
                onClick={() => setTentativa((t) => t + 1)}
                className="font-medium text-text-default hover:underline"
              >
                Tentar de novo
              </button>
            </p>
          )}

          {atividade && (
            <div className="rounded-lg bg-background-surface-highest p-3">
              <p className="text-text-xs font-semibold text-text-default">{atividade.nome}</p>
              {atividade.detalhe && <p className="text-text-xs text-text-muted">{atividade.detalhe}</p>}
            </div>
          )}

          <PilulasDeCargo
            cargos={chips}
            podeRemover={podeMexerNosCargos}
            podeAdicionar={podeMexerNosCargos && atribuiveis.length > 0}
            aoRemover={(cargoId) => void toggleRole(user.id, cargoId, false)}
            aoAdicionar={abrirMenuDeCargos}
          />

          {/*
            "DISCORD MEMBER SINCE" / "Mutual Servers" / "Mutual Friends" —
            `discord-mobile-perfil.png` tem as três, direto no perfil de outra
            pessoa, sem aba: no cartão desktop elas ficam só no perfil completo
            (`UserProfileModal.tsx`, ver o comentário do cabeçalho deste
            arquivo), porque nenhum dos quatro prints 1:1 do popout as mostra.
            No celular o cartão dos outros vira a tela inteira (a folha do
            `Popout`), e a captura mostra as três juntas — por isso elas entram
            aqui só em `ehMobile`. Conteúdo (rótulo, ordem, "Nenhum … em
            comum.") copiado do `UserProfileModal` para não inventar um
            segundo texto para a mesma coisa; a diferença é a ausência de abas
            (a captura rola tudo numa coluna só) e de "Invite to Servers" (o
            app não tem essa ação — §6.6/§8 do processo: botão inerte só
            existe quando o Discord o tem E nós temos o que ele faz). "NOTE"
            também fica de fora: já não existe no app (ver `abrirKebab` acima,
            "Adicionar nota (em breve)").
          */}
          {ehMobile && !isMe && perfil && (
            <div className="flex flex-col gap-0.5">
              <p className="text-text-xs font-bold uppercase tracking-[0.02em] text-text-muted">Membro desde</p>
              <p className="text-text-sm text-text-default">{DATA_MEMBRO_DESDE.format(new Date(perfil.createdAt))}</p>
            </div>
          )}

          {ehMobile && !isMe && perfil && (
            <div className="flex flex-col gap-1">
              <p className="text-text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
                Servidores em comum
              </p>
              {perfil.mutualGuilds.length === 0 ? (
                <p className="text-text-sm text-text-muted">Nenhum servidor em comum.</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {perfil.mutualGuilds.map((g) => (
                    <li key={g.id} className="flex min-h-[44px] min-w-0 items-center gap-2 px-1">
                      {g.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.iconUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-input-background-default text-[10px] font-semibold text-text-strong">
                          {g.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 truncate text-text-sm text-text-default">{g.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {ehMobile && !isMe && perfil && (
            <div className="flex flex-col gap-1">
              <p className="text-text-xs font-bold uppercase tracking-[0.02em] text-text-muted">Amigos em comum</p>
              {perfil.mutualFriends.length === 0 ? (
                <p className="text-text-sm text-text-muted">Nenhum amigo em comum.</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {perfil.mutualFriends.map((f) => (
                    <li key={f.id}>
                      {/* troca o cartão para o do amigo em comum, como o
                          `UserProfileModal` já faz na mesma lista — o `Popout`
                          é uma folha só, então reabrir aqui só troca o
                          conteúdo dela, sem empilhar uma segunda */}
                      <button
                        type="button"
                        onClick={(e) => ui.openProfile(f, anchorOf(e.currentTarget))}
                        className="flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded px-1 text-left active:bg-interactive-background-hover"
                      >
                        <Avatar user={f} size="sm" surface="border-background-base-low" />
                        <span className="min-w-0 truncate text-text-sm text-text-default">{displayNameOf(f)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isMe && peloRodape && (
            <PainelDaMinhaConta
              status={status}
              aoEditarPerfil={editarPerfil}
              aoAbrirStatus={abrirSubmenuDeStatus}
              aoPassarNoStatus={passarNoStatus}
              aoSairDoStatus={() => window.clearTimeout(timerDoSubmenu.current)}
              aoMudarDeConta={() => {
                close();
                openModal({ kind: "gerenciarContas" });
              }}
            />
          )}
        </div>

        {/* `empty:p-0`: o `.footer__5be3e:empty` do Discord zera o respiro */}
        <div className="flex flex-col px-4 pb-3 empty:p-0">
          {isMe && !peloRodape && (
            /*
              O botão dos prints `101804` e `113603`: 268 × 32 (x=1360–1627,
              y=497–528), raio 8 — o `Button` primário `sm` na largura toda. O
              invólucro `flex` existe porque o `Button` é `inline-flex`: solto num
              bloco ele entraria numa linha de texto e a entrelinha somaria folga.
            */
            <div className="flex">
              <Button
                variante="primario"
                tamanho="sm"
                larguraTotal
                icone={<Pencil size={16} aria-hidden="true" />}
                onClick={editarPerfil}
                className="celular:h-[44px]"
              >
                Editar perfil
              </Button>
            </div>
          )}

          {/*
            No celular este composer embutido sai: `discord-mobile-perfil.png`
            não tem campo de mensagem no cartão da outra pessoa — "Mensagem" é
            um botão que leva para a conversa (a fileira de ações acima,
            `abrirConversa`), não um mini-composer aqui dentro. `!ehMobile`
            entra na frente da condição de sempre; as classes `celular:`
            internas ficam paradas (o `<form>` nem monta), documentadas para
            quem procurar por que "não disparam".
          */}
          {!ehMobile && !isMe && relacao !== "blocked" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
              /*
                Não há print 1:1 do cartão de outra pessoa: altura (40), raio (8)
                e fundo (`--chat-background-default`) são os da implementação
                anterior, não medidos.
              */
              className="flex items-center gap-1 rounded-lg bg-chat-background-default px-2"
            >
              {/* peça interna do controle composto (o fundo e o raio são do
                  `<form>`, que divide a moldura com o botão de enviar), não um
                  `TextInput` com moldura própria */}
              <input
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                aria-label={`Mensagem para @${user.username}`}
                placeholder={`Mensagem @${user.username}`}
                className="h-10 min-w-0 flex-1 bg-transparent text-text-sm text-text-default outline-none placeholder:text-text-muted celular:h-[44px]"
              />
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
 * Um botão da fileira de ações do cartão no celular: ícone em cima, rótulo
 * embaixo, os dois centrados — a forma de "Message"/"Voice Call"/"Video Call"
 * em `discord-mobile-perfil.png`. Não é o `Button` de `primitivos` (que só
 * sabe ícone-ao-lado-do-texto): esta pilha vertical não tem outro uso no app,
 * então fica local em vez de virar mais uma variante do primitivo.
 *
 * `min-h-[44px]` é o piso de toque (§ celular do cartão), não uma medida da
 * captura — a foto não dá px fino (escala ≈2,0 **±4%**, `MEDIDAS.md` §1).
 */
function BotaoDeAcaoDoPerfil({
  icone,
  rotulo,
  onClick,
  disabled,
}: {
  icone: ReactNode;
  rotulo: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg py-2 text-text-muted transition-colors active:bg-interactive-background-hover active:text-text-default disabled:pointer-events-none disabled:opacity-50"
    >
      <span aria-hidden="true" className="pointer-events-none">
        {icone}
      </span>
      <span className="truncate text-text-xs font-medium">{rotulo}</span>
    </button>
  );
}

/**
 * Emblemas do perfil. Vazio enquanto o contrato não tiver `badges` no
 * `PublicUser`/`UserProfile`.
 */
const EMBLEMAS: { id: string; label: string; icon: ReactNode }[] = [];

interface Atividade {
  nome: string;
  detalhe?: string;
}

/**
 * Atividade ("Jogando…") de alguém. Sempre null: o contrato não tem presença
 * rica. Fica como função para o cartão já saber se desenhar quando `PublicUser`
 * ganhar o campo.
 */
function atividadeDe(_user: { id: string }): Atividade | null {
  return null;
}
