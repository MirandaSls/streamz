import { Track } from "livekit-client";
import type { AudioProcessorOptions, TrackProcessor } from "livekit-client";

/**
 * A cadeia de captura do microfone: supressão de ruído (RNNoise) e volume de
 * entrada, num grafo Web Audio só, publicado no lugar do microfone cru.
 *
 * Por que não o supressor do Discord: o do Discord é o Krisp, licenciado, e o
 * filtro pronto do LiveKit só funciona no LiveKit Cloud — que a ADR-0005
 * abandonou de propósito. O RNNoise é o equivalente aberto (o mesmo que o Jitsi
 * usa): tira ventilador, ar-condicionado, teclado e chiado; perde para o Krisp
 * quando o ruído é *outra voz* ou um cachorro.
 *
 * Ele não substitui a supressão nativa do navegador por capricho: rodar as duas
 * em série soa metálico, porque a nativa volta a comprimir o que a rede já
 * limpou. Por isso quem escolhe "Avançada" desliga a nativa (ver
 * `restricoesDeCaptura`, em `stores/voice`).
 *
 * ## O contexto de captura é NOSSO, e a taxa só é forçada para quem a exige
 *
 * A versão anterior usava a `AudioContext` que o LiveKit entrega em
 * `init({ audioContext })` sempre que ela já estivesse em 48 kHz, e abria uma
 * própria só no caso contrário — sem nunca reaproveitá-la. As duas metades
 * quebravam ao sair e entrar da call várias vezes:
 *
 * 1. **A do LiveKit morre na saída.** `Room.disconnect()` faz
 *    `audioContext.close()` (livekit-client 2.22.0). Um supressor que ficou
 *    pendurado nela — a `destroy()` do processador é chamada por
 *    `LocalTrack.stop()` *sem `await`* — passa a rodar num contexto fechado.
 * 2. **A nossa vazava.** Uma `AudioContext` nova por `init()`, fechada só na
 *    `destroy()` correspondente, encosta no teto do Chromium (≈6 contextos por
 *    página): a partir daí `new AudioContext()` lança, a `init()` falha e a
 *    supressão "buga" até o F5.
 *
 * Por isso o contexto é criado sob demanda, reaproveitado e apenas **suspenso**
 * quando ninguém o usa — nunca fechado, e nunca é o do LiveKit. São no máximo
 * dois por aba, e o que os separa é a taxa:
 *
 * - **48 kHz forçados** — o que o RNNoise exige (o modelo assume essa taxa; em
 *   44,1 kHz devolveria a voz com a altura errada). Nasce só quando a cadeia
 *   avançada vai ser montada — ou no pré-aquecimento, que já só roda para quem
 *   escolheu "Avançada". O worklet é registrado uma vez nele: `addModule` duas
 *   vezes no mesmo contexto é erro.
 * - **taxa do aparelho** (sem `sampleRate`) — para quem só *ouve* o sinal (o
 *   detector local de fala, o retorno do teste de microfone) e para a cadeia
 *   sem RNNoise, que é um `GainNode` e mais nada. Nenhum deles depende da taxa.
 *
 * Por que a separação: quem mantinha um contexto de 48 kHz aberto do começo ao
 * fim de **toda** chamada não era o supressor — era o detector local de fala,
 * armado sempre, sem olhar preferência nenhuma. Isto é **eliminação de
 * suspeito** no relato de que entrar numa call estraga o som dos outros
 * aplicativos: não há prova de que um contexto com taxa forçada cause aquilo, e
 * não há motivo para ele existir quando ninguém precisa da taxa.
 *
 * Quem não exige 48 kHz reaproveita o contexto forçado quando ele já está
 * aberto: manter dois contextos vivos por gosto seria trocar um custo por
 * outro.
 *
 * ## Ordem: supressor → ganho
 *
 * O ganho fica **depois** da rede neural, e não antes, por duas razões:
 * o RNNoise decide o que é voz a partir do nível que o microfone entrega, e
 * empurrar 200% na entrada dele muda essa decisão (ruído alto vira "voz");
 * e o detector de fala que acende o anel do participante é o do LiveKit, que
 * mede o áudio **publicado** — ou seja, depois do ganho. Assim o slider mexe
 * no que os outros ouvem e no que o medidor mostra, sem mexer no VAD do modelo.
 */

