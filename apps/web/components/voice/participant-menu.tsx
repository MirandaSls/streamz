"use client";

import {
  Permission,
  computePermissions,
  displayNameOf,
  hasPermission,
  highestPosition,
  type PermissionMember,
  type PublicUser,
} from "@streamz/shared";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { AppWindow, Monitor, MonitorX, MoreHorizontal } from "@/components/ui/icones";
import { silencioDoServidorDe } from "@/hooks/useSilencioDoServidor";
import { abrirJanelaSolta, podeAbrirJanelaSolta } from "@/lib/janela-solta";
import { mencionar as entregarMencao } from "@/lib/mencoes";
import {
  alternarSilencioDoServidor,
  alternarSurdezDoServidor,
  podeEnsurdecerNoServidor,
  podeSilenciarNoServidor,
  type MembroDeVoz,
} from "@/lib/moderacao-de-voz";
import { pedirTrocaDeTela } from "@/lib/pedido-de-troca-de-tela";
import {
  garantirComandosDeContexto,
  iniciarChamadaComUsuario,
  itemAdicionarNota,
  itemBloquear,
  itemDesfazerAmizade,
  itemIgnorar,
  submenuAppsDeUsuario,
  submenuConvidarParaOServidor,
} from "@/lib/menu-de-usuario";
import { lerRascunho, salvarRascunho } from "@/lib/rascunhos";
import { chaveDoTileDeTela, usePreviaDaMinhaTela } from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { chaveDaJanela, type TipoDeJanelaDeVoz } from "@/stores/janelas-de-voz";
import { useNotas } from "@/stores/notas";
import { usePermissions } from "@/stores/permissions";
import { usePreferenciasDoPalco } from "@/stores/preferencias-do-palco";
import { usePreferenciasPorParticipante } from "@/stores/preferencias-por-participante";
import { ui, type MenuItem } from "@/stores/ui";
import { aplicarAssinaturasDeTela, participantesDe, telasDe, useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * O menu de um participante da sala — o mesmo na barra lateral e no tile do
 * palco, para as duas listas não divergirem com o tempo.
 *
 * SEM ícones (ESPEC2 item N, prints s13/s14/s15): ao contrário do menu de
 * mensagem/DM, o menu de usuário desta leva é liso — igual ao menu de membro
 * (`MemberList.tsx`) e ao de `lib/menu-de-usuario.tsx`, de onde vêm os itens
 * sociais compartilhados (nota, Apps, convidar para o servidor, ignorar,
 * bloquear, desfazer amizade).
 *
 * "Volume do usuário" é a barra deslizante do próprio item (`slider`,
 * `semValor: true` — sem o "100%" ao lado, só o rótulo em cima e a barra na
 * cor da marca embaixo), não mais um submenu de degraus: o menu de contexto
 * do app desenha ações, não controles contínuos, mas o Discord resolve o
 * volume ali mesmo, sem abrir nada.
 *
 * "Silenciar transmissão" só aparece com a pessoa transmitindo tela agora
 * (`VoiceStateEvent.screen` de `voz.statesOf`, não `opcoes.tela` — esse só
 * existe quando o menu abriu **de cima da própria tela** e eu já a assisto;
 * aqui a checagem vale também vindo da barra lateral, de longe). É outro
 * eixo de "Silenciar": aquele cala a voz da pessoa, este só o som da
 * transmissão dela (`telaSilenciada` em `stores/voice.ts`) — quem assiste a
 * uma transmissão com música alta quer calar a música, não a pessoa.
 *
 * "Silenciar efeitos sonoros" e "Desativar vídeo" são preferências **deste
 * navegador sobre esta pessoa** (`stores/preferencias-por-participante.ts`) —
 * cada uma com efeito num lugar diferente: a primeira faz `soundboard.ts`
 * recusar o som que ela dispara (`stores/soundboard.ts`); a segunda faz o
 * palco tratar a câmera dela como inexistente (`VoiceGrid.tsx`).
 *
 * "Silenciar no servidor" / "Desativar áudio no servidor" são a moderação de
 * voz (`lib/moderacao-de-voz.ts`), vermelhos como no Discord porque agem
 * sobre a pessoa para a sala inteira, não só para mim. Valem também no meu
 * próprio menu quando tenho o bit — o Discord deixa, e a API aceita
 * automutar sem hierarquia. Em DM/grupo nunca: não há servidor cujo bit
 * consultar.
 *
 * A seção de visualização ("… em nova janela", prévia da câmera, participantes
 * sem vídeo) só existe no palco (`noPalco`): são ações sobre o **tile**, e da
 * barra lateral não há tile para soltar nem grade para filtrar.
 *
 * "Cargos" só aparece com o servidor da sala carregado (`usePermissions`
 * pareado com `useGuilds.activeGuildId`) e permissão de gerenciar cargos — a
 * mesma conta de `MemberList.tsx`, reimplementada aqui porque este arquivo não
 * é um componente (abre por `onContextMenu`, sem hooks disponíveis).
 */

/** Quem abre o slider fino de volume (registrado pelo host, ver VoiceGrid). */
export let abrirVolumeDe: (x: number, y: number, userId: string, nome: string) => void = () => {};

export function registrarVolumePopover(fn: typeof abrirVolumeDe) {
  abrirVolumeDe = fn;
}

export function abrirMenuDeParticipante(
  x: number,
  y: number,
  user: PublicUser,
  opcoes: {
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
  },
) {
  const voz = useVoice.getState();
  const volume = user.id in voz.volumes ? voz.volumes[user.id] : 1;
  const silenciado = !!voz.silenciados[user.id];
  const telaSilenciada = !!voz.telaSilenciada[user.id];
  const estaTransmitindo = voz.statesOf(opcoes.channelId).some((e) => e.user.id === user.id && e.screen);
  const prefs = usePreferenciasPorParticipante.getState();

  // o canal manda no servidor: DM/grupo não tem `guildId`, e aí Apps, convite
  // por servidor e cargos se comportam de acordo (ver os itens abaixo)
  const canal = useChannels.getState().channels.find((c) => c.id === opcoes.channelId) ?? null;
  const guildId = canal?.guildId ?? null;
  if (guildId) garantirComandosDeContexto(guildId);

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

  if (opcoes.sou) {
    // Meu mudo/surdo são os mesmos da barra de controles (`useVoicePrefs`),
    // não o "silenciar" local que aplico aos outros — por isso valem também
    // em DM/grupo, sem `guildId`.
    const prefsDeVoz = useVoicePrefs.getState();
    itens.push({ separator: true });
    const visualizacao = itensDeVisualizacao(user, opcoes);
    if (visualizacao.length > 0) {
      itens.push(...visualizacao);
      itens.push({ separator: true });
    }
    itens.push({
      label: "Silenciar",
      checked: prefsDeVoz.muted,
      control: "checkbox",
      onSelect: () => useVoicePrefs.getState().toggleMute(),
    });
    itens.push({
      label: "Desativar áudio",
      checked: prefsDeVoz.deafened,
      control: "checkbox",
      onSelect: () => useVoicePrefs.getState().toggleDeafen(),
    });
    // os de servidor logo abaixo dos meus: são o mesmo par, só que imposto
    // pela moderação — e o Discord deixa quem tem o bit aplicá-los a si
    itens.push(...itensDeModeracaoDeVoz(guildId, opcoes.channelId, user.id));
    if (guildId) {
      itens.push({
        label: "Editar perfil por servidor",
        onSelect: () => ui.openModal({ kind: "perfilPorServidor", guildId }),
      });
      itens.push(submenuAppsDeUsuario(guildId, opcoes.channelId, user.id));
      if (podeModerarMembros(guildId)) {
        itens.push({ separator: true });
        itens.push({
          label: "Abrir na visualização de moderador",
          onSelect: () => ui.openModal({ kind: "visaoDeModerador", guildId, userId: user.id }),
        });
      }
    }
  } else {
    const friends = useFriends.getState();
    const souAmigo = friends.friends.some((f) => f.id === user.id);
    const bloqueado = friends.blocked.some((b) => b.id === user.id);
    const ignorado = friends.ignored?.some((u) => u.id === user.id) ?? false;
    const notaExistente = useNotas.getState().minhasNotas[user.id];

    itens.push({ label: "Mensagem", onSelect: () => void useDMs.getState().openWith(user.id) });
    itens.push({ label: "Iniciar chamada", onSelect: () => void iniciarChamadaComUsuario(user.id) });
    itens.push(itemAdicionarNota(user.id, notaExistente));
    const visualizacao = itensDeVisualizacao(user, opcoes);
    if (visualizacao.length > 0) {
      itens.push({ separator: true });
      itens.push(...visualizacao);
    }
    itens.push({ separator: true });
    // barra arrastável ali mesmo, como no Discord: degraus fixos obrigavam a
    // escolher entre 100% e 150% sem nada no meio
    itens.push({
      label: "Volume do usuário",
      slider: {
        value: Math.round(volume * 100),
        min: 0,
        max: 200,
        step: 5,
        onChange: (pct) => useVoice.getState().setVolume(user.id, pct / 100),
        semValor: true,
      },
    });
    itens.push({ separator: true });
    itens.push({
      label: silenciado ? "Reativar áudio" : "Silenciar",
      checked: silenciado,
      control: "checkbox",
      onSelect: () => useVoice.getState().toggleSilenciado(user.id),
    });
    if (estaTransmitindo) {
      itens.push({
        label: telaSilenciada ? "Reativar som da transmissão" : "Silenciar transmissão",
        checked: telaSilenciada,
        control: "checkbox",
        onSelect: () => useVoice.getState().alternarTelaSilenciada(user.id),
      });
    }
    itens.push({
      label: "Silenciar efeitos sonoros",
      checked: prefs.efeitosSilenciados(user.id),
      control: "checkbox",
      onSelect: () => usePreferenciasPorParticipante.getState().alternarEfeitosSilenciados(user.id),
    });
    itens.push({
      label: "Desativar vídeo",
      checked: prefs.videoDesativado(user.id),
      control: "checkbox",
      onSelect: () => usePreferenciasPorParticipante.getState().alternarVideoDesativado(user.id),
    });
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
    // relação com a pessoa) e antes de "Cargos", separado porque o efeito
    // deixa de ser só meu e passa a valer para a sala inteira
    const moderacao = itensDeModeracaoDeVoz(guildId, opcoes.channelId, user.id);
    if (moderacao.length > 0) {
      itens.push({ separator: true });
      itens.push(...moderacao);
    }
  }

  const cargos = submenuCargos(guildId, user.id);
  if (cargos) {
    itens.push({ separator: true });
    itens.push(cargos);
  }

  // (mover e desconectar da voz entrariam no bloco de moderação acima — ainda
  // não existem no app)

  ui.openContextMenu(x, y, itens, MENU_WIDTH_WIDE);
}

/**
 * Menu da **minha** transmissão de tela (print 2) — botão direito no tile dela
 * no palco. Diferente do menu de participante, este tem ícones, como no
 * Discord.
 */
export function abrirMenuDaMinhaTela(x: number, y: number): void {
  const voz = useVoice.getState();
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
      icon: <Monitor size={18} />,
      onSelect: pedirTrocaDeTela,
    },
  ];

  // a chave é a do meu tile de tela (`<meuId>:tela`), a mesma que o palco usa
  const eu = useAuth.getState().user;
  if (eu && podeAbrirJanelaSolta()) {
    itens.push({
      label: "Transmissão em nova janela",
      icon: <AppWindow size={18} />,
      onSelect: () => abrirJanelaDoTile("tela", eu),
    });
  }

  // "Mais opções" só leva o que tem estado de verdade por trás.
  const maisOpcoes: MenuItem[] = [
    {
      // Trocar a qualidade no ar exige republicar a faixa; `setScreenQuality`
      // sozinho só grava a preferência para a próxima vez (e o selo do palco
      // passaria a mentir o fps). O seletor já tem resolução e taxa no rodapé
      // e, ao escolher, republica com elas — então o item abre o seletor.
      label: "Qualidade da transmissão",
      onSelect: pedirTrocaDeTela,
    },
  ];
  // o som só existe se a transmissão **subiu** com ele (`telaComSom` é o fato,
  // `screenAudio` era a intenção); sem som não há o que ligar ou desligar
  if (voz.screenOn && voz.telaComSom) {
    maisOpcoes.push({
      label: "Áudio da transmissão",
      control: "checkbox",
      checked: !voz.audioDaTelaMudo,
      onSelect: () => void useVoice.getState().alternarAudioDaTela(),
    });
  }
  // "Ocultar pré-visualização": o mesmo par "Ver prévia"/"Ocultar prévia" do
  // tile (`TileDeVoz.tsx`), só que como checkbox — refeito aqui porque este
  // arquivo abre por `onContextMenu`, fora de render, sem os `tiles` que
  // `VoiceGrid` já calculou. A chave (`chaveDoTileDeTela`) vem de achar a
  // publicação de tela da minha própria captura nativa entre os participantes
  // da sala; sem ela (navegador, ou a faixa ainda não subiu) o item não
  // aparece — um checkbox sem estado por trás seria um checkbox que mente.
  const chaveDaMinhaTela = eu ? chaveDaMinhaTelaAtiva(eu.id) : null;
  if (chaveDaMinhaTela) {
    const previaChave = usePreviaDaMinhaTela.getState().chave;
    // "mostrando" é a mesma conta de `mostrando` em `VoiceGrid.tsx`: a prévia
    // pedida ("Ver prévia") ou a tela posta em destaque no palco (clicar no
    // tile também tira o aviso, sem passar pelo botão).
    const mostrando = previaChave === chaveDaMinhaTela || voz.focado === chaveDaMinhaTela;
    const oculta = !mostrando;
    maisOpcoes.push({
      label: "Ocultar pré-visualização",
      control: "checkbox",
      checked: oculta,
      onSelect: () => alternarPreviaDaMinhaTela(chaveDaMinhaTela, oculta),
    });
  }
  itens.push({ label: "Mais opções", icon: <MoreHorizontal size={18} />, submenu: maisOpcoes });

  ui.openContextMenu(x, y, itens, MENU_WIDTH_WIDE);
}

