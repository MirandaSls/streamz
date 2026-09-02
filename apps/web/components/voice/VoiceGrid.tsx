"use client";

import { useEffect, useRef, useState } from "react";
import {
  HeadphoneOff,
  Maximize,
  Maximize2,
  MicOff,
  Minimize2,
  Play,
  Plus,
  UserPlus,
  Volume2,
  VolumeX,
} from "@/components/ui/icones";
import { Track, type Participant, type TrackPublication } from "livekit-client";
import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { alternarTelaCheiaDe } from "@/components/voice/fullscreen";
import { GAP, distribuir, melhorArranjo } from "@/components/voice/grid-layout";
import {
  abrirMenuDeParticipante,
  abrirVolumeDe,
  registrarVolumePopover,
} from "@/components/voice/participant-menu";
import { useAuth } from "@/stores/auth";
import { ui } from "@/stores/ui";
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
 * A grade **não rola**: o arranjo linhas×colunas é calculado a partir do
 * tamanho real do palco (`grid-layout.ts`), como no Discord. Rolagem aqui seria
 * a admissão de que alguém na sala está fora do campo de visão.
 *
 * Tela compartilhada não divide o tile com a câmera: vira um tile próprio e,
 * quando começa, sobe sozinha ao palco — é o conteúdo que as pessoas estão de
 * fato olhando.
 *
 * **Há dois palcos, não um.** Numa conversa direta em que ninguém publicou
 * vídeo nem tela, o Discord não desenha tile nenhum: os avatares ficam soltos
 * sobre o fundo, grandes e centralizados, sem moldura e sem pílula de nome (ver
 * `docs/Reference`). A moldura só entra quando há o que emoldurar — e ela volta
 * assim que qualquer um liga a câmera ou transmite. Em canal de voz de servidor
 * o tile vale desde o começo: ali a grade é a própria sala, e a moldura é o que
 * separa uma pessoa da outra numa lista que cresce.
 */

/** Uma vaga do palco: alguém, ou o convite que ocupa a vaga vazia. */
type Celula = { tipo: "tile"; t: Tile } | { tipo: "convite" };

interface Tile {
  key: string;
  state: VoiceStateEvent;
  participant: Participant | null;
  publication: TrackPublication | null;
  tela: boolean;
}

