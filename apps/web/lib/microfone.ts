import { useEffect, useState } from "react";
import { cadeiaDoMicrofone, contextoDeCaptura, type CadeiaDoMicrofone } from "@/lib/supressor-ruido";

/**
 * O dono da faixa de microfone.
 *
 * Antes não havia dono: `restricoesDeCaptura()` fabricava um supressor novo a
 * cada chamada e o entregava ao `setMicrophoneEnabled`, que ora criava a faixa,
 * ora só desmutava a que já existia. Três defeitos saíam daí, e são os três
 * relatos:
 *
 * 1. **O processador nunca entrava em vigor.** No livekit-client 2.22.0,
 *    `createLocalTracks` chama `track.setProcessor(...)` *antes* de o
 *    `LocalParticipant` chamar `track.setAudioContext(...)`, e
 *    `LocalAudioTrack.setProcessor` começa lançando
 *    `"Audio context needs to be set on LocalAudioTrack in order to enable
 *    processors"` quando não há contexto. Ou seja: passar `processor` dentro
 *    das `captureOptions` de `setMicrophoneEnabled` **sempre** rejeitava — e
 *    como a chamada terminava em `.catch(() => {})`, o microfone simplesmente
 *    não subia. Segundos depois, um `syncFlags()` chamava
 *    `setMicrophoneEnabled(true)` *sem opções* e publicava a faixa **crua**:
 *    "a voz fica estranha ao entrar e depois volta ao normal".
 * 2. **Trocar de nível não trocava nada.** `setMicrophoneEnabled(true, opts)`
 *    ignora `opts` quando a publicação já existe (só faz `unmute()`), então o
 *    `mute → unmute` que servia de "republicar" não aplicava restrição nem
 *    processador nenhum.
 * 3. **Vazamento.** Cada `init()` do supressor antigo podia abrir uma
 *    `AudioContext` própria, e a `destroy()` que a fecharia é chamada pelo SDK
 *    sem `await`. Entrar e sair algumas vezes encostava no teto de contextos do
 *    Chromium e a supressão parava de funcionar de vez.
 *
 * Agora a faixa tem um dono só, aqui, com uma fila que serializa abrir, trocar
 * e fechar — `fechar()` é idempotente e nunca roda no meio de um `abrir()`. A
 * faixa nasce **com a cadeia já montada** e só então é publicada: não existe
 * janela de áudio cru.
 *
 * O acoplamento com o LiveKit fica na interface `SalaDoMicrofone`, que
 * `stores/voice` implementa a partir da `Room`. É o que deixa o ciclo de vida
 * testável sem um SDK inteiro em pé.
 */

/**
 * A parte das restrições que o navegador consegue trocar **na faixa que já
 * está aberta**: tudo menos o aparelho.
 *
 * A separação existe por causa de `atualizarMicrofone`. Trocar de aparelho é
 * outro `getUserMedia` e não há como não reabrir; trocar eco/ruído/AGC é um
 * `applyConstraints` na mesma `MediaStreamTrack`, que **não fecha o
 * dispositivo** — e reabrir o dispositivo à toa é caro em qualquer sistema
 * (num fone Bluetooth é uma renegociação de perfil inteira).
 */
export interface ProcessamentoDeCaptura {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  /**
   * A supressão "forte" do `mediacapture-extensions`, que **substitui** a
   * `noiseSuppression` onde o sistema a suporta.
   *
   * Vai explícita porque o livekit-client 2.22.0 injeta `voiceIsolation: true`
   * nos `audioDefaults` de `createLocalTracks`: sem dizer nada, o padrão do SDK
   * é quem decide qual supressão nativa roda — e esse padrão pode mudar de
   * versão para versão sem que nada aqui acuse. Quem escolhe a supressão neste
   * app é `restricoesDeCaptura`.
   */
  voiceIsolation: boolean;
}

/** O que o navegador precisa saber para abrir a captura. */
export interface RestricoesDeMicrofone extends ProcessamentoDeCaptura {
  deviceId?: string;
}

