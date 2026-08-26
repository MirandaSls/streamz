import { create } from "zustand";
import {
  SCREEN_QUALITY,
  WS_EVENTS,
  type CallEndedEvent,
  type CallRingEvent,
  type Channel,
  type PublicUser,
  type ScreenQuality,
  type VoiceFlags,
  type VoiceStateEvent,
} from "@newdisc/shared";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import { api } from "@/lib/api";
import { CHAMADA_INICIAL, callReducer, type CallAction, type CallState } from "@/stores/call-machine";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";
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
 *    configurado; sem ele o painel mostra "Voz não configurada" e a camada 1
 *    continua funcionando (dá para entrar num canal, tocar uma chamada e ver
 *    quem entrou — só não sai som).
 *
 * O objeto `Room` do SDK é mutável e cheio de referências circulares, então ele
 * fica **fora** do estado observável (`sala`, no módulo) e a store guarda um
 * `tick` que os eventos do SDK incrementam para forçar o re-render.
 */

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

/** Sala do canal em que estou — fora da store, ver o comentário acima. */
let sala: Room | null = null;

interface VoiceStoreState {
  /** estados de voz por canal (só quem está conectado). */
  states: Record<string, VoiceStateEvent[]>;

  // ── minha conexão ──
  channelId: string | null;
  guildId: string | null;
  channelName: string;
  status: VoiceStatus;
  erro: string | null;
  /** o LiveKit respondeu com credenciais? false = "Voz não configurada". */
  midiaDisponivel: boolean;
  tick: number;
  /** identidades (ids de usuário) falando agora. */
  falando: string[];

  // ── mídia local ──
  camOn: boolean;
  screenOn: boolean;
  screenQuality: ScreenQuality;
  screenAudio: boolean;

  // ── preferências por participante (locais, não vão para o servidor) ──
  volumes: Record<string, number>;
  silenciados: Record<string, boolean>;

  // ── foco/tela cheia da grade ──
  focado: string | null;
  telaCheia: boolean;

  // ── chamada em conversa direta ──
  call: CallState;

  loadGuild: (guildId: string) => Promise<void>;
  applyState: (evento: VoiceStateEvent) => void;
  /** Estados de um canal, ordenados por nome (para a barra lateral). */
  statesOf: (channelId: string) => VoiceStateEvent[];

  connect: (channel: Pick<Channel, "id" | "guildId" | "name" | "type">) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;

  toggleCam: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  setScreenQuality: (q: ScreenQuality) => void;
  setScreenAudio: (on: boolean) => void;

