"use client";

import {
  CheckCheck,
  Compass,
  LogOut,
  Plus,
  Settings,
  UserPlus,
  Users,
  Volume2,
} from "@/components/ui/icones";
import {
  displayNameOf,
  guildNotificationScope,
  isGroupChannel,
  type DMChannelView,
  type Guild,
} from "@streamz/shared";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import Marca from "@/components/ui/Marca";
import Tooltip from "@/components/ui/Tooltip";
import { MENU_WIDTH, MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { somarNaoLidas } from "@/stores/nao-lidas";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useNotifications } from "@/stores/notifications";
import { useSettings } from "@/stores/settings";
import { useVoice } from "@/stores/voice";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/** Iniciais de cada palavra, como o Discord faz com servidores sem ícone. */
function acronym(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * A cara de uma conversa no rail, preenchendo o botão de 40px.
 *
 * Não usa `Avatar`: ele carrega o próprio tamanho (40px no maior que serve
 * aqui) e ficaria boiando dentro da casa, com a bolinha de status fora do
 * lugar. No rail o que vale é a mesma regra do ícone de servidor — a imagem
 * cobre o botão inteiro, e a identidade vem da forma, não do status.
 */
function ImagemDaConversa({ dm }: { dm: DMChannelView }) {
  const url = isGroupChannel(dm) ? dm.iconUrl : (dm.others[0]?.avatarUrl ?? null);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-full w-full object-cover" />;
  }
  const outro = dm.others[0];
  if (isGroupChannel(dm) || !outro) {
    return <Users size={20} aria-hidden="true" />;
  }
  // as mesmas iniciais sobre a mesma cor do `Avatar`: sem o fundo próprio, a
  // letra herdava a cor do botão e a pessoa mudava de cara entre as colunas
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: corDoAvatar(outro.id) }}
      className="grid h-full w-full place-items-center font-semibold text-white"
    >
      {displayNameOf(outro).slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Badge vermelho de contagem (menções), no canto do ícone. */
/**
 * Selo de voz: você está numa call **deste** servidor.
 *
 * Fica no canto **superior direito**, medido no print: círculo de 16px tangente
 * às bordas de cima e da direita, sem ultrapassar a caixa de 40 do ícone.
 *
 * A posição não é escolha nossa — é onde o Discord põe. Importa registrar
 * porque o badge de menção fica no canto **inferior** direito, e os dois
 * conviverem sem se cobrir depende de continuarem em cantos opostos.
 */
function SeloDeVoz() {
  return (
    <span
      aria-label="Você está em voz neste servidor"
      className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded-full bg-green ring-[2.5px] ring-rail"
    >
      <Volume2 size={12} className="text-accent-ink" aria-hidden="true" />
    </span>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${count === 1 ? "menção" : "menções"}`}
      className="absolute -bottom-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-[3px] border-rail bg-red px-1 text-[11px] font-bold leading-none text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Um item do rail: quadrado arredondado de raio 12 — a mesma forma em repouso,
 * hover e ativo, como no Discord; o que muda é só a cor e a "pílula" branca à
 * esquerda (ponto se há não lido, curta no hover, alta quando ativo). Mais o
 * tooltip.
 */
function RailItem({
  label,
  active = false,
  unread = false,
  mentions = 0,
  emVoz = false,
  green = false,
  onClick,
  onContextMenu,
  children,
}: {
  label: string;
  active?: boolean;
  unread?: boolean;
  mentions?: number;
  /** você está numa call deste servidor. */
  emVoz?: boolean;
  green?: boolean;
  /** recebe o evento porque o "+" ancora um menu no retângulo do botão. */
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex w-full justify-center" onContextMenu={onContextMenu}>
      <span
        aria-hidden="true"
        /* 4px de largura, medido. A **altura** de 40 no ativo já estava certa:
          a auditoria dizia 36-38, e a medição em 7 prints do Discord deu 40 nos
          sete — a pílula vai de ponta a ponta do botão. */
        className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-paper transition-all duration-200 ${
          active ? "h-10" : unread ? "h-2 group-hover:h-5" : "h-0 group-hover:h-5"
        }`}
      />
      <Tooltip label={label} side="right">
        <button
          type="button"
          onClick={onClick}
          aria-label={unread && !active ? `${label} (não lido)` : label}
          aria-current={active ? "page" : undefined}
          className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl text-[15px] font-semibold transition-all duration-200 ${
            active
              ? "bg-accent text-accent-ink"
              : green
                ? "bg-panel text-green group-hover:bg-green group-hover:text-accent-ink"
                : "bg-panel text-txt-normal group-hover:bg-accent group-hover:text-accent-ink"
          }`}
        >
          {children}
          {emVoz && <SeloDeVoz />}
          <Badge count={mentions} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Coluna 1: mensagens diretas, servidores e as duas formas de ganhar um novo. */
export default function GuildRail() {
  // de qual servidor é a call em curso, para o selo do ícone
  const vozGuildId = useVoice((s) => s.guildId);
  const guilds = useGuilds((s) => s.guilds);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const select = useGuilds((s) => s.select);
  const create = useGuilds((s) => s.create);
  const joinByCode = useGuilds((s) => s.joinByCode);
  const createInvite = useGuilds((s) => s.createInvite);
  const leaveGuild = useGuilds((s) => s.leave);
  const openDMs = useDMs((s) => s.openList);
  const dms = useDMs((s) => s.channels);
  const activeDMId = useDMs((s) => s.activeId);
  const selectDM = useDMs((s) => s.select);
  const friendsOpen = useFriends((s) => s.open);
  const fecharAmigos = useFriends((s) => s.setOpen);
  const view = useUI((s) => s.view);
  const t = useT();
  const porEscopo = useNotifications((s) => s.porEscopo);
  const markGuildRead = useChannels((s) => s.markGuildRead);
  const developerMode = useSettings((s) => s.developerMode);
  const meuId = useAuth((s) => s.user?.id);

  const dmUnread = dms.some((d) => d.lastMessageAt && (!d.lastReadAt || d.lastMessageAt > d.lastReadAt));
  // em conversa toda mensagem não lida conta (Discord): o rail soma as conversas
  const dmMentions = somarNaoLidas(dms);

  /**
   * O rail destaca a conversa que está **na tela** e as que têm mensagem não
   * lida.
   *
   * "Na tela" exige a página Amigos fechada: ela também roda no modo "mensagens
   * diretas" e mantém a última conversa marcada como ativa, então sem essa
   * condição um contato ficava parado no rail sem nada de novo e sem estar
   * aberto de fato.
   *
   * No máximo 6 para o rail não virar uma segunda lista de conversas.
   */
  const naTela = !friendsOpen && view === "dm" ? activeDMId : null;
  const dmsEmDestaque = dms
    .filter(
      (d) =>
        d.id === naTela || (!!d.lastMessageAt && (!d.lastReadAt || d.lastMessageAt > d.lastReadAt)),
    )
    .slice(0, 6);

  /** Menu do "+": criar um servidor ou entrar com um código de convite. */
  function abrirMenuDeServidor(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(
      r.right + 12,
      r.top,
      [
        { label: "Criar um servidor", icon: <Plus size={18} />, onSelect: () => void create() },
        {
          label: "Entrar com um convite",
          icon: <Compass size={18} />,
          onSelect: () => void joinByCode(),
        },
      ],
      MENU_WIDTH,
    );
  }

  /**
   * Botão direito no ícone do servidor. Este menu simplesmente não existia — e
   * é onde o Discord põe "Marcar como lido", que antes estava no dropdown do
   * cabeçalho da barra de canais.
   */
  function openGuildIconMenu(e: React.MouseEvent, guild: Guild) {
    e.preventDefault();
    const escopo = porEscopo[guildNotificationScope(guild.id)];
    const souDono = guild.ownerId === meuId;
    const items: MenuItem[] = [
      {
        label: "Marcar como lido",
        icon: <CheckCheck size={18} />,
        disabled: !guild.unread,
        onSelect: () => void markGuildRead(guild.id),
      },
      { separator: true },
      {
        label: "Convidar pessoas",
        icon: <UserPlus size={18} />,
        highlight: true,
        onSelect: () => {
          select(guild);
          void createInvite();
        },
      },
      submenuSilenciar("Silenciar servidor", { tipo: "servidor", guildId: guild.id }, escopo, t),
      submenuNotificacoes({ tipo: "servidor", guildId: guild.id }, escopo, t),
      { separator: true },
      {
        label: "Configurações do servidor",
        icon: <Settings size={18} />,
        onSelect: () => ui.openModal({ kind: "serverSettings", guildId: guild.id }),
      },
    ];
    if (!souDono) {
      items.push({ separator: true });
      items.push({
        label: "Sair do servidor",
        icon: <LogOut size={18} />,
        danger: true,
        onSelect: () => void leaveGuild(guild.id),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do servidor",
        onSelect: () => void navigator.clipboard?.writeText(guild.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH_WIDE);
  }

  return (
    <nav
      aria-label="Servidores"
      /* sem `pt`: no Discord o topo do primeiro botão encosta na barra de
          título. Os nossos 12px de folga faziam a rail começar mais baixo que
          a coluna ao lado, e a diferença aparece na horizontal do topo. */
      className="flex w-20 shrink-0 flex-col items-center gap-2.5 overflow-y-auto bg-rail pb-[78px]"
    >
      <RailItem
        label="Mensagens diretas"
        active={view === "dm"}
        unread={dmUnread}
        mentions={dmMentions}
        onClick={() => void openDMs()}
      >
        {/* o símbolo da marca no lugar onde o Discord põe o logo dele */}
        <Marca size={22} />
      </RailItem>

      {/*
        Conversas em destaque, entre o botão de início e os servidores — como no
        Discord. Aparece quem tem mensagem não lida e a conversa aberta agora,
        para que uma DM não fique escondida atrás da coluna de servidores quando
        chega mensagem enquanto você está em outro lugar.
      */}
      {dmsEmDestaque.map((dm) => {
        const naoLida = !!dm.lastMessageAt && (!dm.lastReadAt || dm.lastMessageAt > dm.lastReadAt);
        return (
          <RailItem
            key={dm.id}
            label={dmTitle(dm)}
            active={view === "dm" && activeDMId === dm.id}
            unread={naoLida}
            mentions={dm.unreadCount}
            onClick={() => {
              ui.setView("dm");
              // sair da página Amigos: sem isso a conversa é selecionada por
              // baixo e a tela continua mostrando a lista de amigos
              fecharAmigos(false);
              selectDM(dm);
            }}
          >
            {/* preenche o botão inteiro, como o ícone de servidor logo abaixo:
                o `Avatar` traz o próprio tamanho e ficaria menor que a casa */}
            <ImagemDaConversa dm={dm} />
          </RailItem>
        );
      })}

      {/* 1px, e a folga de 10 vem do `gap-2.5` do container — tínhamos 2px com
          mais 2 de margem de cada lado, o que engrossava a linha e afastava os
          grupos */}
      <div aria-hidden="true" className="h-px w-8 shrink-0 bg-rail-divider" />

      {guilds.map((guild) => (
        <RailItem
          key={guild.id}
          label={guild.name}
          active={view === "guild" && activeGuildId === guild.id}
          unread={guild.unread}
          mentions={guild.mentionCount}
          emVoz={vozGuildId === guild.id}
          onClick={() => select(guild)}
          onContextMenu={(e) => openGuildIconMenu(e, guild)}
        >
          {guild.iconUrl ? (
            // o ícone é servido pelo proxy público da API; a sigla é o fallback
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={guild.iconUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            acronym(guild.name)
          )}
        </RailItem>
      ))}

      {/* O "+" do Discord pergunta antes: criar o meu, ou entrar num que já
          existe. Aqui esse menu é o ÚNICO caminho para "entrar por convite" —
          a descoberta pública de servidores não existe neste produto. */}
      <RailItem label="Adicionar um servidor" green onClick={abrirMenuDeServidor}>
        <Plus size={20} />
      </RailItem>
    </nav>
  );
}
