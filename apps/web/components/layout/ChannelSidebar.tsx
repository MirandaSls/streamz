"use client";

import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { CheckCheck, Pencil, Plus, Trash2 } from "@/components/ui/icones";
import {
  Permission,
  channelLinkPath,
  channelNotificationScope,
  guildNotificationScope,
  isMuted,
  isUnread,
  type Category,
  type Channel,
} from "@streamz/shared";
import { useEhMobile } from "@/hooks/useEhMobile";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { CabecalhoDoServidor } from "@/components/layout/sidebar/CabecalhoDoServidor";
import {
  CabecalhoDeCategoria,
  ItemDeCanal,
  type PropsDeArrasto,
} from "@/components/layout/sidebar/CategoriaEItemDeCanal";
import { CanalDeVoz } from "@/components/layout/sidebar/CanalDeVoz";
import { urlPublica } from "@/lib/links-do-app";
import { ordenarComFixados, useCanaisFixados } from "@/stores/canais-fixados";
import { useCanaisOcultos } from "@/stores/canais-ocultos";
import { useNomesOcultos } from "@/stores/nomes-ocultos";
import { canalVisivel } from "@/stores/categoria-colapso";
import { useCategories } from "@/stores/categories";
import { groupByCategory, type CategoryGroup } from "@/stores/channel-order";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useCan } from "@/stores/permissions";
import { podeSoltarEm } from "@/stores/voice-mover";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";
import { errorMessage } from "@/stores/socket-adapter";
import { useNotifications } from "@/stores/notifications";
import { api } from "@/lib/api";
import { useVoice } from "@/stores/voice";
import { useSettings } from "@/stores/settings";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/**
 * O que está sendo arrastado agora (só moderação arrasta).
 *
 * `membro-voz` é o participante de um canal de voz indo para outro (`userId` e o
 * canal de onde ele saiu) — a regra de onde ele pode cair é pura, em
 * `stores/voice-mover`.
 */
type Arrasto =
  | { tipo: "canal" | "categoria"; id: string }
  | { tipo: "membro-voz"; userId: string; deChannelId: string }
  | null;
/** Onde a linha de inserção (ou o realce, no caso do participante) aparece. */
type Alvo =
  | { tipo: "canal"; categoryId: string | null; index: number }
  | { tipo: "categoria"; index: number }
  | { tipo: "membro-voz"; channelId: string }
  | null;

/** Referência estável para "nenhum canal fixado" — evita recriar array a cada render. */
const SEM_FIXADOS: string[] = [];

/** Linha de 2px que marca onde o item vai cair. */
function LinhaDeSolta({ ativa }: { ativa: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`mx-2 h-0.5 rounded-full transition ${ativa ? "bg-brand-500" : "bg-transparent"}`}
    />
  );
}

/**
 * Coluna 2 no modo servidor: dados, ordem, arrastar-e-soltar e rolagem.
 *
 * As três peças que ela desenha moram em `components/layout/sidebar/` — o
 * cabeçalho do servidor, o cabeçalho de categoria com o item de canal de texto,
 * e o canal de voz. A divisão é por peça de tela, não por camada: cada uma é
 * redesenhada em separado na onda 1 (ADR-0009), e o que fica aqui é só o que
 * nenhuma delas pode decidir sozinha (quem está arrastando o quê, qual é o
 * canal ativo, qual linha de solta acende).
 *
 * O arrastar-e-soltar usa o DnD nativo do HTML5 em vez de uma biblioteca
 * (`@dnd-kit` e afins): a lista é vertical, curta e sem colisão complexa, e o
 * cálculo da nova ordem já é lógica pura testada (`stores/channel-order`) — não
 * havia o que uma dependência a mais fosse resolver aqui.
 */