  setVolume: (userId: string, volume: number) => void;
  toggleSilenciado: (userId: string) => void;
  setFocado: (userId: string | null) => void;
  toggleTelaCheia: () => void;

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

const SEM_MIDIA =
  "Voz não configurada — ver PENDENCIAS.md. Você entrou no canal, mas não há servidor de mídia.";

export const useVoice = create<VoiceStoreState>((set, get) => {
  /** Re-render quando o SDK muda participantes/faixas. */
  const rerender = () => set((s) => ({ tick: s.tick + 1 }));

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
    if (!sala) return;
    sala.removeAllListeners();
    void sala.disconnect().catch(() => {});
    sala = null;
  }

  return {
    states: {},
    channelId: null,
    guildId: null,
    channelName: "",
    status: "idle",
    erro: null,
    midiaDisponivel: false,
    tick: 0,
    falando: [],
    camOn: false,
    screenOn: false,
    screenQuality: "720p30",
    screenAudio: true,
    volumes: {},
    silenciados: {},
    focado: null,
    telaCheia: false,
    call: CHAMADA_INICIAL,

    loadGuild: async (guildId) => {
      try {
        const estados = await api.guildVoiceStates(guildId);
        const porCanal: Record<string, VoiceStateEvent[]> = {};
        for (const e of estados) (porCanal[e.channelId] ??= []).push(e);
        set((s) => ({ states: { ...s.states, ...porCanal } }));
      } catch {
        // servidor sem voz ou sem acesso: a barra lateral fica sem bolinhas
      }
    },

    applyState: (evento) => {
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

    statesOf: (channelId) =>
      (get().states[channelId] ?? [])
        .slice()
        .sort((a, b) => a.user.username.localeCompare(b.user.username)),

    connect: async (channel) => {
      const anterior = get().channelId;
      if (anterior && anterior !== channel.id) await get().disconnect();

      set({
        channelId: channel.id,
        guildId: channel.guildId,
        channelName: channel.name ?? "voz",
        status: "connecting",
        erro: null,
        midiaDisponivel: false,
        falando: [],
        camOn: false,
        screenOn: false,
        focado: null,
      });

      // 1) o estado de voz não depende do LiveKit: avisa o gateway primeiro,
      //    para que os outros já vejam você no canal mesmo sem mídia
      emit(WS_EVENTS.VOICE_JOIN, { channelId: channel.id });
      emit(WS_EVENTS.VOICE_UPDATE, flags());

      // 2) mídia, se houver
      const conectou = await conectarMidia(channel.id, set, rerender, get);
      if (!conectou) {
        set({ status: "connected", midiaDisponivel: false, erro: SEM_MIDIA });
        return;
      }
      set({ status: "connected", midiaDisponivel: true, erro: null });
      get().syncFlags();
    },

    disconnect: async () => {
      const channelId = get().channelId;
      fecharSala();
      // o painel do canal de voz é a coluna 3 inteira: sair da call sem fechá-lo
      // deixaria o usuário preso numa sala vazia
      useChannels.getState().leaveVoice();
      if (channelId) {
        emit(WS_EVENTS.VOICE_LEAVE, {});
        if (get().call.phase !== "idle") emit(WS_EVENTS.CALL_END, { channelId });
      }
      set({
        channelId: null,
        guildId: null,
        channelName: "",
        status: "idle",
        erro: null,
        midiaDisponivel: false,
        falando: [],
        camOn: false,
        screenOn: false,
        focado: null,
        telaCheia: false,
        call: CHAMADA_INICIAL,
      });
    },

    reconnect: async () => {
      const { channelId, guildId, channelName } = get();
      if (!channelId) return;
      fecharSala();
      await get().connect({
        id: channelId,
        guildId,
        name: channelName,
        type: guildId ? "VOICE" : "DM",
      });
    },

    toggleCam: async () => {
      const lp = sala?.localParticipant;
      if (!lp) {
        ui.toast(SEM_MIDIA, "error");
        return;
      }
      const proximo = !lp.isCameraEnabled;
      try {
        const cameraId = useVoiceDevicesStore.getState().cameraId;
        await lp.setCameraEnabled(proximo, cameraId ? { deviceId: cameraId } : undefined);
        set({ camOn: proximo });
      } catch (e) {
        set({ camOn: false });
        ui.toast(errorMessage(e, "Não foi possível ligar a câmera"), "error");
      }
      get().syncFlags();
      rerender();
    },

    toggleScreen: async () => {
      const lp = sala?.localParticipant;
      if (!lp) {
        ui.toast(SEM_MIDIA, "error");
        return;
      }
      const proximo = !lp.isScreenShareEnabled;
      const preset = SCREEN_QUALITY[get().screenQuality];
      try {
        await lp.setScreenShareEnabled(proximo, {
          audio: get().screenAudio,
          resolution: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
        });
        set({ screenOn: proximo });
      } catch {
        // usuário cancelou o seletor de tela, ou navegador sem suporte
        set({ screenOn: false });
      }
      get().syncFlags();
      rerender();
    },

    setScreenQuality: (screenQuality) => set({ screenQuality }),
    setScreenAudio: (screenAudio) => set({ screenAudio }),

    setVolume: (userId, volume) =>
      set((s) => ({ volumes: { ...s.volumes, [userId]: Math.max(0, Math.min(2, volume)) } })),

    toggleSilenciado: (userId) =>
      set((s) => ({ silenciados: { ...s.silenciados, [userId]: !s.silenciados[userId] } })),

    setFocado: (focado) => set((s) => ({ focado: s.focado === focado ? null : focado })),
    toggleTelaCheia: () => set((s) => ({ telaCheia: !s.telaCheia })),

    // ── chamada em conversa direta ──

    startCall: async (channelId, comVideo) => {
      // uma conexão de voz por vez: o servidor já garante isso, o cliente
      // precisa fechar a sala antiga para não ficar com duas conexões de mídia
      if (get().channelId && get().channelId !== channelId) await get().disconnect();
      get().dispatchCall({ type: "start", channelId });
      set({
        channelId,
        guildId: null,
        channelName: "",
        status: "connecting",
        erro: null,
        camOn: false,
        screenOn: false,
      });
      try {
        await abrirConversa(channelId);
        const r = await api.startCall(channelId);
        for (const e of r.states) get().applyState(e);
        if (!r.voice) {
          set({ status: "connected", midiaDisponivel: false, erro: SEM_MIDIA });
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
      fecharToque();
      if (get().channelId && get().channelId !== channelId) await get().disconnect();
      get().dispatchCall({ type: "accept" });
      emit(WS_EVENTS.CALL_ACCEPT, { channelId });
      set({ channelId, guildId: null, status: "connecting", erro: null });
      await abrirConversa(channelId);
      // atender entra pela mesma rota de quem liga: ela é a que sabe de conversa
      // direta (o token de canal de voz recusaria uma DM com 400)
      try {
        const r = await api.startCall(channelId);
        for (const e of r.states) get().applyState(e);
        if (r.voice) await entrarNaSala(r.voice, set, rerender, get);
        set(
          r.voice
            ? { status: "connected", midiaDisponivel: true, erro: null }
            : { status: "connected", midiaDisponivel: false, erro: SEM_MIDIA },
        );
      } catch {
        // sem mídia a chamada ainda vale: o estado de voz já põe os dois na sala
        set({ status: "connected", midiaDisponivel: false, erro: SEM_MIDIA });
      }
      get().syncFlags();
    },

    declineCall: () => {
      const channelId = get().call.channelId;
      if (!channelId) return;
      fecharToque();
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
      get().dispatchCall({ type: "ring", channelId: evento.channelId, from: evento.from });
      // o toque só vira tela se a máquina aceitou o evento (já estar em chamada
      // ignora um toque de outra conversa — abrir o modal aí seria mentira)
      if (get().call.phase === "incoming") ui.openModal({ kind: "incomingCall" });
    },

    handleEnded: (evento) => {
      fecharToque();
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
        }
        if (channelId === evento.channelId) void get().disconnect();
        else get().dispatchCall({ type: "reset" });
      }
    },

    dispatchCall: (action) => {
      if (action.type === "timeout" || action.type === "reset") fecharToque();
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
  let conversa = useDMs.getState().channels.find((d) => d.id === channelId);
  if (!conversa) {
    // conversa que ainda não estava na lista (alguém ligou primeiro)
    await useDMs.getState().refreshList();
    conversa = useDMs.getState().channels.find((d) => d.id === channelId);
  }
  ui.setView("dm");
  if (conversa) useDMs.getState().select(conversa);
}

/** Tira a tela de chamada recebida — e só ela, para não fechar outro modal. */
function fecharToque() {
  if (useUI.getState().modal?.kind === "incomingCall") ui.closeModal();
}

/**
 * Pede o token e entra na sala. Devolve false quando a voz não está configurada
 * — o chamador segue com o estado de voz, sem mídia.
 */
async function conectarMidia(
  channelId: string,
  set: (partial: Partial<VoiceStoreState>) => void,
  rerender: () => void,
  get: () => VoiceStoreState,
): Promise<boolean> {
  let creds: { token: string; url: string; room: string };
  try {
    creds = await api.voiceToken(channelId);
  } catch {
    // 503 (sem credenciais) ou canal que não é de voz: sem mídia, e ponto
    return false;
  }
  if (!creds?.token || !/^wss?:\/\//i.test(creds.url ?? "")) return false;
  try {
    await entrarNaSala(creds, set, rerender, get);
    return true;
  } catch {
    return false;
  }
}

/** Conecta o `Room` e liga os eventos do SDK ao `tick`/`falando` da store. */
async function entrarNaSala(
  creds: { token: string; url: string },
  set: (partial: Partial<VoiceStoreState>) => void,
  rerender: () => void,
  get: () => VoiceStoreState,
) {
  const room = new Room({ adaptiveStream: true, dynacast: true });
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
      sala = null;
      set({ midiaDisponivel: false, falando: [] });
      rerender();
    });

  await room.connect(creds.url, creds.token);
  const devices = useVoiceDevicesStore.getState();
  if (devices.inputId) await room.switchActiveDevice("audioinput", devices.inputId).catch(() => {});
  if (devices.outputId) await room.switchActiveDevice("audiooutput", devices.outputId).catch(() => {});
  await room.localParticipant
    .setMicrophoneEnabled(useVoicePrefs.getState().micAberto())
    .catch(() => {});
  void get; // o `get` fica na assinatura para futuras leituras de estado
  rerender();
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

/** Faixas de áudio publicadas por um participante. */
export function audiosDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Audio && !!pub.track && !pub.isMuted,
  );
}

/** Usuário do estado de voz correspondente a uma identidade do LiveKit. */
export function usuarioDaIdentidade(channelId: string, identity: string): PublicUser | null {
  const estados = useVoice.getState().states[channelId] ?? [];
  return estados.find((e) => e.user.id === identity)?.user ?? null;
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
