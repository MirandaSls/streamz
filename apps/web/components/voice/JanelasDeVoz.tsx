"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  RemoteTrackPublication,
  RemoteVideoTrack,
  type ElementInfo,
  type Track,
  type TrackPublication,
} from "livekit-client";
import { displayNameOf } from "@streamz/shared";
import { HeadphoneOff, MicOff, Monitor } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { chaveDoTileDeTela, usePreviaDaMinhaTela } from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { useJanelasDeVoz, type JanelaDeVoz } from "@/stores/janelas-de-voz";
import {
  aplicarAssinaturasDeTela,
  camerasDe,
  participantesDe,
  telasDe,
  useVoice,
} from "@/stores/voice";

/**
 * O conteúdo das janelas soltas da chamada ("Usuário em Nova Janela" e
 * "Transmissão em Nova Janela").
 *
 * Quem **abre** a janela é `lib/janela-solta.ts` (dentro do gesto); aqui só se
 * desenha, por `createPortal` para o `document.body` dela. O vídeo sai da mesma
 * sala e do mesmo `MediaStreamTrack` que o palco já tem — a janela é uma tela a
 * mais da mesma árvore React, não um segundo app.
 *
 * Montado **uma vez**, no `VoiceLayer`, e não no palco: a janela tem de
 * sobreviver à navegação da aba principal (trocar de canal de texto desmonta o
 * palco, e a chamada continua).
 */

/**
 * Quanto uma janela espera, com a pessoa ou a transmissão sumida, antes de
 * fechar. Sem folga, qualquer buraco de um `tick` fecharia a janela: a
 * publicação some e volta quando a câmera é republicada (troca de dispositivo),
 * e o estado de voz é reescrito inteiro a cada `voice.state`. Dois segundos
 * cobrem isso sem deixar uma janela órfã tempo bastante para parecer quebrada.
 */
const CARENCIA_DE_AUSENCIA_MS = 2000;

export default function JanelasDeVoz() {
  const janelas = useJanelasDeVoz((s) => s.janelas);
  const channelId = useVoice((s) => s.channelId);

  // Saiu da chamada (ou trocou de sala): as janelas eram da sala anterior. Não
  // basta a carência por ausência lá embaixo — ao sair, a sala inteira some de
  // uma vez, e fechar tudo já é a resposta certa sem esperar dois segundos.
  const canalAnterior = useRef(channelId);
  useEffect(() => {
    const anterior = canalAnterior.current;
    canalAnterior.current = channelId;
    if (!channelId || (anterior && anterior !== channelId)) {
      useJanelasDeVoz.getState().fecharTodas();
    }
  }, [channelId]);

  if (!channelId) return null;

  return (
    <>
      {Object.entries(janelas).map(([chave, janela]) =>
        // janela fechada sem `pagehide` (a aba congelou): o `document` dela já
        // não aceita nós, e o `jaAberta` da próxima consulta limpa a entrada
        janela.win.closed
          ? null
          : createPortal(
              <ConteudoDaJanela chave={chave} janela={janela} channelId={channelId} />,
              janela.win.document.body,
              chave,
            ),
      )}
    </>
  );
}

// ── o conteúdo de uma janela ──────────────────────────────────────────────

