import { create } from "zustand";
import {
  type CallEndedEvent,
  type CallRingEvent,
  type Channel,
  MEDIA_QUALITY,
  PTT_RELEASE_MS,
  type PublicUser,
  SCREEN_QUALITY,
  SCREEN_QUALITY_PADRAO,
  type ScreenQuality,
  type VoiceEvictedEvent,
  type VoiceFlags,
  type VoiceStateEvent,
  WS_EVENTS,
  donoDaIdentidade,
} from "@streamz/shared";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { api } from "@/lib/api";
import { iniciarTelaNativa, isTauri, ouvirTelaEncerrada, pararTelaNativa } from "@/lib/desktop";
import { tocarSom } from "@/lib/ringtone";
import { montarPedido } from "@/lib/seletor-de-tela";
import { supressorDeRuido } from "@/lib/supressor-ruido";
import { CHAMADA_INICIAL, callReducer, type CallAction, type CallState } from "@/stores/call-machine";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { iniciarMedicaoDePing, pararMedicaoDePing } from "@/stores/voice-ping";
import { estadosAposReconexao, type Recarga } from "@/stores/voice-reconexao";
import { chamadaARetomar, esquecerSala, lembrarSala, salaLembrada } from "@/stores/voice-retomada";
import { decidirSaida, type MotivoDeSaida } from "@/stores/voice-saida";
import { ui } from "@/stores/ui";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useVoiceDevicesStore } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Voz: quem está em cada sala, a minha conexão e a chamada em DM.
 *
 * Duas camadas que não se confundem:
 *
 * 1. **Estado de voz** (`states`) — quem está em qual canal, mudo ou não. Vem
 *    do gateway (`voice.state`) e existe com ou sem servidor de mídia. É o que
 *    a barra lateral desenha.
 * 2. **Mídia** (`room`) — a conexão LiveKit. Só existe quando o LiveKit está
 *    configurado; sem ele a camada 1 continua funcionando (dá para entrar num
 *    canal, tocar uma chamada e ver quem entrou — só não sai som), e **em
 *    silêncio**: falta de configuração não é erro do usuário, então não vira
 *    faixa de aviso permanente. `erro` fica reservado para falha real de
 *    conexão, que é o único caso em que oferecer "tentar de novo" faz sentido.
 *
 * O objeto `Room` do SDK é mutável e cheio de referências circulares, então ele
 * fica **fora** do estado observável (`sala`, no módulo) e a store guarda um
 * `tick` que os eventos do SDK incrementam para forçar o re-render.
 */

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

/** Sala do canal em que estou — fora da store, ver o comentário acima. */
let sala: Room | null = null;
/**
 * A transmissão de tela em curso é a **nativa** (captura no Rust, participante
 * `#tela`)? Fora do estado observável como `sala`: é detalhe de transporte, e
 * o que a interface lê é `screenOn`.
 */
let telaNativa = false;

interface VoiceStoreState {
  /** estados de voz por canal (só quem está conectado). */
  states: Record<string, VoiceStateEvent[]>;

  // ── minha conexão ──
  channelId: string | null;
  guildId: string | null;
  channelName: string;
  /**
   * Quando entrei nesta call (epoch ms) — é o que alimenta o cronômetro do
   * canal na barra lateral. Fica na store, e não num `useState` do componente,
   * porque a barra lateral desmonta ao trocar de servidor e a call não: um
   * cronômetro local voltaria a zero sem nada ter acontecido.
   */
  desde: number | null;
  status: VoiceStatus;
  erro: string | null;
  /** o LiveKit respondeu com credenciais? false = sala sem som, sem alarde. */
  midiaDisponivel: boolean;
  tick: number;
  /** identidades (ids de usuário) falando agora. */
  falando: string[];

  // ── mídia local ──
  camOn: boolean;
  screenOn: boolean;
  screenQuality: ScreenQuality;
  screenAudio: boolean;
  /** ajustes de áudio da aba "Voz e vídeo" (persistidos no browser). */
  audio: AudioPrefs;

  // ── preferências por participante (locais, não vão para o servidor) ──
  volumes: Record<string, number>;
  silenciados: Record<string, boolean>;

  // ── foco/tela cheia da grade ──
  focado: string | null;
  /**
   * Ninguém escolheu o palco ainda, então uma transmissão que comece pode
   * assumi-lo sozinha. Escolher (ou desfazer) o foco à mão desliga isso — quem
   * saiu de uma transmissão não quer ser jogado de volta nela.
   */
  focoAutomatico: boolean;
  telaCheia: boolean;
  /**
   * Telas que eu escolhi assistir, por id de **dono** (a captura pode ser um
   * participante `#tela`, mas quem se assiste é a pessoa).
   *
   * Dá para assistir a várias ao mesmo tempo: cada uma vira um tile no palco.
   * O conjunto é o que decide a assinatura da faixa no LiveKit — tela que
   * ninguém está olhando não é baixada (ver `aplicarAssinaturasDeTela`).
   */
  assistindo: Set<string>;
  /**
   * Dono da tela cuja **miniatura ao vivo** está aberta (o pop-up do hover na
   * lista do canal). Assina a faixa em baixa qualidade enquanto durar, e só.
   */
  previa: string | null;

  // ── chamada em conversa direta ──
  call: CallState;

  loadGuild: (guildId: string) => Promise<void>;
  /** Estado da chamada de uma conversa (o par de `loadGuild` para DM e grupo). */
  loadDM: (channelId: string) => Promise<void>;
  /**
   * Depois de recarregar a página no meio de uma chamada, volta a ela sozinho
   * (ver `voice-retomada.ts`). Chamado ao fim de cada carga de estados.
   */
  retomarSeReconectando: () => Promise<void>;
  /**
   * Socket voltou: recarrega o servidor ativo **e** a sala em que estou, e só
   * então troca `states` (ver `voice-reconexao.ts`).
   */
  recarregarAposReconexao: (guildAtivo: string | null) => Promise<void>;
  applyState: (evento: VoiceStateEvent) => void;
  /** perfil trocou (`user.updated`): atualiza o retrato dentro dos estados. */
  aplicarPerfil: (user: PublicUser) => void;
  /** Estados de um canal, ordenados por nome (para a barra lateral). */
  statesOf: (channelId: string) => VoiceStateEvent[];