/** A faixa local de áudio do LiveKit, só com o que este módulo usa. */
export interface FaixaDeMicrofone {
  /**
   * O que sai para a sala. O `LocalTrack` do LiveKit já devolve aqui a faixa
   * **processada** quando há processador (`processor?.processedTrack ??
   * _mediaStreamTrack`), e é por isso que o detector local de fala e o retorno
   * do teste de microfone podem ler daqui sem saber da cadeia.
   */
  readonly mediaStreamTrack: MediaStreamTrack;
  setAudioContext(ctx: AudioContext | undefined): void;
  setProcessor(cadeia: CadeiaDoMicrofone): Promise<void>;
  stopProcessor(): Promise<void>;
  /**
   * Troca eco/ruído/AGC na captura que já está aberta, sem `getUserMedia` novo.
   *
   * O nome está em inglês, contra a convenção do projeto, porque é o do
   * `LocalAudioTrack` do LiveKit: assim a faixa do SDK satisfaz esta interface
   * como está, sem um embrulho no meio. Ele aplica na faixa **de entrada** (a
   * de antes da cadeia, que é a do dispositivo) e mescla o que passou nas
   * `constraints` guardadas, então uma reaquisição posterior do SDK não volta
   * ao processamento antigo.
   */
  applyConstraints(processamento: ProcessamentoDeCaptura): Promise<void>;
  restartTrack(restricoes: RestricoesDeMicrofone): Promise<void>;
  mute(): Promise<unknown>;
  unmute(): Promise<unknown>;
  stop(): void;
  /**
   * `TrackEvent.Restarted` do LiveKit: a captura foi **reaberta**, por nós ou
   * pelo próprio SDK.
   *
   * O nome do evento está em inglês pelo mesmo motivo de `applyConstraints`: é
   * o do `LocalAudioTrack`, e assim a faixa do SDK satisfaz esta interface sem
   * embrulho. Ver `reaplicarProcessamento` para o porquê de ouvirmos isto.
   */
  on(evento: "restarted", ouvinte: () => void): unknown;
  off(evento: "restarted", ouvinte: () => void): unknown;
}

/** A sala em que a faixa é publicada. `stores/voice` monta a partir da `Room`. */
export interface SalaDoMicrofone {
  criarFaixa(restricoes: RestricoesDeMicrofone): Promise<FaixaDeMicrofone>;
  publicar(faixa: FaixaDeMicrofone): Promise<void>;
  despublicar(faixa: FaixaDeMicrofone): Promise<void>;
}

/** O que o usuário escolheu: captura, supressão, volume e mudo. */
export interface PreferenciasDoMicrofone {
  restricoes: RestricoesDeMicrofone;
  /** RNNoise ligado (nível "avançada"). */
  supressao: boolean;
  /** volume de entrada, 0–2. */
  ganho: number;
  /** o microfone deve estar aberto agora (mudo/surdo/PTT já decididos). */
  aberto: boolean;
}

interface Vivo {
  sala: SalaDoMicrofone;
  faixa: FaixaDeMicrofone;
  cadeia: CadeiaDoMicrofone | null;
  prefs: PreferenciasDoMicrofone;
  /** o ouvinte de `restarted` pendurado nesta faixa, para tirá-lo no descarte. */
  ouvinteDeReaquisicao: (() => void) | null;
  /** estamos dentro de um `restartTrack` **nosso**? Ver `reaplicarProcessamento`. */
  reabrindo: boolean;
  /** a faixa está publicada na sala agora? O teste de microfone a tira de lá. */
  publicado: boolean;
  /** teste de microfone em curso: fora da sala, e aberta mesmo se mudo. */
  testando: boolean;
  /** o que já foi aplicado na faixa, para não mutar/desmutar à toa. */
  mudo: boolean;
}

/**
 * O microfone deve estar **capturando** agora?
 *
 * Durante o teste, sim — sempre, e é isto que faz o retorno funcionar com o
 * usuário mudo. O teste liga mudo e surdo de verdade (ver
 * `stores/teste-de-microfone.ts`), e mudo aqui é `enabled = false` na faixa
 * **de entrada** da cadeia: aplicá-lo mataria o próprio som que o teste
 * devolve. Então enquanto o teste dura a captura fica aberta — o ramo que o
 * retorno ouve é a cadeia inteira, antes do interruptor de mudo — e quem
 * garante que a sala não ouve nada é a despublicação, não o mudo.
 */
function abertoDeFato(estado: Vivo): boolean {
  return estado.testando || estado.prefs.aberto;
}

async function aplicarMudo(estado: Vivo) {
  const mudo = !abertoDeFato(estado);
  if (mudo === estado.mudo) return;
  estado.mudo = mudo;
  await (mudo ? estado.faixa.mute() : estado.faixa.unmute());
}

let vivo: Vivo | null = null;

/**
 * Uma operação de microfone por vez.
 *
 * Sair e entrar depressa (ou o `devicechange` no meio de uma troca de nível)
 * chegava com duas cadeias montando ao mesmo tempo na mesma faixa. A fila é o
 * que garante o "no máximo um contexto e uma faixa vivos" que o teste cobra.
 */
let fila: Promise<unknown> = Promise.resolve();
function emFila<T>(fn: () => Promise<T>): Promise<T> {
  const proxima = fila.then(fn, fn);
  // a fila não pode morrer numa rejeição: o próximo da fila ainda tem de rodar
  fila = proxima.catch(() => {});
  return proxima;
}

/** A cadeia só existe quando faz alguma coisa: suprimir ou mudar o volume. */
function precisaDeCadeia(p: PreferenciasDoMicrofone): boolean {
  return p.supressao || p.ganho !== 1;
}