/** Servidos de `public/supressor/` pelo `predev`/`prebuild`. */
const BASE = "/supressor";
const TAXA_EXIGIDA = 48_000;

/* ---------------------------------------------------------------- */
/* A supressão avançada está disponível nesta janela?                */
/* ---------------------------------------------------------------- */

/**
 * Por que existe uma sonda, e por que ela é a correção deste defeito.
 *
 * O `RnnoiseWorkletNode` **nunca falha visivelmente**: o construtor só cria o
 * nó e manda o `.wasm` pela porta; quem instancia o WebAssembly é o processador
 * lá dentro do `AudioWorkletGlobalScope`, dentro de um `async` sem `catch` e
 * sem ninguém escutando. Se essa instanciação falhar, o processador fica
 * `undefined` para sempre e o `process()` do pacote devolve **silêncio** — não
 * o som cru:
 *
 * ```js
 * process(i, o) { ...|| !this.processor || this.processor.process(i[0], o[0]), true }
 * ```
 *
 * Foi exatamente o que acontecia no desktop. A CSP da janela do Tauri era
 * `script-src 'self' 'unsafe-inline'`, e no Chromium **compilar WebAssembly
 * exige `'wasm-unsafe-eval'`** nessa mesma diretiva. Medido num Chromium
 * headless servindo o `out/` exportado, com e sem a CSP do
 * `tauri.conf.json` (ruído branco em 48 kHz, RMS antes/depois):
 *
 * | CSP | `addModule` | `WebAssembly.compile` | RMS depois/antes |
 * |---|---|---|---|
 * | sem | ok | ok | 0,79 (o RNNoise come ~2 dB do ruído branco) |
 * | a do desktop | ok | `CompileError: ...violates... 'unsafe-eval'` | **0,0000** |
 *
 * Ou seja: no desktop, ligar a "Avançada" não deixava de suprimir — deixava a
 * pessoa **muda**, sem um erro sequer no console. A CSP ganhou
 * `'wasm-unsafe-eval'`; a sonda existe para o caso geral (uma CSP futura, um
 * navegador sem WebAssembly, o `/supressor/` que não subiu no deploy): em vez
 * de montar um nó que devolve silêncio, ela recusa antes, a cadeia continua
 * **sem** o RNNoise e o usuário é avisado (`aoFalharASupressao`).
 */
export class SupressaoIndisponivel extends Error {
  constructor(
    readonly motivo: string,
    opcoes?: { cause?: unknown },
  ) {
    super(`Supressão avançada indisponível: ${motivo}`, opcoes);
    this.name = "SupressaoIndisponivel";
  }
}

/** Módulo wasm válido e vazio (só o cabeçalho): compilá-lo custa microssegundos. */
const WASM_VAZIO = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** O motivo da última recusa, ou `null` enquanto tudo funciona. */
let indisponivel: string | null = null;
let relator: ((motivo: string) => void) | null = null;

/**
 * Por que a supressão avançada não está disponível — de forma **síncrona**,
 * para `restricoesDeCaptura` poder devolver a supressão do navegador no lugar
 * (ficar sem nenhuma das duas seria pior do que antes de escolher "Avançada").
 */
export function supressaoIndisponivel(): string | null {
  return indisponivel;
}

/** Quem mostra a falha ao usuário. A store de voz liga o toast aqui. */
export function aoFalharASupressao(fn: ((motivo: string) => void) | null) {
  relator = fn;
}

/** Só para os testes: esquece a sonda e o motivo. */
export function esquecerSupressaoIndisponivel() {
  indisponivel = null;
  sonda = null;
}

function avisar(motivo: string) {
  indisponivel = motivo;
  relator?.(motivo);
}

