"use client";

import { useMemo, useState, type HTMLAttributes } from "react";
import {
  Plus,
  MessageSquare,
  Users,
  Volume2,
} from "@/components/ui/icones";
import {
  ALL_PERMISSIONS,
  computePermissions,
  guildFolderDisplayName,
  guildNotificationScope,
  isGroupChannel,
  type DMChannelView,
  type Guild,
  type GuildFolder,
  type PermissionMember,
} from "@streamz/shared";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import { GroupAvatar } from "@/components/ui/Avatar";
import Marca from "@/components/ui/Marca";
import Tooltip from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/primitivos";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import {
  ABAS_DO_SERVIDOR,
  abaDoServidorVisivel,
} from "@/components/modals/ServerSettingsModal";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";
import { useAplicativos } from "@/stores/aplicativos";
import { useAuth } from "@/stores/auth";
import { useCanaisOcultos } from "@/stores/canais-ocultos";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { chaveDoItem, colorirPasta, renomearPasta } from "@/stores/guild-folder-logic";
import { layoutResolvido, useGuildLayout } from "@/stores/guild-layout";
import { useGuilds } from "@/stores/guilds";
import { useNotifications } from "@/stores/notifications";
import { usePermissions } from "@/stores/permissions";
import { useSettings } from "@/stores/settings";
import { useVoice } from "@/stores/voice";
import { ui, useUI, type MenuItem } from "@/stores/ui";
import { ModalConfiguracoesDePasta } from "@/components/layout/ModalConfiguracoesDePasta";
import PastaDoRail from "@/components/layout/PastaDoRail";
import { linhaNaPasta, linhaNoTopo, useArrastarRail } from "@/components/layout/useArrastarRail";

/** Menu da pasta no print 02 do Discord: x=60..236, 176px (o do servidor tem 220). */
const LARGURA_MENU_PASTA = 176;

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
 * Bits de permissão de `guild` para o submenu "Config. do servidor" do menu
 * do ícone — sem `useCan`/`useMyPermissions` (stores/permissions.ts), que só
 * conhecem cargos e regras do servidor **ativo**: aqui o clique direito pode
 * ser em qualquer ícone da rail, não só no que está na tela.
 *
 * Mesmo critério conservador de `useMyPermissions`: o dono sempre vale tudo
 * (`computePermissions` ignora os cargos para ele); sem os cargos carregados
 * — o ícone não é do servidor ativo, e só o dele tem `roles`/`overrides` no
 * `usePermissions` — o conservador é 0 (não sabemos, então escondemos o que
 * pede permissão, como o "não sei" que os outros hooks também tratam como
 * "não posso" para esconder controle).
 */
function permissoesDoServidor(guild: Guild, meuId: string | undefined): number {
  if (!meuId) return 0;
  if (guild.ownerId === meuId) return ALL_PERMISSIONS;
  const perm = usePermissions.getState();
  if (perm.guildId !== guild.id) return 0;
  const roleIds = useGuilds.getState().members.find((m) => m.user.id === meuId)?.roleIds ?? [];
  const member: PermissionMember = { isOwner: false, roleIds };
  return computePermissions(member, perm.roles, []);
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
  if (isGroupChannel(dm)) {
    return (
      <GroupAvatar iconUrl={null} members={dm.others} seed={dm.id} size="lg" className="!h-full !w-full" />
    );
  }
  if (!outro) {
    return <Users size={20} aria-hidden="true" />;
  }
  // o mesmo fallback do `Avatar`: o símbolo do Streamz (~60% da casa de 40)
  // sobre a cor da pessoa — sem o fundo próprio, o glifo herdava a cor do
  // botão e a pessoa mudava de cara entre as colunas
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: corDoAvatar(outro.id) }}
      // fundo é uma cor arbitrária do hash — nunca sabemos se é clara ou
      // escura — então o glifo usa o token de overlay (branco garantido), não
      // `text-white` cru: mesmo padrão do `Avatar.tsx`/`CardDeApp.tsx`.
      className="grid h-full w-full place-items-center text-text-overlay-light"
    >
      <Marca size={24} className="shrink-0" />
    </span>
  );
}

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
      className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded-full bg-status-positive ring-[2.5px] ring-background-base-lowest"
    >
      <Volume2 size={12} className="text-control-primary-text-default" aria-hidden="true" />
    </span>
  );
}