/**
 * A chave (`dono:trackSid`) da minha transmissão de tela **nativa** agora —
 * a mesma conta que `VoiceGrid.tsx` faz para o tile (`minhaTelaNativa` +
 * `chaveDoTileDeTela`), refeita aqui porque este menu não tem os `tiles` dela
 * à mão. `null` sem captura nativa em publicação (navegador — onde a tela é
 * a faixa **local** da própria pessoa, sempre visível, sem aviso para
 * ocultar —, ou a captura nativa ainda não subiu).
 *
 * Só o participante `<meuId>#tela` conta: `participantesDe` também devolve a
 * pessoa (identidade === `meuId`), cuja tela — quando existe — é a local do
 * navegador, e essa nunca tem "Ver prévia"/"Ocultar prévia" no tile (ver o
 * comentário de `minhaTelaOculta` em `TileDeVoz.tsx`). Contá-la aqui também
 * faria o checkbox nascer marcado sem nunca ter escondido nada.
 */
function chaveDaMinhaTelaAtiva(meuId: string): string | null {
  for (const p of participantesDe(meuId)) {
    if (p.identity === meuId) continue;
    for (const pub of telasDe(p)) {
      return chaveDoTileDeTela(meuId, pub.trackSid);
    }
  }
  return null;
}

/**
 * O mesmo toggle do botão "Ver prévia"/"Ocultar prévia" do tile
 * (`onPreviaDaMinhaTela` em `VoiceGrid.tsx`): guarda a escolha em
 * `usePreviaDaMinhaTela`, tira a tela do destaque se for ela quem está lá
 * (senão o palco ficaria com o aviso "Você está compartilhando sua tela" em
 * tamanho de cinema) e reaplica as assinaturas — sem isso o LiveKit
 * continuaria (des)assinando pela decisão antiga até o próximo evento do SDK.
 */
