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
import { participantesDe, useVoice, videosDe } from "@/stores/voice";

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
 *
 * O **áudio** dos outros não é daqui. Ele fica em `AudioRemotoHost`, montado
 * com o app inteiro: a grade desmonta ao trocar de tela, e a chamada não.
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

  // Quem transmite pelo app de desktop tem **dois** participantes na sala: a
  // pessoa e o `<userId>#tela` da captura nativa. As faixas dos dois entram no
  // tile do dono — o `#tela` nunca vira uma pessoa a mais na grade.
  const tiles: Tile[] = states.flatMap((state): Tile[] => {
    const meus = participantesDe(state.user.id);
    const p = meus[0] ?? null;
    const videos = meus.flatMap(videosDe);
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
    <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-lg bg-input">
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
        className={`relative inline-grid rounded-full transition ${
          state.reconnecting ? "opacity-50" : ""
        }`}
      >
        <Avatar
          user={state.user}
          size="xl"
          surface="border-rail"
          voz={state.deafened ? "surdo" : state.muted ? "mudo" : null}
          className={`transition-transform ${ativo ? "scale-[0.925]" : ""}`}
        />
        {/* O anel fica DENTRO do Ø80: a foto encolhe 2px e ele ocupa a folga.
            Desenhado por fora, o avatar crescia quando a pessoa falava e a
            fileira inteira parecia pular a cada sílaba. */}
        {ativo && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-green"
          />
        )}
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
      // O tile **emerge** do palco: superfície mais clara que o fundo, como no
      // Discord (tile `#272324` sobre palco preto). Com `panel` sobre `chat`
      // ele afundava, e a única coisa que o separava do fundo era a moldura.
      //
      // Moldura que não existe mais: nem a linha preta, nem a borda verde de
      // quem fala. No Discord o tile não tem borda em estado nenhum — o sinal
      // de fala mora no anel do avatar, que é onde o olho já está.
      className="group relative h-full w-full overflow-hidden rounded-lg bg-input transition"
    >
      {publication ? (
        <VideoDaFaixa publication={publication} espelhar={sou && !tela} />
      ) : (
        <span className="grid h-full w-full place-items-center">
          {/* o anel acompanha o avatar, e não a caixa: num tile grande a borda
              externa fica longe demais do rosto para ler como "falando". E ele
              é desenhado por DENTRO do Ø80 — a foto encolhe 2px e o anel ocupa
              a folga —, senão o avatar cresce quando a pessoa fala e o tile
              inteiro parece pular. */}
          <span className="relative inline-grid rounded-full">
            <Avatar
              user={state.user}
              size={compacto ? "md" : "xl"}
              surface="border-input"
              className={`transition-transform ${ativo ? "scale-[0.925]" : ""}`}
            />
            {ativo && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-green"
              />
            )}
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

      {/* O rótulo de nome — que é também onde o mudo mora.
          O Discord não desenha selo circular de microfone no avatar do tile: o
          próprio rótulo vira o aviso, com o glifo cortado ANTES do nome. Pílula
          de 32px de altura, a 12px da borda esquerda e da de baixo, raio 6 e
          preto a 50% sobre o tile.
          Ela só existe quando tem o que dizer: no tile sem mudo e sem vídeo o
          Discord não desenha rótulo nenhum. Volta quando há estado a informar —
          mudo, surdo, transmissão — e no hover, para quem quiser conferir o
          nome. Com vídeo ela fica sempre: aí o quadro é uma imagem em
          movimento, e o rosto de hoje não é o de ontem. */}
      <span
        className={`pointer-events-none absolute flex items-center rounded-md bg-black/50 text-white transition-opacity ${
          // a medida é a do tile do palco; na tirinha de miniaturas (90px de
          // altura) 32px de pílula a 12px do canto comeriam o quadro
          compacto
            ? "bottom-1.5 left-1.5 h-6 max-w-[calc(100%-12px)] gap-1 px-1.5 text-xs"
            : "bottom-3 left-3 h-8 max-w-[calc(100%-24px)] gap-1.5 px-2 text-sm"
        } ${
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
        {/* surdo implica mudo: mostrar os dois glifos contaria duas vezes a
            mesma coisa. "Silenciado por você" não entra — é estado meu, não
            dele, e vive no menu de contexto.
            Branco, e não vermelho: no Discord o alarme é a presença do glifo,
            não a cor dele — e o vermelho sobre preto a 50% é o que menos se lê
            de perto. */}
        {(state.deafened || state.muted) && (
          <span
            className={`grid shrink-0 place-items-center ${compacto ? "h-3.5 w-3.5" : "h-4 w-4"}`}
          >
            {state.deafened ? (
              <HeadphoneOff size={compacto ? 12 : 14} role="img" aria-label="Sem áudio" />
            ) : (
              <MicOff size={compacto ? 12 : 14} role="img" aria-label="Mudo" />
            )}
          </span>
        )}
        <span className="truncate">
          {nome}
          {sou && " (você)"}
        </span>
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
