"use client";

import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";
import { ehIdentidadeDeTela } from "@streamz/shared";
import {
  mixDaFaixa,
  ouvintesRemotos,
  saidaEscolhida,
  usarGrafoDeGanho,
} from "@/components/voice/audio-remoto";
import { FONTE, TIPO_DE_FAIXA } from "@/lib/livekit";
import { useSilencioDoServidor } from "@/hooks/useSilencioDoServidor";
import { saidaCalada } from "@/stores/teste-de-microfone";
import { useAuth } from "@/stores/auth";
import { participantesDaSala, participantesDe, useVoice } from "@/stores/voice";
import { donoDoParticipante } from "@/stores/voice-falantes";
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
  // junto com o da pessoa, e o meu próprio `#tela` não volta para mim. O bot
  // de música (`bot:<snowflake>`) vira o `userId` dele pelo metadata — é sob
  // essa chave que o menu grava volume e "Silenciar" (`donoDoParticipante`).
  const donos = participantesDaSala().map(donoDoParticipante);
  return (
    <>
      {ouvintesRemotos(estados, donos, meuId).map((userId) => (
        <AudioDoParticipante key={`audio-${userId}`} userId={userId} />
      ))}
    </>
  );
}

/**
 * Áudio de um participante remoto: **todas** as faixas de áudio dele — o
 * microfone e, quando transmite, o áudio da tela (que no desktop chega pelo
 * participante `#tela`). Um `<audio>` por faixa. Voz e transmissão são
 * independentes (como no Discord): volume e "silenciar" da pessoa valem só
 * para o microfone; a faixa de tela obedece apenas ao silenciar-só-a-tela
 * (`telaSilenciada`), com volume 100%. Volume geral e ensurdecer valem nas duas.
 */
export function AudioDoParticipante({ userId }: { userId: string }) {
  useVoice((s) => s.tick);
  const faixas = participantesDe(userId).flatMap((p) =>
    Array.from(p.trackPublications.values())
      .filter((pub) => pub.kind === TIPO_DE_FAIXA.Audio && !!pub.track)
      .map((pub) => ({
        sid: pub.trackSid,
        faixa: pub.track as Track,
        // a faixa é "de tela" pelo `source` (navegador) ou pela identidade
        // `<userId>#tela` (captura nativa do desktop) — ver `ehIdentidadeDeTela`
        deTela: pub.source === FONTE.ScreenShareAudio || ehIdentidadeDeTela(p.identity),
      })),
  );
  return (
    <>
      {faixas.map(({ sid, faixa, deTela }) => (
        <AudioDaFaixa key={sid} userId={userId} faixa={faixa} deTela={deTela} />
      ))}
    </>
  );
}

type ContextoComSaida = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/**
 * O grafo do Web Audio de uma faixa: fonte → ganho → saída do contexto.
 *
 * `fonte` e `trilha` andam juntas: a fonte é refeita quando a
 * `MediaStreamTrack` da faixa muda (o SDK troca a trilha por baixo do mesmo
 * `Track` numa reconexão). `saida` é o id que o contexto já recebeu em
 * `setSinkId` ("" = padrão) e `saidaPronta` fica falsa enquanto essa troca
 * está pendente — até lá quem toca é o elemento, que já está no dispositivo
 * certo, para o começo do som não escapar pela caixa padrão.
 */
type GrafoDeGanho = {
  ctx: ContextoComSaida;
  ganho: GainNode;
  fonte: MediaStreamAudioSourceNode | null;
  trilha: MediaStreamTrack | null;
  saida: string;
  saidaPronta: boolean;
  soltar: () => void;
};