function alternarPreviaDaMinhaTela(chave: string, ver: boolean): void {
  usePreviaDaMinhaTela.setState({ chave: ver ? chave : null });
  if (!ver && useVoice.getState().focado === chave) useVoice.getState().setFocado(null);
  aplicarAssinaturasDeTela();
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

  // no Tauri o webview não abre janela nova: o item some em vez de não fazer
  // nada ao clicar
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
      onSelect: () => usePreferenciasDoPalco.getState().alternarPreviaDaCamera(),
    });
  }

  itens.push({
    label: "Mostrar participantes sem vídeo",
    control: "checkbox",
    checked: palco.mostrarSemVideo,
    onSelect: () => usePreferenciasDoPalco.getState().alternarMostrarSemVideo(),
  });
  return itens;
}

/**
 * "Silenciar no servidor" / "Desativar áudio no servidor" sobre `alvoId`, cada
 * um só com o próprio bit. Vazio em DM/grupo (sem `guildId`).
 *
 * O marcado vem do `VoiceState` do alvo na sala (`serverMute`/`serverDeaf`),
 * não de estado local: quem redesenha depois do clique é o `voice.state` que
 * o gateway devolve (ver `alternarSilencioDoServidor`).
 */
function itensDeModeracaoDeVoz(guildId: string | null, channelId: string, alvoId: string): MenuItem[] {
  if (!guildId) return [];
  // cópia já estreitada para `string`: as closures do `onSelect` não herdam o
  // estreitamento do parâmetro em toda versão do TypeScript
  const servidor = guildId;
  const pode = moderacaoDeVozSobre(alvoId, servidor);
  if (!pode.silenciar && !pode.ensurdecer) return [];
  const { serverMute, serverDeaf } = silencioDoServidorDe(useVoice.getState().states, channelId, alvoId);
  const itens: MenuItem[] = [];
  if (pode.silenciar) {
    itens.push({
      label: "Silenciar no servidor",
      control: "checkbox",
      danger: true,
      checked: serverMute,
      onSelect: () => void alternarSilencioDoServidor(servidor, alvoId, serverMute),
    });
  }
  if (pode.ensurdecer) {
    itens.push({
      label: "Desativar áudio no servidor",
      control: "checkbox",
      danger: true,
      checked: serverDeaf,
      onSelect: () => void alternarSurdezDoServidor(servidor, alvoId, serverDeaf),
    });
  }
  return itens;
}