/**
 * O contexto em que a cadeia destas preferências vai viver.
 *
 * `setAudioContext` só existe para o LiveKit deixar `setProcessor` passar, e a
 * cadeia monta o grafo no contexto que ela mesma toma — os dois têm de ser o
 * mesmo, e agora há dois candidatos: os 48 kHz forçados são do RNNoise, e a
 * cadeia sem RNNoise (só o ganho) roda na taxa do aparelho, como o resto de
 * quem apenas ouve o sinal. O predicado é o mesmo que a cadeia usa em `montar`.
 */
function contextoDaCadeia(p: PreferenciasDoMicrofone): AudioContext {
  return contextoDeCaptura(p.supressao);
}

function mesmoProcessamento(a: ProcessamentoDeCaptura, b: ProcessamentoDeCaptura): boolean {
  return (
    a.echoCancellation === b.echoCancellation &&
    a.noiseSuppression === b.noiseSuppression &&
    a.autoGainControl === b.autoGainControl &&
    a.voiceIsolation === b.voiceIsolation
  );
}

/** Só o que `applyConstraints` aceita: o aparelho fica de fora de propósito. */
function processamentoDe(r: RestricoesDeMicrofone): ProcessamentoDeCaptura {
  return {
    echoCancellation: r.echoCancellation,
    noiseSuppression: r.noiseSuppression,
    autoGainControl: r.autoGainControl,
    voiceIsolation: r.voiceIsolation,
  };
}

/**
 * O aparelho pedido, desembrulhado — e por que ele pode não ser uma string.
 *
 * `LocalAudioTrack.restartTrack` passa as opções por `constraintsForOptions`
 * (livekit-client 2.22.0, `room/track/utils.ts`), que **muta o objeto
 * recebido**: faz `constraints.audio = options.audio` e em seguida
 * `constraints.audio.deviceId ??= { ideal: "default" }`. Enquanto
 * entregávamos o nosso próprio objeto de restrições ao SDK, era o nosso
 * `deviceId` que virava `{ ideal: "default" }` — e a comparação por
 * identidade contra o `undefined` que `restricoesDeCaptura` devolve na
 * escolha "Padrão do sistema" passava a dar **sempre diferente**, reabrindo o
 * microfone a cada mudança de preferência. Hoje o SDK recebe cópia
 * (`reabrirCaptura`, `abrirMicrofone`), e esta função é a segunda tranca:
 * compara o que o `deviceId` *significa*, não a forma em que ele chegou.
 */
function idDeAparelho(valor: RestricoesDeMicrofone["deviceId"]): string | undefined {
  // o tipo diz `string | undefined`, mas quem escreve aqui pode ter sido o SDK
  const bruto: unknown = valor;
  if (typeof bruto === "string") return bruto || undefined;
  if (bruto && typeof bruto === "object") {
    const { exact, ideal } = bruto as { exact?: unknown; ideal?: unknown };
    const escolhido = exact ?? ideal;
    if (typeof escolhido === "string") return escolhido || undefined;
    if (Array.isArray(escolhido) && typeof escolhido[0] === "string") return escolhido[0];
  }
  return undefined;
}

/**
 * Reabre a captura (outro `getUserMedia`) com as restrições dadas.
 *
 * Dois cuidados que não são detalhe. **A cópia**: o SDK muta o objeto que
 * recebe (ver `idDeAparelho`), e o nosso é o mesmo que fica guardado em
 * `estado.prefs.restricoes`. **A marca `reabrindo`**: o `restartTrack` emite
 * `restarted`, e sem ela o nosso próprio ouvinte trataria esta reabertura como
 * se fosse do SDK — avisando no log uma reaquisição que não houve.
 */
async function reabrirCaptura(estado: Vivo, restricoes: RestricoesDeMicrofone) {
  estado.reabrindo = true;
  try {
    await estado.faixa.restartTrack({ ...restricoes });
  } finally {
    estado.reabrindo = false;
  }
}

/**
 * Repõe o nosso processamento depois de uma reabertura **do SDK**.
 *
 * Por que isto existe: quando a `MediaStreamTrack` do microfone termina (fone
 * Bluetooth trocando de perfil, aparelho desconectado, padrão do sistema
 * mudando), o `LocalParticipant` do livekit-client 2.22.0 reage com
 * `track.restartTrack({ deviceId: "default" })` — literalmente só isso
 * (`participant/LocalParticipant.ts`, no tratamento de faixa encerrada). O
 * `getUserMedia` que ele refaz vai **sem** `echoCancellation`,
 * `noiseSuppression`, `autoGainControl` e `voiceIsolation`, e o `restart()`
 * ainda grava esse objeto pobre em `_constraints`: a captura fica no padrão do
 * navegador e o nosso `estado.prefs.restricoes` passa a descrever algo que não
 * existe mais. Nada no app percebia — e no WebKit do macOS o efeito é visível
 * para quem está ouvindo música, porque `echoCancellation` volta ligado e é ele
 * que liga a `kAudioUnitSubType_VoiceProcessingIO` (ver `SistemaDeAudio`).
 *
 * `audioCaptureDefaults` da `Room` **não** cobre este caminho: no SDK 2.22.0
 * ele só é lido por `LocalParticipant.createTracks` e por
 * `Room.switchActiveDevice`, não por `LocalAudioTrack.restartTrack`. Daí a
 * correção ser aqui.
 *
 * O `console.warn` não é ruído: hoje a reaquisição é **invisível**, e este é o
 * único sinal que restará do que aconteceu na máquina de quem relatou o
 * problema. Não devolvemos o aparelho escolhido à força: ele acabou de
 * terminar, e insistir nele é o caminho mais curto para ficar sem microfone
 * nenhum.
 */