export default function VoiceGrid({
  channelId,
  nomeDoCanal,
  guildId = null,
  onAdicionar,
}: {
  channelId: string;
  nomeDoCanal?: string;
  /** ação de convidar do estado vazio — e o que distingue servidor de conversa. */
  guildId?: string | null;
  /**
   * Chamar mais gente para a chamada, no palco de avatares. Vem de fora porque
   * quem sabe se a conversa aceita mais alguém é o host (grupo aceita, conversa
   * de duas pessoas não), e a grade não precisa aprender isso.
   */
  onAdicionar?: () => void;
}) {
  const me = useAuth((s) => s.user);
  // `tick` é o que traz as mudanças do SDK (faixas entrando e saindo)
  useVoice((s) => s.tick);
  const states = useVoice((s) => s.statesOf(channelId));
  const falando = useVoice((s) => s.falando);
  const focado = useVoice((s) => s.focado);
  const focoAutomatico = useVoice((s) => s.focoAutomatico);
  const setFocado = useVoice((s) => s.setFocado);
  const focarAutomaticamente = useVoice((s) => s.focarAutomaticamente);
  // elemento em estado (e não em ref): o palco é desmontado quando alguém sobe
  // ao destaque, e um `ref` não avisaria o observador de que voltou
  const [palco, setPalco] = useState<HTMLDivElement | null>(null);
  const tamanho = useTamanho(palco);

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

  const transmissao = tiles.find((t) => t.tela) ?? null;
  const donoDaTransmissao = transmissao?.state.user.id ?? null;

  // transmissão que começa assume o palco sozinha (Discord). Só quando ninguém
  // escolheu nada à mão — ver `focoAutomatico` na store.
  useEffect(() => {
    if (focoAutomatico && donoDaTransmissao && focado !== donoDaTransmissao) {
      focarAutomaticamente(donoDaTransmissao);
    }
  }, [focoAutomatico, donoDaTransmissao, focado, focarAutomaticamente]);

  // sem nenhuma faixa publicada, uma conversa direta é fileira de avatares
  const modoAvatares = !guildId && tiles.every((t) => !t.publication);

  if (tiles.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-lg font-bold text-txt-primary">
            {nomeDoCanal ? `Ninguém em ${nomeDoCanal}` : "Ninguém na sala"}
          </p>
          <p className="max-w-sm text-sm text-txt-muted">
            Chame alguém e a conversa começa aqui — quem entrar aparece nesta tela.
          </p>
          {guildId && (
            <button
              type="button"
              onClick={() => ui.openModal({ kind: "invite", guildId })}
              className="mt-1 flex h-9 items-center gap-2 rounded-[3px] bg-accent px-4 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover"
            >
              <UserPlus size={16} aria-hidden="true" />
              Convidar pessoas
            </button>
          )}
        </div>
      </div>
    );
  }

  if (modoAvatares) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
          {onAdicionar && (
            <Tooltip label="Adicionar pessoas">
              <button
                type="button"
                onClick={onAdicionar}
                aria-label="Adicionar pessoas"
                className="grid h-20 w-20 place-items-center rounded-full text-txt-secondary transition hover:bg-panel hover:text-txt-primary"
              >
                <Plus size={32} />
              </button>
            </Tooltip>
          )}
          {tiles.map((t) => (
            <AvatarDeChamada
              key={t.key}
              tile={t}
              meId={me?.id}
              falando={falando}
              channelId={channelId}
            />
          ))}
        </div>

        {states
          .filter((s) => s.user.id !== me?.id)
          .map((s) => (
            <AudioDoParticipante key={`audio-${s.user.id}`} userId={s.user.id} />
          ))}
      </div>
    );
  }

  // com alguém no palco a grade vira "destaque em cima + tirinha embaixo".
  // A tira ficava ACIMA para deixar o rodapé livre aos controles flutuantes,
  // mas quem reserva esse espaço é o host (`pb-24` no CallStage e no
  // VoicePanel) — e em cima ela empurrava o destaque para baixo, invertia a
  // ordem de leitura e passava por baixo do cabeçalho absoluto do palco.
  const emFoco = focado ? tiles.filter((t) => t.state.user.id === focado) : [];
  // quem está no palco com tela **e** câmera: a tela é o palco, a câmera vai
  // para a tira (é o que o Discord faz com quem transmite e liga a webcam)
  const principal = emFoco.find((t) => t.tela) ?? emFoco[0] ?? null;
  const resto = principal ? tiles.filter((t) => t.key !== principal.key) : tiles;

  // Com uma pessoa só na sala o Discord não deixa o palco pela metade: a vaga
  // vazia vira o convite. Com mais gente ele some — aí a grade é a própria
  // sala, e o convite continua a um clique na barra lateral.
  const comConvite = !!guildId && !principal && resto.length === 1;
  const celulas: Celula[] = [
    ...resto.map((t) => ({ tipo: "tile" as const, t })),
    ...(comConvite ? [{ tipo: "convite" as const }] : []),
  ];

  const arranjo = melhorArranjo(celulas.length, tamanho.largura, tamanho.altura);
  const linhas = distribuir(celulas.length, arranjo.colunas);
  let indice = 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {principal ? (
        <div className="min-h-0 flex-1">
          <VoiceTile
            tile={principal}
            meId={me?.id}
            falando={falando}
            channelId={channelId}
            assistindo
            onFocar={setFocado}
            grande
          />
        </div>
      ) : (
        <div
          ref={setPalco}
          className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden"
          style={{ gap: GAP }}
        >
          {linhas.map((quantos, linha) => {
            const fatia = celulas.slice(indice, indice + quantos);
            indice += quantos;
            return (
              <div key={linha} className="flex shrink-0 justify-center" style={{ gap: GAP }}>
                {fatia.map((c) => (
                  <div
                    key={c.tipo === "tile" ? c.t.key : "convite"}
                    style={{ width: arranjo.largura, height: arranjo.altura }}
                  >
                    {c.tipo === "tile" ? (
                      <VoiceTile
                        tile={c.t}
                        meId={me?.id}
                        falando={falando}
                        channelId={channelId}
                        assistindo={false}
                        onFocar={setFocado}
                      />
                    ) : (
                      <TileDeConvite guildId={guildId as string} />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {principal && (
        <div className="flex shrink-0 gap-3 overflow-x-auto pb-1">
          {resto.map((t) => (
            <div key={t.key} className="h-[90px] w-40 shrink-0">
              <VoiceTile
                tile={t}
                meId={me?.id}
                falando={falando}
                channelId={channelId}
                assistindo={false}
                onFocar={setFocado}
                compacto
              />
            </div>
          ))}
        </div>
      )}

      {/* áudio dos outros: fora da grade, para não sumir junto com um tile de vídeo */}
      {states
        .filter((s) => s.user.id !== me?.id)
        .map((s) => (
          <AudioDoParticipante key={`audio-${s.user.id}`} userId={s.user.id} />
        ))}
    </div>
  );
}

/** Tamanho útil de um elemento; é o que dá o arranjo sem rolagem. */
function useTamanho(el: HTMLElement | null) {
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entrada]) => {
      const r = entrada.contentRect;
      setTamanho({ largura: r.width, altura: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return tamanho;
}

/**
 * A vaga vazia do palco, como convite.
 *
 * A arte do Discord aqui é ilustração proprietária deles; o que se copia é o
 * **papel** do tile — ocupar a vaga com uma ação em vez de com vazio —, não o
 * desenho. O nosso é o brilho do accent no canto, que é o que a marca tem.
 *
 * Sem "Escolher atividade" ao lado: atividade não existe no produto, e um botão
 * que abre um "em breve" é pior que a ausência dele.
 */
function TileDeConvite({ guildId }: { guildId: string }) {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-lg bg-panel ring-1 ring-black/30">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl"
      />
      <button
        type="button"
        onClick={() => ui.openModal({ kind: "invite", guildId })}
        className="relative flex h-9 items-center gap-2 rounded-[3px] bg-border-strong px-4 text-sm font-semibold text-txt-primary transition hover:bg-border-strong-hover"
      >
        <UserPlus size={16} aria-hidden="true" />
        Convidar para voz
      </button>
    </div>
  );
}

/**
 * Um participante no palco de avatares: só a foto, o anel de fala e o selo de
 * mudo.
 *
 * O nome não aparece em lugar nenhum — é assim no Discord, e faz sentido: numa
 * chamada direta você sabe com quem está falando, e o rótulo só roubaria
 * espaço do rosto. Ele continua alcançável pelo tooltip e pelo `aria-label`,
 * que é o que mantém a tela utilizável para quem navega por leitor de tela.
 *
 * O menu de contexto (volume, silenciar) segue no botão direito, igual ao tile:
 * trocar de leiaute não pode custar uma capacidade.
 */
function AvatarDeChamada({
  tile,
  meId,
  falando,
  channelId,
}: {
  tile: Tile;
  meId?: string;
  falando: string[];
  channelId: string;
}) {
  const { state, participant } = tile;
  const sou = state.user.id === meId;
  const nome = displayNameOf(state.user);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história
  const ativo = !state.muted && (falando.includes(state.user.id) || !!participant?.isSpeaking);

  return (
    <Tooltip label={nome}>
      <span
        data-voice-avatar={state.user.id}
        aria-label={nome}
        onContextMenu={(e) => {
          e.preventDefault();
          abrirMenuDeParticipante(e.clientX, e.clientY, state.user, { sou, channelId });
        }}
        className={`inline-block rounded-full transition ${ativo ? "ring-[3px] ring-green" : ""} ${
          state.reconnecting ? "opacity-50" : ""
        }`}
      >
        <Avatar
          user={state.user}
          size="xl"
          surface="border-rail"
          voz={state.deafened ? "surdo" : state.muted ? "mudo" : null}
        />
      </span>
    </Tooltip>
  );
}

/** Um participante: vídeo quando há, avatar quando não. */
function VoiceTile({
  tile,
  meId,
  falando,
  channelId,
  assistindo,
  onFocar,
  grande = false,
  compacto = false,
}: {
  tile: Tile;
  meId?: string;
  falando: string[];
  channelId: string;
  /** este tile é o que está no palco (só a transmissão usa a distinção). */
  assistindo: boolean;
  onFocar: (userId: string | null) => void;
  grande?: boolean;
  compacto?: boolean;
}) {
  const { state, participant, publication, tela } = tile;
  const sou = state.user.id === meId;
  const caixa = useRef<HTMLDivElement>(null);
  const silenciado = useVoice((s) => !!s.silenciados[state.user.id]);
  const toggleSilenciado = useVoice((s) => s.toggleSilenciado);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história
  const ativo = !state.muted && (falando.includes(state.user.id) || !!participant?.isSpeaking);
  const nome = displayNameOf(state.user);

  return (
    <div
      ref={caixa}
      data-voice-tile={state.user.id}
      onDoubleClick={() => onFocar(state.user.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        abrirMenuDeParticipante(e.clientX, e.clientY, state.user, { sou, channelId });
      }}
      aria-label={`${nome}${tela ? " — tela compartilhada" : ""}`}
      className={`group relative h-full w-full overflow-hidden rounded-lg bg-panel transition ${
        ativo ? "ring-2 ring-green" : "ring-1 ring-black/30"
      }`}
    >
      {publication ? (
        <VideoDaFaixa publication={publication} espelhar={sou && !tela} />
      ) : (
        <span className="grid h-full w-full place-items-center bg-panel">
          {/* o anel acompanha o avatar, e não só a caixa: num tile grande a
              borda externa fica longe demais do rosto para ler como "falando" */}
          <span className={`rounded-full ${ativo ? "ring-[3px] ring-green" : ""}`}>
            <Avatar user={state.user} size={compacto ? "md" : "xl"} surface="border-panel" />
          </span>
        </span>
      )}

      {/* Carência do servidor correndo: a pessoa ainda está na chamada, e some
          só se não voltar. Esmaecer em vez de remover é o que evita a grade
          piscar a cada oscilação de rede de alguém. */}
      {state.reconnecting && (
        <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-semibold text-white">
          Reconectando…
        </span>
      )}

      {/* quem ainda não está assistindo precisa de um convite explícito: um
          quadradinho de vídeo em movimento não diz "isto é uma transmissão" */}
      {tela && !assistindo && (
        <button
          type="button"
          onClick={() => onFocar(state.user.id)}
          className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100"
        >
          <span className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
            <Play size={16} aria-hidden="true" />
            Assistir transmissão
          </span>
        </button>
      )}

      {/* A pílula só aparece quando tem o que dizer.
          No print, um tile de avatar sem mudo e sem o mouse em cima é limpo: só
          a foto e a borda verde de quem fala (113411). Ela volta quando há
          estado a informar — mudo, surdo, transmissão — e no hover, para quem
          quiser conferir o nome. Com vídeo ela fica sempre: aí o quadro é uma
          imagem em movimento, e o rosto de hoje não é o de ontem.
          Desenhá-la sempre, como fazíamos, enchia uma sala de duas pessoas de
          rótulo que ninguém precisa ler. */}
      <span
        className={`pointer-events-none absolute bottom-1 left-1 flex max-w-[calc(100%-8px)] items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white transition-opacity ${
          publication || state.muted || state.deafened
            ? ""
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        {tela && (
          <span className="rounded-[3px] bg-red px-1 text-[10px] font-bold uppercase leading-4 tracking-[0.02em] text-white">
            Ao vivo
          </span>
        )}
        <span className="truncate">
          {nome}
          {sou && " (você)"}
        </span>
        {/* surdo implica mudo: mostrar os dois ícones contaria duas vezes a
            mesma coisa. "Silenciado por você" não entra — é estado meu, não
            dele, e vive no menu de contexto */}
        {state.deafened ? (
          <HeadphoneOff size={12} className="shrink-0 text-red" aria-label="Sem áudio" />
        ) : (
          state.muted && <MicOff size={12} className="shrink-0 text-red" aria-label="Mudo" />
        )}
      </span>

      {!compacto && (
        <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          {!sou && (
            <>
              <AcaoDoTile
                label={`Volume de ${nome}`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  abrirVolumeDe(r.left, r.bottom, state.user.id, nome);
                }}
              >
                <Volume2 size={14} />
              </AcaoDoTile>
              <AcaoDoTile
                label={silenciado ? `Reativar ${nome}` : `Silenciar ${nome}`}
                onClick={() => toggleSilenciado(state.user.id)}
              >
                <VolumeX size={14} className={silenciado ? "text-red" : undefined} />
              </AcaoDoTile>
            </>
          )}
          <AcaoDoTile
            label={grande ? "Sair do palco" : "Colocar no palco"}
            onClick={() => onFocar(state.user.id)}
          >
            {grande ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </AcaoDoTile>
          <AcaoDoTile label="Tela cheia" onClick={() => void alternarTelaCheiaDe(caixa.current)}>
            <Maximize size={14} />
          </AcaoDoTile>
        </div>
      )}
    </div>
  );
}

/** Botão da barra de ações que aparece no hover do tile. */
function AcaoDoTile({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="grid h-7 w-7 place-items-center rounded bg-black/60 text-white transition hover:bg-black/80"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * O slider fino de volume de um participante.
 *
 * Não vira item do menu de contexto porque aquele menu desenha **ações**, e
 * volume é um controle contínuo. Os degraus (50/100/150/200%) resolvem o caso
 * comum de dentro do menu; isto aqui é o ajuste fino.
 */
export function VoiceVolumePopoverHost() {
  const [popover, setPopover] = useState<{ x: number; y: number; userId: string; nome: string } | null>(
    null,
  );
  const volumes = useVoice((s) => s.volumes);
  const setVolume = useVoice((s) => s.setVolume);

  useEffect(() => {
    registrarVolumePopover((x, y, userId, nome) => setPopover({ x, y, userId, nome }));
    return () => registrarVolumePopover(() => {});
  }, []);

  useEffect(() => {
    if (!popover) return;
    const fechar = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setPopover(null);
    };
    window.addEventListener("keydown", fechar);
    window.addEventListener("mousedown", fechar);
    return () => {
      window.removeEventListener("keydown", fechar);
      window.removeEventListener("mousedown", fechar);
    };
  }, [popover]);

  if (!popover) return null;
  const volume = popover.userId in volumes ? volumes[popover.userId] : 1;

  return (
    <div
      role="dialog"
      aria-label={`Volume de ${popover.nome}`}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        left: Math.min(popover.x, window.innerWidth - 240),
        top: Math.min(popover.y, window.innerHeight - 90),
      }}
      className="fixed z-50 w-56 rounded-lg bg-overlay p-3 shadow-high anim-menu"
    >
      <p className="truncate pb-2 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {popover.nome}
      </p>
      <label className="flex items-center gap-2 text-sm text-txt-normal">
        <Volume2 size={16} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(popover.userId, Number(e.target.value) / 100)}
          aria-label={`Volume de ${popover.nome}`}
          className="flex-1 accent-accent"
        />
        <span className="w-9 text-right text-xs text-txt-muted">{Math.round(volume * 100)}%</span>
      </label>
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
 * localmente" e o "desativar áudio" do rodapé aplicados — e a saída apontada
 * para o dispositivo escolhido nas configurações.
 *
 * Acima de 100% o `volume` do elemento não serve: ele satura em 1. O reforço
 * passa por um `GainNode`, montado **sob demanda** — `createMediaElementSource`
 * é irreversível e tira o elemento do caminho do `setSinkId`, então quem nunca
 * subiu o volume continua com a saída de áudio escolhida valendo.
 */
function AudioDoParticipante({ userId }: { userId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const grafo = useRef<{ ctx: AudioContext; ganho: GainNode } | null>(null);
  useVoice((s) => s.tick);
  const porPessoa = useVoice((s) => (userId in s.volumes ? s.volumes[userId] : 1));
  // o volume geral da aba "Voz e vídeo" multiplica o de cada pessoa
  const geral = useVoice((s) => s.audio.saida);
  const volume = porPessoa * geral;
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
