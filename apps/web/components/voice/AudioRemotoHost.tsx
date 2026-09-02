"use client";

import { useEffect, useRef } from "react";
import { Track, type Track as TrackTipo } from "livekit-client";
import { donoDaIdentidade } from "@streamz/shared";
import { ouvintesRemotos } from "@/components/voice/audio-remoto";
import { useAuth } from "@/stores/auth";
import { participantesDaSala, participantesDe, useVoice } from "@/stores/voice";
import { aplicarSaida, useVoiceDevicesStore } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Os `<audio>` dos outros participantes da chamada em que estou.
 *
 * Moram aqui, montados com o app inteiro (ver `VoiceLayer`), e **não** na
 * grade de participantes: a grade só existe enquanto a conversa da chamada (ou
 * o canal de voz) está na tela, e trocar de DM, abrir um servidor ou a aba de
 * amigos a desmontava — `detach` em cada faixa, silêncio total, com a sala
 * ainda conectada e o meu microfone ainda publicado. Quem estava do outro lado
 * continuava me ouvindo e eu não ouvia ninguém.
 *
 * A lista de quem ouvir vem da store (`channelId` + estado de voz da sala), e
 * não da tela: é a chamada que decide, não a navegação. Ao sair — pelo botão,
 * pela expulsão ou pela queda — `channelId` zera e os elementos desmontam.
 *
 * Os elementos nascem depois de um gesto (o clique de entrar na chamada), então
 * o `autoPlay` passa pela política de autoplay do navegador; um `<audio>`
 * criado num carregamento sem gesto ficaria mudo até o primeiro clique.
 */
export default function AudioRemotoHost() {
  const meuId = useAuth((s) => s.user?.id);
  const channelId = useVoice((s) => s.channelId);
  // `tick` é o que traz as faixas entrando e saindo do SDK
  useVoice((s) => s.tick);
  const estados = useVoice((s) => (channelId ? s.states[channelId] : undefined)) ?? [];

  if (!channelId) return null;

  // O `<userId>#tela` da captura nativa é do mesmo dono: o áudio dele toca
  // junto com o da pessoa, e o meu próprio `#tela` não volta para mim.
  const identidades = participantesDaSala().map((p) => donoDaIdentidade(p.identity));
  return (
    <>
      {ouvintesRemotos(estados, identidades, meuId).map((userId) => (
        <AudioDoParticipante key={`audio-${userId}`} userId={userId} />
      ))}
    </>
  );
}

/**
 * Áudio de um participante remoto: **todas** as faixas de áudio dele — o
 * microfone e, quando transmite, o áudio da tela (que no desktop chega pelo
 * participante `#tela`). Um `<audio>` por faixa, todos com o mesmo volume
 * individual e o mesmo "silenciar" da pessoa.
 */
export function AudioDoParticipante({ userId }: { userId: string }) {
  useVoice((s) => s.tick);
  const faixas = participantesDe(userId).flatMap((p) =>
    Array.from(p.trackPublications.values())
      .filter((pub) => pub.kind === Track.Kind.Audio && !!pub.track)
      .map((pub) => ({ sid: pub.trackSid, faixa: pub.track as TrackTipo })),
  );
  return (
    <>
      {faixas.map(({ sid, faixa }) => (
        <AudioDaFaixa key={sid} userId={userId} faixa={faixa} />
      ))}
    </>
  );
}

/**
 * Um `<audio>` de uma faixa, com o volume individual, o "silenciar
 * localmente" e o "desativar áudio" do rodapé aplicados — e a saída apontada
 * para o dispositivo escolhido nas configurações.
 *
 * Acima de 100% o `volume` do elemento não serve: ele satura em 1. O reforço
 * passa por um `GainNode`, montado **sob demanda** — `createMediaElementSource`
 * é irreversível e tira o elemento do caminho do `setSinkId`, então quem nunca
 * subiu o volume continua com a saída de áudio escolhida valendo.
 */
function AudioDaFaixa({ userId, faixa }: { userId: string; faixa: TrackTipo }) {
  const ref = useRef<HTMLAudioElement>(null);
  const grafo = useRef<{ ctx: AudioContext; ganho: GainNode } | null>(null);
  const porPessoa = useVoice((s) => (userId in s.volumes ? s.volumes[userId] : 1));
  // o volume geral da aba "Voz e vídeo" multiplica o de cada pessoa
  const geral = useVoice((s) => s.audio.saida);
  const volume = porPessoa * geral;
  const silenciado = useVoice((s) => !!s.silenciados[userId]);
  const deafened = useVoicePrefs((s) => s.deafened);
  const outputId = useVoiceDevicesStore((s) => s.outputId);

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

    if (volume > 1 && !grafo.current) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          const fonte = ctx.createMediaElementSource(el);
          const ganho = ctx.createGain();
          fonte.connect(ganho).connect(ctx.destination);
          grafo.current = { ctx, ganho };
        }
      } catch {
        // sem Web Audio o volume simplesmente não passa de 100%
      }
    }

    if (grafo.current) {
      el.volume = 1;
      grafo.current.ganho.gain.value = Math.max(0, volume);
      void grafo.current.ctx.resume().catch(() => {});
    } else {
      el.volume = Math.max(0, Math.min(1, volume));
    }
    void aplicarSaida(el, outputId);
  }, [volume, outputId]);

  useEffect(() => {
    return () => {
      void grafo.current?.ctx.close().catch(() => {});
      grafo.current = null;
    };
  }, []);

  // surdo cala **todos** os `<audio>` de uma vez; o silenciar é por pessoa
  return <audio ref={ref} autoPlay muted={deafened || silenciado} />;
}