function reaplicarProcessamento(estado: Vivo) {
  // reabertura nossa já nasce com as restrições certas
  if (estado.reabrindo) return;
  void emFila(async () => {
    if (vivo !== estado) return;
    const processamento = processamentoDe(estado.prefs.restricoes);
    console.warn(
      "[voz] o LiveKit reabriu a captura do microfone por conta própria " +
        "(a faixa do aparelho terminou); reaplicando o processamento escolhido",
      { processamento, aparelho: estado.faixa.mediaStreamTrack.getSettings?.()?.deviceId },
    );
    try {
      await estado.faixa.applyConstraints(processamento);
    } catch (e) {
      console.warn(
        "[voz] o navegador recusou repor o processamento depois da reabertura; " +
          "a captura está com o padrão dele até a próxima troca de preferência",
        e,
      );
    }
  });
}

/**
 * Confere o que o navegador **entregou** contra o que nós **pedimos**, e repara
 * o único desvio que faz estrago fora do app.
 *
 * Por que isto existe: em 2026-09-22 o usuário entrou numa call com música
 * tocando, já com o tratamento "No app" (ou seja, `echoCancellation: false`
 * pedido no `getUserMedia`), e o som da máquina inteira ficou abafado na hora.
 * Alternar uma preferência qualquer e voltar ao **mesmo** estado consertava.
 * Mesmas restrições, resultados diferentes — então o que estava no ar não era
 * o que tínhamos pedido, e nada no app olhava para isso.
 *
 * `getSettings()` é a única fonte do que a captura realmente é. Comparar com o
 * pedido transforma um relato ("ficou abafado") no fato que falta ("pedimos
 * `echoCancellation: false` e viemos com `true`").
 *
 * **O reparo é só para o cancelamento de eco, e só quando ele veio ligado sem
 * termos pedido.** É o único dos quatro cuja ponta errada sai do app: no macOS
 * o WebKit entrega entrada e saída do aparelho à `VoiceProcessingIO` quando ele
 * está ativo (ver `SistemaDeAudio`). Os outros três só afetam a nossa própria
 * voz — anotar basta, reabrir o dispositivo por causa deles custaria mais do
 * que corrige. Uma tentativa só: se a reabertura também vier com eco, insistir
 * viraria laço, e o aviso no log já conta o que houve.
 */
async function conferirCaptura(estado: Vivo) {
  const real = estado.faixa.mediaStreamTrack.getSettings?.();
  if (!real) return;
  const pedido = processamentoDe(estado.prefs.restricoes);
  // `undefined` = o navegador não publica esta restrição; não é divergência
  const divergencias = (["echoCancellation", "noiseSuppression", "autoGainControl"] as const)
    .filter((chave) => real[chave] !== undefined && real[chave] !== pedido[chave])
    .map((chave) => `${chave}: pedimos ${pedido[chave]}, veio ${real[chave]}`);
  if (divergencias.length === 0) return;

  console.warn(
    "[voz] a captura aberta não confere com o que foi pedido",
    { divergencias, aparelho: real.deviceId, taxa: real.sampleRate },
  );

  if (pedido.echoCancellation !== false || real.echoCancellation !== true) return;
  console.warn(
    "[voz] o cancelamento de eco veio ligado sem termos pedido — no macOS é ele " +
      "que entrega o aparelho ao processamento de voz do sistema e abafa os " +
      "outros aplicativos; reabrindo a captura para desligá-lo",
  );
  try {
    await reabrirCaptura(estado, estado.prefs.restricoes);
    const depois = estado.faixa.mediaStreamTrack.getSettings?.()?.echoCancellation;
    if (depois === true) {
      console.warn(
        "[voz] a reabertura também veio com cancelamento de eco: este navegador " +
          "não o desliga para este aparelho",
      );
    }
  } catch (e) {
    console.warn("[voz] não deu para reabrir a captura para desligar o eco", e);
  }
}