function construtorDeContexto(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

function contextoTemSinkId(Ctor: typeof AudioContext | undefined): boolean {
  return typeof (Ctor?.prototype as ContextoComSaida | undefined)?.setSinkId === "function";
}

/**
 * Cria o contexto e o ganho (ainda sem fonte) e cuida de tirá-lo do
 * `suspended`.
 *
 * O contexto nasce fora do gesto do usuário (num effect, depois de mexer no
 * volume), e no WebView2 a política de autoplay o deixa suspenso. Tenta-se o
 * `resume()` na hora; se não pegar, um par de ouvintes de `pointerdown` /
 * `keydown` no `window` tenta de novo no próximo gesto e sai sozinho quando o
 * contexto roda. `statechange` avisa `aoMudar` para o componente trocar quem
 * toca — enquanto o contexto não roda, o elemento continua tocando (ver
 * `mixDaFaixa`), então suspenso nunca significa mudo.
 */
function montarGrafo(Ctor: typeof AudioContext, aoMudar: () => void): GrafoDeGanho {
  const ctx: ContextoComSaida = new Ctor();
  let gestoPreso = false;
  const retomar = () => {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  };
  const prenderGesto = () => {
    if (gestoPreso) return;
    gestoPreso = true;
    window.addEventListener("pointerdown", retomar, true);
    window.addEventListener("keydown", retomar, true);
  };
  const soltarGesto = () => {
    if (!gestoPreso) return;
    gestoPreso = false;
    window.removeEventListener("pointerdown", retomar, true);
    window.removeEventListener("keydown", retomar, true);
  };
  const aoMudarEstado = () => {
    if (ctx.state === "running") soltarGesto();
    else if (ctx.state === "suspended") prenderGesto();
    aoMudar();
  };
  ctx.addEventListener("statechange", aoMudarEstado);

  try {
    const ganho = ctx.createGain();
    // nasce calado: quem decide o ganho é `mixDaFaixa`, depois de a fonte e a
    // saída estarem prontas
    ganho.gain.value = 0;
    ganho.connect(ctx.destination);
    const grafo: GrafoDeGanho = {
      ctx,
      ganho,
      fonte: null,
      trilha: null,
      saida: "",
      saidaPronta: true,
      soltar: () => {
        ctx.removeEventListener("statechange", aoMudarEstado);
        soltarGesto();
      },
    };
    if (ctx.state !== "running") {
      void ctx
        .resume()
        .catch(() => {})
        .then(() => {
          if (ctx.state === "suspended") prenderGesto();
        });
    }
    return grafo;
  } catch (e) {
    ctx.removeEventListener("statechange", aoMudarEstado);
    void ctx.close().catch(() => {});
    throw e;
  }
}

function desmontarGrafo(grafo: GrafoDeGanho) {
  grafo.soltar();
  try {
    grafo.fonte?.disconnect();
  } catch {
    // já desconectada
  }
  void grafo.ctx.close().catch(() => {});
}

/**
 * Liga a `MediaStreamTrack` atual da faixa ao ganho. `createMediaStreamSource`
 * e não `createMediaElementSource`: no Chromium, a fonte de elemento sobre um
 * `<audio>` cujo `srcObject` é stream remota do WebRTC entrega silêncio ou
 * falha de forma intermitente. A fonte de stream lê a trilha direto; o
 * elemento continua anexado (e mudo) só porque o Chromium não faz o áudio
 * remoto fluir sem algum elemento consumindo a stream.
 */
function conectarFonte(grafo: GrafoDeGanho, trilha: MediaStreamTrack | undefined) {
  if (grafo.fonte && grafo.trilha === trilha) return;
  try {
    grafo.fonte?.disconnect();
  } catch {
    // já desconectada
  }
  grafo.fonte = null;
  grafo.trilha = null;
  if (!trilha) return;
  const fonte = grafo.ctx.createMediaStreamSource(new MediaStream([trilha]));
  fonte.connect(grafo.ganho);
  grafo.fonte = fonte;
  grafo.trilha = trilha;
}

/**
 * Um `<audio>` de uma faixa, com o volume individual, o "silenciar
 * localmente" e o "desativar áudio" do rodapé aplicados — e a saída apontada
 * para o dispositivo escolhido nas configurações.
 *
 * Acima de 100% o `volume` do elemento não serve: ele satura em 1. O reforço
 * passa por um `GainNode` (ver `usarGrafoDeGanho` e `mixDaFaixa`), montado
 * **sob demanda** e alimentado pela `MediaStreamTrack` da faixa. Com o grafo
 * tocando, o `<audio>` fica anexado e mudo, só consumindo a stream, e volume e
 * silêncio passam pelo ganho. Como a fonte é a trilha e não o elemento, o
 * grafo é reversível: desmontá-lo devolve o som ao elemento.
 *
 * O grafo toca por `ctx.destination`, a saída **padrão** do sistema, e não
 * pelo `setSinkId` do elemento. Com dispositivo escolhido, a saída é aplicada
 * no próprio contexto (`AudioContext.setSinkId`, Chromium 110+). Onde isso não
 * existe, ou se criar o grafo ou apontar a saída falhar, **não** há grafo: o
 * volume fica limitado a 100% no elemento, que continua no dispositivo
 * escolhido — melhor que um volume maior na caixa de som errada. E enquanto o
 * contexto estiver suspenso (autoplay do WebView2), quem toca é o elemento,
 * também limitado a 100%: suspenso nunca vira silêncio.
 *
 * `deTela` distingue a faixa da tela das da voz: quem assiste pode silenciar
 * só a transmissão de alguém sem silenciar a voz dela, e vice-versa. Por isso
 * `telaSilenciada` só entra na conta da faixa de tela, e o volume/silêncio da
 * pessoa só entram na conta da faixa de microfone.
 */
function AudioDaFaixa({
  userId,
  faixa,
  deTela,
}: {
  userId: string;
  faixa: Track;
  deTela: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const grafo = useRef<GrafoDeGanho | null>(null);
  // o grafo falhou uma vez nesta faixa (criar ou apontar a saída): não se
  // tenta de novo a cada mexida no volume, fica no elemento até 100%
  const recusado = useRef(false);
  const porPessoa = useVoice((s) => (userId in s.volumes ? s.volumes[userId] : 1));
  // o volume geral da aba "Voz e vídeo" multiplica o de cada pessoa
  const geral = useVoice((s) => s.audio.saida);
  // o volume por pessoa é da voz: a transmissão toca sempre a 100% (× geral)
  const volume = (deTela ? 1 : porPessoa) * geral;
  const silenciado = useVoice((s) => !!s.silenciados[userId]);
  const telaSilenciada = useVoice((s) => !!s.telaSilenciada[userId]);
  const deafened = useVoicePrefs((s) => s.deafened);
  // testar o microfone ensurdece **localmente** enquanto dura (o Discord faz
  // igual): ninguém do outro lado sabe, e mudo/surdo persistidos não mudam
  const testandoMicrofone = useVoice((s) => s.testandoMicrofone);
  const outputId = useVoiceDevicesStore((s) => s.outputId);
  // o servidor também corta isso no LiveKit (canSubscribe=false), mas
  // silenciar localmente fecha a janela até a concessão valer
  const { serverDeaf } = useSilencioDoServidor();
  // surdo cala **todos** os `<audio>` de uma vez; fora isso, a faixa de tela
  // só cala pelo silenciar-só-da-tela e a de microfone só pelo silenciar da pessoa
  const calado = saidaCalada(
    deafened || serverDeaf,
    testandoMicrofone,
    deTela ? telaSilenciada : silenciado,
  );
  const trilha = faixa?.mediaStreamTrack;

  // reforça o silêncio e o volume no elemento e no ganho: o livekit
  // sobrescreve `muted` tanto no `track.attach` quanto no `Room.startAudio()`,
  // então a prop declarativa sozinha não basta
  const aplicarMudo = (el: HTMLAudioElement) => {
    const g = grafo.current;
    const m = mixDaFaixa({
      calado,
      volume,
      grafoTocando: !!g && !!g.fonte && g.saidaPronta && g.ctx.state === "running",
    });
    el.muted = m.muted;
    el.volume = m.volumeDoElemento;
    if (g) g.ganho.gain.value = m.ganho;
  };
  // os ouvintes do contexto e do elemento disparam fora da renderização:
  // precisam da versão de `aplicarMudo` com o estado mais recente
  const aplicarRef = useRef(aplicarMudo);
  useEffect(() => {
    aplicarRef.current = aplicarMudo;
  });
  useEffect(() => {
    const el = ref.current;
    if (el && faixa) {
      faixa.attach(el);
      // o attach do livekit faz `element.muted = semFaixaDeAudio` (quase
      // sempre false), desfazendo o mudo declarativo — reforça na sequência
      aplicarRef.current(el);
    }
    return () => {
      if (el && faixa) faixa.detach(el);
    };
  }, [faixa]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reaplicar = () => {
      const atual = ref.current;
      if (atual) aplicarRef.current(atual);
    };
    const Ctor = construtorDeContexto();
    const usar = usarGrafoDeGanho({
      volume,
      outputId,
      temWebAudio: !!Ctor,
      contextoTemSinkId: contextoTemSinkId(Ctor),
      grafoExiste: !!grafo.current,
      recusado: recusado.current,
    });

    const largar = () => {
      if (grafo.current) desmontarGrafo(grafo.current);
      grafo.current = null;
    };

    if (!usar) {
      largar();
    } else if (Ctor) {
      try {
        const g = grafo.current ?? montarGrafo(Ctor, reaplicar);
        grafo.current = g;
        conectarFonte(g, trilha);
        const alvo = saidaEscolhida(outputId) ? outputId : "";
        if (g.saida !== alvo && typeof g.ctx.setSinkId === "function") {
          g.saida = alvo;
          g.saidaPronta = false;
          void g.ctx.setSinkId(alvo).then(
            () => {
              if (grafo.current !== g || g.saida !== alvo) return;
              g.saidaPronta = true;
              reaplicar();
            },
            () => {
              // o contexto não conseguiu ir para o dispositivo escolhido: sem
              // grafo, o elemento (que está nele) volta a tocar até 100%
              if (grafo.current !== g) return;
              recusado.current = true;
              largar();
              reaplicar();
            },
          );
        }
      } catch {
        // sem Web Audio utilizável o volume simplesmente não passa de 100%
        recusado.current = true;
        largar();
      }
    }

    // `aplicarRef` já é o desta renderização: o effect que o atualiza vem antes
    aplicarRef.current(el);
    void aplicarSaida(el, outputId);
  }, [volume, outputId, calado, trilha]);

  useEffect(() => {
    return () => {
      if (grafo.current) desmontarGrafo(grafo.current);
      grafo.current = null;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // o `Room.startAudio()` do livekit faz `el.muted = false` em todo
    // elemento anexado (dispara no primeiro gesto do usuário na página) —
    // sem depender de evento do Room, o listener reforça o estado aqui mesmo.
    // Reatribuir o mesmo valor não dispara `volumechange`, então não há laço.
    const reforcar = () => aplicarRef.current(el);
    el.addEventListener("volumechange", reforcar);
    el.addEventListener("play", reforcar);
    return () => {
      el.removeEventListener("volumechange", reforcar);
      el.removeEventListener("play", reforcar);
    };
  }, []);

  return <audio ref={ref} autoPlay muted={calado} />;
}