function motivoDe(e: unknown): string {
  return e instanceof SupressaoIndisponivel ? e.motivo : `falha inesperada (${String(e)})`;
}

let sonda: Promise<void> | null = null;

/**
 * Compila um módulo vazio só para saber se **esta janela** pode compilar
 * WebAssembly. É a única forma de descobrir na thread principal o que
 * aconteceria dentro do worklet, onde o erro não sai.
 */
function garantirWebAssembly(): Promise<void> {
  sonda ??= (async () => {
    if (typeof WebAssembly === "undefined" || typeof WebAssembly.compile !== "function") {
      throw new SupressaoIndisponivel("este navegador não tem WebAssembly");
    }
    try {
      await WebAssembly.compile(WASM_VAZIO);
    } catch (cause) {
      throw new SupressaoIndisponivel(
        "a política de segurança da janela bloqueia WebAssembly",
        { cause },
      );
    }
  })();
  return sonda;
}

/**
 * Rampa de subida do ganho ao ligar a cadeia.
 *
 * Sem ela o primeiro bloco sai no volume cheio no meio de um grafo que acabou
 * de nascer, e é isso que se ouve como "a voz fica estranha ao entrar". 120 ms
 * de silêncio subindo é curto demais para cortar uma sílaba e longo o bastante
 * para o worklet estabilizar.
 */
const SUBIDA_S = 0.12;
/** Rampa das trocas de volume: sem ela, arrastar o slider estala. */
const AJUSTE_S = 0.02;

/**
 * O pacote e o wasm são os mesmos para todo mundo: carregam uma vez por aba.
 *
 * Um `import()` só, e não um por peça: são o mesmo módulo, e duas entradas
 * dinâmicas para o mesmo pacote é a diferença entre "baixa uma vez" e "baixa
 * quando der".
 */
type Modelo = {
  RnnoiseWorkletNode: typeof import("@sapphi-red/web-noise-suppressor").RnnoiseWorkletNode;
  wasmBinary: ArrayBuffer;
};
let modelo: Promise<Modelo> | null = null;
function carregarModelo(): Promise<Modelo> {
  if (!modelo) {
    modelo = import("@sapphi-red/web-noise-suppressor")
      .then(async (m) => ({
        RnnoiseWorkletNode: m.RnnoiseWorkletNode,
        wasmBinary: await m.loadRnnoise({
          url: `${BASE}/rnnoise.wasm`,
          simdUrl: `${BASE}/rnnoise_simd.wasm`,
        }),
      }))
      .catch((e: unknown) => {
        // falhou (rede, 404 do `predev`): a próxima tentativa recomeça
        modelo = null;
        throw e;
      });
  }
  return modelo;
}

/** Os dois contextos de captura da aba (ver o cabeçalho) — um de cada, no máximo. */
let ctxDoModelo: AudioContext | null = null;
let ctxNativo: AudioContext | null = null;
/** O `addModule` que já rodou — sempre no `ctxDoModelo`, que é o único que usa worklet. */
let worklet: Promise<void> | null = null;
/** Quantas cadeias estão montadas — só o teste do ciclo pergunta. */
let montadas = 0;
/**
 * Quem está usando cada contexto agora: as cadeias, o detector local de fala e
 * o retorno do teste de microfone. Com zero, o contexto é suspenso — e **só**
 * com zero: suspendê-lo enquanto o detector mede deixaria o anel de fala
 * congelado, que foi como o defeito apareceria se o contador fosse só o das
 * cadeias.
 *
 * A conta é por contexto, e não uma só, porque os dois têm vidas independentes:
 * o de 48 kHz costuma ficar suspenso a call inteira de quem não usa a
 * supressão avançada.
 */
const usuarios = new Map<AudioContext, number>();

function aberto(c: AudioContext | null): c is AudioContext {
  return !!c && c.state !== "closed";
}

function usuariosDe(c: AudioContext | null): number {
  return (c && usuarios.get(c)) ?? 0;
}