/**
 * Leva a faixa aberta das restrições `atuais` para as `novas` — reabrindo o
 * dispositivo **só** quando não há outro jeito.
 *
 * Por que isto não é mais um `restartTrack` para tudo: `restartTrack` faz
 * `stop()` na faixa e um `getUserMedia` novo, ou seja, fecha e reabre o
 * dispositivo. Toda reabertura é uma renegociação com o áudio do sistema (num
 * fone Bluetooth, de perfil e codec), e nada disso é necessário para mudar eco,
 * ruído nativo ou ganho automático: são restrições da mesma captura, e
 * `applyConstraints` as troca com o dispositivo aberto. É também o que fazem os
 * dois clientes comparáveis que usam este mesmo SDK no navegador — Element Call
 * e LiveKit Meet —, onde `restartTrack` aparece apenas como contorno para troca
 * de **aparelho**.
 *
 * Trocar de aparelho continua sendo `restartTrack`: é outro dispositivo, outro
 * `getUserMedia`.
 */
async function trocarRestricoes(estado: Vivo, novas: RestricoesDeMicrofone) {
  const atuais = estado.prefs.restricoes;
  if (idDeAparelho(atuais.deviceId) !== idDeAparelho(novas.deviceId)) {
    await reabrirCaptura(estado, novas);
    return;
  }
  if (mesmoProcessamento(atuais, novas)) return;
  try {
    await estado.faixa.applyConstraints(processamentoDe(novas));
  } catch (e) {
    // `OverconstrainedError`: este navegador/driver não troca estas restrições
    // com o dispositivo aberto. Recuar para `restartTrack` custa a reabertura
    // que este caminho existe para evitar, mas deixar a preferência sem efeito
    // (e em silêncio) seria pior — a pessoa mexeu no controle esperando algo.
    console.warn(
      "[voz] o navegador recusou trocar o processamento do microfone ao vivo; " +
        "reabrindo a captura para aplicar a preferência",
      e,
    );
    await reabrirCaptura(estado, novas);
  }
}

/**
 * Monta (ou desmonta) a cadeia na faixa conforme as preferências.
 *
 * `setProcessor` troca o que sai pelo `sender` sem renegociar nada — é por isso
 * que ligar a supressão no meio da conversa não corta mais o áudio. O contexto
 * é reposto antes de cada chamada porque o `publishTrack` do LiveKit sobrescreve
 * o da faixa com o da `Room`, que a `Room` fecha ao desconectar.
 */
async function aplicarCadeia(estado: Vivo, prefs: PreferenciasDoMicrofone) {
  const quer = precisaDeCadeia(prefs);
  const trocouOFormato = !!estado.cadeia && estado.prefs.supressao !== prefs.supressao;

  if (!quer) {
    if (estado.cadeia) {
      await estado.faixa.stopProcessor();
      estado.cadeia = null;
    }
    return;
  }

  if (estado.cadeia && !trocouOFormato) {
    // só o volume mudou: o grafo continua o mesmo e o ganho anda na rampa
    estado.cadeia.setGanho(prefs.ganho);
    return;
  }

  const cadeia = cadeiaDoMicrofone({ supressao: prefs.supressao, ganho: prefs.ganho });
  estado.faixa.setAudioContext(contextoDaCadeia(prefs));
  // `setProcessor` já derruba o processador anterior (e espera pela `destroy()`)
  await estado.faixa.setProcessor(cadeia);
  estado.cadeia = cadeia;
}

/**
 * Abre o microfone e publica a faixa **já processada**.
 *
 * Fecha o que estiver aberto antes: entrar noutra sala sem passar por
 * `fecharMicrofone` deixaria a faixa antiga viva com a luz do microfone acesa.
 */
export function abrirMicrofone(
  sala: SalaDoMicrofone,
  prefs: PreferenciasDoMicrofone,
  testando = false,
): Promise<void> {
  return emFila(async () => {
    await fechar();
    // cópia: `constraintsForOptions` do SDK muta o objeto que recebe, e este é
    // o mesmo que fica guardado em `estado.prefs` (ver `idDeAparelho`)
    const faixa = await sala.criarFaixa({ ...prefs.restricoes });
    const estado: Vivo = {
      sala,
      faixa,
      cadeia: null,
      prefs,
      ouvinteDeReaquisicao: null,
      reabrindo: false,
      publicado: false,
      testando,
      mudo: false,
    };
    estado.ouvinteDeReaquisicao = () => reaplicarProcessamento(estado);
    faixa.on("restarted", estado.ouvinteDeReaquisicao);
    try {
      // a cadeia é um luxo; o microfone não. Se o wasm não baixar ou a
      // `AudioContext` não abrir, publica cru — ficar sem microfone porque a
      // supressão falhou é trocar um defeito por um pior
      try {
        // o contexto só serve para montar a cadeia (`setProcessor` precisa
        // dele); sem cadeia a pedir, tomá-lo aqui só abriria uma `AudioContext`
        // à toa para quem nunca vai usar supressão nem ganho
        if (precisaDeCadeia(prefs)) faixa.setAudioContext(contextoDaCadeia(prefs));
        await aplicarCadeia(estado, prefs);
      } catch {
        estado.cadeia = null;
      }
      // mudo antes de publicar: quem entra em mudo não solta meio segundo de sala
      await aplicarMudo(estado);
      // entrar numa sala no meio de um teste de microfone não publica nada: o
      // teste é surdo dos dois lados enquanto dura
      if (!estado.testando) {
        await sala.publicar(faixa);
        estado.publicado = true;
        // o `publicar` repõe o contexto da `Room` na faixa; o nosso é que vale
        // — mas só há o que repor quando existe cadeia montada por cima dele
        if (estado.cadeia) faixa.setAudioContext(contextoDaCadeia(estado.prefs));
      }
      // depois de publicar: a conferência pode reabrir a captura, e reabrir
      // antes da publicação deixaria a sala esperando por um `getUserMedia` a
      // mais no caminho crítico da entrada
      await conferirCaptura(estado);
    } catch (e) {
      await descartar(estado);
      throw e;
    }
    vivo = estado;
  });
}