  connect: (channel: Pick<Channel, "id" | "guildId" | "name" | "type">) => Promise<void>;
  disconnect: () => Promise<void>;
  /** O servidor tirou esta conexão da voz: a conta entrou de outro lugar. */
  expulsoDaVoz: (evento: VoiceEvictedEvent) => void;
  reconnect: () => Promise<void>;
  /** Reentra na sala de voz depois de o socket voltar (ver `useRealtime`). */
  rejoinAposReconexao: () => Promise<void>;

  toggleCam: () => Promise<void>;
  /** Publica uma captura já obtida pelo botão do navegador (ver ScreenShareButton). */
  publicarTela: (stream: MediaStream) => Promise<void>;
  /**
   * Transmite uma janela ou tela pela captura nativa do desktop: o Rust entra
   * na sala como `<userId>#tela` e publica; aqui só o estado e o token.
   */
  publicarTelaNativa: (fonteId: string) => Promise<void>;
  pararTela: () => Promise<void>;
  setScreenQuality: (q: ScreenQuality) => void;
  setScreenAudio: (on: boolean) => void;
  setAudioPref: (patch: Partial<AudioPrefs>) => void;

  setVolume: (userId: string, volume: number) => void;
  toggleSilenciado: (userId: string) => void;
  /**
   * Põe um tile no palco, ou tira o que está lá (clicar no focado volta à
   * grade). A chave é a do tile, não o id da pessoa: quem assiste a duas telas
   * tem dois tiles do mesmo dono.
   */
  setFocado: (chave: string | null) => void;
  /** Foco sem gesto do usuário (transmissão que começa): não desliga o automático. */
  focarAutomaticamente: (chave: string) => void;
  setTelaCheia: (ativo: boolean) => void;
  /** Passa a assistir à tela desta pessoa (assina a faixa). */
  assistir: (userId: string) => void;
  /** Para de assistir (desassina a faixa e some com o tile do palco). */
  pararDeAssistir: (userId: string) => void;
  /** Abre/fecha a miniatura ao vivo do hover — assinatura em baixa qualidade. */
  abrirPrevia: (userId: string | null) => void;

  startCall: (channelId: string, comVideo: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => Promise<void>;
  handleRing: (evento: CallRingEvent) => void;
  handleEnded: (evento: CallEndedEvent) => void;
  dispatchCall: (action: CallAction) => void;

  /** Reenvia mudo/surdo/vídeo/tela ao gateway e aplica no SDK. */
  syncFlags: () => void;
}

/**
 * Ajustes de áudio da aba "Voz e vídeo".
 *
 * Moram aqui (e não em `voicePrefs`) porque só fazem sentido com a mídia: o que
 * `voicePrefs` guarda é o par mudo/surdo, que vale com ou sem servidor de voz.
 *
 * Nem todos têm efeito no MVP e o comentário diz qual é qual, para ninguém
 * "consertar" um slider que já está certo:
 * - `saida` multiplica o volume de cada `<audio>` remoto — vale hoje.
 * - `processamento` vira restrição de captura do microfone — vale hoje.
 * - `entrada`, `sensibilidade` e `pttAtrasoMs` ficam guardados mas ainda não
 *   mudam a captura: ganho de entrada exigiria republicar o microfone por um
 *   grafo Web Audio, o limiar de voz é decidido pelo servidor de mídia, e o
 *   atraso do PTT vive em `voicePrefs`, que lê a constante do contrato.
 */
export interface AudioPrefs {
  /** ganho do microfone, 0–2. */
  entrada: number;
  /** volume geral da saída, 0–2 (multiplica o volume por pessoa). */
  saida: number;
  /** limiar da atividade de voz, 0–1. */
  sensibilidade: number;
  /** folga entre soltar a tecla de PTT e o microfone fechar, em ms. */
  pttAtrasoMs: number;
  processamento: { eco: boolean; ruido: NivelDeRuido; ganho: boolean };
}

/**
 * Quanto de supressão de ruído aplicar no microfone.
 *
 * - `off`: nada, o microfone cru.
 * - `padrao`: a do navegador (`noiseSuppression` do getUserMedia). Subtração
 *   espectral: come chiado e ventilador, não come teclado nem cachorro.
 * - `avancada`: RNNoise em WebAssembly antes de publicar (ver
 *   `lib/supressor-ruido.ts`). Bem melhor, ao custo de CPU no cliente — por
 *   isso é escolha, e não o padrão.
 */
export type NivelDeRuido = "off" | "padrao" | "avancada";

const AUDIO_PADRAO: AudioPrefs = {
  entrada: 1,
  saida: 1,
  sensibilidade: 0.35,
  pttAtrasoMs: PTT_RELEASE_MS,
  processamento: { eco: true, ruido: "padrao", ganho: true },
};

const AUDIO_KEY = "voiceAudioPrefs";

function carregarAudio(): AudioPrefs {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(AUDIO_KEY) : null;
    if (!raw) return AUDIO_PADRAO;
    const lido = JSON.parse(raw) as Partial<AudioPrefs>;
    const processamento = { ...AUDIO_PADRAO.processamento, ...(lido.processamento ?? {}) };
    // `ruido` era booleano antes de existir o nível "avançada": quem já tinha
    // preferência salva não pode cair no padrão por causa da mudança de tipo
    const bruto = (lido.processamento as { ruido?: unknown } | undefined)?.ruido;
    if (typeof bruto === "boolean") processamento.ruido = bruto ? "padrao" : "off";
    return { ...AUDIO_PADRAO, ...lido, processamento };
  } catch {
    return AUDIO_PADRAO;
  }
}

/** Falha real de conexão: é o único texto que vira faixa vermelha com "tentar de novo". */
const FALHA_MIDIA = "Não foi possível conectar ao servidor de voz.";
const QUEDA_MIDIA = "A conexão de voz caiu.";
const SEM_SALA = "Você não está conectado a um canal de voz.";

/**
 * Expulso porque a conta entrou em voz de outro lugar.
 *
 * Antes isto chegava como `QUEDA_MIDIA` — o LiveKit derruba a identidade
 * repetida, o `RoomEvent.Disconnected` dispara e o handler supõe queda de rede.
 * Dizer "a conexão caiu" para quem acabou de entrar pelo celular manda a pessoa
 * investigar a internet quando o app está funcionando exatamente como devia.
 */
const OUTRO_LUGAR = "Você entrou na chamada em outro dispositivo.";

/** Resultado de tentar abrir a mídia: falta de configuração ≠ falha. */
type ResultadoMidia = { tipo: "ok" } | { tipo: "sem-config" } | { tipo: "falha"; erro: string };