/**
 * O contexto de captura para este uso.
 *
 * `exigeTaxaDoModelo` é do RNNoise e de mais ninguém. Sem ele, a `AudioContext`
 * nasce **sem `sampleRate`** — na taxa do próprio aparelho — e, se o contexto
 * forçado já estiver de pé, é ele que volta: dois contextos abertos ao mesmo
 * tempo só se justificam enquanto a cadeia avançada e um ouvinte antigo se
 * cruzam (o ouvinte se rearma e o outro fica suspenso).
 */
export function contextoDeCaptura(exigeTaxaDoModelo = false): AudioContext {
  if (exigeTaxaDoModelo) {
    if (!aberto(ctxDoModelo)) {
      ctxDoModelo = new AudioContext({ sampleRate: TAXA_EXIGIDA });
      // contexto novo, worklet ainda não registrado nele
      worklet = null;
    }
    return ctxDoModelo;
  }
  if (aberto(ctxDoModelo)) return ctxDoModelo;
  if (!aberto(ctxNativo)) ctxNativo = new AudioContext();
  return ctxNativo;
}

/** Toma o contexto (e o acorda). Todo `usar` precisa de um `liberar`. */
export function usarContextoDeCaptura(exigeTaxaDoModelo = false): AudioContext {
  const c = contextoDeCaptura(exigeTaxaDoModelo);
  usuarios.set(c, usuariosDe(c) + 1);
  if (c.state === "suspended") void c.resume().catch(() => {});
  return c;
}

/**
 * Devolve o contexto; o último a sair o suspende (não o fecha: recriá-lo a cada
 * montagem é o vazamento descrito no cabeçalho).
 *
 * Passar o contexto que se tomou é o certo. Sem ele, devolve-se ao que tem dono
 * — o nativo primeiro, porque quem não pediu taxa nenhuma foi parar nele — e
 * nunca a um contexto zerado: um decremento errado suspenderia o contexto de
 * quem ainda está usando.
 */
export function liberarContextoDeCaptura(contexto?: AudioContext) {
  const c = contexto ?? (usuariosDe(ctxNativo) > 0 ? ctxNativo : ctxDoModelo);
  if (!c) return;
  const restantes = Math.max(0, usuariosDe(c) - 1);
  usuarios.set(c, restantes);
  if (restantes === 0) void c.suspend().catch(() => {});
}

/** Só para os testes: quantos donos os contextos têm agora. */
export function usuariosDoContexto(): number {
  return usuariosDe(ctxDoModelo) + usuariosDe(ctxNativo);
}

async function garantirWorklet(c: AudioContext) {
  // a promessa é guardada, não um booleano: duas cadeias montando ao mesmo
  // tempo esperam o mesmo `addModule` em vez de disputá-lo
  worklet ??= c.audioWorklet.addModule(`${BASE}/rnnoise-worklet.js`);
  try {
    await worklet;
  } catch (e) {
    // falhou: a próxima tentativa tem de poder registrar de novo
    worklet = null;
    throw e;
  }
}

/** Só para os testes: quantas cadeias estão montadas neste contexto. */
export function cadeiasMontadas(): number {
  return montadas;
}

/**
 * Pré-aquece a supressão avançada: o pacote, o `.wasm` e o `addModule`.
 *
 * As três coisas são caras **uma vez por aba** e hoje eram pagas no pior
 * momento possível — no meio da entrada na call, com a pessoa olhando a tela de
 * espera. O `import()` é um chunk separado; o `loadRnnoise` baixa dois `.wasm`;
 * o `addModule` compila o worklet. Feito no repouso (ao abrir o app, ou quando
 * o mouse passa pelo canal de voz), a entrada encontra tudo memoizado:
 * `carregarModelo` guarda a promessa e `garantirWorklet` também.
 *
 * A `AudioContext` de 48 kHz nasce **suspensa** — criá-la sem gesto do usuário
 * é permitido, só não toca som —, e é a mesma que a cadeia avançada vai usar
 * depois. Ela só aparece aqui porque quem pré-aquece já escolheu "Avançada"
 * (`preaquecerCadeiaDeVoz`, em `stores/voice`); para os outros níveis este
 * caminho não roda e nenhum contexto com taxa forçada chega a existir.
 * `addModule` funciona em contexto suspenso; quem o acorda é
 * `usarContextoDeCaptura`, no clique.
 *
 * Nunca rejeita: pré-aquecer é otimização. Se falhar, a entrada tenta de novo
 * pelo caminho normal e, aí sim, avisa a pessoa (`aoFalharASupressao`).
 */