/** Aplica preferências novas na faixa que já está no ar. */
export function atualizarMicrofone(prefs: PreferenciasDoMicrofone): Promise<void> {
  return emFila(async () => {
    const estado = vivo;
    if (!estado) return;
    await trocarRestricoes(estado, prefs.restricoes);
    try {
      // a cadeia é nossa e vive fora do `getUserMedia`: montar/desmontar o
      // RNNoise (e mexer no ganho) continua sendo trabalho daqui, tenha a
      // captura sido reaberta ou só reconfigurada ao vivo
      await aplicarCadeia(estado, prefs);
    } catch {
      // mesma regra do `abrirMicrofone`: a call continua, sem a cadeia
      estado.cadeia = null;
    }
    estado.prefs = prefs;
    await aplicarMudo(estado);
  });
}

/**
 * O pedido de `aberto` mais recente que ainda não começou a rodar, e a promise
 * que o entrega — para coalescer rajadas de clique em `definirMicrofoneAberto`.
 *
 * Sem isto, cada clique de "spammar mudo" enfileirava a própria operação em
 * `emFila`, uma por uma: N cliques viravam N `mute()`/`unmute()` em série (o
 * `mute()`/`unmute()` do LiveKit tem lock próprio), e se alguma operação lenta
 * estivesse na fila no meio da rajada (`abrirMicrofone`, uma troca de
 * restrições), todo o resto esperava atrás dela e era aplicado um a um — a
 * rajada demorava para assentar no estado real, proporcional ao número de
 * cliques.
 *
 * Agora só o último valor pedido fica guardado aqui; a operação que já está
 * enfileirada (e ainda não rodou) lê esse valor **no momento em que roda**, não
 * no momento em que foi pedida. `pendenteAberto` é zerado como a primeira linha
 * da operação, antes de qualquer `await`: é o que marca "já comecei" para o
 * próximo clique, que aí enfileira uma operação nova em vez de coalescer nesta.
 * Resultado: uma rajada de N cliques vira no máximo uma operação em curso mais
 * uma enfileirada atrás dela — nunca uma fila do tamanho da rajada — e o
 * estado final é sempre o do último clique.
 */
let pendenteAberto: { valor: boolean; prontidao: Promise<void> } | null = null;

/** Mudo/surdo/PTT: só abre e fecha a faixa que já existe. */
export function definirMicrofoneAberto(aberto: boolean): Promise<void> {
  if (pendenteAberto) {
    pendenteAberto.valor = aberto;
    return pendenteAberto.prontidao;
  }
  let pendente!: { valor: boolean; prontidao: Promise<void> };
  pendente = {
    valor: aberto,
    prontidao: emFila(async () => {
      // a partir daqui a operação já começou: o próximo clique não coalesce
      // mais nesta, e enfileira uma operação nova
      pendenteAberto = null;
      const estado = vivo;
      // sem `vivo`, não faz nada — inclusive quando o pedido coalescido chegou
      // antes de `abrirMicrofone` terminar de montar `estado.prefs`
      if (!estado || estado.prefs.aberto === pendente.valor) return;
      estado.prefs = { ...estado.prefs, aberto: pendente.valor };
      await aplicarMudo(estado);
    }),
  };
  pendenteAberto = pendente;
  return pendente.prontidao;
}

/**
 * Teste de microfone: tira a faixa da sala sem fechá-la.
 *
 * Despublicar, e não mutar: o teste devolve o próprio som à pessoa, e um mudo
 * (que é `mediaStreamTrack.enabled = false` na **entrada** da cadeia) faria o
 * retorno sair mudo junto. Assim a mesma faixa — com a mesma cadeia, o mesmo
 * supressor e o mesmo volume de entrada — continua rodando: o teste ouve
 * exatamente o que a sala ouviria, sem um segundo `getUserMedia` e sem um
 * segundo `AudioContext`.
 *
 * É também o que sustenta o mudo de verdade do teste: `abertoDeFato` mantém a
 * captura aberta enquanto `testando` vale, então o mudo que o rodapé mostra
 * (e que o gateway recebe) não chega a apagar o retorno. Fora da sala e sem
 * ninguém escutando, uma faixa aberta não vaza para lugar nenhum.
 */