export const useVoice = create<VoiceStoreState>((set, get) => {
  /**
   * Re-render quando o SDK muda participantes/faixas.
   *
   * É aqui que as assinaturas de tela são reaplicadas: uma faixa que acabou de
   * ser publicada chega **depois** da escolha de assistir (o `assistindo` pode
   * ter sido montado antes de a pessoa ligar a tela), e sem isto ela entraria
   * assinada por padrão — que é justamente o gasto que se quer evitar.
   */
  const rerender = () => {
    aplicarAssinaturasDeTela();
    set((s) => ({ tick: s.tick + 1 }));
  };

  /** Flags atuais do usuário, do jeito que o gateway espera. */
  function flags(): VoiceFlags {
    const prefs = useVoicePrefs.getState();
    return {
      muted: !prefs.micAberto(),
      deafened: prefs.deafened,
      video: get().camOn,
      screen: get().screenOn,
    };
  }

  /** Desmonta a sala de mídia sem tocar no estado de voz (que é do servidor). */
  function fecharSala() {
    // a transmissão nativa é uma segunda conexão: sair da sala tem que
    // derrubá-la também, senão o `#tela` fica na sala sem dono
    if (telaNativa) {
      telaNativa = false;
      void pararTelaNativa();
    }
    if (!sala) return;
    pararMedicaoDePing();
    sala.removeAllListeners();
    void sala.disconnect().catch(() => {});
    sala = null;
  }

  /**
   * Deixa a sala atual: fecha a mídia, avisa o gateway (quando a saída é
   * minha) e zera a minha conexão. O que **não** faz por conta própria é fechar
   * a coluna do canal de voz — isso depende do motivo, e a tabela está em
   * `voice-saida.ts`. Todo caminho que sai de uma sala passa por aqui;
   * `disconnect` é o caso "o usuário quis sair".
   */
  function sairDaSalaAtual(motivo: MotivoDeSaida, destinoEmServidor = false) {
    const { channelId, call } = get();
    const decisao = decidirSaida(motivo, destinoEmServidor);
    // expulso não tem som: o que a pessoa ouve é o toast explicando
    if (channelId && decisao.avisaGateway) tocarSom("sair");
    // `fecharSala` tira os ouvintes antes de desconectar, então o
    // `RoomEvent.Disconnected` do LiveKit não vem depois marcar queda de mídia
    fecharSala();
    // saí de vez: um F5 depois disto não deve me trazer de volta
    esquecerSala();
    if (channelId && decisao.avisaGateway) {
      emit(WS_EVENTS.VOICE_LEAVE, {});
      if (call.phase !== "idle") emit(WS_EVENTS.CALL_END, { channelId });
    }
    // o painel do canal de voz é a coluna 3 inteira: sair da call sem fechá-lo
    // deixaria o usuário preso numa sala vazia
    if (decisao.fechaColuna) useChannels.getState().leaveVoice();
    set({
      channelId: null,
      guildId: null,
      channelName: "",
      desde: null,
      status: "idle",
      erro: null,
      midiaDisponivel: false,
      falando: [],
      camOn: false,
      screenOn: false,
      focado: null,
      focoAutomatico: true,
      telaCheia: false,
      assistindo: new Set(),
      previa: null,
      call: CHAMADA_INICIAL,
    });
  }

  return {
    states: {},
    channelId: null,
    guildId: null,
    channelName: "",
    desde: null,
    status: "idle",
    erro: null,
    midiaDisponivel: false,
    tick: 0,
    falando: [],
    camOn: false,
    screenOn: false,
    screenQuality: SCREEN_QUALITY_PADRAO,
    screenAudio: true,
    audio: carregarAudio(),
    volumes: {},
    silenciados: {},
    focado: null,
    focoAutomatico: true,
    telaCheia: false,
    assistindo: new Set<string>(),
    previa: null,
    call: CHAMADA_INICIAL,

    loadGuild: async (guildId) => {
      try {
        const estados = await api.guildVoiceStates(guildId);
        const porCanal: Record<string, VoiceStateEvent[]> = {};
        for (const e of estados) (porCanal[e.channelId] ??= []).push(e);
        // a resposta é a verdade **deste** servidor: some com os canais dele que
        // esvaziaram, e preserva o cache dos outros — trocar de servidor não pode
        // apagar quem está nas salas do anterior (a barra lateral e o palco leem
        // daqui mesmo com o servidor em segundo plano)
        set((s) => {
          const outros = Object.fromEntries(
            Object.entries(s.states).filter(([, lista]) => lista[0]?.guildId !== guildId),
          );
          return { states: { ...outros, ...porCanal } };
        });
        await get().retomarSeReconectando();
      } catch {
        // servidor sem voz ou sem acesso: a barra lateral fica sem bolinhas
      }
    },

    loadDM: async (channelId) => {
      try {
        const estados = await api.dmVoiceStates(channelId);
        // a resposta é a verdade **desta** conversa; as outras salas ficam como estão
        set((s) => ({ states: { ...s.states, [channelId]: estados } }));
        await get().retomarSeReconectando();
      } catch {
        // conversa que sumiu ou sem acesso: a faixa de chamada simplesmente não aparece
      }
    },

    recarregarAposReconexao: async (guildAtivo) => {
      const { channelId, guildId } = get();
      const pedidos: Promise<Recarga>[] = [];
      const doServidor = (id: string) =>
        api
          .guildVoiceStates(id)
          .then((estados): Recarga => ({ escopo: "servidor", guildId: id, estados }))
          .catch((): Recarga => ({ escopo: "servidor", guildId: id, estados: null }));
      if (guildAtivo) pedidos.push(doServidor(guildAtivo));
      // a minha sala: uma conversa tem rota própria; um canal de voz de outro
      // servidor vem com o servidor dele (o ativo já cobre o próprio)
      if (channelId && !guildId) {
        pedidos.push(
          api
            .dmVoiceStates(channelId)
            .then((estados): Recarga => ({ escopo: "sala", channelId, estados }))
            .catch((): Recarga => ({ escopo: "sala", channelId, estados: null })),
        );
      } else if (guildId && guildId !== guildAtivo) {
        pedidos.push(doServidor(guildId));
      }
      const recargas = await Promise.all(pedidos);
      set((s) => ({ states: estadosAposReconexao(s.states, recargas) }));
    },

    retomarSeReconectando: async () => {
      const alvo = chamadaARetomar({
        states: get().states,
        meuId: useAuth.getState().user?.id,
        conectadoEm: get().channelId,
        lembrada: salaLembrada(),
      });
      if (!alvo) return;
      // duas cargas podem terminar quase juntas (servidor ativo + sala
      // lembrada): a primeira a chegar aqui esquece a sala e a segunda não
      // acha nada. `connect` volta a lembrar
      esquecerSala();
      if (alvo.guildId) {
        await get().connect({ id: alvo.channelId, guildId: alvo.guildId, name: alvo.name, type: "VOICE" });
        // com os canais do servidor já na tela, abre o palco; senão a barra do
        // rodapé mostra a conexão e o clique no canal encontra a sala já ocupada
        const canal = useChannels.getState().channels.find((c) => c.id === alvo.channelId);
        if (canal) useChannels.getState().select(canal);
        return;
      }
      // a chamada de conversa é a tela em que a pessoa estava: volta para ela
      await abrirConversa(alvo.channelId);
      await get().connect({ id: alvo.channelId, guildId: null, name: "", type: "DM" });
    },

    applyState: (evento) => {
      const meuCanal = get().channelId;
      const eu = evento.user.id === useAuth.getState().user?.id;
      const jaEstava = (get().states[evento.channelId] ?? []).some(
        (e) => e.user.id === evento.user.id,
      );
      // entrar e sair da **minha** sala tem som, como no Discord; movimento em
      // outro canal é ruído para quem não está lá
      if (!eu && evento.channelId === meuCanal && evento.connected !== jaEstava) {
        tocarSom(evento.connected ? "alguem-entrou" : "alguem-saiu");
      }
      set((s) => {
        const atual = s.states[evento.channelId] ?? [];
        const semEle = atual.filter((e) => e.user.id !== evento.user.id);
        const lista = evento.connected ? [...semEle, evento] : semEle;
        return { states: { ...s.states, [evento.channelId]: lista } };
      });
      // alguém entrou na minha chamada de DM: ela deixou de estar "tocando"
      const { call, channelId } = get();
      if (evento.connected && evento.channelId === channelId && call.phase !== "idle") {
        get().dispatchCall({ type: "connected", channelId: evento.channelId });
      }
    },

    /**
     * O `user` dentro de `VoiceStateEvent` é o retrato de quem a pessoa era
     * quando entrou na chamada — o servidor só reemite esse evento quando
     * alguém entra, sai ou muda mudo/vídeo. Trocar a foto ou o nome no meio da
     * chamada não mexia em nada aqui, e por isso a mudança só aparecia depois
     * de sair e voltar.
     *
     * Reescrever a lista é barato porque ela é pequena por definição (quem está
     * numa chamada), ao contrário de `members`/`messages` — que continuam
     * resolvendo pelo overlay de `usePresence` na hora de desenhar.
     */
    aplicarPerfil: (user) =>
      set((s) => {
        let mudou = false;
        const states: Record<string, VoiceStateEvent[]> = {};
        for (const [canal, lista] of Object.entries(s.states)) {
          if (!lista.some((e) => e.user.id === user.id)) {
            states[canal] = lista;
            continue;
          }
          mudou = true;
          states[canal] = lista.map((e) => (e.user.id === user.id ? { ...e, user } : e));
        }
        // sem `mudou`, um `user.updated` de quem não está em chamada nenhuma
        // trocaria a referência de `states` e re-renderizaria toda a grade
        return mudou ? { states } : s;
      }),

    statesOf: (channelId) =>
      (get().states[channelId] ?? [])
        .slice()
        .sort((a, b) => a.user.username.localeCompare(b.user.username)),

    connect: async (channel) => {
      const anterior = get().channelId;
      // trocar de sala não é sair: a coluna do canal de destino fica de pé
      if (anterior && anterior !== channel.id) sairDaSalaAtual("troca-de-sala", !!channel.guildId);

      set({
        channelId: channel.id,
        guildId: channel.guildId,
        channelName: channel.name ?? "voz",
        // reconectar depois de uma queda de mídia passa por aqui com o mesmo
        // canal: zerar o relógio ali diria que a call recomeçou, e ela não
        desde: anterior === channel.id ? get().desde ?? Date.now() : Date.now(),
        status: "connecting",
        erro: null,
        midiaDisponivel: false,
        falando: [],
        camOn: false,
        screenOn: false,
        focado: null,
        focoAutomatico: true,
        assistindo: new Set<string>(),
        previa: null,
      });
      lembrarSala({ channelId: channel.id, guildId: channel.guildId, name: channel.name ?? "" });
      tocarSom("entrar");

      // 1) o estado de voz não depende do LiveKit: avisa o gateway primeiro,
      //    para que os outros já vejam você no canal mesmo sem mídia
      emit(WS_EVENTS.VOICE_JOIN, { channelId: channel.id });
      emit(WS_EVENTS.VOICE_UPDATE, flags());

      // 2) mídia, se houver
      const r = await conectarMidia(channel, set, rerender, get);
      if (r.tipo === "falha") {
        set({ status: "error", midiaDisponivel: false, erro: r.erro });
        return;
      }
      set({
        status: "connected",
        midiaDisponivel: r.tipo === "ok",
        erro: null,
      });
      if (r.tipo === "ok") get().syncFlags();
    },

    /** Sair porque o usuário quis (botão, atalho, "desligar", fim da chamada). */
    disconnect: async () => {
      sairDaSalaAtual("usuario");
    },

    expulsoDaVoz: ({ channelId, novoCanalId }) => {
      // já tinha saído daqui por conta própria: nada a desfazer
      if (get().channelId !== channelId) return;
      // sem `voice.leave`: o servidor já me tirou, e o aviso derrubaria a
      // conexão nova da conta. A coluna fecha — o painel mostraria uma sala em
      // que não estou mais
      sairDaSalaAtual("expulso");
      ui.toast(
        channelId === novoCanalId
          ? OUTRO_LUGAR
          : "Você entrou em outro canal de voz em outro dispositivo.",
      );
    },

    reconnect: async () => {
      const { channelId, guildId, channelName } = get();
      if (!channelId) return;
      // não passa por `sairDaSalaAtual`: refazer a mídia da **mesma** sala não
      // é sair dela — o gateway continua me vendo lá, o relógio não zera e a
      // coluna do canal fica como está
      fecharSala();
      await get().connect({
        id: channelId,
        guildId,
        name: channelName,
        type: guildId ? "VOICE" : "DM",
      });
    },

    /**
     * Socket voltou: reentra na sala de voz.
     *
     * O gateway perdeu o `voiceChannelId` junto com o socket antigo e está
     * contando a carência para tirar o usuário da chamada. Reemitir o join é o
     * que a cancela — sem isto a pessoa voltava "online", continuava vendo a
     * própria call na tela e sumia dela sozinha segundos depois, sem aviso
     * nenhum. Antes daqui, só as salas de **texto** reentravam.
     */
    rejoinAposReconexao: async () => {
      const { channelId, status } = get();
      // fora de chamada, ou já entrando numa: não há o que reentrar
      if (!channelId || status === "idle" || status === "connecting") return;

      emit(WS_EVENTS.VOICE_JOIN, { channelId });
      emit(WS_EVENTS.VOICE_UPDATE, flags());

      // A mídia tem reconexão própria: o LiveKit se restabelece quando só a
      // rede oscilou, e refazer a sala por cima publicaria a mesma câmera duas
      // vezes. Só refaz quando ela caiu de vez junto com o socket.
      const room = salaAtual();
      if (room && room.state !== ConnectionState.Disconnected) return;
      await get().reconnect();
    },

    toggleCam: async () => {
      const lp = sala?.localParticipant;
      if (!lp) {
        ui.toast(SEM_SALA, "error");
        return;
      }
      const proximo = !lp.isCameraEnabled;
      try {
        const cameraId = useVoiceDevicesStore.getState().cameraId;
        // A resolução vai explícita porque passar `captureOptions` substitui o
        // `videoCaptureDefaults` da sala em vez de completá-lo: sem isto, ligar
        // a câmera com um dispositivo escolhido cairia no padrão do navegador.
        await lp.setCameraEnabled(proximo, {
          ...(cameraId ? { deviceId: cameraId } : {}),
          resolution: {
            width: MEDIA_QUALITY.camera.width,
            height: MEDIA_QUALITY.camera.height,
            frameRate: MEDIA_QUALITY.camera.frameRate,
          },
        });
        set({ camOn: proximo });
      } catch (e) {
        set({ camOn: false });
        ui.toast(errorMessage(e, "Não foi possível ligar a câmera"), "error");
      }
      get().syncFlags();
      rerender();
    },

    /**
     * A captura vem pronta de fora porque `getDisplayMedia` só funciona no
     * gesto do usuário: quem a chama é o botão (`ScreenShareButton`, no
     * navegador), com as restrições de `restricoesDeCaptura`, e aqui só
     * publicamos o que ele já obteve. No desktop a tela não passa por aqui —
     * vai pelo Rust, em `publicarTelaNativa`.
     */
    publicarTela: async (stream) => {
      const lp = sala?.localParticipant;
      if (!lp) {
        stream.getTracks().forEach((t) => t.stop());
        ui.toast(SEM_SALA, "error");
        return;
      }
      const [video] = stream.getVideoTracks();
      if (!video) return;
      const preset = SCREEN_QUALITY[get().screenQuality];
      // `contentHint` avisa o encoder de que o conteúdo é texto/detalhe: ele
      // passa a preservar nitidez em vez de suavizar o quadro (o que faria com
      // uma câmera). É o ganho de legibilidade mais barato que existe aqui.
      video.contentHint = "detail";
      try {
        await lp.publishTrack(new LocalVideoTrack(video), {
          source: Track.Source.ScreenShare,
          // sem isto a faixa sobe com o bitrate padrão do SDK, calibrado para
          // 1080p — em 1440p o resultado seria mais pixels, todos borrados
          videoEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate },
          // simulcast de tela em alta gasta CPU de quem transmite para produzir
          // camadas reduzidas que ninguém quer: quem abre uma tela quer lê-la
          simulcast: false,
          // com banda apertada, derrubar quadros preserva o texto legível;
          // derrubar resolução o transformaria em borrão
          degradationPreference: "maintain-resolution",
        });
        const [audio] = stream.getAudioTracks();
        if (audio && get().screenAudio) {
          await lp.publishTrack(new LocalAudioTrack(audio), {
            source: Track.Source.ScreenShareAudio,
            // áudio de tela é música/jogo/vídeo, não voz: estéreo, bitrate alto
            // e sem DTX, que existe para cortar silêncio de conversa
            audioPreset: { maxBitrate: MEDIA_QUALITY.screenAudioBitrate },
            forceStereo: true,
            dtx: false,
            red: false,
          });
        }
        // parar pelo botão do próprio navegador precisa refletir aqui, senão a
        // UI continuaria anunciando uma transmissão que já morreu
        video.addEventListener("ended", () => void get().pararTela(), { once: true });
        set({ screenOn: true });
        tocarSom("transmissao-iniciada");
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        set({ screenOn: false });
        ui.toast(errorMessage(e, "Não foi possível compartilhar a tela"), "error");
      }
      get().syncFlags();
      rerender();
    },

    publicarTelaNativa: async (fonteId) => {
      const { channelId, screenQuality, screenAudio } = get();
      if (!channelId || !sala) {
        ui.toast(SEM_SALA, "error");
        return;
      }
      try {
        const creds = await api.telaToken(channelId);
        await iniciarTelaNativa(montarPedido(fonteId, screenQuality, creds, screenAudio));
        telaNativa = true;
        set({ screenOn: true });
        tocarSom("transmissao-iniciada");
      } catch (e) {
        telaNativa = false;
        set({ screenOn: false });
        ui.toast(errorMessage(e, "Não foi possível compartilhar a tela"), "error");
      }
      get().syncFlags();
      rerender();
    },

    pararTela: async () => {
      const lp = sala?.localParticipant;
      // só avisa quem estava mesmo no ar: `pararTela` também chega pelo botão
      // do navegador e por um segundo clique, e som de fim sem começo confunde
      const estava = get().screenOn;
      set({ screenOn: false });
      if (estava) tocarSom("transmissao-encerrada");
      if (telaNativa) {
        telaNativa = false;
        await pararTelaNativa();
      }
      if (lp) {
        for (const pub of Array.from(lp.trackPublications.values())) {
          if (
            pub.source === Track.Source.ScreenShare ||
            pub.source === Track.Source.ScreenShareAudio
          ) {
            if (pub.track) await lp.unpublishTrack(pub.track, true).catch(() => {});
          }
        }
      }
      get().syncFlags();
      rerender();
    },

    setScreenQuality: (screenQuality) => set({ screenQuality }),
    setScreenAudio: (screenAudio) => set({ screenAudio }),

    setAudioPref: (patch) => {
      const anterior = get().audio;
      const audio: AudioPrefs = {
        ...anterior,
        ...patch,
        processamento: { ...anterior.processamento, ...(patch.processamento ?? {}) },
      };
      set({ audio });
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify(audio));
      } catch {
        // sem storage a preferência vale só nesta sessão
      }
      // mudar o processamento é mudar a **captura**: só republicando o
      // microfone as novas restrições entram em vigor
      const mudouProcessamento =
        !!patch.processamento &&
        (Object.keys(patch.processamento) as (keyof AudioPrefs["processamento"])[]).some(
          (k) => patch.processamento?.[k] !== anterior.processamento[k],
        );
      if (mudouProcessamento) void republicarMicrofone(audio);
    },

    setVolume: (userId, volume) =>
      set((s) => ({ volumes: { ...s.volumes, [userId]: Math.max(0, Math.min(2, volume)) } })),

    toggleSilenciado: (userId) =>
      set((s) => ({ silenciados: { ...s.silenciados, [userId]: !s.silenciados[userId] } })),

    setFocado: (focado) =>
      set((s) => ({ focado: s.focado === focado ? null : focado, focoAutomatico: false })),
    focarAutomaticamente: (focado) => set({ focado }),
    setTelaCheia: (telaCheia) => set({ telaCheia }),

    // Um `Set` novo a cada mudança, e não `add`/`delete` no mesmo: zustand
    // compara por referência, e mutar o conjunto no lugar não re-renderizaria
    // tile nenhum.
    assistir: (userId) => {
      set((s) => (s.assistindo.has(userId) ? s : { assistindo: new Set(s.assistindo).add(userId) }));
      aplicarAssinaturasDeTela();
    },
    pararDeAssistir: (userId) => {
      set((s) => {
        if (!s.assistindo.has(userId)) return s;
        const assistindo = new Set(s.assistindo);
        assistindo.delete(userId);
        // o tile sai do palco junto: deixar o foco apontando para uma tela que
        // não se assiste mais daria um palco com o convite "Assistir" em tela
        // cheia, que é o oposto do que o clique pediu
        const focado = s.focado?.startsWith(`${userId}:`) || s.focado === userId ? null : s.focado;
        return { assistindo, focado };
      });
      aplicarAssinaturasDeTela();
    },
    abrirPrevia: (previa) => {
      set({ previa });
      aplicarAssinaturasDeTela();
    },

    // ── chamada em conversa direta ──

    startCall: async (channelId, comVideo) => {
      // uma conexão de voz por vez: o servidor já garante isso, o cliente
      // precisa fechar a sala antiga para não ficar com duas conexões de mídia.
      // A chamada mora na conversa, então a coluna do canal de voz fecha
      if (get().channelId && get().channelId !== channelId) sairDaSalaAtual("troca-de-sala");
      get().dispatchCall({ type: "start", channelId });
      set({
        channelId,
        guildId: null,
        channelName: "",
        desde: Date.now(),
        status: "connecting",
        erro: null,
        camOn: false,
        screenOn: false,
      });
      lembrarSala({ channelId, guildId: null, name: "" });
      try {
        await abrirConversa(channelId);
        const r = await api.startCall(channelId);
        for (const e of r.states) get().applyState(e);
        if (!r.voice) {
          // sem LiveKit a chamada ainda toca e o estado de voz vale: só não há som
          set({ status: "connected", midiaDisponivel: false, erro: null });
          return;
        }
        await entrarNaSala(r.voice, set, rerender, get);
        set({ status: "connected", midiaDisponivel: true, erro: null });
        get().syncFlags();
        if (comVideo) await get().toggleCam();
      } catch (e) {
        set({ status: "error", erro: errorMessage(e, "Não foi possível iniciar a chamada") });
        get().dispatchCall({ type: "ended", channelId, reason: "ended" });
        ui.toast(errorMessage(e, "Não foi possível iniciar a chamada"), "error");
      }
    },

    acceptCall: async () => {
      const channelId = get().call.channelId;
      if (!channelId) return;
      if (get().channelId && get().channelId !== channelId) sairDaSalaAtual("troca-de-sala");
      get().dispatchCall({ type: "accept" });
      emit(WS_EVENTS.CALL_ACCEPT, { channelId });
      set({ channelId, guildId: null, desde: Date.now(), status: "connecting", erro: null });
      lembrarSala({ channelId, guildId: null, name: "" });
      await abrirConversa(channelId);
      // atender entra pela mesma rota de quem liga: ela é a que sabe de conversa
      // direta (o token de canal de voz recusaria uma DM com 400)
      try {
        const r = await api.startCall(channelId);
        for (const e of r.states) get().applyState(e);
        if (r.voice) await entrarNaSala(r.voice, set, rerender, get);
        set({ status: "connected", midiaDisponivel: !!r.voice, erro: null });
      } catch {
        // sem mídia a chamada ainda vale: o estado de voz já põe os dois na sala
        set({ status: "connected", midiaDisponivel: false, erro: null });
      }
      get().syncFlags();
    },

    declineCall: () => {
      const channelId = get().call.channelId;
      if (!channelId) return;
      emit(WS_EVENTS.CALL_DECLINE, { channelId });
      get().dispatchCall({ type: "decline" });
      // recusar não deixa nada na tela: volta ao repouso na hora
      get().dispatchCall({ type: "reset" });
    },

    endCall: async () => {
      const channelId = get().call.channelId ?? get().channelId;
      if (channelId) emit(WS_EVENTS.CALL_END, { channelId });
      await get().disconnect();
    },

    handleRing: (evento) => {
      // chamada recebida não abre modal: o cartão flutuante do canto vive na
      // `VoiceLayer` e reage à fase `incoming` sozinho, sem travar a interface
      get().dispatchCall({ type: "ring", channelId: evento.channelId, from: evento.from });
    },

    handleEnded: (evento) => {
      get().dispatchCall({
        type: "ended",
        channelId: evento.channelId,
        reason: evento.reason,
      });
      const { call, channelId } = get();
      if (call.phase === "ended") {
        if (evento.reason === "declined" && evento.by) {
          ui.toast(`${evento.by.username} recusou a chamada`);
        } else if (evento.reason === "timeout") {
          ui.toast("Ninguém atendeu");
        } else if (evento.reason === "alone") {
          // o servidor derrubou a chamada porque sobrou uma pessoa só; sem o
          // aviso ela veria a tela fechar do nada
          ui.toast("Chamada encerrada: você ficou sozinho");
        }
        // a chamada acabou para mim: sai como se eu tivesse desligado
        if (channelId === evento.channelId) sairDaSalaAtual("fim-da-chamada");
        else get().dispatchCall({ type: "reset" });
      }
    },

    dispatchCall: (action) => {
      set((s) => ({ call: callReducer(s.call, action, Date.now()) }));
    },

    syncFlags: () => {
      const f = flags();
      emit(WS_EVENTS.VOICE_UPDATE, f);
      const lp = sala?.localParticipant;
      if (!lp) return;
      lp.setMicrophoneEnabled(!f.muted).catch(() => {});
    },
  };
});