/**
 * Um item do rail: squircle fixo (raio 12, `--radius-md`, `rounded-xl`), em
 * repouso, hover e ativo — não há morfo de círculo para squircle.
 *
 * A revisão visual mediu a forma em repouso nos prints 1:1 (`2026-09-02
 * 152318.png`, servidor "H": 20px de largura em y=243, 34 em y=246, 38 em
 * y=249, 40 em y=255 — raio ≈12; `2026-08-31 101638.png` confirma no mesmo
 * ícone) e achou o **mesmo** raio no início ativo e no "+": o botão já nasce
 * squircle, não círculo — o antigo `rounded-full` de repouso (cartão 1b-rail,
 * que buscava o morfo por SVG do Discord sem achar o par exato de
 * `border-radius`) desenhava um raio maior (≈20) do que o Discord usa. O raio
 * do hover não foi medido à parte e fica igual ao do repouso. O que muda
 * ainda é a cor e a "pílula" branca à esquerda (ponto se há não lido, curta
 * no hover, alta quando ativo). Mais o tooltip.
 */
function RailItem({
  label,
  subtitulo,
  active = false,
  unread = false,
  mentions = 0,
  emVoz = false,
  green = false,
  lado = 40,
  redondo = false,
  dados,
  alvo,
  arrasto,
  arrastando = false,
  realce = false,
  linha = null,
  onClick,
  onContextMenu,
  children,
}: {
  label: string;
  /**
   * Linha secundária da dica (ex.: "2 membros" num grupo de DM em destaque no
   * rail). Ver `Tooltip.subtitle`.
   */
  subtitulo?: React.ReactNode;
  active?: boolean;
  unread?: boolean;
  mentions?: number;
  /** você está numa call deste servidor. */
  emVoz?: boolean;
  green?: boolean;
  /** lado do botão: 40 no desktop, 48 no celular (ver `GuildRail`). */
  lado?: 40 | 48;
  /**
   * Círculo, sempre — nunca o squircle fixo dos servidores/início/"+".
   *
   * É a forma das **conversas em destaque** do rail (`GuildRail.dmsEmDestaque`:
   * a revisão mediu círculo no avatar de DM do print 1:1 `2026-09-01
   * 130840.png`, 12px de largura em y=82 crescendo a 24 em y=86 — curva mais
   * fechada que a de um squircle de raio 12) e da **bolha de conversas** no
   * topo da rail do celular: na captura `discord-mobile-dms-2024.png` ela é
   * redonda e os ícones de servidor abaixo dela não são — a forma é o que
   * separa "minhas conversas" de "um servidor".
   */
  redondo?: boolean;
  /**
   * Atributos `data-*` no botão, para a **delegação de clique** do
   * `ShellMobile` (`aoTocarNaLista`) reconhecer o item. É como
   * `data-channel-button` e `data-dm-button` já funcionam nas outras colunas —
   * um atributo sem pixel nenhum, em vez de um `if (ehMobile)` espalhado aqui
   * dentro.
   */
  dados?: Record<string, string>;
  /**
   * Marca lida pela delegação do arrasto (`useArrastarRail`): `guild:<id>`
   * num servidor, `fim` no "+" (vão depois do último item) e `nada` no início
   * e nas conversas, onde soltar não faz nada.
   */
  alvo?: string;
  /**
   * Atributos de arrastar (`draggable`, `onDragStart`, `onDragEnd`) da caixa
   * de 40 — não do item inteiro, para o arrasto começar no ícone e não na
   * faixa vazia ao lado dele, que é onde fica a pílula.
   */
  arrasto?: HTMLAttributes<HTMLDivElement>;
  /** Este item está sendo arrastado: no lugar dele fica o quadrado tracejado. */
  arrastando?: boolean;
  /** Um servidor arrastado juntaria com este (criaria pasta, ou entraria na dela). */
  realce?: boolean;
  /** Classes de posição da linha de vão, quando soltar agora poria o item ali. */
  linha?: string | null;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const caixa = lado === 48 ? "h-[48px] w-[48px]" : "h-10 w-10";
  return (
    <div
      className="group relative flex w-full justify-center"
      onContextMenu={onContextMenu}
      data-rail-alvo={alvo}
    >
      <span
        aria-hidden="true"
        /* 4px de largura, medido. A **altura** de 40 no ativo já estava certa:
          a auditoria dizia 36-38, e a medição em 7 prints do Discord deu 40 nos
          sete — a pílula vai de ponta a ponta do botão. Cor `--interactive-
          text-active` (#fbfbfb): era `bg-paper` (#fdfdfb), a cor de MARCA do
          Streamz (wordmark/assets) — não é o mesmo token, e pílula de rail não
          é marca (cartão 1b-rail, origem: `unreadPill__972a0` no CSS bruto e
          medir.py rail-tooltip.png×101733.png linha 182). */
        className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-interactive-text-active transition-all duration-200 ${
          arrastando
            ? "h-0"
            : active
              ? lado === 48
                ? "h-[48px]"
                : "h-10"
              : unread
                ? "h-2 group-hover:h-5"
                : "h-0 group-hover:h-5"
        }`}
      />
      {/* A caixa de 40 que **não** corta: é ela que ancora o badge. O selo de
          voz continua dentro do botão de propósito — ele é tangente às bordas
          de cima e da direita e não pode ultrapassar a caixa (ver `SeloDeVoz`);
          o badge, sim, transborda o canto de baixo.

          Arrastando, a caixa vira o `.dragInner` do Discord: um quadrado
          tracejado do tamanho do ícone no lugar de onde ele saiu. É o
          `::before` (não um filho) para o `[&>*]:invisible` esconder ícone,
          badge e selo sem esconder o próprio marcador. */}
      <div
        {...arrasto}
        className={`relative shrink-0 ${caixa} ${
          arrastando
            ? "before:absolute before:inset-0 before:z-10 before:rounded-xl before:border before:border-dashed before:border-border-subtle before:bg-background-mod-normal before:content-[''] [&>*]:invisible"
            : ""
        }`}
      >
        {/* Realce de soltar "sobre": `--opacity-green-28` com contorno
            `--status-positive`, raio 12 (o `.dropHover` do CSS do Discord).
            Fica atrás do botão e 4px maior que ele, então o que se vê é a
            moldura verde em volta do ícone. */}
        {realce && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-xl bg-opacity-green-28 outline outline-1 outline-status-positive"
          />
        )}
        <Tooltip label={label} subtitle={subtitulo} side="right" rail>
          <button
            type="button"
            onClick={onClick}
            {...dados}
            aria-label={unread && !active ? `${label} (não lido)` : label}
            aria-current={active ? "page" : undefined}
            // `redondo` (DM em destaque e a bolha de conversas do celular) é
            // círculo sempre — é a forma que a separa de "servidor" (ver o
            // comentário da prop). Todo o resto (servidor, início, "+") nasce
            // squircle de raio 12 (`rounded-xl`, `--radius-md`) e continua
            // squircle em repouso, hover e ativo — sem morfo (ver o
            // comentário do componente).
            className={`relative grid place-items-center overflow-hidden text-[15px] font-semibold transition-all duration-200 ${
              redondo ? "rounded-full" : "rounded-xl"
            } ${caixa} ${
              active
                ? "bg-brand-500 text-control-primary-text-default"
                : green
                  ? "bg-interactive-background-hover text-status-positive group-hover:bg-status-positive group-hover:text-control-primary-text-default"
                  : "bg-interactive-background-hover text-text-default group-hover:bg-brand-500 group-hover:text-control-primary-text-default"
            }`}
          >
            {children}
            {emVoz && <SeloDeVoz />}
          </button>
        </Tooltip>
        {/*
          Badge de menção/não lidas — o primitivo `Badge` (`tipo="numero"`,
          `recorte`) é a mesma medida que este componente desenhava à mão
          (miolo 16), mas com o token certo de texto (`--badge-text-default`
          #fbfbfb, não o branco puro que estava aqui). O primitivo não tem
          `aria-label` nem posição — por isso o wrapper, que mora **fora** do
          botão (ele tem `overflow-hidden`, é o que faz a foto seguir o raio;
          o badge transborda o canto) com `pointer-events-none`: o clique tem
          que continuar caindo no servidor, não no número.

          Posição e anel: revisão visual mediu o print 1:1 `2026-09-01
          130840.png` (badge em x44-59/y106-121, rente às bordas do ícone em
          x20-59/y82-121, anel de 2px) contra o que saía daqui (badge 2px além
          da borda direita e 1px da inferior, anel de 3px do `recorte`
          padrão do primitivo) — daí `bottom-0 right-0` (rente, não
          transbordando) e `ring-2` (2px) por cima do `ring-[3px]` que
          `recorte` aplica, sem mudar o padrão do primitivo (outros usos de
          `recorte` continuam em 3px).
        */}
        {mentions > 0 && (
          <span
            aria-label={`${mentions} ${mentions === 1 ? "menção" : "menções"}`}
            className="pointer-events-none absolute bottom-0 right-0"
          >
            <Badge tipo="numero" valor={mentions} recorte className="ring-2" />
          </span>
        )}
      </div>
      {linha && <LinhaDeSoltar posicao={linha} />}
    </div>
  );
}

/**
 * A linha de vão: onde o item arrastado vai parar se soltar agora. 2px em
 * `--brand-500`, a mesma do arrastar canais na coluna 2; `posicao` a põe no
 * meio do vão de cima ou de baixo do item (ver `classeDaLinha`).
 */
function LinhaDeSoltar({ posicao }: { posicao: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 z-10 h-0.5 w-10 -translate-x-1/2 rounded-full bg-brand-500 ${posicao}`}
    />
  );
}