function ConteudoDaJanela({
  chave,
  janela,
  channelId,
}: {
  chave: string;
  janela: JanelaDeVoz;
  channelId: string;
}) {
  const { tipo, userId, win } = janela;
  // `tick` é o pulso dos eventos do SDK: faixa publicada, assinada, saindo
  useVoice((s) => s.tick);
  const meId = useAuth((s) => s.user?.id);
  // direto do mapa, e não `statesOf`: aquele ordena uma cópia a cada chamada e
  // o seletor devolveria referência nova em todo render
  const state = useVoice(
    (s) => s.states[channelId]?.find((e) => e.user.id === userId) ?? null,
  );
  const falando = useVoice((s) => s.falando.has(userId));

  const publication = publicacaoDaJanela(janela);
  const ausente = !state || (tipo === "tela" && !publication);

  useAssinaturaDaTela(janela, meId, publication);

  // Pessoa saiu da chamada, ou parou de transmitir: a janela não tem mais o que
  // mostrar. Câmera desligada **não** fecha — cai no avatar, como o tile.
  useEffect(() => {
    if (!ausente) return;
    // relógio da janela principal: o da janela solta morre com ela
    const id = window.setTimeout(
      () => useJanelasDeVoz.getState().fechar(chave),
      CARENCIA_DE_AUSENCIA_MS,
    );
    return () => window.clearTimeout(id);
  }, [ausente, chave]);

  if (!state) return <div className="fixed inset-0 bg-black" />;

  const sou = userId === meId;
  const tela = tipo === "tela";
  const nome = displayNameOf(state.user);
  const track = publication?.track ?? null;
  const ativo = !state.muted && falando;

  return (
    <div
      role="region"
      aria-label={tela ? `Transmissão de ${nome}` : nome}
      className="fixed inset-0 select-none overflow-hidden bg-black"
    >
      {track ? (
        <VideoNaJanela
          key={track.sid ?? track.mediaStreamTrack.id}
          track={track}
          win={win}
          // a própria câmera espelhada, como no tile: é assim que a pessoa se
          // reconhece; a tela nunca, senão o texto sairia ao contrário
          espelhar={sou && !tela}
        />
      ) : tela ? (
        // publicação existe mas a faixa ainda não chegou: assinar é uma ida e
        // volta ao servidor de mídia, e um preto mudo nesse intervalo lê como
        // transmissão quebrada (mesmo texto do tile)
        <span className="grid h-full w-full place-items-center px-3 text-center text-xs text-text-overlay-light/70">
          Carregando a transmissão…
        </span>
      ) : (
        <span className="grid h-full w-full place-items-center">
          <span className="relative inline-grid rounded-full">
            <Avatar
              user={state.user}
              size="xl"
              surface="border-black"
              className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""}`}
            />
            {ativo && <AnelDeFala />}
          </span>
        </span>
      )}

      {/* Moldura de fala com câmera aberta: sem avatar onde pendurar o anel, o
          sinal vai para a borda — a mesma geometria do tile, aqui com raio 0
          porque a moldura é a própria janela. */}
      {track && !tela && ativo && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_2px_rgb(var(--status-positive-rgb)),inset_0_0_0_3px_rgb(var(--black-rgb))]"
        />
      )}

      {state.reconnecting && (
        <span className="absolute inset-0 grid place-items-center bg-background-scrim text-xs font-semibold text-text-overlay-light">
          Reconectando…
        </span>
      )}

      {/* Rótulo de nome com as medidas do tile do palco (pílula de 32, a 12 da
          borda, glifo de 16 antes do nome) — ver o comentário do rótulo em
          `TileDeVoz.tsx`. Repetido aqui, e não exportado de lá, porque o de lá
          carrega os ramos do celular e da miniatura que a janela não tem. */}
      <span
        className={`pointer-events-none absolute bottom-3 left-3 flex h-8 max-w-[calc(100%-24px)] items-center gap-1.5 rounded-lg bg-control-overlay-secondary-background-default pr-3 text-sm text-control-overlay-secondary-text-default ${
          tela || state.muted || state.deafened ? "pl-2" : "pl-3"
        }`}
      >
        {tela ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center">
            <Monitor size={16} role="img" aria-label="Tela compartilhada" />
          </span>
        ) : (
          (state.deafened || state.muted) && (
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              {state.deafened ? (
                <HeadphoneOff size={16} role="img" aria-label="Sem áudio" />
              ) : (
                <MicOff size={16} role="img" aria-label="Mudo" />
              )}
            </span>
          )
        )}
        <span className="truncate">
          {nome}
          {sou && !tela && " (você)"}
        </span>
      </span>
    </div>
  );
}

/**
 * A publicação que a janela desenha, pelo mesmo caminho da grade
 * (`VoiceGrid`): câmera pela `camerasDe` (só com faixa viva) e tela pela
 * `telasDe` (com ou sem faixa, porque a tela desassinada ainda existe). O
 * `participantesDe` já junta a pessoa e o `<userId>#tela` da captura nativa.
 *
 * A minha tela no navegador é a faixa **local** do meu participante — a mesma
 * que o tile mostra, sem ida ao servidor.
 */
function publicacaoDaJanela({ tipo, userId }: JanelaDeVoz): TrackPublication | null {
  const participantes = participantesDe(userId);
  if (tipo === "usuario") return participantes.flatMap(camerasDe)[0] ?? null;
  return participantes.flatMap(telasDe)[0] ?? null;
}

/**
 * Garante que a transmissão da janela é baixada enquanto ela estiver aberta.
 *
 * **Tela de outra pessoa:** o mesmo `assistir` do botão "Assistir" do tile —
 * a regra de assinatura inteira continua morando em `assinaturas-de-tela.ts`,
 * e a janela é só mais alguém pedindo para ver. Ao fechar, solta **só se** a
 * janela foi quem pediu: quem já assistia antes continua assistindo. A exceção
 * é a pessoa ter posto a tela no destaque do palco **com a mão** nesse meio
 * tempo (`focoAutomatico` falso): aí ela está olhando no palco, e soltar
 * apagaria o que ela acabou de escolher. Foco automático não conta — é o
 * próprio `assistir` da janela que o provoca.
 *
 * **A minha tela pela captura nativa** (`<userId>#tela`, remota para o meu
 * cliente): ela não se assina sozinha, e o caminho é o "Ver prévia" do tile
 * (`usePreviaDaMinhaTela`), sempre em camada baixa — inclusive quando a
 * origem é a janela solta que `abrirMenuDaMinhaTela` oferece para a própria
 * transmissão (`podeAbrirJanelaSolta`, liberada no desktop pelo
 * `on_new_window` de `lib.rs`): o efeito abaixo entra nesse caso e a janela
 * não nasce preta. A minha tela no navegador (sem captura nativa) é local e
 * não se assina.
 */
function useAssinaturaDaTela(
  { tipo, userId }: JanelaDeVoz,
  meId: string | undefined,
  publication: TrackPublication | null,
): void {
  const sou = !!meId && userId === meId;
  // só a publicação remota da minha tela precisa de prévia; o sid identifica o
  // tile (`chaveDoTileDeTela`), e muda se a transmissão recomeçar
  const sidDaMinhaTelaNativa =
    tipo === "tela" && sou && publication instanceof RemoteTrackPublication
      ? publication.trackSid
      : null;

  useEffect(() => {
    if (tipo !== "tela" || !meId || userId === meId) return;
    const jaAssistia = useVoice.getState().assistindo.has(userId);
    if (!jaAssistia) useVoice.getState().assistir(userId);
    return () => {
      if (jaAssistia) return;
      const s = useVoice.getState();
      // saiu da chamada: o `leave` já zerou tudo, e não há sala onde desassinar
      if (!s.channelId || !s.assistindo.has(userId)) return;
      const escolhidaNoPalco =
        !s.focoAutomatico && !!s.focado && s.focado.startsWith(`${userId}:`);
      if (!escolhidaNoPalco) s.pararDeAssistir(userId);
    };
  }, [tipo, userId, meId]);

  useEffect(() => {
    if (!sidDaMinhaTelaNativa || !meId) return;
    const chave = chaveDoTileDeTela(meId, sidDaMinhaTelaNativa);
    const anterior = usePreviaDaMinhaTela.getState().chave;
    if (anterior === chave) return; // a prévia do tile já estava ligada: não é nossa
    usePreviaDaMinhaTela.setState({ chave });
    aplicarAssinaturasDeTela();
    return () => {
      // só desfaz se ninguém mexeu depois (o "Ocultar"/"Ver prévia" do tile
      // passa a ser a escolha que vale)
      if (usePreviaDaMinhaTela.getState().chave !== chave) return;
      usePreviaDaMinhaTela.setState({ chave: anterior });
      aplicarAssinaturasDeTela();
    };
  }, [sidDaMinhaTelaNativa, meId]);
}

// ── o <video> na outra janela ─────────────────────────────────────────────

/**
 * `<video>` colado na faixa, **dentro da janela solta**.
 *
 * Não é o `VideoDaFaixa` do tile por causa do `adaptiveStream` do LiveKit
 * (ligado na sala, `stores/voice.ts`). Com ele, o `attach` cria um observador
 * de visibilidade para o elemento — um `IntersectionObserver` da **janela
 * principal** — e o SDK pede ao servidor para pausar a faixa quando nenhum
 * elemento dela está visível. Um elemento noutra janela nunca cruza o viewport
 * da principal: numa popup o vídeo congelaria no primeiro quadro (ou nem
 * começaria) sempre que o tile do palco não estivesse na tela junto. E mesmo
 * visível, o SDK pausa tudo quando a **aba principal** vai para segundo plano
 * (`pauseVideoInBackground`) — exatamente o momento em que alguém abre uma
 * janela solta.
 *
 * A saída é a API que o SDK tem para isso: `observeElementInfo` com um
 * `ElementInfo` nosso (`infoDaJanela`), que mede o elemento na janela dele e
 * responde à visibilidade **dela**. O do `attach` continua lá, dizendo
 * "invisível"; o SDK considera visível se **algum** estiver.
 */
function VideoNaJanela({
  track,
  win,
  espelhar,
}: {
  track: Track;
  win: Window;
  espelhar: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    // O `attach` decide `playsInline` e o empurrão de `play()` do Safari/
    // Firefox com `instanceof HTMLVideoElement` — que é falso para um elemento
    // de outra janela (outro realm). Os atributos vêm do JSX; o `play()` vem
    // daqui. Faixa muda, sem áudio: o autoplay não é bloqueado.
    el.play().catch(() => {
      /* o `autoPlay` segue tentando; não há o que avisar */
    });

    // Faixa local (a minha câmera, a minha tela no navegador) não tem
    // adaptiveStream: nada a observar.
    const info =
      track instanceof RemoteVideoTrack && track.isAdaptiveStream ? infoDaJanela(el, win) : null;
    if (info && track instanceof RemoteVideoTrack) track.observeElementInfo(info);

    return () => {
      // antes do `detach`: ele também remove infos com `element === el`, e
      // parar duas vezes é inofensivo, mas deixar o nosso sem `stopObserving`
      // vazaria o `ResizeObserver` e o ouvinte de visibilidade da janela
      if (info && track instanceof RemoteVideoTrack) track.stopObservingElementInfo(info);
      track.detach(el);
      // solta a referência ao `MediaStream` da janela principal: sem isto o
      // elemento (que pode sobreviver no documento até a janela fechar) segura
      // a faixa viva
      el.srcObject = null;
    };
  }, [track, win]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      // `contain` sempre: numa janela que a pessoa redimensiona à vontade,
      // cortar a borda de uma tela é cortar o texto que ela abriu para ler
      className={`h-full w-full bg-black object-contain ${espelhar ? "-scale-x-100" : ""}`}
    />
  );
}

/**
 * O `ElementInfo` de um `<video>` que mora numa janela solta.
 *
 * - **Tamanho:** medido no próprio elemento, com um `ResizeObserver` **da
 *   janela solta** — é o tamanho dela que decide a camada do simulcast pedida
 *   (janela grande = camada alta). O `ResizeObserver` da principal não é
 *   garantido para elemento de outro documento.
 * - **Visível:** a janela não estar minimizada/oculta
 *   (`document.visibilityState` **dela**). Minimizar pausa de verdade — é
 *   banda que ninguém está vendo —, e voltar retoma.
 * - **`pictureInPicture` junto com `visible`:** é o único sinal que o SDK
 *   deixa passar por cima da pausa de segundo plano da aba **principal**
 *   (`updateVisibility`: `visível && !emSegundoPlano || pip`). Sem ele, a
 *   janela congelaria ao trocar de aba na principal.
 *
 * Os dois modos usam este mesmo objeto. No Document PiP o `attach` já daria
 * conta sozinho (o SDK procura o elemento na janela do PiP), mas ele mede a
 * visibilidade uma vez no `attach` e depende de um evento `enter` que, com a
 * janela já aberta antes do portal, não vem mais — e fica sujeito à mesma
 * pausa de segundo plano. Um caminho só, que funciona nos dois, é mais barato
 * de manter do que dois que falham de jeitos diferentes.
 */
function infoDaJanela(el: HTMLVideoElement, win: Window): ElementInfo {
  const doc = win.document;
  let observador: ResizeObserver | null = null;

  const aoMudarVisibilidade = () => {
    const visivel = doc.visibilityState !== "hidden";
    if (visivel === info.visible) return;
    info.visible = visivel;
    info.pictureInPicture = visivel;
    info.visibilityChangedAt = Date.now();
    info.handleVisibilityChanged?.();
  };

  const info: ElementInfo = {
    element: el,
    width: () => el.clientWidth,
    height: () => el.clientHeight,
    visible: doc.visibilityState !== "hidden",
    pictureInPicture: doc.visibilityState !== "hidden",
    visibilityChangedAt: undefined,
    observe() {
      // o construtor da própria janela: observador e elemento no mesmo realm
      const Construtor =
        (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ??
        ResizeObserver;
      observador = new Construtor(() => info.handleResize?.());
      observador.observe(el);
      doc.addEventListener("visibilitychange", aoMudarVisibilidade);
    },
    stopObserving() {
      observador?.disconnect();
      observador = null;
      doc.removeEventListener("visibilitychange", aoMudarVisibilidade);
    },
  };
  return info;
}