/**
 * Leva a tela para a conversa da chamada. Atender sem isso deixaria o usuário
 * olhando outro canal, sem nenhum sinal de onde a chamada está acontecendo.
 */
async function abrirConversa(channelId: string) {
  ui.setView("dm");
  // `abrirPorId` cobre a conversa que ainda não estava na lista (alguém ligou
  // primeiro) e a que estava fechada — esta o `GET /dms` não devolve, e a
  // chamada ficava sem tela nenhuma
  await useDMs.getState().abrirPorId(channelId);
}

/**
 * Pede o token e entra na sala.
 *
 * A distinção que importa é entre **não ter mídia** e **a mídia ter falhado**:
 * a primeira é uma instalação sem LiveKit (dev), e insistir seria inútil; a
 * segunda é uma queda de rede, e aí o usuário precisa de um "tentar de novo".
 *
 * Numa conversa direta o token vem de `POST /dms/:id/call` — a rota de canal
 * de voz recusa DM com 400. Entrar numa chamada que já está rolando por ali é
 * silencioso (não toca de novo), então é o caminho certo tanto para "tentar
 * novamente" quanto para voltar depois de um F5. Sem isto, reconectar numa
 * chamada de conversa dava "conectado", sem som.
 */
async function conectarMidia(
  channel: Pick<Channel, "id" | "guildId">,
  set: (partial: Partial<VoiceStoreState>) => void,
  rerender: () => void,
  get: () => VoiceStoreState,
): Promise<ResultadoMidia> {
  let creds: { token: string; url: string; room: string } | null;
  if (channel.guildId) {
    try {
      creds = await api.voiceToken(channel.id);
    } catch {
      // 503 (sem credenciais) ou canal que não é de voz: sem mídia, e ponto
      return { tipo: "sem-config" };
    }
  } else {
    try {
      const r = await api.startCall(channel.id);
      for (const e of r.states) get().applyState(e);
      creds = r.voice;
    } catch (e) {
      // aqui não é falta de configuração: a conversa recusou (bloqueio, acesso)
      return { tipo: "falha", erro: errorMessage(e, FALHA_MIDIA) };
    }
  }
  if (!creds?.token || !/^wss?:\/\//i.test(creds.url ?? "")) return { tipo: "sem-config" };
  try {
    await entrarNaSala(creds, set, rerender, get);
    return { tipo: "ok" };
  } catch (e) {
    // credenciais existiam e mesmo assim não conectou: isso é falha
    return { tipo: "falha", erro: errorMessage(e, FALHA_MIDIA) };
  }
}

/** Conecta o `Room` e liga os eventos do SDK ao `tick`/`falando` da store. */
async function entrarNaSala(
  creds: { token: string; url: string },
  set: (partial: Partial<VoiceStoreState>) => void,
  rerender: () => void,
  get: () => VoiceStoreState,
) {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: {
        width: MEDIA_QUALITY.camera.width,
        height: MEDIA_QUALITY.camera.height,
        frameRate: MEDIA_QUALITY.camera.frameRate,
      },
    },
    // Câmera e microfone publicam com os tetos do contrato, não com o padrão do
    // SDK (calibrado para sala grande em rede ruim). `dtx: false` mantém o
    // fluxo de áudio contínuo: com DTX o encoder corta o silêncio e a primeira
    // sílaba depois de uma pausa chega mutilada — economia de banda que se paga
    // em inteligibilidade. `red` duplica os pacotes de voz e é o que segura a
    // qualidade quando a rede perde pacote, que é a falha comum de verdade.
    publishDefaults: {
      videoEncoding: {
        maxBitrate: MEDIA_QUALITY.camera.maxBitrate,
        maxFramerate: MEDIA_QUALITY.camera.frameRate,
      },
      audioPreset: { maxBitrate: MEDIA_QUALITY.micBitrate },
      dtx: false,
      red: true,
    },
  });
  sala = room;
  room
    .on(RoomEvent.ParticipantConnected, rerender)
    .on(RoomEvent.ParticipantDisconnected, rerender)
    .on(RoomEvent.TrackSubscribed, rerender)
    .on(RoomEvent.TrackUnsubscribed, rerender)
    .on(RoomEvent.LocalTrackPublished, rerender)
    .on(RoomEvent.LocalTrackUnpublished, rerender)
    .on(RoomEvent.TrackMuted, rerender)
    .on(RoomEvent.TrackUnmuted, rerender)
    .on(RoomEvent.ActiveSpeakersChanged, (falantes: Participant[]) =>
      set({ falando: falantes.map((p) => p.identity) }),
    )
    .on(RoomEvent.Disconnected, () => {
      // sair de propósito passa por `fecharSala`, que remove os ouvintes antes:
      // se este handler rodou, a sala caiu sozinha
      sala = null;
      pararMedicaoDePing();
      set({ midiaDisponivel: false, falando: [], status: "error", erro: QUEDA_MIDIA });
      rerender();
    });

  await room.connect(creds.url, creds.token);
  // o ping da barra "Voz conectada" mora numa store própria (não no `tick`)
  iniciarMedicaoDePing(room);
  const devices = useVoiceDevicesStore.getState();
  if (devices.inputId) await room.switchActiveDevice("audioinput", devices.inputId).catch(() => {});
  if (devices.outputId) await room.switchActiveDevice("audiooutput", devices.outputId).catch(() => {});
  await room.localParticipant
    .setMicrophoneEnabled(
      useVoicePrefs.getState().micAberto(),
      restricoesDeCaptura(useVoice.getState().audio),
    )
    .catch(() => {});
  void get; // o `get` fica na assinatura para futuras leituras de estado
  rerender();
}

