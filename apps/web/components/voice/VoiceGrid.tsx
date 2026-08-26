"use client";

import { useEffect, useRef, useState } from "react";
import { HeadphoneOff, Maximize2, MicOff, MonitorUp, Volume2, VolumeX } from "lucide-react";
import { Track, type Participant, type TrackPublication } from "livekit-client";
import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/stores/auth";
import { participantesDaSala, useVoice, videosDe } from "@/stores/voice";
import { aplicarSaida, useVoiceDevicesStore } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * A grade de participantes de uma sala de voz.
 *
 * Quem manda na grade é o **estado de voz do servidor**, não o LiveKit: sem
 * servidor de mídia configurado a sala continua tendo gente, e é isso que o
 * usuário precisa ver. A faixa de vídeo, quando existe, é casada pelo
 * `identity` do participante (que é o id do usuário) e apenas *enfeita* o tile.
 *
 * Tela compartilhada não divide o tile com a câmera: vira um tile próprio e
 * grande, porque é o conteúdo que as pessoas estão de fato olhando.
 */

interface Tile {
  key: string;
  state: VoiceStateEvent;
  participant: Participant | null;
  publication: TrackPublication | null;
  /** tela compartilhada ocupa o dobro de espaço e não espelha a imagem. */
  tela: boolean;
}

export default function VoiceGrid({ channelId }: { channelId: string }) {
  const me = useAuth((s) => s.user);
  // `tick` é o que traz as mudanças do SDK (faixas entrando e saindo)
  useVoice((s) => s.tick);
  const states = useVoice((s) => s.statesOf(channelId));
  const falando = useVoice((s) => s.falando);
  const focado = useVoice((s) => s.focado);
  const setFocado = useVoice((s) => s.setFocado);

  const porIdentidade = new Map(participantesDaSala().map((p) => [p.identity, p]));
  const tiles: Tile[] = states.flatMap((state): Tile[] => {
    const p = porIdentidade.get(state.user.id) ?? null;
    const videos = p ? videosDe(p) : [];
    if (videos.length === 0) {
      return [{ key: state.user.id, state, participant: p, publication: null, tela: false }];
    }
    return videos.map((pub) => ({
      key: `${state.user.id}:${pub.trackSid}`,
      state,
      participant: p,
      publication: pub,
      tela: pub.source === Track.Source.ScreenShare,
    }));
  });

  if (tiles.length === 0) {
    return <p className="grid h-full place-items-center text-sm text-txt-muted">Ninguém na sala ainda.</p>;
  }

  // com alguém em foco a grade vira "palco + tirinha", como o Discord faz ao
  // clicar num participante
  const emFoco = focado ? tiles.filter((t) => t.state.user.id === focado) : [];
  const resto = focado ? tiles.filter((t) => t.state.user.id !== focado) : tiles;

  return (
    <div className="flex h-full flex-col gap-3">
      {emFoco.length > 0 && (
        <div className="min-h-0 flex-1">
          {emFoco.map((t) => (
            <VoiceTile key={t.key} tile={t} meId={me?.id} falando={falando} onFocus={setFocado} grande />
          ))}
        </div>
      )}

      <div
        className={
          focado
            ? "flex shrink-0 gap-3 overflow-x-auto"
            : "grid flex-1 auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {resto.map((t) => (
          <div key={t.key} className={focado ? "w-48 shrink-0" : t.tela ? "sm:col-span-2" : ""}>
            <VoiceTile tile={t} meId={me?.id} falando={falando} onFocus={setFocado} />
          </div>
        ))}
      </div>

      {/* áudio dos outros: fora da grade, para não sumir junto com um tile de vídeo */}
      {states
        .filter((s) => s.user.id !== me?.id)
        .map((s) => (
          <AudioDoParticipante key={`audio-${s.user.id}`} userId={s.user.id} />
        ))}
    </div>
  );
}