/**
 * Classes da linha de vão, centrada no espaço entre os itens.
 *
 * No topo o espaço é o `gap-2.5` do rail (10px): a linha de 2px fica 6px para
 * fora. Dentro da pasta aberta o primeiro servidor está 6px abaixo do
 * cabeçalho e o último a 4px da borda de baixo (`PastaDoRail`), por isso
 * 4px antes do primeiro e 3px depois do último — e a linha não escapa do
 * `overflow-hidden` da lista da pasta.
 */
function classeDaLinha(
  linha: "antes" | "depois" | null,
  { naPasta = false, primeiro = false }: { naPasta?: boolean; primeiro?: boolean } = {},
): string | null {
  if (linha === "antes") return naPasta && primeiro ? "-top-[4px]" : "-top-[6px]";
  if (linha === "depois") return naPasta ? "-bottom-[3px]" : "-bottom-[6px]";
  return null;
}

/**
 * O cabeçalho da pasta arrastada vira o quadrado tracejado de 48 do Discord
 * (`.dragInner` com `--guildbar-folder-size`), como a caixa do servidor
 * arrastado em `RailItem`: `::before` para o `[&>*]:invisible` esconder pílula
 * e botão sem esconder o marcador.
 */
const MARCADOR_DA_PASTA_ARRASTADA =
  "before:absolute before:left-1/2 before:top-0 before:z-10 before:h-12 before:w-12 before:-translate-x-1/2 before:rounded-xl before:border before:border-dashed before:border-border-subtle before:bg-background-mod-normal before:content-[''] [&>*]:invisible";