export function definirMicrofoneEmTeste(testando: boolean): Promise<void> {
  return emFila(async () => {
    const estado = vivo;
    if (!estado || estado.testando === testando) return;
    estado.testando = testando;
    await aplicarMudo(estado);
    if (testando && estado.publicado) {
      await estado.sala.despublicar(estado.faixa).catch(() => {});
      estado.publicado = false;
    } else if (!testando && !estado.publicado) {
      await estado.sala.publicar(estado.faixa).catch(() => {});
      estado.publicado = true;
      // como acima: só há contexto a repor quando existe cadeia montada sobre
      // ele — sem cadeia, tomá-lo aqui abriria uma `AudioContext` à toa
      if (estado.cadeia) estado.faixa.setAudioContext(contextoDaCadeia(estado.prefs));
    }
  });
}

/**
 * A faixa que está (ou estaria) no ar, para quem só quer **ouvir** o microfone:
 * o detector local de fala e o retorno do teste. Já vem processada.
 */
export function faixaDeMonitoracao(): MediaStreamTrack | null {
  return vivo?.faixa.mediaStreamTrack ?? null;
}

/** Fecha o microfone. Chamar duas vezes (ou sem nada aberto) não faz nada. */
export function fecharMicrofone(): Promise<void> {
  return emFila(fechar);
}

async function fechar() {
  const estado = vivo;
  if (!estado) return;
  vivo = null;
  await descartar(estado);
}

/** Desmonta tudo sem deixar cair a fila: falhar aqui não pode travar o próximo. */
async function descartar(estado: Vivo) {
  // primeiro o ouvinte: a faixa ainda vai ser parada aqui, e um `restarted`
  // atrasado chegaria a um estado que já não é o `vivo`
  if (estado.ouvinteDeReaquisicao) {
    estado.faixa.off("restarted", estado.ouvinteDeReaquisicao);
    estado.ouvinteDeReaquisicao = null;
  }
  // despublicar primeiro: desmontar a cadeia com o `sender` ainda apontando
  // para ela mandaria silêncio para a sala antes de o "saiu" chegar
  if (estado.publicado) {
    estado.publicado = false;
    await estado.sala.despublicar(estado.faixa).catch(() => {});
  }
  if (estado.cadeia) {
    await estado.cadeia.destroy().catch(() => {});
    estado.cadeia = null;
  }
  // `stop()` do LiveKit também chama a `destroy()` do processador, mas sem
  // esperar por ela: a nossa fila já garantiu que ela terminou
  try {
    estado.faixa.stop();
  } catch {
    // faixa já morta: nada a parar
  }
}

/** Só para os testes: a faixa que está no ar, se houver. */
export function faixaDoMicrofone(): FaixaDeMicrofone | null {
  return vivo?.faixa ?? null;
}

// ── Microfone de fone Bluetooth ────────────────────────────────────────────

/**
 * Rótulos com que o sistema nomeia a captura do perfil mãos-livres.
 *
 * O Windows batiza o ponto de captura do HFP de `Headset (<fone> Hands-Free AG
 * Audio)` — em pt-BR, `Fone de Ouvido (<fone> Áudio Mãos-Livres AG)`. O macOS
 * usa `<fone> (Hands-Free)`. "Headset" e "Fone" sozinhos ficam de fora de
 * propósito: qualquer headset USB se chama assim e não tem este problema.
 */
const MARCAS_DE_MAOS_LIVRES = [
  /hands[\s-]?free/i,
  /m[ãa]os[\s-]?livres/i,
  /\bHFP\b/i,
  /\bAG Audio\b/i,
  /bluetooth/i,
];

/**
 * O rótulo é de um microfone de fone Bluetooth?
 *
 * Por que isto existe: abrir a captura de um fone Bluetooth faz o sistema
 * trocar o perfil do aparelho de A2DP (estéreo, banda cheia) para o de chamada
 * (HFP no Windows, mãos-livres também no macOS: mono, banda estreita). A troca
 * vale para o **fone inteiro**, então música, jogo e vídeo passam a sair
 * abafados enquanto a chamada dura. Nada que este app faça desfaz isso — não é
 * volume, é o codec do enlace. Resta avisar e sugerir outro microfone, que é o
 * que a aba "Voz e vídeo" faz.
 *
 * Isto vale nos dois sistemas: o texto antigo dizia "o Windows", e no Mac com
 * AirPods o efeito é o mesmo (e mais audível, porque o fone é a saída padrão).
 *
 * O rótulo é o único sinal que o navegador entrega: `MediaDeviceInfo` não diz
 * transporte nem perfil. Por isso a heurística erra para menos quando o
 * fabricante inventa o nome — e errar para menos é o lado certo: um aviso que
 * não aparece incomoda menos que um aviso falso em quem usa microfone de mesa.
 */
