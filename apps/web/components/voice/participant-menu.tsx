"use client";

import {
  Permission,
  computePermissions,
  displayNameOf,
  hasPermission,
  highestPosition,
  nomeParaMim,
  type GuildMemberView,
  type PublicUser,
  type Role,
} from "@streamz/shared";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { ExternalLink, MonitorX, RefreshCw } from "@/components/ui/icones";
import { silencioDoServidorDe } from "@/hooks/useSilencioDoServidor";
import { abrirJanelaSolta, podeAbrirJanelaSolta } from "@/lib/janela-solta";
import { mencionar as entregarMencao } from "@/lib/mencoes";
import {
  alternarSilencioDoServidor,
  alternarSurdezDoServidor,
  desconectarDaVoz,
  podeDesconectarDaVoz,
  podeEnsurdecerNoServidor,
  podeSilenciarNoServidor,
  type MembroDeVoz,
} from "@/lib/moderacao-de-voz";
import { pedirTrocaDeTela } from "@/lib/pedido-de-troca-de-tela";
import {
  garantirComandosDeContexto,
  iniciarChamadaComUsuario,
  itemAdicionarNota,
  itemAlterarApelido,
  itemApelidoDeAmigo,
  itemBloquear,
  itemCastigar,
  itemDesfazerAmizade,
  itemIgnorar,
  submenuAppsDeUsuario,
  submenuConvidarParaOServidor,
} from "@/lib/menu-de-usuario";
import { lerRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useComandosDeContexto } from "@/stores/comandos-de-contexto";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { chaveDaJanela, type TipoDeJanelaDeVoz } from "@/stores/janelas-de-voz";
import { useNotas } from "@/stores/notas";
import { minhasRegrasNoCanalAgora, usePermissions } from "@/stores/permissions";
import { usePreferenciasDoPalco } from "@/stores/preferencias-do-palco";
import { usePreferenciasPorParticipante } from "@/stores/preferencias-por-participante";
import { ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * O menu de um participante da sala — o mesmo na barra lateral e no tile do
 * palco, para as duas listas não divergirem com o tempo.
 *
 * **Menu vivo** (`ui.abrirMenuVivo`): ele se remonta quando a sala muda com ele
 * aberto. Os interruptores (Silenciar, Silenciar efeitos sonoros, Silenciar voz
 * no servidor…) não fecham o menu (`manterAberto`), como no Discord, e a caixa
 * precisa acompanhar o clique **e** o que os outros fazem — outro moderador
 * desfaz o silêncio, a pessoa começa a transmitir, vira amiga.
 *
 * A ordem, sobre outra pessoa, é a do Discord: Perfil, Mencionar, Mensagem,
 * Iniciar chamada, nota, apelido de amigo │ Volume do usuário │ Silenciar,
 * Silenciar efeitos sonoros, Alterar apelido, Apps ›, Convidar para o
 * servidor ›, Desfazer amizade, Ignorar, Bloquear │ o bloco vermelho de
 * moderação (visualização de moderador, silêncio e surdez no servidor,
 * Desconectar, Castigar, Expulsar, Banir) │ Cargos ›. Não existem aqui
 * "Desativar vídeo" (a câmera ligada de alguém sempre aparece — ver
 * `stores/preferencias-por-participante.ts`) nem "Ver Código de Verificação"
 * (não há criptografia de ponta a ponta na voz): item sem ação seria mentira.
 *
 * SEM ícones (ESPEC2 item N, prints s13/s14/s15): ao contrário do menu de
 * mensagem/DM, o menu de usuário desta leva é liso — igual ao menu de membro
 * (`MemberList.tsx`) e ao de `lib/menu-de-usuario.tsx`, de onde vêm os itens
 * sociais e a moderação de membro compartilhados.
 *
 * "Volume do usuário" é a barra deslizante do próprio item (`slider`,
 * `semValor: true` — sem o "100%" ao lado; o valor aparece no balão sobre o
 * polegar durante o arraste), não um submenu de degraus.
 *
 * "Silenciar transmissão" só aparece com a pessoa transmitindo tela agora
 * (`VoiceStateEvent.screen`, não `opcoes.tela` — esse só existe quando o menu
 * abriu **de cima da própria tela** e eu já a assisto). É outro eixo de
 * "Silenciar": aquele cala a voz da pessoa, este só o som da transmissão dela
 * (`telaSilenciada` em `stores/voice.ts`).
 *
 * "Silenciar efeitos sonoros" é preferência **deste navegador sobre esta
 * pessoa** (`stores/preferencias-por-participante.ts`): faz o cliente que está
 * na chamada recusar o som que ela dispara (`deveTocarEfeitoDaChamada` em
 * `stores/soundboard.ts`).
 *
 * A moderação de voz (`lib/moderacao-de-voz.ts`) vale também no meu próprio
 * menu quando tenho o bit — o Discord deixa, e a API aceita automutar sem
 * hierarquia. Castigar/Expulsar/Banir e "Alterar apelido" exigem o bit **e**
 * a hierarquia (`assertCanActOn` da API), e só aparecem para quem é membro do
 * servidor: as ações de `useGuilds` agem sobre a lista de membros carregada, e
 * fora dela não fariam nada. Em DM/grupo, nada de servidor.
 *
 * A seção de visualização ("… em nova janela", prévia da câmera, participantes
 * sem vídeo) só existe no palco (`noPalco`): são ações sobre o **tile**.
 */

/** Quem abre o slider fino de volume (registrado pelo host, ver VoiceGrid). */
export let abrirVolumeDe: (x: number, y: number, userId: string, nome: string) => void = () => {};

export function registrarVolumePopover(fn: typeof abrirVolumeDe) {
  abrirVolumeDe = fn;
}

interface OpcoesDoMenu {
  sou: boolean;
  channelId: string;
  /**
   * Presente só quando o menu abriu a partir do tile de uma tela que eu
   * assisto agora (nunca a minha própria). É o mesmo botão do hover do tile
   * (`TileDeVoz`) — no celular, sem hover, este menu (toque longo) é o único
   * caminho até ele.
   */
  tela?: { onPararDeAssistir: () => void };
  /**
   * O menu abriu do tile do palco (`TileDeVoz`), não da barra lateral. Muda
   * só o meu próprio menu: no palco o Discord não oferece "Mencionar" a mim
   * mesmo (print 3), na lista da sidebar oferece (print 4).
   */
  noPalco?: boolean;
}

export function abrirMenuDeParticipante(x: number, y: number, user: PublicUser, opcoes: OpcoesDoMenu) {
  // o canal manda no servidor: DM/grupo não tem `guildId`, e aí Apps, convite
  // por servidor, moderação e cargos se comportam de acordo
  const canal = useChannels.getState().channels.find((c) => c.id === opcoes.channelId) ?? null;
  const guildId = canal?.guildId ?? null;
  // a carga dos Apps é disparada uma vez; quando chega, o menu vivo se remonta
  // com a lista em vez de ficar em "Nenhum app disponível"
  if (guildId) garantirComandosDeContexto(guildId);

  ui.abrirMenuVivo(
    x,
    y,
    {
      montar: () => montarMenuDeParticipante(x, y, user, guildId, opcoes),
      assinar: assinarMenuDeParticipante,
    },
    MENU_WIDTH_WIDE,
  );
}

function montarMenuDeParticipante(
  x: number,
  y: number,
  user: PublicUser,
  guildId: string | null,
  opcoes: OpcoesDoMenu,
): MenuItem[] {
  const itens: MenuItem[] = [
    {
      label: "Perfil",
      onSelect: () => ui.openProfile(user, { x, y, width: 0, height: 0 }),
    },
  ];
  if (!(opcoes.sou && opcoes.noPalco)) {
    itens.push({ label: "Mencionar", onSelect: () => mencionar(opcoes.channelId, user) });
  }

  // "Parar de assistir": único jeito de sair de uma tela pelo menu no celular
  // (o botão do hover não existe lá — ver `TileDeVoz`). Vem antes dos itens
  // sociais porque é a ação que o próprio tile anunciou ao abrir este menu.
  if (opcoes.tela) {
    itens.push({ separator: true });
    itens.push({ label: "Parar de assistir", onSelect: opcoes.tela.onPararDeAssistir });
  }

  itens.push(...(opcoes.sou ? itensDoMeuMenu(user, guildId, opcoes) : itensSobreOutraPessoa(user, guildId, opcoes)));

  const cargos = submenuCargos(guildId, user.id);
  if (cargos) {
    itens.push({ separator: true });
    itens.push(cargos);
  }
  return itens;
}

function itensDoMeuMenu(user: PublicUser, guildId: string | null, opcoes: OpcoesDoMenu): MenuItem[] {
  // Meu mudo/surdo são os mesmos da barra de controles (`useVoicePrefs`), não
  // o "silenciar" local que aplico aos outros — por isso valem também em
  // DM/grupo, sem `guildId`.
  const prefsDeVoz = useVoicePrefs.getState();
  const itens: MenuItem[] = [{ separator: true }];
  const visualizacao = itensDeVisualizacao(user, opcoes);
  if (visualizacao.length > 0) {
    itens.push(...visualizacao);
    itens.push({ separator: true });
  }
  itens.push({
    label: "Silenciar",
    checked: prefsDeVoz.muted,
    control: "checkbox",
    manterAberto: true,
    onSelect: () => useVoicePrefs.getState().toggleMute(),
  });
  itens.push({
    label: "Desativar áudio",
    checked: prefsDeVoz.deafened,
    control: "checkbox",
    manterAberto: true,
    onSelect: () => useVoicePrefs.getState().toggleDeafen(),
  });
  if (!guildId) return itens;

  const servidor = servidorCarregado(guildId);
  // os de servidor logo abaixo dos meus: são o mesmo par, só que imposto pela
  // moderação — e o Discord deixa quem tem o bit aplicá-los a si
  if (servidor) itens.push(...itensDeModeracaoDeVoz(servidor, opcoes.channelId, user.id));
  itens.push({
    label: "Editar perfil por servidor",
    onSelect: () => ui.openModal({ kind: "perfilPorServidor", guildId }),
  });
  itens.push(submenuAppsDeUsuario(guildId, opcoes.channelId, user.id));
  if (servidor?.pode(Permission.MODERATE_MEMBERS)) {
    itens.push({ separator: true });
    itens.push(itemVisaoDeModerador(guildId, user.id));
  }
  return itens;
}

function itensSobreOutraPessoa(user: PublicUser, guildId: string | null, opcoes: OpcoesDoMenu): MenuItem[] {
  const voz = useVoice.getState();
  const friends = useFriends.getState();
  const souAmigo = friends.friends.some((f) => f.id === user.id);
  const bloqueado = friends.blocked.some((b) => b.id === user.id);
  const ignorado = friends.ignored?.some((u) => u.id === user.id) ?? false;
  const servidor = guildId ? servidorCarregado(guildId) : null;
  const membro = servidor?.linhaDe(user.id);
  // o nome que eu vejo dessa pessoa, o mesmo de `MemberList`: apelido de amigo,
  // depois o do servidor, depois o nome de exibição
  const nome = nomeParaMim(user, {
    apelidoDeAmigo: friends.apelidos?.[user.id],
    apelidoNoServidor: membro?.nickname,
  });

  const itens: MenuItem[] = [
    { label: "Mensagem", onSelect: () => void useDMs.getState().openWith(user.id) },
    { label: "Iniciar chamada", onSelect: () => void iniciarChamadaComUsuario(user.id) },
    itemAdicionarNota(user.id, useNotas.getState().minhasNotas[user.id]),
  ];
  if (souAmigo) itens.push(itemApelidoDeAmigo(user.id, friends.apelidos?.[user.id]));

  const visualizacao = itensDeVisualizacao(user, opcoes);
  if (visualizacao.length > 0) {
    itens.push({ separator: true });
    itens.push(...visualizacao);
  }

  itens.push({ separator: true });
  // barra arrastável ali mesmo, como no Discord; `volumes` é por dono (o id do
  // usuário), o mesmo que o `<audio>` lê — ver `AudioRemotoHost`
  const volume = user.id in voz.volumes ? voz.volumes[user.id] : 1;
  itens.push({
    label: "Volume do usuário",
    slider: {
      value: Math.round(volume * 100),
      min: 0,
      max: 200,
      step: 5,
      onChange: (pct) => useVoice.getState().setVolume(user.id, pct / 100),
      format: (pct) => `${pct}%`,
      semValor: true,
    },
  });
  itens.push({ separator: true });

  // rótulos fixos, como no Discord: a caixa marcada já diz o estado, e um
  // rótulo que trocasse ("Reativar áudio") mudaria o item de lugar na leitura
  // de quem acabou de clicar nele
  itens.push({
    label: "Silenciar",
    checked: !!voz.silenciados[user.id],
    control: "checkbox",
    manterAberto: true,
    onSelect: () => useVoice.getState().toggleSilenciado(user.id),
  });
  const estaTransmitindo = voz.statesOf(opcoes.channelId).some((e) => e.user.id === user.id && e.screen);
  if (estaTransmitindo) {
    itens.push({
      label: "Silenciar transmissão",
      checked: !!voz.telaSilenciada[user.id],
      control: "checkbox",
      manterAberto: true,
      onSelect: () => useVoice.getState().alternarTelaSilenciada(user.id),
    });
  }
  itens.push({
    label: "Silenciar efeitos sonoros",
    checked: usePreferenciasPorParticipante.getState().efeitosSilenciados(user.id),
    control: "checkbox",
    manterAberto: true,
    onSelect: () => usePreferenciasPorParticipante.getState().alternarEfeitosSilenciados(user.id),
  });
  if (servidor && membro && servidor.podeAgirSobre(user.id, Permission.MANAGE_NICKNAMES)) {
    itens.push(itemAlterarApelido(servidor.guildId, membro, nome));
  }
  itens.push(submenuAppsDeUsuario(guildId, opcoes.channelId, user.id));
  itens.push(submenuConvidarParaOServidor(user.id, useGuilds.getState().guilds));
  itens.push(
    souAmigo
      ? itemDesfazerAmizade(user, friends.remove)
      : { label: "Adicionar amigo", onSelect: () => void useFriends.getState().send(user.username) },
  );
  itens.push(itemIgnorar(user.id, ignorado, friends.ignorar, friends.deixarDeIgnorar));
  itens.push(itemBloquear(user, bloqueado, friends.block, friends.unblock));

  // bloco de moderação: depois dos itens sociais (que são meus, sobre a
  // relação com a pessoa), separado porque o efeito deixa de ser só meu e
  // passa a valer para a sala ou o servidor inteiro
  const moderacao = servidor ? blocoDeModeracao(servidor, opcoes.channelId, user.id, membro, nome) : [];
  if (moderacao.length > 0) {
    itens.push({ separator: true });
    itens.push(...moderacao);
  }
  return itens;
}

/**
 * As stores que `montarMenuDeParticipante` lê. Cada assinatura compara só as
 * fatias que importam: sem isso, qualquer mudança nessas stores (a `useVoice`
 * muda a cada pacote de nível de áudio) remontaria o menu à toa. `volumes` fica
 * de fora de propósito — quem muda o volume é a barra deste mesmo menu, que
 * guarda o valor no próprio estado durante o arraste.
 */
function assinarMenuDeParticipante(aoMudar: () => void): () => void {
  const cancelar = [
    aoMudarEm(useVoice, (s) => [s.states, s.silenciados, s.telaSilenciada, s.camOn], aoMudar),
    aoMudarEm(useVoicePrefs, (s) => [s.muted, s.deafened], aoMudar),
    aoMudarEm(usePreferenciasPorParticipante, (s) => [s.efeitosSonorosSilenciados], aoMudar),
    aoMudarEm(usePreferenciasDoPalco, (s) => [s.previaDaCamera, s.mostrarSemVideo], aoMudar),
    aoMudarEm(useFriends, (s) => [s.friends, s.blocked, s.ignored, s.apelidos], aoMudar),
    aoMudarEm(useNotas, (s) => [s.minhasNotas], aoMudar),
    aoMudarEm(useGuilds, (s) => [s.guilds, s.members, s.activeGuildId], aoMudar),
    aoMudarEm(usePermissions, (s) => [s.guildId, s.roles, s.overrides, s.categoryOverrides], aoMudar),
    aoMudarEm(useComandosDeContexto, (s) => [s.porGuild], aoMudar),
    aoMudarEm(useChannels, (s) => [s.channels], aoMudar),
  ];
  return () => {
    for (const c of cancelar) c();
  };
}

/** `subscribe` do zustand que só avisa quando alguma das `fatias` trocou de referência. */
function aoMudarEm<S>(
  store: { subscribe: (ouvinte: (estado: S, anterior: S) => void) => () => void },
  fatias: (estado: S) => readonly unknown[],
  aoMudar: () => void,
): () => void {
  return store.subscribe((estado, anterior) => {
    const agora = fatias(estado);
    const antes = fatias(anterior);
    if (agora.some((v, i) => v !== antes[i])) aoMudar();
  });
}

/**
 * Menu da **minha** transmissão de tela (print 2) — botão direito no tile dela
 * no palco. Diferente do menu de participante, este tem ícones, como no
 * Discord.
 */
export function abrirMenuDaMinhaTela(x: number, y: number): void {
  const itens: MenuItem[] = [
    {
      label: "Parar de transmitir",
      danger: true,
      icon: <MonitorX size={18} />,
      onSelect: () => void useVoice.getState().pararTela(),
    },
    {
      // o seletor é estado do `ScreenShareButton`; o pedido chega a ele por
      // `lib/pedido-de-troca-de-tela`
      label: "Alterar a Transmissão",
      icon: <RefreshCw size={18} />,
      onSelect: pedirTrocaDeTela,
    },
  ];

  // a chave é a do meu tile de tela (`<meuId>:tela`), a mesma que o palco usa
  const eu = useAuth.getState().user;
  if (eu && podeAbrirJanelaSolta()) {
    itens.push({ separator: true });
    itens.push({
      label: "Transmissão em Nova Janela",
      icon: <ExternalLink size={18} />,
      onSelect: () => abrirJanelaDoTile("tela", eu),
    });
  }

  ui.openContextMenu(x, y, itens, MENU_WIDTH_WIDE);
}

/** Tamanho inicial das janelas soltas, em 16:9 como os tiles do palco. */
const JANELA_DO_USUARIO = { largura: 480, altura: 270 };
const JANELA_DA_TELA = { largura: 960, altura: 540 };

/**
 * Solta o tile numa janela. `abrirJanelaSolta` já foca a existente quando a
 * chave está aberta (o Discord traz a janela para a frente em vez de abrir
 * outra), então aqui não há checagem própria — duas contas do mesmo "já
 * aberta" divergiriam no primeiro ajuste. Síncrono de propósito: roda dentro
 * do `onSelect`, que ainda é o gesto do clique (ver `lib/janela-solta.ts`).
 */
function abrirJanelaDoTile(tipo: TipoDeJanelaDeVoz, user: PublicUser): void {
  const nome = displayNameOf(user);
  const tamanho = tipo === "tela" ? JANELA_DA_TELA : JANELA_DO_USUARIO;
  abrirJanelaSolta({
    chave: chaveDaJanela(tipo, user.id),
    titulo: tipo === "tela" ? `Transmissão de ${nome}` : nome,
    largura: tamanho.largura,
    altura: tamanho.altura,
    tipo,
    userId: user.id,
  });
}

/**
 * Seção "visualização" do menu aberto no palco: soltar o tile numa janela,
 * a prévia da minha câmera e o filtro de quem está sem vídeo. Vazia fora do
 * palco (da barra lateral não há tile nem grade).
 *
 * O tile de tela de outra pessoa chega com `opcoes.tela` (só existe quando eu
 * a assisto — e sem assistir não há vídeo para levar à janela); sem ele, o
 * menu veio do tile da pessoa.
 */
function itensDeVisualizacao(
  user: PublicUser,
  opcoes: { sou: boolean; tela?: unknown; noPalco?: boolean },
): MenuItem[] {
  if (!opcoes.noPalco) return [];
  const itens: MenuItem[] = [];
  const ehTela = !!opcoes.tela;

  // no Tauri de celular o `on_new_window` não existe (o de desktop libera
  // `window.open("about:blank")`, ver `lib.rs`): o item some em vez de não
  // fazer nada ao clicar
  if (podeAbrirJanelaSolta()) {
    itens.push({
      label: ehTela ? "Transmissão em nova janela" : "Usuário em nova janela",
      onSelect: () => abrirJanelaDoTile(ehTela ? "tela" : "usuario", user),
    });
  }

  const palco = usePreferenciasDoPalco.getState();
  // só com a câmera ligada: desligada, o tile já é o avatar e o checkbox não
  // mudaria nada na tela. Continua aparecendo com a prévia escondida — é o
  // único caminho de volta.
  if (opcoes.sou && !ehTela && useVoice.getState().camOn) {
    itens.push({
      label: "Pré-visualização da câmera",
      control: "checkbox",
      checked: palco.previaDaCamera,
      manterAberto: true,
      onSelect: () => usePreferenciasDoPalco.getState().alternarPreviaDaCamera(),
    });
  }

  itens.push({
    label: "Mostrar participantes sem vídeo",
    control: "checkbox",
    checked: palco.mostrarSemVideo,
    manterAberto: true,
    onSelect: () => usePreferenciasDoPalco.getState().alternarMostrarSemVideo(),
  });
  return itens;
}

/**
 * O servidor da sala visto por mim, quando é o servidor **carregado** —
 * `usePermissions`/`useGuilds` só conhecem cargos e membros do servidor ativo.
 * `null` fora dele: sem cargos na mão não há como saber o que posso, e
 * esconder é o lado seguro (a API recusaria de todo modo). Este arquivo não é
 * componente (abre por `onContextMenu`), então lê as stores por `getState()`
 * em vez de `useCan`.
 */
interface ServidorCarregado {
  guildId: string;
  roles: Role[];
  eu: MembroDeVoz;
  membro: (userId: string) => MembroDeVoz;
  /** a linha da pessoa na lista de membros; `undefined` para quem não é membro. */
  linhaDe: (userId: string) => GuildMemberView | undefined;
  /** tenho o bit no servidor (fora de canal)? */
  pode: (bit: number) => boolean;
  /**
   * Posso usar o bit **sobre** esta pessoa? A regra de `assertCanActOn` da
   * API: o bit, alvo diferente de mim e meu cargo mais alto estritamente acima
   * do dela (dono acima de todos).
   */
  podeAgirSobre: (alvoId: string, bit: number) => boolean;
}

function servidorCarregado(guildId: string): ServidorCarregado | null {
  const meId = useAuth.getState().user?.id;
  const guildsState = useGuilds.getState();
  const permsState = usePermissions.getState();
  if (!meId) return null;
  if (guildsState.activeGuildId !== guildId || permsState.guildId !== guildId) return null;
  const guild = guildsState.guilds.find((g) => g.id === guildId);
  if (!guild) return null;
  const roles = permsState.roles;
  const linhaDe = (userId: string) => guildsState.members.find((m) => m.user.id === userId);
  const membro = (userId: string): MembroDeVoz => ({
    userId,
    isOwner: guild.ownerId === userId,
    roleIds: linhaDe(userId)?.roleIds ?? [],
  });
  const eu = membro(meId);
  const meusBits = computePermissions(eu, roles, []);
  const pode = (bit: number) => hasPermission(meusBits, bit);
  return {
    guildId,
    roles,
    eu,
    membro,
    linhaDe,
    pode,
    podeAgirSobre: (alvoId, bit) =>
      pode(bit) && alvoId !== meId && highestPosition(eu, roles) > highestPosition(membro(alvoId), roles),
  };
}

/** "Abrir na visualização de moderador" (`MODERATE_MEMBERS`, decidido por quem chama). */
function itemVisaoDeModerador(guildId: string, userId: string): MenuItem {
  return {
    label: "Abrir na visualização de moderador",
    danger: true,
    onSelect: () => ui.openModal({ kind: "visaoDeModerador", guildId, userId }),
  };
}

/**
 * O bloco vermelho sobre outra pessoa: visualização de moderador, moderação de
 * voz e moderação de membro, na ordem do Discord. Castigar/Expulsar/Banir pedem
 * a pessoa na lista de membros (`membro`): `useGuilds.kick`/`ban`/`timeout`
 * a procuram lá, e sem ela o clique não faria nada.
 */
function blocoDeModeracao(
  servidor: ServidorCarregado,
  channelId: string,
  alvoId: string,
  membro: GuildMemberView | undefined,
  nome: string,
): MenuItem[] {
  const itens: MenuItem[] = [];
  if (servidor.pode(Permission.MODERATE_MEMBERS)) itens.push(itemVisaoDeModerador(servidor.guildId, alvoId));
  itens.push(...itensDeModeracaoDeVoz(servidor, channelId, alvoId));
  if (!membro) return itens;
  const guilds = useGuilds.getState();
  if (servidor.podeAgirSobre(alvoId, Permission.MODERATE_MEMBERS)) {
    itens.push(itemCastigar(membro, nome, guilds));
  }
  if (servidor.podeAgirSobre(alvoId, Permission.KICK_MEMBERS)) {
    itens.push({ label: `Expulsar ${nome}`, danger: true, onSelect: () => useGuilds.getState().kick(alvoId) });
  }
  if (servidor.podeAgirSobre(alvoId, Permission.BAN_MEMBERS)) {
    itens.push({ label: `Banir ${nome}`, danger: true, onSelect: () => useGuilds.getState().ban(alvoId) });
  }
  return itens;
}

/**
 * "Silenciar voz no servidor" / "Desativar áudio no servidor" / "Desconectar"
 * sobre `alvoId`, cada um só com o próprio bit (`lib/moderacao-de-voz`: bit +
 * hierarquia + override do **canal** em que a pessoa está, "contra mim só o
 * bit").
 *
 * O marcado vem do `VoiceState` do alvo na sala (`serverMute`/`serverDeaf`),
 * não de estado local. Os dois não fecham o menu: a caixa vira na hora do
 * clique, o `voice.state` que o gateway devolve confirma pela remontagem do
 * menu vivo, e o `false` de `alternarSilencioDoServidor` (API recusou) a
 * desvira.
 */
function itensDeModeracaoDeVoz(servidor: ServidorCarregado, channelId: string, alvoId: string): MenuItem[] {
  const { guildId } = servidor;
  const regras = minhasRegrasNoCanalAgora(channelId);
  const alvo = servidor.membro(alvoId);
  const { serverMute, serverDeaf } = silencioDoServidorDe(useVoice.getState().states, channelId, alvoId);
  const itens: MenuItem[] = [];
  if (podeSilenciarNoServidor(servidor.eu, alvo, servidor.roles, regras)) {
    itens.push({
      label: "Silenciar voz no servidor",
      control: "checkbox",
      danger: true,
      checked: serverMute,
      manterAberto: true,
      onSelect: () => alternarSilencioDoServidor(guildId, alvoId, serverMute),
    });
  }
  if (podeEnsurdecerNoServidor(servidor.eu, alvo, servidor.roles, regras)) {
    itens.push({
      label: "Desativar áudio no servidor",
      control: "checkbox",
      danger: true,
      checked: serverDeaf,
      manterAberto: true,
      onSelect: () => alternarSurdezDoServidor(guildId, alvoId, serverDeaf),
    });
  }
  if (podeDesconectarDaVoz(servidor.eu, alvo, servidor.roles, regras)) {
    itens.push({
      label: "Desconectar",
      danger: true,
      onSelect: () => void desconectarDaVoz(guildId, alvoId),
    });
  }
  return itens;
}

/**
 * "Cargos" — bolinha colorida + nome, com checkbox de atribuição só para quem
 * pode gerenciar cargos (mesma regra de `MemberList.tsx`, §J). `null` fora do
 * servidor carregado ou quando ninguém pode atribuir nada.
 */
function submenuCargos(guildId: string | null, targetUserId: string): MenuItem | null {
  const servidor = guildId ? servidorCarregado(guildId) : null;
  if (!servidor || !servidor.pode(Permission.MANAGE_ROLES)) return null;
  const meuTeto = highestPosition(servidor.eu, servidor.roles);
  const atribuiveis = servidor.roles
    .filter((r) => !r.isDefault && r.position < meuTeto)
    .sort((a, b) => b.position - a.position);
  if (atribuiveis.length === 0) return null;
  const temCargo = (roleId: string) => servidor.linhaDe(targetUserId)?.roleIds.includes(roleId) ?? false;

  return {
    label: "Cargos",
    submenu: atribuiveis.map((r) => ({
      label: r.name,
      control: "checkbox" as const,
      checked: temCargo(r.id),
      dot: r.color ?? undefined,
      onSelect: () => void useGuilds.getState().toggleRole(targetUserId, r.id, !temCargo(r.id)),
    })),
  };
}

/**
 * Mencionar avisa o composer que estiver montado (`lib/mencoes`) e, se não
 * houver nenhum — do palco de voz o campo de texto só aparece quando a conversa
 * abre —, cai no rascunho do canal, que sobrevive até ele montar.
 */
function mencionar(channelId: string, user: PublicUser) {
  if (entregarMencao(user)) return;
  const atual = lerRascunho(channelId);
  const prefixo = atual && !atual.endsWith(" ") ? `${atual} ` : atual;
  // a menção é `@username` em texto puro: é assim que o contrato a reconhece
  salvarRascunho(channelId, `${prefixo}@${user.username} `);
  ui.toast(`@${user.username} foi para a caixa de mensagem`);
}