/**
 * Coluna 1: mensagens diretas, servidores e as duas formas de ganhar um novo.
 *
 * `compacto` é o rail do celular. As medidas vêm da captura oficial
 * `docs/Reference/mobile/discord-mobile-servidor-2024.png` (1,9707 px/pt, ver
 * `MEDIDAS.md` §4): rail de **72pt**, ícone de **48pt**, folga vertical de
 * ~7–8pt — contra 80/40/20 **px** do desktop (ver o comentário da largura, no
 * `<nav>` abaixo). Não é enfeite: 40pt é um alvo de toque abaixo do piso das
 * duas plataformas, e o rail do telefone é a única navegação entre
 * servidores que existe ali.
 */
export default function GuildRail({ compacto = false }: { compacto?: boolean } = {}) {
  // de qual servidor é a call em curso, para o selo do ícone
  const vozGuildId = useVoice((s) => s.guildId);
  const guilds = useGuilds((s) => s.guilds);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const select = useGuilds((s) => s.select);
  const createInvite = useGuilds((s) => s.createInvite);
  const leaveGuild = useGuilds((s) => s.leave);
  const atualizarConversas = useDMs((s) => s.refreshList);
  const dms = useDMs((s) => s.channels);
  const activeDMId = useDMs((s) => s.activeId);
  const selectDM = useDMs((s) => s.select);
  const fecharAmigos = useFriends((s) => s.setOpen);
  const view = useUI((s) => s.view);
  const t = useT();
  const porEscopo = useNotifications((s) => s.porEscopo);
  const markGuildRead = useChannels((s) => s.markGuildRead);
  const sairDaColunaDeVoz = useChannels((s) => s.leaveVoice);
  const developerMode = useSettings((s) => s.developerMode);
  const meuId = useAuth((s) => s.user?.id);
  // ── j-bots · F4 ── o diretório de aplicativos, que abre por cima da coluna 3.
  // Quem o **abre** é o item "Descobrir aplicativos" da `DMList` (a lista da
  // home); aqui o rail só o fecha, porque todo clique dele é uma navegação para
  // outro lugar — servidor, conversa em destaque ou o logo.
  const fecharApps = useAplicativos((s) => s.fechar);

  // ── pastas de servidores ──
  const layoutSalvo = useGuildLayout((s) => s.layout);
  const abertas = useGuildLayout((s) => s.abertas);
  const alternarPasta = useGuildLayout((s) => s.alternarPasta);
  const fecharTodas = useGuildLayout((s) => s.fecharTodas);
  /**
   * O layout gravado casado com os servidores de agora (id que saiu some,
   * servidor novo entra solto no fim). Memorizado porque `resolveGuildLayout`
   * cria um objeto novo a cada chamada, e o arrasto re-renderiza o rail a cada
   * troca de alvo — sem memo, cada render refaria a reconciliação inteira.
   */
  const resolvido = useMemo(
    () => layoutResolvido(layoutSalvo, guilds.map((g) => g.id)),
    [layoutSalvo, guilds],
  );
  const porId = useMemo(() => new Map(guilds.map((g) => [g.id, g])), [guilds]);
  // No celular o rail é de toque: drag-and-drop do HTML5 por toque é
  // irregular entre navegadores, e lá o rail continua só navegando.
  const arrasto = useArrastarRail({ layout: resolvido, abertas, ativo: !compacto });

  /** Id da pasta com "Configurações de pasta" aberto. */
  const [pastaEmEdicao, setPastaEmEdicao] = useState<string | null>(null);
  let pastaEditada: GuildFolder | null = null;
  for (const item of resolvido.items) {
    if (item.kind === "folder" && item.folder.id === pastaEmEdicao) pastaEditada = item.folder;
  }
  // A pasta sumiu com o modal aberto (desfeita noutro aparelho, ou o último
  // servidor dela saiu): o modal fecha, e não reabre sozinho se um id igual
  // voltar depois.
  if (pastaEmEdicao !== null && pastaEditada === null) setPastaEmEdicao(null);

  /**
   * O rail só destaca conversas com mensagem não lida. Como no Discord, a
   * conversa aberta não aparece ali só por estar aberta: ao ser lida, sai.
   *
   * No máximo 6 para o rail não virar uma segunda lista de conversas.
   */
  const dmsEmDestaque = dms
    .filter((d) => !!d.lastMessageAt && (!d.lastReadAt || d.lastMessageAt > d.lastReadAt))
    .slice(0, 6);

  /**
   * O logo volta para **Amigos** (a home), como o do Discord.
   *
   * Antes ele chamava `useDMs.openList`, que reabre a última conversa e só cai
   * na página Amigos quando não há nenhuma — na prática o logo nunca levava
   * para Amigos depois da primeira conversa aberta. Agora é o mesmo caminho do
   * botão "Amigos" da coluna e do histórico (`stores/historico.ts`):
   * `ui.setView("dm")` + `useFriends.setOpen(true)`.
   *
   * `leaveVoice` só tira o **painel** do canal de voz da coluna 3 (é um id de
   * exibição, ver `stores/channels.ts`); a chamada em si vive na store de voz e
   * continua tocando. A lista de conversas é atualizada porque estamos entrando
   * no modo DM — era o que o `openList` fazia por último.
   */
  function irParaAmigos() {
    ui.setView("dm");
    // sair do diretório: senão ele continuaria cobrindo a coluna 3 e o clique
    // no logo pareceria não ter feito nada
    fecharApps();
    sairDaColunaDeVoz();
    // No celular a bolha abre a **lista de conversas**, não a página Amigos:
    // na captura, tocar nela mostra "Mensagens" com as conversas, e "Adicionar
    // amigos" é um botão dentro dessa lista. No desktop o logo continua indo
    // para Amigos, que é a home de lá.
    fecharAmigos(!compacto);
    void atualizarConversas();
  }

  /**
   * Botão direito no ícone do servidor. Este menu simplesmente não existia — e
   * é onde o Discord põe "Marcar como lido", que antes estava no dropdown do
   * cabeçalho da barra de canais.
   *
   * ESPEC §D (print p5): **sem ícone em item nenhum**, inclusive nos
   * submenus — por isso `submenuSilenciar`/`submenuNotificacoes` entram com
   * `semIcones: true` (o cabeçalho da coluna, `CabecalhoDoServidor.tsx`,
   * continua com ícone: é outro menu, com outra referência visual).
   */
  function openGuildIconMenu(e: React.MouseEvent, guild: Guild) {
    e.preventDefault();
    const escopo = porEscopo[guildNotificationScope(guild.id)];
    const souDono = guild.ownerId === meuId;
    const bits = permissoesDoServidor(guild, meuId);
    const abasVisiveis = ABAS_DO_SERVIDOR.filter((a) => abaDoServidorVisivel(a, bits, souDono));
    const items: MenuItem[] = [
      {
        label: "Marcar como lida",
        disabled: !guild.unread,
        onSelect: () => void markGuildRead(guild.id),
      },
      { separator: true },
      {
        label: "Convidar para o servidor",
        // mesmo convite que o botão de convidar já abre hoje: entra no
        // servidor (para o modal carregar os canais e as regras certas) e
        // abre o modal de convite em seguida
        onSelect: () => {
          select(guild);
          void createInvite();
        },
      },
      { separator: true },
      submenuSilenciar(
        "Silenciar servidor",
        { tipo: "servidor", guildId: guild.id },
        escopo,
        t,
        true,
      ),
      submenuNotificacoes({ tipo: "servidor", guildId: guild.id }, escopo, t, "Config. de notificação", true),
      {
        label: "Ocultar canais silenciados",
        control: "checkbox",
        checked: useCanaisOcultos.getState().ocultarSilenciados(guild.id),
        onSelect: () => useCanaisOcultos.getState().alternar(guild.id),
      },
      { separator: true },
    ];
    // sem aba nenhuma visível (ninguém, nem o dono, vê "Configurações do
    // servidor" vazia): o item some, como o Discord nunca mostra item morto
    if (abasVisiveis.length > 0) {
      items.push({
        label: "Config. do servidor",
        submenu: abasVisiveis.map((a) => ({
          label: a.label,
          onSelect: () => ui.openModal({ kind: "serverSettings", guildId: guild.id, tab: a.id }),
        })),
      });
    }
    items.push(
      {
        label: "Config. de privacidade",
        onSelect: () => ui.openModal({ kind: "privacidadeDoServidor", guildId: guild.id }),
      },
      {
        label: "Editar perfil por servidor",
        onSelect: () => ui.openModal({ kind: "perfilPorServidor", guildId: guild.id }),
      },
    );
    if (!souDono) {
      items.push({ separator: true });
      items.push({
        label: "Sair do servidor",
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

  /**
   * "Marcar pasta como lida": um servidor depois do outro, não em paralelo.
   * `markGuildRead` guarda um retrato dos canais para desfazer se a API
   * falhar; chamadas simultâneas tirariam retratos umas das outras no meio, e
   * a reversão de uma desfaria o que outra já tinha marcado.
   */
  async function marcarPastaComoLida(guildIds: string[]) {
    for (const id of guildIds) await markGuildRead(id);
  }

  /**
   * Botão direito no cabeçalho de uma pasta. Mesmo mecanismo do menu do
   * servidor (`ui.openContextMenu`), e por isso o mesmo acesso por teclado:
   * a tecla de menu / Shift+F10 com o foco no botão da pasta dispara o
   * `contextmenu` que chega aqui, e o menu se navega por setas.
   */
  function openFolderMenu(e: React.MouseEvent, servidores: Guild[], pastaId: string) {
    e.preventDefault();
    const naoLidos = servidores.filter((g) => g.unread || g.mentionCount > 0);
    const items: MenuItem[] = [
      {
        label: "Marcar pasta como lida",
        disabled: naoLidos.length === 0,
        onSelect: () => void marcarPastaComoLida(naoLidos.map((g) => g.id)),
      },
      { separator: true },
      { label: "Configurações de pasta", onSelect: () => setPastaEmEdicao(pastaId) },
      { label: "Fechar todas as pastas", onSelect: () => fecharTodas() },
    ];
    ui.openContextMenu(e.clientX, e.clientY, items, LARGURA_MENU_PASTA);
  }

  /**
   * Nome e cor num `aplicar` só — um PUT, não dois. Parte do layout **de
   * agora** na store, não do render que abriu o modal: com ele aberto pode
   * ter chegado um `guild.layout.update` de outro aparelho.
   */
  function salvarPasta(pastaId: string, { name, color }: { name: string | null; color: string | null }) {
    const base = layoutResolvido(
      useGuildLayout.getState().layout,
      useGuilds.getState().guilds.map((g) => g.id),
    );
    const novo = colorirPasta(renomearPasta(base, pastaId, name), pastaId, color);
    // as duas funções devolvem o mesmo objeto quando nada muda: Pronto sem
    // mexer em nada não vira PUT
    if (novo !== base) useGuildLayout.getState().aplicar(novo);
  }

  /** Um servidor no rail — solto no topo ou dentro de uma pasta aberta. */
  function servidorNoRail(guild: Guild, linha: string | null) {
    const chave = chaveDoItem({ kind: "guild", guildId: guild.id });
    return (
      <RailItem
        key={chave}
        lado={compacto ? 48 : 40}
        label={guild.name}
        active={view === "guild" && activeGuildId === guild.id}
        unread={guild.unread}
        mentions={guild.mentionCount}
        emVoz={vozGuildId === guild.id}
        alvo={chave}
        arrasto={arrasto.arrastoDoServidor(guild.id)}
        arrastando={arrasto.arrastado === chave}
        realce={arrasto.alvo?.tipo === "servidor" && arrasto.alvo.guildId === guild.id}
        linha={linha}
        onClick={() => {
          // o diretório cobre a coluna 3; entrar num servidor o fecha (F4)
          fecharApps();
          select(guild);
        }}
        onContextMenu={(e) => openGuildIconMenu(e, guild)}
      >
        {guild.iconUrl ? (
          // o ícone é servido pelo proxy público da API; a sigla é o fallback.
          // `draggable={false}`: senão o arrasto começaria na imagem (só ela
          // como fantasma, levando a URL junto), e não na caixa do servidor
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={guild.iconUrl}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          acronym(guild.name)
        )}
      </RailItem>
    );
  }

  /** Uma pasta no topo do rail, com os servidores dela dentro. */
  function pastaNoRail(folder: GuildFolder, linha: string | null) {
    const chave = chaveDoItem({ kind: "folder", folder });
    const servidores = folder.guildIds
      .map((id) => porId.get(id))
      .filter((g): g is Guild => g !== undefined);
    const dragProps = arrasto.arrastoDaPasta(folder.id);
    return (
      <div key={chave} className="relative w-full">
        <PastaDoRail
          folder={folder}
          nome={guildFolderDisplayName(folder, (id) => porId.get(id)?.name)}
          servidores={servidores}
          aberta={abertas.includes(folder.id)}
          // fechada, a pasta faz as vezes do servidor ativo que está nela:
          // ganha a pílula alta (aberta, quem mostra é o próprio servidor)
          ativa={view === "guild" && activeGuildId !== null && folder.guildIds.includes(activeGuildId)}
          naoLido={servidores.some((g) => g.unread)}
          mencoes={servidores.reduce((soma, g) => soma + g.mentionCount, 0)}
          onToggle={() => alternarPasta(folder.id)}
          onContextMenu={(e) => openFolderMenu(e, servidores, folder.id)}
          dropAlvo={arrasto.alvo?.tipo === "pasta" && arrasto.alvo.pastaId === folder.id}
          lado={compacto ? 48 : 40}
          dragProps={
            arrasto.arrastado === chave ? { ...dragProps, className: MARCADOR_DA_PASTA_ARRASTADA } : dragProps
          }
        >
          {servidores.map((g, k) =>
            servidorNoRail(
              g,
              classeDaLinha(linhaNaPasta(arrasto.alvo, folder.id, k, servidores.length), {
                naPasta: true,
                primeiro: k === 0,
              }),
            ),
          )}
        </PastaDoRail>
        {linha && <LinhaDeSoltar posicao={linha} />}
      </div>
    );
  }

  return (
    <nav
      aria-label="Servidores"
      /* sem `pt`: no Discord o topo do primeiro botão encosta na barra de
          título. Os nossos 12px de folga faziam a rail começar mais baixo que
          a coluna ao lado, e a diferença aparece na horizontal do topo.

          Largura 80px no desktop: a revisão visual mediu o print 1:1
          `2026-08-31 152318.png` (linha y=600 — rail em x0–79, borda em
          x=80) contra o nosso (rail em x0–70, borda em x=71) — 72px
          (`--custom-guild-list-width`) não batia com o Discord medido, que
          recua 20px de cada lado do ícone de 40 (linha y=52, ícone em
          x20–59), não 16. Os itens já centralizam com `justify-center`, então
          o recuo vem sozinho da largura — não é padding extra. A borda de 1px
          entre a rail e a coluna de canais é `var(--app-frame-border)` direto
          (não `theme(colors.app-frame-border)`): a função de opacidade do
          token só resolve `<alpha-value>` dentro do pipeline de cor do
          Tailwind, e o `theme(colors.rail-divider)` antigo referenciava um
          nome que não existe mais em `tokens.gerados.ts` desde a migração da
          ADR-0009 — a classe inteira não compilava e a rail ficava sem
          nenhuma linha (cartão 1b-rail, divergência "amigos-online"). */
      className={`flex shrink-0 flex-col items-center overflow-y-auto bg-background-base-lowest shadow-[inset_-1px_0_0_var(--app-frame-border)] ${
        // no celular não há card de usuário flutuando por cima da rail: o
        // respiro de 78px existe só para ele, e ali sobraria um buraco no fim.
        // O compacto continua 72 — só o desktop mudou para 80 (ver acima).
        compacto ? "w-[72px] gap-2 pb-3" : "w-[80px] gap-2.5 pb-[78px]"
      }`}
      // o arrasto de servidores e pastas, delegado (ver `useArrastarRail`)
      {...arrasto.propsDaNav}
    >
      {/*
        Sem `mentions`: o botão de início **não** ganha badge vermelho.

        Medido no print do Discord `2026-09-01 130840` (e nos dois vizinhos):
        há uma conversa não lida — o avatar dela, logo abaixo, mostra o badge
        `1` no canto inferior direito, com o ponto branco de não lido à
        esquerda — e o botão de início, no mesmo instante, está limpo. O número
        aparece em quem mandou (o item da conversa) e nos servidores com
        menção, nunca somado no início.

        O início não mostra pílula de não lido, como no Discord: só a pílula de
        ativo. O número fica no item da conversa.
      */}
      <RailItem
        label="Mensagens diretas"
        lado={compacto ? 48 : 40}
        redondo={compacto}
        active={view === "dm"}
        // acima dos servidores soltar não faz nada
        alvo="nada"
        onClick={irParaAmigos}
      >
        {/*
          No desktop, o símbolo da marca, no lugar onde o Discord põe o logo
          dele. No celular, o **balão**: ali esta bolha não é "a home do app", é
          a entrada das conversas — tocá-la troca a coluna da direita pela lista
          "Mensagens" (`discord-mobile-dms-2024.png`), com a rail à vista.
        */}
        {compacto ? <MessageSquare size={26} /> : <Marca size={22} />}
      </RailItem>

      {/*
        Conversas em destaque, entre o botão de início e os servidores — como no
        Discord. Aparece quem tem mensagem não lida, para que uma DM não fique
        escondida atrás da coluna de servidores quando chega mensagem enquanto
        você está em outro lugar.
      */}
      {dmsEmDestaque.map((dm) => {
        const naoLida = !!dm.lastMessageAt && (!dm.lastReadAt || dm.lastMessageAt > dm.lastReadAt);
        // contagem de membros na dica, só para grupo (DM 1-a-1 não tem
        // subtítulo — o rótulo já é a pessoa). `others` exclui quem está
        // olhando, daí o +1.
        const membros = dm.others.length + 1;
        return (
          <RailItem
            key={dm.id}
            lado={compacto ? 48 : 40}
            // DM em destaque é sempre círculo, nunca squircle — ver o
            // comentário da prop em `RailItem`.
            redondo
            label={dmTitle(dm)}
            subtitulo={isGroupChannel(dm) ? `${membros} ${membros === 1 ? "membro" : "membros"}` : undefined}
            active={view === "dm" && activeDMId === dm.id}
            unread={naoLida}
            mentions={dm.unreadCount}
            alvo="nada"
            onClick={() => {
              ui.setView("dm");
              // sair da página Amigos: sem isso a conversa é selecionada por
              // baixo e a tela continua mostrando a lista de amigos
              fecharAmigos(false);
              // e do diretório, pelo mesmo motivo (F4)
              fecharApps();
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
      <div aria-hidden="true" className="h-px w-8 shrink-0 bg-app-frame-border" />

      {/* Servidores soltos e pastas, na ordem do layout da conta. */}
      {resolvido.items.map((item, i) => {
        const linha = classeDaLinha(linhaNoTopo(arrasto.alvo, i, resolvido.items.length));
        if (item.kind === "folder") return pastaNoRail(item.folder, linha);
        const guild = porId.get(item.guildId);
        return guild ? servidorNoRail(guild, linha) : null;
      })}

      {/* O "+" do Discord abre "Crie seu servidor" direto — não um menu de
          duas opções. "Já tem um convite?" mora dentro desse modal
          (`CriarServidorModal.tsx`, tela "criar"), com o botão "Entrar em um
          servidor" que leva à tela "entrar". Este continua sendo o ÚNICO
          caminho para entrar por convite — a descoberta pública de
          servidores não existe neste produto. */}
      <RailItem
        label="Adicionar um servidor"
        lado={compacto ? 48 : 40}
        green
        // soltar sobre o "+" é soltar depois do último item
        alvo="fim"
        onClick={() => ui.openModal({ kind: "criarServidor" })}
      >
        <Plus size={compacto ? 24 : 20} />
      </RailItem>

      <ModalConfiguracoesDePasta
        aberto={pastaEditada !== null}
        folderName={pastaEditada?.name ?? null}
        folderColor={pastaEditada?.color ?? null}
        // o print do Discord mostra o texto fixo, não o nome derivado
        placeholderNome="Pasta do servidor"
        onSalvar={(v) => {
          if (pastaEmEdicao !== null) salvarPasta(pastaEmEdicao, v);
        }}
        onFechar={() => setPastaEmEdicao(null)}
      />

      {/*
        ── j-bots · F4 ── "Descobrir aplicativos" **não fica mais aqui.**

        Ele nasceu neste ponto, logo abaixo do "+", e mudou de lugar: agora é um
        item da lista da home (`components/layout/DMList.tsx`), logo abaixo de
        "Amigos". O motivo é o mesmo do Discord — a rail é a coluna de
        *destinos* (os servidores e o "+" que cria um), enquanto Amigos, Nitro e
        Loja, que são a navegação **da home**, moram na coluna 2. Um botão de
        catálogo entre os ícones de servidor pedia para ser lido como a
        descoberta de servidores, que foi removida de propósito (o comentário
        acima do "+" diz por quê) e continua removida.

        O que veio junto na mudança e está lá, não aqui: o ícone `Apps` (as
        quatro formas do App Directory — não uma bússola, ver `icones.tsx`) e o
        atributo `data-apps-button`, que o `ShellMobile` escuta por delegação
        para empilhar a tela cheia no celular.

        O que ficou: o `fecharApps()` nos cliques do rail. O diretório cobre a
        coluna 3, então entrar num servidor ou numa conversa por aqui precisa
        tirá-lo da frente — como o `fecharAmigos(false)` faz com a página
        Amigos.
      */}
    </nav>
  );
}