/**
 * Restrições de captura do microfone.
 *
 * A supressão nativa e a avançada são **excludentes**: encadeadas, a nativa
 * volta a comprimir o que a rede neural já limpou e a voz sai metálica. Por
 * isso `noiseSuppression` só vai ligada no nível "padrão".
 */
export function restricoesDeCaptura(audio: AudioPrefs) {
  const nivel = audio.processamento.ruido;
  return {
    echoCancellation: audio.processamento.eco,
    noiseSuppression: nivel === "padrao",
    autoGainControl: audio.processamento.ganho,
    // o SDK publica a saída do processador no lugar do microfone cru
    processor: nivel === "avancada" ? supressorDeRuido() : undefined,
  };
}

/** Republica o microfone para as novas restrições entrarem em vigor. */
async function republicarMicrofone(audio: AudioPrefs) {
  const lp = sala?.localParticipant;
  if (!lp) return;
  const aberto = useVoicePrefs.getState().micAberto();
  try {
    await lp.setMicrophoneEnabled(false);
    await lp.setMicrophoneEnabled(aberto, restricoesDeCaptura(audio));
  } catch {
    // o microfone pode ter sumido no meio da troca; o próximo toggle resolve
  }
}

/** A sala LiveKit corrente (ou null). Os componentes leem daqui, nunca a guardam. */
export function salaAtual(): Room | null {
  return sala;
}