export async function preaquecerSupressor(): Promise<void> {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  try {
    await garantirWebAssembly();
  } catch {
    // esta janela não compila wasm: não adianta baixar modelo nenhum
    return;
  }
  await Promise.all([
    carregarModelo().catch(() => {}),
    garantirWorklet(contextoDeCaptura(true)).catch(() => {}),
  ]);
}

export interface CadeiaDoMicrofone
  extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  /** Volume de entrada, 0–2. Vale na hora, sem republicar a faixa. */
  setGanho(valor: number): void;
}

/**
 * Monta a cadeia como um processador de faixa do LiveKit.
 *
 * `supressao` liga o RNNoise; sem ele a cadeia é só o ganho — e continua
 * existindo, porque tirá-la e recolocá-la a cada mudança de volume republicaria
 * o microfone no meio da frase.
 */
export function cadeiaDoMicrofone(inicial: {
  supressao: boolean;
  ganho: number;
}): CadeiaDoMicrofone {
  const opcoes = { ...inicial };

  let fonte: MediaStreamAudioSourceNode | null = null;
  let no: (AudioWorkletNode & { destroy(): void }) | null = null;
  let ganho: GainNode | null = null;
  let destino: MediaStreamAudioDestinationNode | null = null;
  /**
   * O contexto que ESTA cadeia tomou. Guardado porque agora existem dois: ler
   * um global na hora de devolver (ou de mexer no ganho) devolveria o contexto
   * do vizinho quando a supressão avançada tivesse acabado de entrar em cena.
   */
  let contexto: AudioContext | null = null;
  /** true entre a `destroy()` e uma `init()` nova: a cadeia não pode ressuscitar sozinha. */
  let montada = false;
  /**
   * `init`, `restart` e `destroy` chegam de lados diferentes (nós, o LiveKit ao
   * trocar de microfone, o `stop()` da faixa) e o SDK não espera pela nossa
   * `destroy()`. A fila é o que torna a `destroy()` idempotente de verdade:
   * ela nunca roda no meio de uma `init()`.
   */
  let fila: Promise<void> = Promise.resolve();
  const emFila = (fn: () => Promise<void>): Promise<void> => {
    fila = fila.then(fn, fn);
    return fila;
  };

  function desmontar() {
    if (!montada) return;
    montada = false;
    montadas = Math.max(0, montadas - 1);
    fonte?.disconnect();
    no?.disconnect();
    no?.destroy();
    ganho?.disconnect();
    destino?.disconnect();
    // a faixa de saída é uma `MediaStreamTrack` como outra qualquer: sem parar,
    // ela fica viva depois de a cadeia morrer (o `stop()` da faixa local do
    // LiveKit só para a de **entrada**)
    destino?.stream.getTracks().forEach((t) => t.stop());
    fonte = null;
    no = null;
    ganho = null;
    destino = null;
    cadeia.processedTrack = undefined;
    // o contexto fica de pé (é compartilhado), mas suspenso não gasta CPU
    liberarContextoDeCaptura(contexto ?? undefined);
    contexto = null;
  }

  /**
   * O nó do RNNoise, já com o modelo carregado. Só existe com a supressão
   * ligada, e só depois de a sonda dizer que este navegador compila
   * WebAssembly — ver `SupressaoIndisponivel`. Cada falha vira uma
   * `SupressaoIndisponivel` com o motivo em português, porque é ele que a
   * pessoa vai ler no toast.
   */
  async function criarNoDoModelo(c: AudioContext) {
    await garantirWebAssembly();
    const [{ RnnoiseWorkletNode, wasmBinary }] = await Promise.all([
      carregarModelo().catch((cause: unknown) => {
        throw new SupressaoIndisponivel(`o modelo não carregou (${BASE}/rnnoise*.wasm)`, {
          cause,
        });
      }),
      garantirWorklet(c).catch((cause: unknown) => {
        throw new SupressaoIndisponivel(
          `o worklet não carregou (${BASE}/rnnoise-worklet.js)`,
          { cause },
        );
      }),
    ]);
    // mono: o microfone é uma fonte só, e cada canal a mais é uma inferência
    // a mais por quadro
    const criado = new RnnoiseWorkletNode(c, { maxChannels: 1, wasmBinary }) as typeof no;
    // o worklet pode morrer depois de montado (o `process` lançou): sem isto,
    // o nó continua no grafo devolvendo silêncio e ninguém fica sabendo
    if (criado) {
      criado.onprocessorerror = () => avisar("o worklet do RNNoise parou de rodar");
    }
    return criado;
  }

  async function montar(track: MediaStreamTrack) {
    // só o RNNoise exige 48 kHz; a cadeia de puro ganho roda na taxa do
    // aparelho, como qualquer um que apenas ouve o sinal
    const c = usarContextoDeCaptura(opcoes.supressao);
    contexto = c;
    montada = true;
    montadas += 1;
    // O modelo é carregado ANTES de o grafo existir: publicar a faixa e só
    // então esperar o wasm é o que mandava alguns segundos de áudio cru.
    //
    // E a falha dele **não** derruba a cadeia: o ganho também é dela, e um nó
    // de RNNoise que não subiu devolve silêncio (ver `SupressaoIndisponivel`),
    // o que é pior do que publicar a voz sem supressão. Quem conta à pessoa o
    // que houve é `avisar` → toast.
    let noDoModelo: typeof no = null;
    if (opcoes.supressao) {
      try {
        noDoModelo = await criarNoDoModelo(c);
        // subiu: uma recusa anterior (outra aba, outro contexto) não vale mais
        indisponivel = null;
      } catch (e) {
        avisar(motivoDe(e));
      }
    }
    // suspenso pela cadeia anterior: sem isto o grafo nasce parado e não sai som
    if (c.state === "suspended") await c.resume().catch(() => {});

    fonte = c.createMediaStreamSource(new MediaStream([track]));
    ganho = c.createGain();
    destino = c.createMediaStreamDestination();
    no = noDoModelo;
    if (no) fonte.connect(no).connect(ganho);
    else fonte.connect(ganho);
    ganho.connect(destino);

    // sobe do silêncio em vez de entrar com o áudio no volume cheio
    const agora = c.currentTime;
    ganho.gain.setValueAtTime(0, agora);
    ganho.gain.linearRampToValueAtTime(opcoes.ganho, agora + SUBIDA_S);

    cadeia.processedTrack = destino.stream.getAudioTracks()[0];
  }

  const cadeia: CadeiaDoMicrofone = {
    name: "cadeia-do-microfone",

    init: ({ track }: AudioProcessorOptions) =>
      emFila(async () => {
        desmontar();
        await montar(track);
      }),

    restart: ({ track }: AudioProcessorOptions) =>
      emFila(async () => {
        desmontar();
        await montar(track);
      }),

    destroy: () => emFila(async () => desmontar()),

    setGanho: (valor) => {
      opcoes.ganho = valor;
      if (!ganho || !contexto) return;
      const agora = contexto.currentTime;
      // segura o valor de agora antes de agendar o próximo: sem isto, mexer no
      // slider durante os 120 ms de subida deixaria a rampa antiga terminar por
      // cima e o volume voltaria sozinho para o anterior
      ganho.gain.cancelAndHoldAtTime?.(agora);
      // rampa curta: um salto de ganho estala no fone de quem escuta
      ganho.gain.setTargetAtTime(valor, agora, AJUSTE_S);
    },
  };

  return cadeia;
}