/**
 * A conta de `usePodeModerarVoz` sem hooks — este arquivo abre por
 * `onContextMenu`, fora de render. Reaproveita as funções puras de
 * `lib/moderacao-de-voz` (bit + hierarquia, "contra mim só o bit"); o que se
 * repete aqui é só a leitura das stores, com a mesma saída conservadora:
 * servidor da sala diferente do carregado → nada, porque sem os cargos na mão
 * não há como saber e esconder é o lado seguro (a API recusaria de todo modo).
 */
function moderacaoDeVozSobre(alvoId: string, guildId: string): { silenciar: boolean; ensurdecer: boolean } {
  const NADA = { silenciar: false, ensurdecer: false };
  const meId = useAuth.getState().user?.id;
  const guildsState = useGuilds.getState();
  const permsState = usePermissions.getState();
  if (!meId) return NADA;
  if (guildsState.activeGuildId !== guildId || permsState.guildId !== guildId) return NADA;
  const guild = guildsState.guilds.find((g) => g.id === guildId);
  if (!guild) return NADA;
  const membro = (userId: string): MembroDeVoz => ({
    userId,
    isOwner: guild.ownerId === userId,
    roleIds: guildsState.members.find((m) => m.user.id === userId)?.roleIds ?? [],
  });
  const eu = membro(meId);
  const alvo = membro(alvoId);
  return {
    silenciar: podeSilenciarNoServidor(eu, alvo, permsState.roles),
    ensurdecer: podeEnsurdecerNoServidor(eu, alvo, permsState.roles),
  };
}

