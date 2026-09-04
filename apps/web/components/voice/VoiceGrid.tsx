"use client";

import { useEffect, useRef, useState } from "react";
import {
  HeadphoneOff,
  Maximize,
  Maximize2,
  MicOff,
  Minimize2,
  MonitorX,
  MoreHorizontal,
  Play,
  Plus,
  UserPlus,
  Volume2,
  VolumeX,
} from "@/components/ui/icones";
import type { TrackPublication } from "livekit-client";
import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import { alternarTelaCheiaDe } from "@/components/voice/fullscreen";
import {
  FAIXA_ALTURA,
  FAIXA_GAP,
  FAIXA_LARGURA,
  FOCO_GAP,
  GAP,
  distribuir,
  melhorArranjo,
} from "@/components/voice/grid-layout";
import {
  abrirMenuDeParticipante,
  abrirVolumeDe,
  registrarVolumePopover,
} from "@/components/voice/participant-menu";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { useCorDominante } from "@/lib/cor-dominante";
import { chaveDoTileDeTela } from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { usePresence } from "@/stores/presence";
import { ui } from "@/stores/ui";
import { camerasDe, participantesDe, telasDe, useVoice } from "@/stores/voice";

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
 * **Cada pessoa tem um tile, e cada tela tem outro.** Quem transmite aparece
 * duas vezes — o avatar dela e a transmissão —, que é o que o Discord faz. E dá
 * para assistir a **várias** telas ao mesmo tempo: quem se assiste está em
 * `assistindo` na store, e é isso que decide se a faixa é baixada
 * (`aplicarAssinaturasDeTela`). Tela que ninguém abriu mostra só o convite
 * "Assistir transmissão" sobre a cor da pessoa, sem gastar rede.
 *
 * **Com um tile no palco (foco) o leiaute vira "destaque + faixa".** Medido na
 * print `2026-09-03 203909` (escala 0,8075 = 2777/3439, conferida pelo passo da
 * lista de canais — 26px → 32 — e pela cápsula de controles — 38px → 48):
 * destaque de 1458×823 px = **16:9 exato**, centralizado, com 229px de folga de
 * cada lado; vão de 6px (**8**) até a faixa; tile da faixa de 150×86 px
 * (**188×106**), também centralizado.
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
  publication: TrackPublication | null;
  tela: boolean;
  /** só para tela: a faixa está assinada porque eu escolhi assistir (ou é minha). */
  assistindo: boolean;
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
  const assistindo = useVoice((s) => s.assistindo);
  const setFocado = useVoice((s) => s.setFocado);
  const focarAutomaticamente = useVoice((s) => s.focarAutomaticamente);
  const assistir = useVoice((s) => s.assistir);
  const pararDeAssistir = useVoice((s) => s.pararDeAssistir);
  // elemento em estado (e não em ref): o palco é desmontado quando alguém sobe
  // ao destaque, e um `ref` não avisaria o observador de que voltou
  const [palco, setPalco] = useState<HTMLDivElement | null>(null);
  const tamanho = useTamanho(palco);

  // Quem transmite pelo app de desktop tem **dois** participantes na sala: a
  // pessoa e o `<userId>#tela` da captura nativa. As faixas dos dois entram nos
  // tiles do dono — o `#tela` nunca vira uma pessoa a mais na grade.
  const tiles: Tile[] = states.flatMap((state): Tile[] => {
    const meus = participantesDe(state.user.id);
    const sou = state.user.id === me?.id;
    const pessoa: Tile = {
      key: state.user.id,
      state,
      // câmera fica no tile da pessoa; tela nunca — ela tem tile próprio
      publication: meus.flatMap(camerasDe)[0] ?? null,
      tela: false,
      assistindo: false,
    };
    const telas = meus.flatMap(telasDe).map(
      (pub): Tile => ({
        key: chaveDoTileDeTela(state.user.id, pub.trackSid),
        state,
        publication: pub,
        tela: true,
        // A minha transmissão é sempre exibida, como no Discord: no navegador
        // porque a faixa é local, e no desktop porque a store assina de volta o
        // `<userId>#tela` da captura nativa (ver `assinaturas-de-tela.ts`).
        // Esconder a própria tela atrás de "Assistir" seria pedir permissão a
        // si mesmo — e foi por não haver esse pedido que ela ficou preta.
        assistindo: sou || assistindo.has(state.user.id),
      }),
    );
    return [pessoa, ...telas];
  });

  // transmissão que eu **estou assistindo** assume o palco sozinha (Discord).
  // Só quando ninguém escolheu nada à mão — ver `focoAutomatico` na store —, e
  // só depois de assistida: subir ao palco uma tela fechada daria o convite
  // "Assistir transmissão" em tamanho de cinema.
  const telaAssistida = tiles.find((t) => t.tela && t.assistindo) ?? null;
  const chaveDaTela = telaAssistida?.key ?? null;
  useEffect(() => {
    if (focoAutomatico && chaveDaTela && focado !== chaveDaTela) {
      focarAutomaticamente(chaveDaTela);
    }
  }, [focoAutomatico, chaveDaTela, focado, focarAutomaticamente]);

  // sem nenhuma faixa publicada, uma conversa direta é fileira de avatares
  const modoAvatares = !guildId && tiles.every((t) => !t.publication && !t.tela);

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

  // Foco: um tile grande em cima, o resto numa faixa embaixo. A chave é a do
  // tile (`userId` ou `userId:sid`), não o id da pessoa — quem assiste a duas
  // telas tem dois tiles do mesmo dono; o casamento por id fica como reserva
  // para quem tenha guardado só a pessoa.
  const principal =
    (focado ? tiles.find((t) => t.key === focado) : null) ??
    (focado ? tiles.find((t) => t.state.user.id === focado) : null) ??
    null;
  const resto = principal ? tiles.filter((t) => t.key !== principal.key) : tiles;

  const acoes = {
    meId: me?.id,
    falando,
    channelId,
    onFocar: setFocado,
    // assistir e subir ao palco são o mesmo gesto: ninguém abre uma
    // transmissão para vê-la do tamanho de um selo. `setFocado` alterna, então
    // só se chama quando o tile ainda não é o do palco.
    onAssistir: (userId: string, chave: string) => {
      assistir(userId);
      if (focado !== chave) setFocado(chave);
    },
    onPararDeAssistir: pararDeAssistir,
  };

  if (principal) {
    const foco = melhorArranjo(1, tamanho.largura, tamanho.altura);
    return (
      <div className="flex h-full min-h-0 flex-col items-center" style={{ gap: FOCO_GAP }}>
        {/* o destaque mantém 16:9 e fica centralizado nos dois eixos, como na
            print: é `melhorArranjo` com uma vaga só */}
        <div
          ref={setPalco}
          className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
        >
          <div style={{ width: foco.largura, height: foco.altura }}>
            <VoiceTile tile={principal} {...acoes} grande />
          </div>
        </div>

        {resto.length > 0 && (
          <div
            className="flex shrink-0 justify-center overflow-x-auto"
            style={{ gap: FAIXA_GAP, height: FAIXA_ALTURA }}
          >
            {resto.map((t) => (
              <div
                key={t.key}
                className="shrink-0"
                style={{ width: FAIXA_LARGURA, height: FAIXA_ALTURA }}
              >
                <VoiceTile tile={t} {...acoes} compacto />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Com uma pessoa só na sala o Discord não deixa o palco pela metade: a vaga
  // vazia vira o convite. Com mais gente ele some — aí a grade é a própria
  // sala, e o convite continua a um clique na barra lateral.
  const comConvite = !!guildId && resto.length === 1;
  const celulas: Celula[] = [
    ...resto.map((t) => ({ tipo: "tile" as const, t })),
    ...(comConvite ? [{ tipo: "convite" as const }] : []),
  ];

  const arranjo = melhorArranjo(celulas.length, tamanho.largura, tamanho.altura);
  const linhas = distribuir(celulas.length, arranjo.colunas);
  let indice = 0;

  return (
    <div
      ref={setPalco}
      className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden"
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
                  <VoiceTile tile={c.t} {...acoes} />
                ) : (
                  <TileDeConvite guildId={guildId as string} />
                )}
              </div>
            ))}
          </div>
        );
      })}
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
  falando: ReadonlySet<string>;
  channelId: string;
}) {
  const { state } = tile;
  const sou = state.user.id === meId;
  const nome = displayNameOf(state.user);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história.
  // A conta é só esta — `participant.isSpeaking` saiu de cena: era uma segunda
  // fonte, lida no render em vez de reagir a evento, e é dela que vinham as
  // duas divergências (palco aceso e lista apagada; palco piscando).
  const ativo = !state.muted && falando.has(state.user.id);

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
          surface="border-void"
          voz={state.deafened ? "surdo" : state.muted ? "mudo" : null}
          className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""}`}
        />
        {/* O anel fica DENTRO do Ø80: a foto encolhe 2px e ele ocupa a folga.
            Desenhado por fora, o avatar crescia quando a pessoa falava e a
            fileira inteira parecia pular a cada sílaba. */}
        {ativo && <AnelDeFala />}
      </span>
    </Tooltip>
  );
}

/**
 * Um participante: vídeo quando há, avatar quando não.
 *
 * O fundo é a **cor dominante da foto** (ver `lib/cor-dominante.ts`), como no
 * Discord: medido na print `203909`, o fundo do tile e o fundo do avatar são o
 * mesmo pixel. Quem não tem foto fica na cor do avatar sem imagem, que já é
 * estável por id.
 */
function VoiceTile({
  tile,
  meId,
  falando,
  channelId,
  onFocar,
  onAssistir,
  onPararDeAssistir,
  grande = false,
  compacto = false,
}: {
  tile: Tile;
  meId?: string;
  falando: ReadonlySet<string>;
  channelId: string;
  onFocar: (chave: string | null) => void;
  onAssistir: (userId: string, chave: string) => void;
  onPararDeAssistir: (userId: string) => void;
  grande?: boolean;
  compacto?: boolean;
}) {
  const { state, publication, tela, assistindo } = tile;
  const sou = state.user.id === meId;
  const caixa = useRef<HTMLDivElement>(null);
  const silenciado = useVoice((s) => !!s.silenciados[state.user.id]);
  const toggleSilenciado = useVoice((s) => s.toggleSilenciado);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história.
  // A conta é só esta — `participant.isSpeaking` saiu de cena: era uma segunda
  // fonte, lida no render em vez de reagir a evento, e é dela que vinham as
  // duas divergências (palco aceso e lista apagada; palco piscando).
  const ativo = !state.muted && falando.has(state.user.id);
  const nome = displayNameOf(state.user);
  // a foto ao vivo, pelo mesmo caminho do `Avatar`: quem troca a foto troca
  // também a cor do tile, sem F5
  const perfil = usePresence((e) => e.profiles[state.user.id]);
  const fundo = useCorDominante((perfil ?? state.user).avatarUrl, corDoAvatar(state.user.id));
  /** só mostra vídeo quando há faixa: tela fechada não tem o que desenhar. */
  const video = publication?.track ? publication : null;

  return (
    <div
      ref={caixa}
      data-voice-tile={tile.key}
      // Um clique põe no palco, e o clique no que já está no palco volta para a
      // grade (`setFocado` alterna). Era duplo clique: ninguém adivinha isso, e
      // a print mostra o Discord trocando de foco com um toque só. Os botões de
      // dentro param a propagação — senão "silenciar" também mexeria no palco.
      onClick={() => onFocar(tile.key)}
      onContextMenu={(e) => {
        e.preventDefault();
        abrirMenuDeParticipante(e.clientX, e.clientY, state.user, { sou, channelId });
      }}
      aria-label={`${nome}${tela ? " — tela compartilhada" : ""}`}
      // O tile **emerge** do palco na cor da pessoa (ver o comentário do
      // componente). Sem foto, `corDoAvatar` — e com vídeo o `<video>` cobre
      // tudo, então a cor só aparece nas bordas do `object-contain`.
      //
      // Moldura que não existe mais: nem a linha preta, nem a borda verde de
      // quem fala. No Discord o tile não tem borda em estado nenhum — o sinal
      // de fala mora no anel do avatar, que é onde o olho já está.
      style={{ backgroundColor: fundo }}
      className="group relative h-full w-full overflow-hidden rounded-lg transition"
    >
      {video ? (
        <VideoDaFaixa publication={video} espelhar={sou && !tela} />
      ) : tela ? (
        // Sem faixa. Ou a tela não se assiste ainda — e aí o convite logo
        // abaixo é tudo o que há para ver —, ou ela já foi assinada e o
        // primeiro quadro está a caminho: assinar é uma ida e volta ao
        // servidor de mídia, e um retângulo mudo nesse intervalo é
        // indistinguível de uma transmissão quebrada (foi como a tela preta
        // apareceu na print da 0.0.18).
        <span className="grid h-full w-full place-items-center px-3 text-center text-xs text-white/70">
          {assistindo ? "Carregando a transmissão…" : null}
        </span>
      ) : (
        <span className="grid h-full w-full place-items-center">
          {/* o anel acompanha o avatar, e não a caixa: num tile grande a borda
              externa fica longe demais do rosto para ler como "falando". E ele
              é desenhado por DENTRO do avatar — a foto encolhe 2px e o anel
              ocupa a folga —, senão o avatar cresce quando a pessoa fala e o
              tile inteiro parece pular.

              80px no tile do palco (medido na print `2026-08-31 101857`, 1:1:
              avatar de 80 num tile de 760×428) e 64 na faixa de miniaturas
              (medido em `203909`: ~68px num tile de 188×106 — o avatar do
              Discord é quase constante, não uma fração do tile). */}
          <span className="relative inline-grid rounded-full">
            <Avatar
              user={state.user}
              size="xl"
              surface="border-input"
              className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""} ${
                compacto
                  ? "h-16 w-16 [&>img]:h-16 [&>img]:w-16 [&>span]:h-16 [&>span]:w-16 [&>span]:text-xl"
                  : ""
              }`}
            />
            {ativo && <AnelDeFala />}
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

      {/* Convite para abrir uma transmissão que ainda não estou assistindo.
          Pílula de 32px de altura, e não a chapa que cobria o tile inteiro: o
          botão gigante escondia justamente o tile que ele anuncia (print nosso
          `2026-09-03 203457`). Não há print do Discord com este botão — os 32
          são a medida do resto da interface, não medição. */}
      {tela && !assistindo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssistir(state.user.id, tile.key);
          }}
          aria-label={`Assistir à transmissão de ${nome}`}
          className="absolute inset-0 grid place-items-center"
        >
          <span
            className={`flex h-8 items-center rounded-full bg-accent font-semibold text-accent-ink shadow-high transition group-hover:brightness-110 ${
              compacto ? "w-8 justify-center" : "gap-2 px-3 text-[13px]"
            }`}
          >
            <Play size={14} aria-hidden="true" />
            {!compacto && "Assistir transmissão"}
          </span>
        </button>
      )}

      {/* "Ao vivo" é selo próprio no canto **superior direito**, não um pedaço
          do rótulo de nome. No Discord os dois convivem: o nome embaixo à
          esquerda, o aviso de transmissão em cima à direita. Dentro do rótulo
          ele competia com o nome pela mesma linha e sumia junto com ela. */}
      {tela && (
        // some no hover: as ações do tile moram neste mesmo canto, e as duas
        // coisas empilhadas viravam um borrão vermelho com botões por cima. O
        // selo diz "isto é uma transmissão", que é informação de relance — no
        // hover a pergunta já é outra
        <span
          className={`pointer-events-none absolute rounded-[4px] bg-red font-bold uppercase leading-none tracking-[0.02em] text-white transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 ${
            compacto ? "right-1.5 top-1.5 px-1 py-0.5 text-[9px]" : "right-3 top-3 px-1.5 py-1 text-[10px]"
          }`}
        >
          Ao vivo
        </span>
      )}

      {/* O rótulo de nome — que é também onde o mudo mora.
          O Discord não desenha selo circular de microfone no avatar do tile: o
          próprio rótulo vira o aviso, com o glifo cortado ANTES do nome.
          Pílula de 32px de altura, a 12px da borda esquerda e da de baixo —
          medida nas duas prints: 101857 a 1:1 dá 32 e 12; 203909 dá 26px e
          8–9px de folga, que na escala de 0,8075 são os mesmos 32 e 12. Na
          faixa de miniaturas a folga cai para 4px, que é o que a print mostra.
          Ela só existe quando tem o que dizer: no tile sem mudo e sem vídeo o
          Discord não desenha rótulo nenhum. Volta quando há estado a informar —
          mudo, surdo, transmissão — e no hover, para quem quiser conferir o
          nome. Com vídeo ela fica sempre: aí o quadro é uma imagem em
          movimento, e o rosto de hoje não é o de ontem. */}
      <span
        className={`pointer-events-none absolute flex h-8 items-center gap-1.5 rounded-lg bg-black/50 px-2 text-sm text-white transition-opacity ${
          compacto ? "bottom-1 left-1 max-w-[calc(100%-8px)]" : "bottom-3 left-3 max-w-[calc(100%-24px)]"
        } ${
          video || tela || state.muted || state.deafened
            ? ""
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        {/* surdo implica mudo: mostrar os dois glifos contaria duas vezes a
            mesma coisa. "Silenciado por você" não entra — é estado meu, não
            dele, e vive no menu de contexto.
            Branco, e não vermelho: no Discord o alarme é a presença do glifo,
            não a cor dele — e o vermelho sobre preto a 50% é o que menos se lê
            de perto. */}
        {(state.deafened || state.muted) && !tela && (
          <span className="grid h-4 w-4 shrink-0 place-items-center">
            {state.deafened ? (
              <HeadphoneOff size={14} role="img" aria-label="Sem áudio" />
            ) : (
              <MicOff size={14} role="img" aria-label="Mudo" />
            )}
          </span>
        )}
        <span className="truncate">
          {nome}
          {sou && !tela && " (você)"}
        </span>
      </span>

      {/* Ações do hover, no canto superior direito. Numa tela **já assistida** o
          que falta não é "assistir", é sair dela: entra o botão de parar,
          pequeno, ao lado do "…" que a print mostra no tile da faixa. */}
      <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
        {tela
          ? assistindo &&
            !sou && (
              <AcaoDoTile
                label={`Parar de assistir a ${nome}`}
                onClick={() => onPararDeAssistir(state.user.id)}
              >
                <MonitorX size={14} />
              </AcaoDoTile>
            )
          : !sou && (
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
          onClick={() => onFocar(tile.key)}
        >
          {grande ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </AcaoDoTile>
        {!compacto && (
          <AcaoDoTile label="Tela cheia" onClick={() => void alternarTelaCheiaDe(caixa.current)}>
            <Maximize size={14} />
          </AcaoDoTile>
        )}
        <AcaoDoTile
          label={`Mais opções de ${nome}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            abrirMenuDeParticipante(r.left, r.bottom + 4, state.user, { sou, channelId });
          }}
        >
          <MoreHorizontal size={14} />
        </AcaoDoTile>
      </div>
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
        onClick={(e) => {
          // o tile inteiro é clicável (põe no palco): sem isto, silenciar
          // alguém também trocaria o foco
          e.stopPropagation();
          onClick(e);
        }}
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

/**
 * `<video>` colado numa faixa do SDK; solta a faixa ao trocar/desmontar.
 *
 * Exportado porque a miniatura ao vivo do hover (`PreviaDeTela`) desenha a
 * mesma faixa noutro lugar da tela, e duplicar o `attach`/`detach` é a receita
 * de deixar faixa pendurada quando o pop-up fecha.
 */
export function VideoDaFaixa({
  publication,
  espelhar = false,
  ajuste = "object-contain",
}: {
  publication: TrackPublication;
  espelhar?: boolean;
  /** `object-cover` na miniatura, que é pequena demais para letterbox. */
  ajuste?: string;
}) {
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
      className={`h-full w-full bg-black ${ajuste} ${espelhar ? "-scale-x-100" : ""}`}
    />
  );
}