export function ehMicrofoneDeFoneBluetooth(rotulo: string | null | undefined): boolean {
  if (!rotulo) return false;
  return MARCAS_DE_MAOS_LIVRES.some((marca) => marca.test(rotulo));
}

// ── O que o sistema faz com o som dos outros aplicativos ───────────────────

/**
 * Qual mecanismo do sistema mexe no som dos **outros** aplicativos enquanto o
 * nosso microfone está aberto.
 *
 * Isto existe porque a tela de voz vinha mentindo em dois sentidos opostos, e
 * as duas mentiras estavam certas *em alguma* plataforma:
 *
 * - **`windows`** — o Chromium (e portanto Chrome, Edge e o WebView2 que
 *   embrulha o app) marca **toda** captura como `AudioCategory_Communications`
 *   (`media/audio/win/audio_low_latency_input_win.cc`,
 *   `SetCommunicationsCategoryAndMaybeRawCaptureMode`, chamada no `Open()`).
 *   Isso liga a política de comunicação do Windows, cujo padrão de fábrica é
 *   *"Reduzir o volume dos outros sons em 80%"* (Som ▸ Comunicações). Nenhuma
 *   opção nossa tira dali: desligar eco/ganho só troca
 *   `AUDCLNT_STREAMOPTIONS_NONE` por `AUDCLNT_STREAMOPTIONS_RAW`, que muda o
 *   processamento da **nossa** captura e nada mais.
 * - **`macos-webkit`** — Safari e o WKWebView do Tauri (o app de macOS) usam a
 *   `kAudioUnitSubType_VoiceProcessingIO` do Core Audio **exatamente quando o
 *   cancelamento de eco está ligado**
 *   (`Source/WebCore/platform/mediastream/cocoa/CoreAudioCaptureSource.cpp`:
 *   `m_unit = echoCancellation() ? defaultSingleton() : createNonVPIOUnit()`).
 *   Essa unidade não trata só a entrada: ela assume entrada **e** saída do
 *   aparelho e abaixa o "outro áudio" — tanto que o próprio WebKit configura
 *   `kAUVoiceIOProperty_OtherAudioDuckingConfiguration` no nível mínimo e ainda
 *   chama `AudioDeviceDuck(…, 1.0, …)` para desfazer o que consegue. Aqui,
 *   portanto, **desligar o cancelamento de eco resolve** — e é a única opção da
 *   tela que muda alguma coisa para os outros aplicativos.
 * - **`macos-chromium`** — Chrome e Edge no macOS **não** usam a
 *   VoiceProcessingIO: `AUAudioInputStream::IsEchoCancellationSupported` começa
 *   com `if (!media::IsSystemEchoCancellationEnforced()) return false;`, e
 *   `kEnforceSystemEchoCancellation` é `FEATURE_DISABLED_BY_DEFAULT`
 *   (`media/base/media_switches.cc`). O eco é cancelado em software (AEC3), sem
 *   tocar na saída. Nenhuma opção nossa mexe nos outros aplicativos.
 * - **`outro`** — Linux e o resto: também nada.
 *
 * O `userAgent` é o único sinal disponível no cliente, e é o bastante para a
 * pergunta que interessa (é WebKit ou é Chromium?). Errar aqui só troca o texto
 * de ajuda exibido — nenhuma decisão de áudio depende disto.
 */
export type SistemaDeAudio = "windows" | "macos-webkit" | "macos-chromium" | "outro";

export function sistemaDeAudio(userAgent: string | null | undefined): SistemaDeAudio {
  const ua = userAgent ?? "";
  if (/Windows NT/i.test(ua)) return "windows";
  if (!/Mac OS X|Macintosh/i.test(ua)) return "outro";
  // Chrome, Chromium, Edge, Opera e o WebView2 trazem `Chrome/` no `userAgent`;
  // Safari e o WKWebView do Tauri, não. `CriOS` é o Chrome do iPad em modo
  // desktop, que se anuncia como Macintosh mas por baixo é WebKit — por isso
  // ele **não** entra aqui.
  return /Chrome\/|Chromium\/|Edg\//i.test(ua) ? "macos-chromium" : "macos-webkit";
}

/**
 * O mesmo, para a tela. Só responde depois de montar: no servidor não existe
 * `navigator`, e devolver um palpite na primeira renderização trocaria o texto
 * de ajuda na frente da pessoa. Até lá é `null` — "ainda não sei" — e quem
 * mostra o aviso não mostra nada.
 */
export function useSistemaDeAudio(): SistemaDeAudio | null {
  const [sistema, setSistema] = useState<SistemaDeAudio | null>(null);
  useEffect(() => {
    setSistema(sistemaDeAudio(navigator.userAgent));
  }, []);
  return sistema;
}