/**
 * "Abrir na visualização de moderador" exige MODERATE_MEMBERS — a mesma regra
 * de `MemberList.tsx`, calculada sem hooks como em `submenuCargos`. `false`
 * quando o servidor da sala não é o carregado: sem cargos na mão não há como
 * saber, e esconder é o lado seguro (a API recusaria de qualquer forma).
 */
function podeModerarMembros(guildId: string): boolean {
  const guildsState = useGuilds.getState();
  const permsState = usePermissions.getState();
  if (guildsState.activeGuildId !== guildId || permsState.guildId !== guildId) return false;
  const meId = useAuth.getState().user?.id;
  const guild = guildsState.guilds.find((g) => g.id === guildId);
  const meuMembro = guildsState.members.find((m) => m.user.id === meId);
  const meuPM: PermissionMember = { isOwner: !!guild && guild.ownerId === meId, roleIds: meuMembro?.roleIds ?? [] };
  return hasPermission(computePermissions(meuPM, permsState.roles, []), Permission.MODERATE_MEMBERS);
}

/**
 * "Cargos" — bolinha colorida + nome, com checkbox de atribuição só para quem
 * pode gerenciar cargos (mesma regra de `MemberList.tsx`, §J). `null` quando
 * o servidor da sala não é o carregado (`usePermissions`/`useGuilds` só
 * conhecem o servidor **ativo**) ou quando ninguém pode atribuir nada.
 */
