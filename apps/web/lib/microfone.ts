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

/** O que o navegador precisa saber para abrir a captura. */
export interface RestricoesDeMicrofone {
  deviceId?: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
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
  restartTrack(restricoes: RestricoesDeMicrofone): Promise<void>;
  mute(): Promise<unknown>;
  unmute(): Promise<unknown>;
  stop(): void;
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

function mesmasRestricoes(a: RestricoesDeMicrofone, b: RestricoesDeMicrofone): boolean {
  return (
    a.deviceId === b.deviceId &&
    a.echoCancellation === b.echoCancellation &&
    a.noiseSuppression === b.noiseSuppression &&
    a.autoGainControl === b.autoGainControl
  );
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
  estado.faixa.setAudioContext(contextoDeCaptura());
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
    const faixa = await sala.criarFaixa(prefs.restricoes);
    const estado: Vivo = {
      sala,
      faixa,
      cadeia: null,
      prefs,
      publicado: false,
      testando,
      mudo: false,
    };
    try {
      // a cadeia é um luxo; o microfone não. Se o wasm não baixar ou a
      // `AudioContext` não abrir, publica cru — ficar sem microfone porque a
      // supressão falhou é trocar um defeito por um pior
      try {
        faixa.setAudioContext(contextoDeCaptura());
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
        faixa.setAudioContext(contextoDeCaptura());
      }
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
    // eco/supressão nativa/AGC/dispositivo são do `getUserMedia`: só um
    // `restartTrack` os troca — e ele reinicia a cadeia junto, pelo SDK
    if (!mesmasRestricoes(estado.prefs.restricoes, prefs.restricoes)) {
      await estado.faixa.restartTrack(prefs.restricoes);
    }
    try {
      await aplicarCadeia(estado, prefs);
    } catch {
      // mesma regra do `abrirMicrofone`: a call continua, sem a cadeia
      estado.cadeia = null;
    }
    estado.prefs = prefs;
    await aplicarMudo(estado);
  });
}

/** Mudo/surdo/PTT: só abre e fecha a faixa que já existe. */
export function definirMicrofoneAberto(aberto: boolean): Promise<void> {
  return emFila(async () => {
    const estado = vivo;
    if (!estado || estado.prefs.aberto === aberto) return;
    estado.prefs = { ...estado.prefs, aberto };
    await aplicarMudo(estado);
  });
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
      estado.faixa.setAudioContext(contextoDeCaptura());
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