/** Participantes da sala: eu primeiro, como no Discord. */
export function participantesDaSala(): Participant[] {
  if (!sala) return [];
  return [sala.localParticipant, ...sala.remoteParticipants.values()];
}

/** Faixas de vídeo publicadas por um participante (câmera e tela). */
export function videosDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Video && !!pub.track && !pub.isMuted,
  );
}

/** Só a câmera: a tela tem tile próprio e regra própria (ver `telasDe`). */
export function camerasDe(p: Participant) {
  return videosDe(p).filter((pub) => pub.source !== Track.Source.ScreenShare);
}

/**
 * Telas publicadas por um participante — **com ou sem faixa baixada**.
 *
 * Diferente de `videosDe`, que exige `pub.track`: uma transmissão que ninguém
 * está assistindo fica *desassinada*, e então não há faixa nenhuma. O tile
 * precisa existir mesmo assim, senão o botão "Assistir transmissão" não teria
 * onde morar e a transmissão sumiria do palco.
 */
export function telasDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare,
  );
}

/**
 * Assina só as telas que alguém está de fato olhando.
 *
 * O LiveKit assina tudo por padrão (`autoSubscribe`), o que numa sala com três
 * transmissões significa baixar três vídeos em alta para mostrar três
 * quadradinhos. Aqui a regra é explícita: assina quem está em `assistindo`, e
 * em **baixa qualidade** quando a única razão é a miniatura do hover.
 *
 * A minha própria tela não passa por aqui: faixa local não se assina.
 */