export default function ChannelSidebar() {
  /**
   * No celular o cabeçalho desta coluna é outro — ver `CabecalhoDoServidor`.
   * O do desktop (nome + chevron + convidar, 49px) é o medido no computador.
   */
  const celular = useEhMobile();
  const listRef = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto>(null);
  const [alvo, setAlvo] = useState<Alvo>(null);

  const t = useT();
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);
  // ── e-configuracoes ── silenciar canal/servidor
  const porEscopo = useNotifications((s) => s.porEscopo);
  const createInvite = useGuilds((s) => s.createInvite);
  const developerMode = useSettings((s) => s.developerMode);
  /*
    Criar, editar, apagar e reordenar canal e categoria perguntam **a mesma**
    permissão que a API, pelo `useCan` — que roda a `computePermissions` do
    `@streamz/shared`, a mesma função do servidor. `canModerate` ("tenho
    **alguma** permissão de gestão") não serve aqui: quem só expulsa membros
    passava por ele e via ações que a API recusa com 403.
  */
  const podeGerenciarCanais = useCan(Permission.MANAGE_CHANNELS);
  /** Arrastar alguém de um canal de voz para outro (bit novo, ver ADR-0002). */
  const podeMoverMembros = useCan(Permission.MOVE_MEMBERS);
  /**
   * "Ocultar canais silenciados" (print p5 e o cabeçalho do servidor) — por
   * servidor, lida de `stores/canais-ocultos.ts`. Quem liga/desliga é o
   * checkbox dos dois menus (`GuildRail.tsx`, `CabecalhoDoServidor.tsx`); aqui
   * só se lê, para decidir o que a coluna mostra.
   */
  const ocultarSilenciados = useCanaisOcultos((s) =>
    guild ? s.ocultarSilenciados(guild.id) : false,
  );

  const channels = useChannels((s) => s.channels);
  const loading = useChannels((s) => s.loading);
  const activeChannelId = useChannels((s) => s.activeChannelId);
  const vozAqui = useVoice((s) => s.channelId);
  const vozDesde = useVoice((s) => s.desde);
  const voiceChannelId = useChannels((s) => s.voiceChannelId);
  const select = useChannels((s) => s.select);
  const removeChannel = useChannels((s) => s.remove);
  const dropChannel = useChannels((s) => s.dropChannel);
  const dropCategory = useChannels((s) => s.dropCategory);

  const openModal = useUI((s) => s.openModal);
  const abrirVoiceChat = useUI((s) => s.abrirVoiceChat);

  const categories = useCategories((s) => s.categories);
  const collapsed = useCategories((s) => s.collapsed);
  const toggleCollapsed = useCategories((s) => s.toggleCollapsed);
  const setAllCollapsed = useCategories((s) => s.setAllCollapsed);
  const apagarCategoria = useCategories((s) => s.remove);

  /*
    Um bloco por categoria, mais o bloco sem título do topo para os canais
    soltos — e nada além disso.

    Aqui existia um segundo modo: enquanto o servidor não tivesse categoria
    nenhuma, a coluna **inventava** os títulos "Canais de Texto" e "Canais de
    Voz" separando os canais soltos por tipo. Como eram desenho e não dado, a
    primeira categoria de verdade que alguém criasse desligava esse modo: os
    dois títulos sumiam e os canais iam todos para o bloco sem título. Agora as
    duas categorias padrão são linhas em `Category`, criadas junto com o
    servidor (e criadas para os antigos pelo passo de boot da API), então
    aparecem, se renomeiam e se apagam como qualquer outra.
  */
  const idsFixados = useCanaisFixados((s) => (guild ? s.fixados(guild.id) : SEM_FIXADOS));
  /*
    Canais fixados (ESPEC2, item 2 do cartão): saem da categoria deles e vão
    para um bloco no TOPO da coluna, acima de tudo e sem cabeçalho — por isso
    `ordenarComFixados` primeiro tira os fixados da lista (`resto`) e só o
    resto vira `grupos`/categoria. Arrastar para reordenar não está
    implementado para eles (ver `renderChannel`, que desliga o arrasto quando
    `grupo` é `null`).
  */
  const { fixados: canaisFixados, resto: canaisNaoFixados } = ordenarComFixados(channels, idsFixados);
  const grupos = groupByCategory(canaisNaoFixados, categories);

  /**
   * "Entrar sem som de entrada" (menu de contexto do canal de VOZ, item G).
   *
   * O clique normal é `select(canal, "clique")`: ele marca como lido, abre a
   * coluna **e** entra na chamada tocando o som (`voice-entrada.ts`). Aqui a
   * abertura é `"navegacao"` — mesma marcação de lido e mesma troca de coluna,
   * mas ela **não** entra sozinha (só `"clique"` entra) — e quem entra é o
   * `connect` direto, com `som: false`. As guardas de entrada (já conectado
   * aqui, WebRTC indisponível) são as do próprio `connect`; não há checagem
   * duplicada aqui, é o mesmo caminho do clique menos o aviso sonoro.
   */
  function entrarSemSomDeEntrada(channel: Channel) {
    select(channel, "navegacao");
    void useVoice.getState().connect(channel, { som: false });
  }

  /** "Duplicar canal" (F/G): cria uma cópia do canal na mesma categoria. */
  async function duplicarCanal(channel: Channel) {
    const guildId = channel.guildId ?? guild?.id;
    if (!guildId) return;
    try {
      const novo = await api.duplicarCanal(guildId, channel.id);
      useChannels.getState().handleCreated(novo);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível duplicar o canal"), "error");
    }
  }

  /**
   * Botão direito num canal — dois menus por `channel.type` (ESPEC2 F/texto,
   * G/voz), sem ícone em item nenhum (ESPEC2: "TODOS os menus abaixo são SEM
   * ícones").
   *
   * "Renomear canal" e "Gerenciar acesso" saíram: no Discord existe só "Editar
   * canal", e renomear e permissões são abas de dentro dele. "Seguir canal (em
   * breve)" saiu porque o Discord nunca mostra item morto — ou existe, ou não
   * aparece.
   */
  function openChannelMenu(e: MouseEvent, channel: Channel) {
    e.preventDefault();
    const setting = porEscopo[channelNotificationScope(channel.id)];
    const escopo = { tipo: "canal" as const, channelId: channel.id };
    const guildId = channel.guildId ?? guild?.id ?? "";
    const ehVoz = channel.type === "VOICE";
    const fixado = useCanaisFixados.getState().estaFixado(guildId, channel.id);

    const items: MenuItem[] = [
      {
        label: "Marcar como lida",
        disabled: !isUnread(channel),
        onSelect: () => void useChannels.getState().markRead(channel.id),
      },
      { separator: true },
      {
        label: ehVoz ? "Convidar para voz" : "Convite para o canal",
        onSelect: () => void createInvite(channel.id),
      },
      {
        label: fixado ? "Desafixar canal do topo" : "Fixe o Canal no Topo",
        onSelect: () => useCanaisFixados.getState().alternar(guildId, channel.id),
      },
      {
        label: "Copiar link",
        // origem pública e caminho do contrato: montar a URL à mão com
        // `window.location.origin` copiava `http://tauri.localhost/...` no desktop
        onSelect: () =>
          void navigator.clipboard?.writeText(
            urlPublica(channelLinkPath(channel.guildId, channel.id)),
          ),
      },
      { separator: true },
    ];

    if (ehVoz) {
      items.push(
        { label: "Entrar sem som de entrada", onSelect: () => entrarSemSomDeEntrada(channel) },
        {
          label: "Abrir chat",
          onSelect: () => {
            select(channel, "balao");
            abrirVoiceChat(channel.id);
          },
        },
        {
          label: "Ocultar nomes",
          control: "checkbox",
          checked: useNomesOcultos.getState().ocultos(channel.id),
          onSelect: () => useNomesOcultos.getState().alternar(channel.id),
        },
        { separator: true },
        // voz só tem "Silenciar canal ›" — sem "Config. de notificação" (ESPEC2 G)
        submenuSilenciar("Silenciar canal", escopo, setting, t, true),
      );
    } else {
      items.push(
        submenuSilenciar("Silenciar canal", escopo, setting, t, true),
        submenuNotificacoes(escopo, setting, t, "Config. de notificação", true),
      );
    }

    if (podeGerenciarCanais) {
      items.push({ separator: true });
      items.push({
        label: "Editar canal",
        onSelect: () => openModal({ kind: "channelSettings", channelId: channel.id }),
      });
      items.push({ label: "Duplicar canal", onSelect: () => void duplicarCanal(channel) });
      items.push({
        label: ehVoz ? "Criar canal de voz" : "Criar canal de texto",
        onSelect: () =>
          openModal({
            kind: "createChannel",
            categoryId: channel.categoryId,
            tipo: ehVoz ? "VOICE" : "TEXT",
          }),
      });
      items.push({
        // renomeado de "Apagar canal" (ESPEC2 F/G). A confirmação
        // (`stores/channels.ts` `remove()`) continua com o texto antigo — fora
        // do escopo deste cartão, ver relatório final.
        label: "Excluir canal",
        danger: true,
        onSelect: () => void removeChannel(channel),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do canal",
        onSelect: () => void navigator.clipboard?.writeText(channel.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  /** Botão direito numa categoria. */
  function openCategoryMenu(e: MouseEvent, category: Category) {
    e.preventDefault();
    if (!guild) return;
    // "recolher/expandir todas" é UM item que alterna, não dois lado a lado
    const todasFechadas = categories.length > 0 && categories.every((c) => collapsed.includes(c.id));
    const items: MenuItem[] = [
      {
        label: "Marcar como lida",
        icon: <CheckCheck size={18} />,
        onSelect: () => {
          for (const c of channels.filter((c) => c.categoryId === category.id)) {
            void useChannels.getState().markRead(c.id);
          }
        },
      },
      { separator: true },
      {
        label: collapsed.includes(category.id) ? "Expandir categoria" : "Recolher categoria",
        onSelect: () => toggleCollapsed(category.id),
      },
      {
        label: todasFechadas ? "Expandir todas as categorias" : "Recolher todas as categorias",
        onSelect: () => setAllCollapsed(!todasFechadas),
      },
    ];
    if (podeGerenciarCanais) {
      items.push({ separator: true });
      /*
        "Editar categoria" era um `prompt` de renomear. Agora abre o mesmo modal
        da engrenagem do cabeçalho, com abas (geral e permissões) — como no
        Discord, onde renomear é um campo dentro de "Editar categoria" e não uma
        caixinha à parte.
      */
      items.push({
        label: "Editar categoria",
        icon: <Pencil size={18} />,
        onSelect: () => openModal({ kind: "categorySettings", categoryId: category.id }),
      });
      items.push({
        label: "Apagar categoria",
        icon: <Trash2 size={18} />,
        danger: true,
        onSelect: () => void apagarCategoria(guild.id, category),
      });
      // no Discord "Criar canal" vem depois de excluir, no fim do bloco
      items.push({
        label: "Criar canal",
        icon: <Plus size={18} />,
        onSelect: () => openModal({ kind: "createChannel", categoryId: category.id }),
      });
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID da categoria",
        onSelect: () => void navigator.clipboard?.writeText(category.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  /**
   * Setas navegam entre canais sem tirar a mão do teclado; o próprio `button`
   * cuida de Enter/Espaço. Home/End vão para as pontas.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-channel-button]") ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    event.preventDefault();
    items[next]?.focus();
  }

  // ── arrastar-e-soltar ────────────────────────────────────────

  function inicioArrasto(e: DragEvent, tipo: "canal" | "categoria", id: string) {
    e.dataTransfer.effectAllowed = "move";
    // o Firefox só inicia o arrasto se houver algum dado no dataTransfer
    e.dataTransfer.setData("text/plain", id);
    setArrasto({ tipo, id });
  }

  function fimArrasto() {
    setArrasto(null);
    setAlvo(null);
  }

  /** Metade de cima do item = soltar antes; metade de baixo = soltar depois. */
  function indiceNaLinha(e: DragEvent, index: number): number {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY - r.top > r.height / 2 ? index + 1 : index;
  }

  function sobreCanal(e: DragEvent, grupo: CategoryGroup, index: number, channel: Channel) {
    // participante de voz sendo arrastado: o alvo é o canal inteiro, não uma
    // posição entre canais — realce em vez de linha
    if (arrasto?.tipo === "membro-voz") {
      if (!podeSoltarEm(arrasto, channel, podeMoverMembros)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setAlvo({ tipo: "membro-voz", channelId: channel.id });
      return;
    }
    if (arrasto?.tipo !== "canal") return;
    e.preventDefault();
    setAlvo({ tipo: "canal", categoryId: grupo.category?.id ?? null, index: indiceNaLinha(e, index) });
  }

  function sobreCabecalho(e: DragEvent, grupo: CategoryGroup, indexCategoria: number) {
    // cabeçalho de categoria não recebe gente: mover é de canal de voz para
    // canal de voz, e uma categoria não é uma sala
    if (!arrasto || arrasto.tipo === "membro-voz") return;
    e.preventDefault();
    if (arrasto.tipo === "canal") {
      // soltar no cabeçalho joga o canal para o topo daquela categoria
      setAlvo({ tipo: "canal", categoryId: grupo.category?.id ?? null, index: 0 });
    } else {
      setAlvo({ tipo: "categoria", index: indiceNaLinha(e, indexCategoria) });
    }
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    const atual = arrasto;
    const destino = alvo;
    fimArrasto();
    if (!atual || !destino) return;
    if (atual.tipo === "canal" && destino.tipo === "canal") {
      void dropChannel(atual.id, destino.categoryId, destino.index);
    } else if (atual.tipo === "categoria" && destino.tipo === "categoria") {
      void dropCategory(atual.id, destino.index);
    } else if (atual.tipo === "membro-voz" && destino.tipo === "membro-voz") {
      void moverMembro(atual.userId, destino.channelId);
    }
  }

  /**
   * Solta o participante no canal de voz alvo.
   *
   * Quem troca de sala é o cliente **movido**, ao receber o `voice.moved`; aqui
   * não se toca no estado local: os dois `voice.state` do servidor (saiu de lá,
   * entrou aqui) já redesenham as duas listas para todo mundo. Recusa da API
   * (sem permissão, alvo que saiu da voz no meio do arrasto) vira toast.
   */
  async function moverMembro(userId: string, channelId: string) {
    if (!guild) return;
    try {
      await api.moverParaCanalDeVoz(guild.id, userId, channelId);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível mover esta pessoa"), "error");
    }
  }

  function alvoDeCanal(categoryId: string | null, index: number): boolean {
    return alvo?.tipo === "canal" && alvo.categoryId === categoryId && alvo.index === index;
  }

  /**
   * Canal silenciado (por ele mesmo ou pelo servidor) não conta como não lido.
   *
   * Virou função porque a categoria recolhida também precisa da resposta, para
   * decidir quais canais continuam à vista.
   */
  function estaSilenciado(channel: Channel): boolean {
    return (
      isMuted(porEscopo[channelNotificationScope(channel.id)]) ||
      (channel.guildId ? isMuted(porEscopo[guildNotificationScope(channel.guildId)]) : false)
    );
  }

  /**
   * Com "Ocultar canais silenciados" ligado, some da coluna quem está mudo —
   * exceto o canal aberto agora (ele não pode desaparecer debaixo de quem
   * está nele) e quem tem menção não lida (a pílula vermelha precisa
   * continuar visível, ou a citação passaria despercebida).
   */
  function ocultoPorSilencio(channel: Channel): boolean {
    if (!ocultarSilenciados) return false;
    if (channel.id === activeChannelId || channel.id === voiceChannelId) return false;
    if (channel.mentionCount > 0) return false;
    return estaSilenciado(channel);
  }

  /**
   * `grupo` nulo é o canal FIXADO no topo (item 2, ESPEC2): sem categoria e
   * fora de `channel-order`, então sem arrasto (o card não pede reordenar
   * fixados) e sem linha de solta — as duas coisas dependem de uma posição
   * dentro de um grupo que o fixado não tem.
   */
  function renderChannel(channel: Channel, grupo: CategoryGroup | null, index: number) {
    // um só destaque para os dois tipos: canal de voz agora também é canal
    // aberto (ele tem chat de texto), e continua marcado depois de desligar
    const active = activeChannelId === channel.id;
    const silenciado = estaSilenciado(channel);
    // canal de voz entra na conta do não lido como qualquer outro: o chat de
    // texto dele é real, e mensagem lá não pode passar despercebida
    const unread = !active && !silenciado && isUnread(channel);
    const arrastando = grupo !== null && arrasto?.tipo === "canal" && arrasto.id === channel.id;
    const dragProps: PropsDeArrasto = grupo
      ? {
          draggable: podeGerenciarCanais,
          onDragStart: (e: DragEvent) => inicioArrasto(e, "canal", channel.id),
          onDragEnd: fimArrasto,
          onDragOver: (e: DragEvent) => sobreCanal(e, grupo, index, channel),
          onDrop: soltar,
        }
      : { draggable: false, onDragStart: () => {}, onDragEnd: () => {}, onDragOver: () => {}, onDrop: () => {} };
    /** O que as duas linhas (texto e voz) têm em comum. */
    const comuns = {
      channel,
      ativo: active,
      naoLido: unread,
      silenciado,
      arrastando,
      podeGerenciarCanais,
      arrasto: dragProps,
      aoAbrirMenu: (e: MouseEvent) => openChannelMenu(e, channel),
      aoConvidar: () => void createInvite(channel.id),
      aoEditar: () => openModal({ kind: "channelSettings", channelId: channel.id }),
    };
    return (
      <div key={channel.id}>
        {grupo && <LinhaDeSolta ativa={alvoDeCanal(grupo.category?.id ?? null, index)} />}
        {channel.type === "VOICE" ? (
          <CanalDeVoz
            {...comuns}
            // realce no canal inteiro quando é ele que recebe o participante
            // arrastado; linha de inserção não serve aqui — não há "entre
            // dois" numa sala de voz
            alvoDeMembro={alvo?.tipo === "membro-voz" && alvo.channelId === channel.id}
            // conectado à voz **deste** canal: no Discord ganha ícone verde e
            // nome branco
            conectado={vozAqui === channel.id}
            vozDesde={vozDesde}
            podeMoverMembros={podeMoverMembros}
            aoEntrar={() => select(channel, "clique")}
            aoAbrirConversa={() => {
              // `"balao"`: abre o canal **sem** entrar — é aqui que a
              // `VistaDoCanalDeVoz` aparece, com a conversa ao lado
              select(channel, "balao");
              abrirVoiceChat();
            }}
            aoArrastarMembro={(userId) =>
              setArrasto({ tipo: "membro-voz", userId, deChannelId: channel.id })
            }
            aoFimDoArrasto={fimArrasto}
          />
        ) : (
          <ItemDeCanal {...comuns} aoSelecionar={() => select(channel, "clique")} />
        )}
      </div>
    );
  }

  /**
   * Desenha um bloco da lista: o cabeçalho da categoria (quando há uma) e os
   * canais dela. O bloco dos canais soltos não tem cabeçalho — no Discord eles
   * ficam no topo, sem título — e some quando está vazio.
   */
  function renderGrupo(grupo: CategoryGroup, indexCategoria: number) {
    const category = grupo.category;
    const chave = category?.id ?? "sem-categoria";
    const rotulo = category?.name ?? "";
    const lista = grupo.channels;
    const colapsavel = !!category;
    const fechada = colapsavel && collapsed.includes(chave);
    /*
      Categoria fechada não esconde tudo: o canal ativo continua à vista e,
      junto com ele, o que tem novidade — não lido ou menção. É o que o Discord
      faz, e é o que impede o colapso de engolir uma mensagem nova (ou um canal
      recém-criado, que entra aqui já como ativo). A regra é pura e testada em
      `stores/categoria-colapso`.

      Silenciado zera o "não lido" (a mesma conta do `renderChannel`), mas **não**
      as menções: o canal silenciado já desenha a pílula vermelha quando alguém
      me cita, e escondê-lo aqui apagaria da tela a citação que a pílula mostra.
    */
    const visiveis = lista.filter(
      (c) =>
        canalVisivel({
          recolhida: fechada,
          ativo: c.id === activeChannelId || c.id === voiceChannelId,
          naoLido: !estaSilenciado(c) && isUnread(c),
          mencoes: c.mentionCount,
        }) && !ocultoPorSilencio(c),
    );

    // categoria vazia continua desenhada (é onde se solta o primeiro canal);
    // o bloco sem título, não — senão sobraria um respiro no topo da coluna
    if (!colapsavel && grupo.channels.length === 0) return null;
    // diferente da vazia de verdade (acima): esta tinha canal, mas o filtro
    // de "ocultar silenciados" escondeu todos — a categoria some inteira, e
    // não vira um bloco de alvo de solta vazio (ESPEC §D, item 5)
    if (ocultarSilenciados && lista.length > 0 && visiveis.length === 0) return null;

    return (
      <div key={chave} className={colapsavel ? "mt-4" : "mt-1"}>
        {colapsavel && (
          <>
            {/* 2px que a medida do cabeçalho conta: a linha existe em todo
                cabeçalho de categoria e só acende no alvo do arrasto */}
            <LinhaDeSolta
              ativa={alvo?.tipo === "categoria" && alvo.index === indexCategoria}
            />
            <CabecalhoDeCategoria
              label={rotulo}
              collapsed={fechada}
              onToggle={() => toggleCollapsed(chave)}
              // numa categoria cabem os dois tipos — inclusive nas duas
              // padrão, que agora são categorias comuns —, então quem pergunta
              // é o modal, como no Discord
              onCreate={
                podeGerenciarCanais
                  ? () => openModal({ kind: "createChannel", categoryId: category?.id ?? null })
                  : undefined
              }
              onEdit={
                podeGerenciarCanais && category
                  ? () => openModal({ kind: "categorySettings", categoryId: category.id })
                  : undefined
              }
              celular={celular}
              onContextMenu={category ? (e) => openCategoryMenu(e, category) : undefined}
              arrasto={
                category
                  ? {
                      draggable: podeGerenciarCanais,
                      onDragStart: (e: DragEvent) => inicioArrasto(e, "categoria", category.id),
                      onDragEnd: fimArrasto,
                      onDragOver: (e: DragEvent) => sobreCabecalho(e, grupo, indexCategoria),
                      onDrop: soltar,
                    }
                  : undefined
              }
            />
          </>
        )}
        {/* sem margem: cada canal já traz 2px de linha de solta na frente, e
            era esse par que empurrava o primeiro canal 2px abaixo da print */}
        <div>
          {visiveis.map((c) => renderChannel(c, grupo, grupo.channels.indexOf(c)))}
          {/*
            Zona de solta no fim do bloco (inclusive quando ele está vazio).
            `-mb-3` tira os 12px dela do fluxo: ela passa a ocupar os 12
            primeiros pixels da margem do bloco seguinte, que é espaço morto de
            qualquer jeito. Em fluxo, esses 12px somavam ao `mt-4` do próximo
            cabeçalho e abriam 54px entre um canal e o cabeçalho seguinte, onde
            a print tem 42 — era o buraco mais visível da coluna.
          */}
          <div
            onDragOver={(e) => {
              if (arrasto?.tipo !== "canal") return;
              e.preventDefault();
              setAlvo({
                tipo: "canal",
                categoryId: category?.id ?? null,
                index: grupo.channels.length,
              });
            }}
            onDrop={soltar}
            className="h-3 -mb-3"
          >
            <LinhaDeSolta ativa={alvoDeCanal(category?.id ?? null, grupo.channels.length)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-[294px] shrink-0 flex-col bg-background-base-lowest">
      <CabecalhoDoServidor celular={celular} />

      <div
        ref={listRef}
        role="list"
        aria-label="Canais"
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto pb-[78px] pt-2"
      >
        {loading && <p className="px-4 py-1 text-sm text-text-muted">Carregando canais…</p>}
        {!loading && channels.length === 0 && categories.length === 0 && (
          <p className="px-4 py-1 text-sm text-text-muted">
            {guild ? "Nenhum canal ainda. Crie um pelo menu do servidor." : "Escolha um servidor no rail."}
          </p>
        )}

        {/* Canais fixados (ESPEC2 item 2): topo da lista, fora de categoria,
            sem cabeçalho — igual ao bloco solto, mas antes dele. */}
        {canaisFixados.map((c) => renderChannel(c, null, 0))}
        {grupos.map((grupo, i) => renderGrupo(grupo, i - 1))}
      </div>

    </aside>
  );
}