/** Um participante: vídeo quando há, avatar quando não. */
function VoiceTile({
  tile,
  meId,
  falando,
  onFocus,
  grande = false,
}: {
  tile: Tile;
  meId?: string;
  falando: string[];
  onFocus: (userId: string | null) => void;
  grande?: boolean;
}) {
  const { state, participant, publication, tela } = tile;
  const sou = state.user.id === meId;
  const silenciado = useVoice((s) => !!s.silenciados[state.user.id]);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história
  const ativo = !state.muted && (falando.includes(state.user.id) || !!participant?.isSpeaking);
  const nome = displayNameOf(state.user);

  return (
    <div
      data-voice-tile={state.user.id}
      className={`group relative overflow-hidden rounded-lg bg-panel transition ${
        grande ? "h-full" : "aspect-video"
      } ${ativo ? "ring-2 ring-green" : "ring-1 ring-black/30"}`}
    >
      <button
        type="button"
        onClick={() => onFocus(state.user.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!sou) abrirMenuParticipante(e.clientX, e.clientY, state.user.id, nome);
        }}
        aria-label={`${nome}${tela ? " — tela compartilhada" : ""}`}
        className="h-full w-full"
      >
        {publication ? (
          <VideoDaFaixa publication={publication} espelhar={sou && !tela} />
        ) : (
          <span className="grid h-full w-full place-items-center bg-panel">
            <Avatar user={state.user} size="xl" surface="border-panel" />
          </span>
        )}
      </button>

      <span className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {nome}
        {sou && " (você)"}
        {tela && <MonitorUp size={12} aria-hidden="true" />}
        {state.muted && <MicOff size={12} className="text-red" aria-label="Mudo" />}
        {state.deafened && <HeadphoneOff size={12} className="text-red" aria-label="Sem áudio" />}
        {silenciado && <VolumeX size={12} className="text-red" aria-label="Silenciado por você" />}
      </span>

      {!grande && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
          <Maximize2 size={12} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

/**
 * Menu do participante — volume e "silenciar localmente".
 *
 * Não usa o `ui.openContextMenu` do app de propósito: aquele menu só sabe
 * desenhar itens que executam uma ação, e aqui é preciso um controle contínuo
 * (o slider de volume). Em vez de complicar o menu global por um caso só, este
 * pedaço desenha o próprio painel — com Esc e clique fora, como o outro.
 */
let abrirMenuParticipante: (x: number, y: number, userId: string, nome: string) => void = () => {};

export function VoiceParticipantMenuHost() {
  const [menu, setMenu] = useState<{ x: number; y: number; userId: string; nome: string } | null>(null);
  const volumes = useVoice((s) => s.volumes);
  const silenciados = useVoice((s) => s.silenciados);
  const setVolume = useVoice((s) => s.setVolume);
  const toggleSilenciado = useVoice((s) => s.toggleSilenciado);

  useEffect(() => {
    abrirMenuParticipante = (x, y, userId, nome) => setMenu({ x, y, userId, nome });
    return () => {
      abrirMenuParticipante = () => {};
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const fechar = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setMenu(null);
    };
    window.addEventListener("keydown", fechar);
    window.addEventListener("mousedown", fechar);
    return () => {
      window.removeEventListener("keydown", fechar);
      window.removeEventListener("mousedown", fechar);
    };
  }, [menu]);

  if (!menu) return null;
  const volume = menu.userId in volumes ? volumes[menu.userId] : 1;
  const silenciado = !!silenciados[menu.userId];

  return (
    <div
      role="dialog"
      aria-label={`Ajustes de ${menu.nome}`}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        left: Math.min(menu.x, window.innerWidth - 232),
        top: Math.min(menu.y, window.innerHeight - 130),
      }}
      className="fixed z-50 w-56 rounded-[4px] bg-footer p-2 shadow-lg"
    >
      <p className="truncate px-1 pb-1 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {menu.nome}
      </p>
      <label className="flex items-center gap-2 px-1 py-1.5 text-sm text-txt-normal">
        <Volume2 size={16} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(menu.userId, Number(e.target.value) / 100)}
          aria-label={`Volume de ${menu.nome}`}
          className="flex-1 accent-accent"
        />
        <span className="w-9 text-right text-xs text-txt-muted">{Math.round(volume * 100)}%</span>
      </label>
      <button
        type="button"
        onClick={() => {
          toggleSilenciado(menu.userId);
          setMenu(null);
        }}
        className={`flex w-full items-center gap-2 rounded-[2px] px-1 py-1.5 text-left text-sm transition hover:bg-accent hover:text-accent-ink ${
          silenciado ? "text-red" : "text-txt-normal"
        }`}
      >
        <VolumeX size={16} aria-hidden="true" />
        {silenciado ? "Reativar áudio" : "Silenciar localmente"}
      </button>
    </div>
  );
}

/** `<video>` colado numa faixa do SDK; solta a faixa ao trocar/desmontar. */
function VideoDaFaixa({ publication, espelhar }: { publication: TrackPublication; espelhar: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = publication.track;

  useEffect(() => {
    const el = ref.current;
    if (el && track) track.attach(el);
    return () => {
      if (el && track) track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full bg-black object-contain ${espelhar ? "-scale-x-100" : ""}`}
    />
  );
}

/**
 * Áudio de um participante remoto, com o volume individual, o "silenciar
 * localmente" e o "desativar áudio" do rodapé aplicados no elemento — e a saída
 * apontada para o dispositivo escolhido nas configurações.
 */
function AudioDoParticipante({ userId }: { userId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useVoice((s) => s.tick);
  const volume = useVoice((s) => (userId in s.volumes ? s.volumes[userId] : 1));
  const silenciado = useVoice((s) => !!s.silenciados[userId]);
  const deafened = useVoicePrefs((s) => s.deafened);
  const outputId = useVoiceDevicesStore((s) => s.outputId);

  const participante = participantesDaSala().find((p) => p.identity === userId) ?? null;
  const faixa = participante
    ? Array.from(participante.trackPublications.values()).find(
        (pub) => pub.kind === Track.Kind.Audio && !!pub.track,
      )?.track ?? null
    : null;

  useEffect(() => {
    const el = ref.current;
    if (el && faixa) faixa.attach(el);
    return () => {
      if (el && faixa) faixa.detach(el);
    };
  }, [faixa]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // o slider vai até 200%, mas o elemento só aceita até 1: acima disso o ganho
    // extra precisaria de WebAudio, que não vale a complexidade aqui
    el.volume = Math.max(0, Math.min(1, volume));
    void aplicarSaida(el, outputId);
  }, [volume, outputId]);

  // surdo cala **todos** os `<audio>` de uma vez; o silenciar é por pessoa
  return <audio ref={ref} autoPlay muted={deafened || silenciado} />;
}