export function aplicarAssinaturasDeTela() {
  const { assistindo, previa } = useVoice.getState();
  for (const p of participantesDaSala()) {
    const dono = donoDaIdentidade(p.identity);
    for (const pub of telasDe(p)) {
      if (!(pub instanceof RemoteTrackPublication)) continue;
      const assistida = assistindo.has(dono);
      const querida = assistida || previa === dono;
      if (pub.isSubscribed !== querida) pub.setSubscribed(querida);
      if (querida) pub.setVideoQuality(assistida ? VideoQuality.HIGH : VideoQuality.LOW);
    }
  }
}

/** Alguém publicou tela nesta sala (mesmo sem eu estar assistindo)? */
export function telaPublicadaDe(userId: string): TrackPublication | null {
  for (const p of participantesDe(userId)) {
    const [tela] = telasDe(p);
    if (tela) return tela;
  }
  return null;
}

/** Faixas de áudio publicadas por um participante. */
export function audiosDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Audio && !!pub.track && !pub.isMuted,
  );
}

/**
 * Usuário do estado de voz correspondente a uma identidade do LiveKit. A
 * identidade pode ser a da pessoa (`userId`) ou a do participante de tela
 * dela (`userId#tela`, a captura nativa do desktop): o dono é o mesmo.
 */
