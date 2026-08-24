"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import "@livekit/components-styles";
import { api } from "@/lib/api";

/**
 * Painel de voz/vídeo/tela de um canal de VOZ, sobre o LiveKit.
 *
 * Usa a API direta do `livekit-client` (em vez do <LiveKitRoom> de
 * @livekit/components-react) para ter um ponto único de try/catch em torno da
 * conexão — o que permite tratar com clareza o caso das credenciais do LiveKit
 * ausentes/inválidas (env vars ainda placeholders, ver PENDENCIAS.md).
 *
 * O componente deve ser montado com `key={channelId}` para reiniciar a conexão
 * ao trocar de canal.
 */

type Status = "connecting" | "connected" | "idle" | "error";

const LIVEKIT_HINT =
  "Configure o LiveKit Cloud (ver PENDENCIAS.md) para habilitar a voz.";

export default function VoicePanel({
  channelId,
  channelName,
  onLeave,
}: {
  channelId: string;
  channelName: string;
  onLeave?: () => void;
}) {
  const roomRef = useRef<Room | null>(null);
  const startedRef = useRef(false);

  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());

  // estado local dos dispositivos (otimista; sincronizado por eventos)
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);

  // "tick" para re-render quando o SDK emite mudanças de participantes/tracks
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const cleanup = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      room.disconnect().catch(() => {});
      roomRef.current = null;
    }
    setSpeakers(new Set());
    setCamOn(false);
    setScreenOn(false);
  }, []);

  const connect = useCallback(async () => {
    if (roomRef.current) return; // já conectado/conectando
    setStatus("connecting");
    setError(null);

    // 1) token da nossa API
    let creds: { token: string; url: string; room: string };
    try {
      creds = await api.voiceToken(channelId);
    } catch {
      setStatus("error");
      setError(`Não foi possível obter o token de voz. ${LIVEKIT_HINT}`);
      return;
    }

    // 2) credenciais válidas? (env vars ainda podem ser placeholders)
    if (!creds?.token || !creds?.url || !/^wss?:\/\//i.test(creds.url)) {
      setStatus("error");
      setError(`Credenciais do LiveKit ausentes ou inválidas. ${LIVEKIT_HINT}`);
      return;
    }

    // 3) conecta na sala
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room
      .on(RoomEvent.ParticipantConnected, rerender)
      .on(RoomEvent.ParticipantDisconnected, rerender)
      .on(RoomEvent.TrackSubscribed, rerender)
      .on(RoomEvent.TrackUnsubscribed, rerender)
      .on(RoomEvent.LocalTrackPublished, rerender)
      .on(RoomEvent.LocalTrackUnpublished, rerender)
      .on(RoomEvent.TrackMuted, rerender)
      .on(RoomEvent.TrackUnmuted, rerender)
      .on(RoomEvent.ActiveSpeakersChanged, (spk: Participant[]) => {
        setSpeakers(new Set(spk.map((p) => p.identity)));
      })
      .on(RoomEvent.Disconnected, () => {
        cleanup();
        setStatus("idle");
      });

    try {
      await room.connect(creds.url, creds.token);
      // microfone ligado por padrão ao entrar
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
      } catch {
        setMicOn(false);
      }
      setStatus("connected");
      rerender();
    } catch {
      cleanup();
      setStatus("error");
      setError(`Não foi possível conectar ao servidor de voz. ${LIVEKIT_HINT}`);
    }
  }, [channelId, cleanup, rerender]);

  // conecta automaticamente ao montar (ao clicar no canal de voz)
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    connect();
    return () => cleanup();
  }, [connect, cleanup]);

  const leave = useCallback(() => {
    cleanup();
    setStatus("idle");
    onLeave?.();
  }, [cleanup, onLeave]);

  const toggleMic = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !lp.isMicrophoneEnabled;
    try {
      await lp.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {
      /* permissão negada — mantém estado anterior */
    }
    rerender();
  }, [rerender]);

  const toggleCam = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !lp.isCameraEnabled;
    try {
      await lp.setCameraEnabled(next);
      setCamOn(next);
    } catch {
      setCamOn(false);
    }
    rerender();
  }, [rerender]);

  const toggleScreen = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !lp.isScreenShareEnabled;
    try {
      await lp.setScreenShareEnabled(next, { audio: true });
      setScreenOn(next);
    } catch {
      // usuário cancelou o seletor de tela, ou navegador sem suporte
      setScreenOn(false);
    }
    rerender();
  }, [rerender]);

  const room = roomRef.current;
  const participants: Participant[] =
    status === "connected" && room
      ? [room.localParticipant, ...room.remoteParticipants.values()]
      : [];

  return (
    <div className="flex h-full flex-col bg-chat">
      <header className="flex items-center justify-between border-b border-black/20 px-4 py-3">
        <span className="font-semibold">
          <span className="mr-1 text-neutral-500">🔊</span>
          {channelName}
        </span>
        <span className="text-xs text-neutral-400">
          {status === "connected"
            ? `${participants.length} na call`
            : status === "connecting"
              ? "Conectando…"
              : status === "error"
                ? "Erro de conexão"
                : "Desconectado"}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {status === "connecting" && (
          <div className="grid h-full place-items-center text-neutral-400">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-accent" />
              <p>Entrando na call de voz…</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="grid h-full place-items-center">
            <div className="max-w-sm rounded-lg bg-panel p-6 text-center">
              <div className="mb-2 text-2xl">🎧</div>
              <p className="mb-4 text-sm text-neutral-300">{error}</p>
              <button
                onClick={connect}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {status === "idle" && (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <p>Você saiu da call.</p>
              <button
                onClick={connect}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Entrar na call
              </button>
            </div>
          </div>
        )}

        {status === "connected" && (
          <>
            {participants.length === 0 ? (
              <p className="text-sm text-neutral-400">Ninguém na call ainda.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {participants.flatMap((p) => {
                  const isLocal = p.identity === room!.localParticipant.identity;
                  const speaking = speakers.has(p.identity) || p.isSpeaking;
                  const videos = videoPublications(p);

                  if (videos.length === 0) {
                    return [
                      <AvatarTile
                        key={p.identity}
                        participant={p}
                        isLocal={isLocal}
                        speaking={speaking}
                      />,
                    ];
                  }
                  return videos.map((pub) => (
                    <VideoTile
                      key={`${p.identity}:${pub.trackSid}`}
                      publication={pub}
                      participant={p}
                      isLocal={isLocal}
                      speaking={speaking}
                    />
                  ));
                })}
              </div>
            )}

            {/* áudio remoto (renderizado oculto para tocar o som) */}
            {participants.map((p) =>
              p.identity === room!.localParticipant.identity
                ? null
                : audioPublications(p).map((pub) => (
                    <AudioSink key={`${p.identity}:${pub.trackSid}`} publication={pub} />
                  )),
            )}
          </>
        )}
      </div>

      {status === "connected" && (
        <div className="flex items-center justify-center gap-3 border-t border-black/20 px-4 py-3">
          <ControlButton
            active={micOn}
            onClick={toggleMic}
            title={micOn ? "Mutar microfone" : "Desmutar microfone"}
          >
            {micOn ? "🎤" : "🔇"}
          </ControlButton>
          <ControlButton
            active={camOn}
            onClick={toggleCam}
            title={camOn ? "Desligar câmera" : "Ligar câmera"}
          >
            {camOn ? "🎥" : "📷"}
          </ControlButton>
          <ControlButton
            active={screenOn}
            onClick={toggleScreen}
            title={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}
          >
            🖥️
          </ControlButton>
          <button
            onClick={leave}
            title="Sair da call"
            className="grid h-11 w-11 place-items-center rounded-full bg-red-600 text-lg text-white transition hover:brightness-110"
          >
            📞
          </button>
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────

function videoPublications(p: Participant): TrackPublication[] {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Video && !!pub.track && !pub.isMuted,
  );
}

function audioPublications(p: Participant): TrackPublication[] {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Audio && !!pub.track && !pub.isMuted,
  );
}

function displayName(p: Participant, isLocal: boolean): string {
  const base = p.name || p.identity;
  return isLocal ? `${base} (você)` : base;
}

// ── sub-componentes ──────────────────────────────────────────

function ControlButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`grid h-11 w-11 place-items-center rounded-full text-lg transition hover:brightness-110 ${
        active ? "bg-accent text-white" : "bg-rail text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function VideoTile({
  publication,
  participant,
  isLocal,
  speaking,
}: {
  publication: TrackPublication;
  participant: Participant;
  isLocal: boolean;
  speaking: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = publication.track;
  const isScreen = publication.source === Track.Source.ScreenShare;

  useEffect(() => {
    const el = ref.current;
    if (el && track) track.attach(el);
    return () => {
      if (el && track) track.detach(el);
    };
  }, [track]);

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-lg bg-black ${
        speaking ? "ring-2 ring-green-400" : "ring-1 ring-black/30"
      }`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover ${
          isLocal && !isScreen ? "-scale-x-100" : ""
        }`}
      />
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {displayName(participant, isLocal)}
        {isScreen ? " · tela" : ""}
        {!participant.isMicrophoneEnabled && !isScreen ? " 🔇" : ""}
      </span>
    </div>
  );
}

function AvatarTile({
  participant,
  isLocal,
  speaking,
}: {
  participant: Participant;
  isLocal: boolean;
  speaking: boolean;
}) {
  const name = participant.name || participant.identity;
  return (
    <div
      className={`relative flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-panel ${
        speaking ? "ring-2 ring-green-400" : "ring-1 ring-black/30"
      }`}
    >
      <div className="grid h-16 w-16 place-items-center rounded-full bg-rail text-xl font-bold text-neutral-200">
        {name.slice(0, 2).toUpperCase()}
      </div>
      <span className="rounded bg-black/40 px-1.5 py-0.5 text-xs text-white">
        {displayName(participant, isLocal)}
        {!participant.isMicrophoneEnabled ? " 🔇" : ""}
      </span>
    </div>
  );
}

function AudioSink({ publication }: { publication: TrackPublication }) {
  const ref = useRef<HTMLAudioElement>(null);
  const track = publication.track;

  useEffect(() => {
    const el = ref.current;
    if (el && track) track.attach(el);
    return () => {
      if (el && track) track.detach(el);
    };
  }, [track]);

  return <audio ref={ref} autoPlay />;
}