function submenuCargos(guildId: string | null, targetUserId: string): MenuItem | null {
  if (!guildId) return null;
  const guildsState = useGuilds.getState();
  const permsState = usePermissions.getState();
  if (guildsState.activeGuildId !== guildId || permsState.guildId !== guildId) return null;

  const meId = useAuth.getState().user?.id;
  const guild = guildsState.guilds.find((g) => g.id === guildId);
  const meuMembro = guildsState.members.find((m) => m.user.id === meId);
  const alvoMembro = guildsState.members.find((m) => m.user.id === targetUserId);
  const meuPM: PermissionMember = { isOwner: !!guild && guild.ownerId === meId, roleIds: meuMembro?.roleIds ?? [] };
  const meuTeto = highestPosition(meuPM, permsState.roles);
  const podeCargos = hasPermission(
    computePermissions(meuPM, permsState.roles, []),
    Permission.MANAGE_ROLES,
  );
  const atribuiveis = permsState.roles
    .filter((r) => !r.isDefault && r.position < meuTeto)
    .sort((a, b) => b.position - a.position);
  if (!podeCargos || atribuiveis.length === 0) return null;

  return {
    label: "Cargos",
    submenu: atribuiveis.map((r) => ({
      label: r.name,
      control: "checkbox" as const,
      checked: alvoMembro?.roleIds.includes(r.id) ?? false,
      dot: r.color ?? undefined,
      onSelect: () =>
        void guildsState.toggleRole(targetUserId, r.id, !(alvoMembro?.roleIds.includes(r.id) ?? false)),
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