export function usuarioDaIdentidade(channelId: string, identity: string): PublicUser | null {
  const estados = useVoice.getState().states[channelId] ?? [];
  const dono = donoDaIdentidade(identity);
  return estados.find((e) => e.user.id === dono)?.user ?? null;
}

/**
 * Todos os participantes da sala que pertencem a um usuário: a pessoa e, se
 * ela transmite pelo desktop, o `#tela`. A pessoa vem primeiro — é o
 * participante de quem se lê "falando" e o microfone.
 */
export function participantesDe(userId: string): Participant[] {
  return participantesDaSala()
    .filter((p) => donoDaIdentidade(p.identity) === userId)
    .sort((a, b) => Number(a.identity !== userId) - Number(b.identity !== userId));
}

// A transmissão nativa pode acabar sem ninguém pedir: a janela fechou, a sala
// do `#tela` caiu. O Rust avisa por evento e a store volta ao repouso — sem
// isto o botão continuaria dizendo "ao vivo" com ninguém do outro lado.
if (typeof window !== "undefined" && isTauri()) {
  ouvirTelaEncerrada((motivo) => {
    if (!telaNativa) return;
    telaNativa = false;
    useVoice.setState((s) => ({ screenOn: false, tick: s.tick + 1 }));
    tocarSom("transmissao-encerrada");
    useVoice.getState().syncFlags();
    ui.toast(
      motivo === "fonteSumiu"
        ? "A janela compartilhada foi fechada; a transmissão parou."
        : motivo === "desconectado"
          ? "A transmissão caiu: a conexão com a sala foi perdida."
          : "A transmissão parou: a captura de tela falhou.",
      "error",
    );
  });
}

// Trocar de microfone/saída nas configurações vale **na hora**, sem sair da
// call: o SDK republica a faixa com o novo dispositivo. A câmera é a exceção —
// ela só troca no próximo `setCameraEnabled`, porque republicar vídeo no meio
// de uma frase pisca a imagem para todo mundo.
if (typeof window !== "undefined") {
  let anteriores = "";
  useVoiceDevicesStore.subscribe((devices) => {
    const chave = `${devices.inputId}|${devices.outputId}`;
    if (chave === anteriores) return;
    anteriores = chave;
    const room = sala;
    if (!room) return;
    if (devices.inputId) void room.switchActiveDevice("audioinput", devices.inputId).catch(() => {});
    if (devices.outputId) void room.switchActiveDevice("audiooutput", devices.outputId).catch(() => {});
  });
}

// Mudo/surdo do rodapé e push-to-talk valem dentro da call: qualquer troca é
// reenviada ao gateway e aplicada no SDK. A assinatura fica aqui (e não num
// componente) para valer mesmo com o painel de voz fechado.
if (typeof window !== "undefined") {
  let anterior = "";
  useVoicePrefs.subscribe((prefs) => {
    const chave = `${prefs.muted}|${prefs.deafened}|${prefs.pushToTalk}|${prefs.pttAtivo}`;
    if (chave === anterior) return;
    anterior = chave;
    if (useVoice.getState().channelId) useVoice.getState().syncFlags();
  });
}
