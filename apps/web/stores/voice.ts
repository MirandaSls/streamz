import { create } from "zustand";
import {
  type CallEndedEvent,
  type CallRingEvent,
  type Channel,
  MEDIA_QUALITY,
  PTT_RELEASE_MS,
  type PublicUser,
  SCREEN_QUALITY,
  SCREEN_QUALITY_PADRAO,
  type ScreenQuality,
  type VoiceEvictedEvent,
  type VoiceFlags,
  type VoiceMovedEvent,
  type VoiceStateEvent,
  WS_EVENTS,
  displayNameOf,
  donoDaIdentidade,
} from "@streamz/shared";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { api } from "@/lib/api";
import {
  descartarTelaNativa as ponteDescartarTela,
  ehAndroidNoTauri,
  iniciarServicoDeChamada,
  iniciarTelaNativa,
  isTauri,
  ouvirSaidaPelaNotificacao,
  ouvirTelaEncerrada,
  pararServicoDeChamada,
  pararTelaNativa,
  prepararTelaNativa as pontePrepararTela,
} from "@/lib/desktop";
import { tocarSom, tocarSomDeMovido } from "@/lib/ringtone";
import { cronometroDeVoz, type CronometroDeVoz } from "@/lib/tempos-de-voz";
import { montarPedido } from "@/lib/seletor-de-tela";
import {
  aoFalharASupressao,
  esquecerSupressaoIndisponivel,
  preaquecerSupressor,
  supressaoIndisponivel,
} from "@/lib/supressor-ruido";
import {
  abrirMicrofone,
  atualizarMicrofone,
  definirMicrofoneAberto,
  definirMicrofoneEmTeste,
  fecharMicrofone,
  type PreferenciasDoMicrofone,
  type RestricoesDeMicrofone,
  type SalaDoMicrofone,
} from "@/lib/microfone";
import { aplicarAssinaturas, type ParticipanteDeTela } from "@/stores/assinaturas-de-tela";
import { CHAMADA_INICIAL, callReducer, type CallAction, type CallState } from "@/stores/call-machine";
import { jaNaChamada, type ConexaoDeChamada } from "@/stores/chamada-em-curso";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { iniciarMedicaoDePing, pararMedicaoDePing } from "@/stores/voice-ping";
import { estadosAposReconexao, type Recarga } from "@/stores/voice-reconexao";
import { chamadaARetomar, esquecerSala, lembrarSala, salaLembrada } from "@/stores/voice-retomada";
import { decidirMovido } from "@/stores/voice-mover";
import { chaveDaAcao, decidirServicoDeChamada } from "@/stores/servico-de-chamada";
import { decidirSaida, type MotivoDeSaida } from "@/stores/voice-saida";
import {
  NINGUEM,
  comFalante,
  falantesDeIdentidades,
  proximoConjunto,
} from "@/stores/voice-falantes";
import { armarDetectorLocal, desarmarDetectorLocal } from "@/stores/voz-detector-local";
import {
  iniciarTeste,
  pararTeste,
  testeSobrevive,
  type EstadoDoTeste,
  type PrefsDeVoz,
} from "@/stores/teste-de-microfone";
import { ui } from "@/stores/ui";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useVoiceDevicesStore } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Voz: quem está em cada sala, a minha conexão e a chamada em DM.
 *
 * Duas camadas que não se confundem:
 *
 * 1. **Estado de voz** (`states`) — quem está em qual canal, mudo ou não. Vem
 *    do gateway (`voice.state`) e existe com ou sem servidor de mídia. É o que
 *    a barra lateral desenha.
 * 2. **Mídia** (`room`) — a conexão LiveKit. Só existe quando o LiveKit está
 *    configurado; sem ele a camada 1 continua funcionando (dá para entrar num
 *    canal, tocar uma chamada e ver quem entrou — só não sai som), e **em
 *    silêncio**: falta de configuração não é erro do usuário, então não vira
 *    faixa de aviso permanente. `erro` fica reservado para falha real de
 *    conexão, que é o único caso em que oferecer "tentar de novo" faz sentido.
 *
 * O objeto `Room` do SDK é mutável e cheio de referências circulares, então ele
 * fica **fora** do estado observável (`sala`, no módulo) e a store guarda um
 * `tick` que os eventos do SDK incrementam para forçar o re-render.
 */

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

/** Sala do canal em que estou — fora da store, ver o comentário acima. */
let sala: Room | null = null;
/**
 * A transmissão de tela em curso é a **nativa** (captura no Rust, participante
 * `#tela`)? Fora do estado observável como `sala`: é detalhe de transporte, e
 * o que a interface lê é `screenOn`.
 */
let telaNativa = false;
/**
 * A credencial do `#tela` já buscada e a sala já pré-conectada por
 * `prepararTelaNativa` (o seletor abrindo). Guardada aqui para o clique na
 * miniatura não pagar nem o `POST /tela-token` nem o handshake do LiveKit.
 * `channelId` junto porque trocar de canal com o seletor aberto invalida as
 * duas coisas.
 */
let telaPreparada: { url: string; token: string; channelId: string } | null = null;
/**
 * Geração da pré-conexão. Preparar é assíncrono em duas etapas (token e
 * `connect`), e o seletor pode fechar no meio: sem este contador a conexão
 * que chegasse atrasada deixaria um `#tela` mudo na sala para sempre. Quem
 * descarta, publica ou desmonta a sala incrementa; quem preparava e vê o
 * número mudado desfaz o que acabou de abrir.
 */
let geracaoDeTela = 0;

interface VoiceStoreState {
  /** estados de voz por canal (só quem está conectado). */
  states: Record<string, VoiceStateEvent[]>;

  // ── minha conexão ──
  channelId: string | null;
  guildId: string | null;
  channelName: string;
  /**
   * Quando entrei nesta call (epoch ms) — é o que alimenta o cronômetro do
   * canal na barra lateral. Fica na store, e não num `useState` do componente,
   * porque a barra lateral desmonta ao trocar de servidor e a call não: um
   * cronômetro local voltaria a zero sem nada ter acontecido.
   */
  desde: number | null;
  status: VoiceStatus;
  erro: string | null;
  /** o LiveKit respondeu com credenciais? false = sala sem som, sem alarde. */
  midiaDisponivel: boolean;
  /**
   * O microfone já está no ar nesta sala?
   *
   * `status: "connected"` passou a significar **estou na sala e ouvindo** — o
   * microfone sobe depois, sem segurar a entrada (ver `entrarNaSala`). Entre um
   * e outro a pessoa ouve todo mundo e ninguém a ouve, e a barra de controles
   * mostra o microfone como mudo, com "Ativando microfone…" no rótulo. Sem esta
   * flag não haveria como distinguir "estou mudo porque quis" de "a faixa ainda
   * não subiu", e o segundo caso pareceria um defeito.
   */
  microfonePronto: boolean;
  tick: number;
  /**
   * Quem está falando agora, por `userId` — a fonte **única** do anel verde,
   * lida igual pelo palco, pela lista do canal e pela lista de membros.
   * Ver `stores/voice-falantes.ts` para de onde vem cada nome do conjunto.
   */
  falando: ReadonlySet<string>;
  /**
   * Teste de microfone em curso (o do `PopoverDeRuido`, o da aba "Voz e vídeo"
   * e o do `VoiceSettingsPanel`). Enquanto ele vale, o meu microfone sai da
   * sala e **mudo e surdo são ligados de verdade** — com som, com ícone no
   * rodapé e com `voice.update`, como se eu tivesse clicado. Parar restaura o
   * par de antes. Ver `stores/teste-de-microfone.ts`.
   */
  testandoMicrofone: boolean;

  // ── mídia local ──
  camOn: boolean;
  /**
   * Que lado da câmera está no ar — só faz sentido em aparelho com duas.
   *
   * Fica aqui e não em `voiceDevices` porque não é *um dispositivo*: no celular
   * o navegador entrega frontal e traseira como dois `videoinput` com ids
   * opacos que **mudam entre sessões**, e guardar o id não sobrevive a um
   * recarregamento. `facingMode` é a mesma escolha em termos que o `getUserMedia`
   * entende em qualquer aparelho.
   */
  facingMode: "user" | "environment";
  screenOn: boolean;
  screenQuality: ScreenQuality;
  screenAudio: boolean;
  /** ajustes de áudio da aba "Voz e vídeo" (persistidos no browser). */
  audio: AudioPrefs;
  /**
   * Por que a supressão **avançada** não está no ar, quando ela foi escolhida.
   *
   * Não é preferência e não se persiste: é um fato desta janela (a CSP, o
   * navegador, o `/supressor/` que não subiu). Existe porque a falha era
   * completamente calada — ver `SupressaoIndisponivel` em
   * `lib/supressor-ruido.ts`. Enquanto vale, a captura volta a usar a supressão
   * do navegador (`restricoesDeCaptura`).
   */
  erroDeSupressao: string | null;

  // ── preferências por participante (locais, não vão para o servidor) ──
  volumes: Record<string, number>;
  silenciados: Record<string, boolean>;

  // ── foco/tela cheia da grade ──
  focado: string | null;
  /**
   * Ninguém escolheu o palco ainda, então uma transmissão que comece pode
   * assumi-lo sozinha. Escolher (ou desfazer) o foco à mão desliga isso — quem
   * saiu de uma transmissão não quer ser jogado de volta nela.
   */
  focoAutomatico: boolean;
  telaCheia: boolean;
  /**
   * Telas que eu escolhi assistir, por id de **dono** (a captura pode ser um
   * participante `#tela`, mas quem se assiste é a pessoa).
   *
   * Dá para assistir a várias ao mesmo tempo: cada uma vira um tile no palco.
   * O conjunto é o que decide a assinatura da faixa no LiveKit — tela que
   * ninguém está olhando não é baixada (ver `aplicarAssinaturasDeTela`).
   */
  assistindo: Set<string>;
  /**
   * Dono da tela cuja **miniatura ao vivo** está aberta (o pop-up do hover na
   * lista do canal). Assina a faixa em baixa qualidade enquanto durar, e só.
   */
  previa: string | null;

  // ── chamada em conversa direta ──
  call: CallState;

  loadGuild: (guildId: string) => Promise<void>;
  /** Estado da chamada de uma conversa (o par de `loadGuild` para DM e grupo). */
  loadDM: (channelId: string) => Promise<void>;
  /**
   * Depois de recarregar a página no meio de uma chamada, volta a ela sozinho
   * (ver `voice-retomada.ts`). Chamado ao fim de cada carga de estados.
   */
  retomarSeReconectando: () => Promise<void>;
  /**
   * Socket voltou: recarrega o servidor ativo **e** a sala em que estou, e só
   * então troca `states` (ver `voice-reconexao.ts`).
   */
  recarregarAposReconexao: (guildAtivo: string | null) => Promise<void>;
  applyState: (evento: VoiceStateEvent) => void;
  /** perfil trocou (`user.updated`): atualiza o retrato dentro dos estados. */
  aplicarPerfil: (user: PublicUser) => void;
  /** Estados de um canal, ordenados por nome (para a barra lateral). */
  statesOf: (channelId: string) => VoiceStateEvent[];

  connect: (
    channel: Pick<Channel, "id" | "guildId" | "name" | "type">,
    /**
     * `som: false` é de quem já tocou o próprio aviso; `forcar` é de quem
     * precisa refazer a **mesma** sala (`reconnect`), e por isso não pode
     * esbarrar na guarda de "já estou aqui".
     */
    opcoes?: { som?: boolean; forcar?: boolean },
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  /** O servidor tirou esta conexão da voz: a conta entrou de outro lugar. */
  expulsoDaVoz: (evento: VoiceEvictedEvent) => void;
  /** Alguém com "mover membros" me arrastou para outro canal de voz. */
  movidoDeCanal: (evento: VoiceMovedEvent) => Promise<void>;
  reconnect: () => Promise<void>;
  /** Reentra na sala de voz depois de o socket voltar (ver `useRealtime`). */
  rejoinAposReconexao: () => Promise<void>;

  toggleCam: () => Promise<void>;
  /**
   * Troca frontal ↔ traseira **sem derrubar a sala**.
   *
   * `restartTrack` reabre a captura dentro da faixa que já está publicada: o
   * `trackSid` não muda, ninguém do outro lado vê um `unpublish`/`publish` e a
   * `Room` continua exatamente onde estava (§7: ninguém derruba a sala). Parar
   * e republicar a câmera faria a imagem sumir e voltar para todo mundo — que
   * é justamente o que o comentário do fim deste arquivo já dizia sobre trocar
   * de câmera pelas configurações.
   */
  virarCamera: () => Promise<void>;
  /** Publica uma captura já obtida pelo botão do navegador (ver ScreenShareButton). */
  publicarTela: (stream: MediaStream) => Promise<void>;
  /**
   * Transmite uma janela ou tela pela captura nativa do desktop: o Rust entra
   * na sala como `<userId>#tela` e publica; aqui só o estado e o token.
   */
  publicarTelaNativa: (fonteId: string) => Promise<void>;
  /** Pré-conecta o `#tela` na sala enquanto o seletor está aberto. */
  prepararTelaNativa: () => Promise<void>;
  /** Desfaz a pré-conexão (seletor fechado sem escolha). */
  descartarTelaNativa: () => Promise<void>;
  pararTela: () => Promise<void>;
  setScreenQuality: (q: ScreenQuality) => void;
  setScreenAudio: (on: boolean) => void;
  setAudioPref: (patch: Partial<AudioPrefs>) => void;

  setVolume: (userId: string, volume: number) => void;
  toggleSilenciado: (userId: string) => void;
  /**
   * Põe um tile no palco, ou tira o que está lá (clicar no focado volta à
   * grade). A chave é a do tile, não o id da pessoa: quem assiste a duas telas
   * tem dois tiles do mesmo dono.
   */
  setFocado: (chave: string | null) => void;
  /** Foco sem gesto do usuário (transmissão que começa): não desliga o automático. */
  focarAutomaticamente: (chave: string) => void;
  setTelaCheia: (ativo: boolean) => void;
  /** Passa a assistir à tela desta pessoa (assina a faixa). */
  assistir: (userId: string) => void;
  /** Para de assistir (desassina a faixa e some com o tile do palco). */
  pararDeAssistir: (userId: string) => void;
  /** Abre/fecha a miniatura ao vivo do hover — assinatura em baixa qualidade. */
  abrirPrevia: (userId: string | null) => void;

  startCall: (channelId: string, comVideo: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => Promise<void>;
  handleRing: (evento: CallRingEvent) => void;
  handleEnded: (evento: CallEndedEvent) => void;
  dispatchCall: (action: CallAction) => void;

  /** Reenvia mudo/surdo/vídeo/tela ao gateway e aplica no SDK. */
  syncFlags: () => void;

  /**
   * Começa o teste de microfone: tira a faixa da sala e liga mudo e surdo pelo
   * caminho normal (`voicePrefs.setMuteDeafen`), guardando o par de antes. A
   * captura de retorno é do hook `useTesteDeMicrofone`, que ouve este estado —
   * aqui fica só o que a chamada precisa saber.
   */
  iniciarTesteDeMicrofone: () => void;
  /**
   * Para o teste e restaura o mudo/surdo de antes dele — a não ser que o
   * usuário já os tenha mudado na mão (ver `teste-de-microfone.ts`).
   */
  pararTesteDeMicrofone: () => void;
}

/**
 * Ajustes de áudio da aba "Voz e vídeo".
 *
 * Moram aqui (e não em `voicePrefs`) porque só fazem sentido com a mídia: o que
 * `voicePrefs` guarda é o par mudo/surdo, que vale com ou sem servidor de voz.
 *
 * Nem todos têm efeito no MVP e o comentário diz qual é qual, para ninguém
 * "consertar" um slider que já está certo:
 * - `saida` multiplica o volume de cada `<audio>` remoto — vale hoje.
 * - `processamento` vira restrição de captura do microfone — vale hoje.
 * - `entrada` é o "volume de entrada": um `GainNode` depois do supressor, na
 *   cadeia de captura (`lib/supressor-ruido.ts`) — vale hoje, e muda o volume
 *   na hora, sem republicar a faixa.
 * - `sensibilidade` e `pttAtrasoMs` ficam guardados mas ainda não mudam a
 *   captura: o limiar de voz é decidido pelo servidor de mídia, e o atraso do
 *   PTT vive em `voicePrefs`, que lê a constante do contrato.
 */
export interface AudioPrefs {
  /** volume de entrada do microfone, 0–2 (1 = sem mexer). */
  entrada: number;
  /** volume geral da saída, 0–2 (multiplica o volume por pessoa). */
  saida: number;
  /** limiar da atividade de voz, 0–1. */
  sensibilidade: number;
  /** folga entre soltar a tecla de PTT e o microfone fechar, em ms. */
  pttAtrasoMs: number;
  processamento: { eco: boolean; ruido: NivelDeRuido; ganho: boolean };
}

/**
 * Quanto de supressão de ruído aplicar no microfone.
 *
 * - `off`: nada, o microfone cru.
 * - `padrao`: a do navegador (`noiseSuppression` do getUserMedia). Subtração
 *   espectral: come chiado e ventilador, não come teclado nem cachorro.
 * - `avancada`: RNNoise em WebAssembly antes de publicar (ver
 *   `lib/supressor-ruido.ts`). Bem melhor, ao custo de CPU no cliente — por
 *   isso é escolha, e não o padrão.
 */
export type NivelDeRuido = "off" | "padrao" | "avancada";

const AUDIO_PADRAO: AudioPrefs = {
  entrada: 1,
  saida: 1,
  sensibilidade: 0.35,
  pttAtrasoMs: PTT_RELEASE_MS,
  processamento: { eco: true, ruido: "padrao", ganho: true },
};

const AUDIO_KEY = "voiceAudioPrefs";

function carregarAudio(): AudioPrefs {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(AUDIO_KEY) : null;
    if (!raw) return AUDIO_PADRAO;
    const lido = JSON.parse(raw) as Partial<AudioPrefs>;
    const processamento = { ...AUDIO_PADRAO.processamento, ...(lido.processamento ?? {}) };
    // `ruido` era booleano antes de existir o nível "avançada": quem já tinha
    // preferência salva não pode cair no padrão por causa da mudança de tipo
    const bruto = (lido.processamento as { ruido?: unknown } | undefined)?.ruido;
    if (typeof bruto === "boolean") processamento.ruido = bruto ? "padrao" : "off";
    return { ...AUDIO_PADRAO, ...lido, processamento };
  } catch {
    return AUDIO_PADRAO;
  }
}

/** Falha real de conexão: é o único texto que vira faixa vermelha com "tentar de novo". */
const FALHA_MIDIA = "Não foi possível conectar ao servidor de voz.";
const QUEDA_MIDIA = "A conexão de voz caiu.";
const SEM_SALA = "Você não está conectado a um canal de voz.";

/**
 * Expulso porque a conta entrou em voz de outro lugar.
 *
 * Antes isto chegava como `QUEDA_MIDIA` — o LiveKit derruba a identidade
 * repetida, o `RoomEvent.Disconnected` dispara e o handler supõe queda de rede.
 * Dizer "a conexão caiu" para quem acabou de entrar pelo celular manda a pessoa
 * investigar a internet quando o app está funcionando exatamente como devia.
 */
const OUTRO_LUGAR = "Você entrou na chamada em outro dispositivo.";

/**
 * O `set` da store, na forma que a zustand entrega — inclusive a de função,
 * que é a única segura para mexer no conjunto de falantes: o valor anterior tem
 * de vir do estado do momento, e não de um `get()` de antes do `await`.
 */
type AjustarVoz = (
  partial:
    | Partial<VoiceStoreState>
    | ((estado: VoiceStoreState) => Partial<VoiceStoreState>),
) => void;

/** Resultado de tentar abrir a mídia: falta de configuração ≠ falha. */
type ResultadoMidia = { tipo: "ok" } | { tipo: "sem-config" } | { tipo: "falha"; erro: string };

/** O recorte da store que `chamada-em-curso.ts` lê (a guarda do clique repetido). */
function instantaneo(s: VoiceStoreState): ConexaoDeChamada {
  return {
    channelId: s.channelId,
    status: s.status,
    fase: s.call.phase,
    canalDaChamada: s.call.channelId,
  };
}

/**
 * Desmonta a sala de mídia sem tocar no estado de voz (que é do servidor).
 *
 * Mora no escopo do módulo, e não dentro da store, porque `entrarNaSala`
 * também precisa dela: **duas `Room` vivas ao mesmo tempo é o defeito**, não
 * um detalhe de arrumação. O LiveKit não aceita a mesma identidade duas vezes
 * — a conexão nova derruba a antiga —, e quem recebia esse tombo era o handler
 * de `Disconnected` da sala **velha**, que anunciava "a conexão de voz caiu" e
 * zerava `sala` por cima da sala nova, que estava perfeita.
 */
function desmontarSala() {
  // a transmissão nativa é uma segunda conexão: sair da sala tem que
  // derrubá-la também, senão o `#tela` fica na sala sem dono
  if (telaNativa) {
    telaNativa = false;
    void pararTelaNativa();
  }
  // idem para a sala que o seletor deixou pré-conectada sem publicar nada
  geracaoDeTela += 1;
  if (telaPreparada) {
    telaPreparada = null;
    void ponteDescartarTela();
  }
  if (!sala) return;
  pararMedicaoDePing();
  // o microfone tem dono e é ele quem desmonta a cadeia: a `Room` fecha a
  // própria `AudioContext` no `disconnect`, e o que estivesse pendurado nela
  // rodaria num contexto morto na próxima entrada
  void fecharMicrofone();
  desarmarDetectorLocal(() => {});
  sala.removeAllListeners();
  void sala.disconnect().catch(() => {});
  sala = null;
}

export const useVoice = create<VoiceStoreState>((set, get) => {
  /**
   * Re-render quando o SDK muda participantes/faixas.
   *
   * É aqui que as assinaturas de tela são reaplicadas: uma faixa que acabou de
   * ser publicada chega **depois** da escolha de assistir (o `assistindo` pode
   * ter sido montado antes de a pessoa ligar a tela), e sem isto ela entraria
   * assinada por padrão — que é justamente o gasto que se quer evitar.
   */
  const rerender = () => {
    aplicarAssinaturasDeTela();
    set((s) => ({ tick: s.tick + 1 }));
  };

  /** Flags atuais do usuário, do jeito que o gateway espera. */
  function flags(): VoiceFlags {
    const prefs = useVoicePrefs.getState();
    return {
      muted: !prefs.micAberto(),
      deafened: prefs.deafened,
      video: get().camOn,
      screen: get().screenOn,
    };
  }

  /** Desmonta a sala de mídia sem tocar no estado de voz (que é do servidor). */
  const fecharSala = desmontarSala;

  /**
   * Encerra o teste de microfone e devolve mudo/surdo ao que eram antes dele.
   *
   * `naSala` diz se ainda vale mexer na publicação: quem está saindo da call já
   * vai fechar a faixa, e republicá-la antes disso seria um "entrou/saiu" à toa
   * na sala que está indo embora.
   */
  function encerrarTeste(naSala: boolean) {
    if (!get().testandoMicrofone) return;
    const { estado, aplicar } = pararTeste(estadoDoTeste(), prefsDeVoz());
    anteriorDoTeste = estado.anterior;
    set({ testandoMicrofone: false });
    // a restauração vem antes de republicar: assim o dono da faixa já a
    // devolve à sala com o mudo certo, sem um mudo/desmudo no meio
    if (aplicar) useVoicePrefs.getState().setMuteDeafen(aplicar);
    if (naSala) aplicarTesteNaSala();
  }

  /**
   * Deixa a sala atual: fecha a mídia, avisa o gateway (quando a saída é
   * minha) e zera a minha conexão. O que **não** faz por conta própria é fechar
   * a coluna do canal de voz — isso depende do motivo, e a tabela está em
   * `voice-saida.ts`. Todo caminho que sai de uma sala passa por aqui;
   * `disconnect` é o caso "o usuário quis sair".
   */
  function sairDaSalaAtual(motivo: MotivoDeSaida, destinoEmServidor = false) {
    const { channelId, guildId, call } = get();
    // sair da call encerra o teste: ele existe para dizer "o outro lado vai te
    // ouvir assim", e sem outro lado não há o que testar. Antes do resto, para
    // o mudo/surdo voltarem ao que eram enquanto o gateway ainda escuta
    encerrarTeste(false);
    const decisao = decidirSaida(motivo, {
      destinoEmServidor,
      // o canal de voz que estou deixando ainda é o que está na coluna: há uma
      // `VistaDoCanalDeVoz` para onde voltar, em vez de cair no chat de largura
      // inteira. Numa chamada de conversa (`guildId` nulo) não há coluna, e
      // depois de navegar para outro canal o `voiceChannelId` já é outro
      canalDeServidorAberto:
        !!guildId && !!channelId && useChannels.getState().voiceChannelId === channelId,
    });
    // expulso não tem som: o que a pessoa ouve é o toast explicando
    if (channelId && decisao.avisaGateway) tocarSom("sair");
    // `fecharSala` tira os ouvintes antes de desconectar, então o
    // `RoomEvent.Disconnected` do LiveKit não vem depois marcar queda de mídia
    fecharSala();
    // saí de vez: um F5 depois disto não deve me trazer de volta
    esquecerSala();
    if (channelId && decisao.avisaGateway) {
      emit(WS_EVENTS.VOICE_LEAVE, {});
      if (call.phase !== "idle") emit(WS_EVENTS.CALL_END, { channelId });
    }
    // fechar aqui é o que devolve a coluna 3 ao chat do canal; quando a decisão
    // é manter, o `VoicePanel` continua montado e desenha a vista do canal
    if (decisao.fechaColuna) useChannels.getState().leaveVoice();
    set({
      channelId: null,
      guildId: null,
      channelName: "",
      desde: null,
      status: "idle",
      erro: null,
      midiaDisponivel: false,
      microfonePronto: false,
      falando: NINGUEM,
      // o teste já foi encerrado (com a restauração) no topo desta função;
      // aqui é só o campo voltando ao padrão junto com o resto
      testandoMicrofone: false,
      camOn: false,
      screenOn: false,
      focado: null,
      focoAutomatico: true,
      telaCheia: false,
      assistindo: new Set(),
      previa: null,
      call: CHAMADA_INICIAL,
    });
  }

  return {
    states: {},
    channelId: null,
    guildId: null,
    channelName: "",
    desde: null,
    status: "idle",
    erro: null,
    midiaDisponivel: false,
    microfonePronto: false,
    tick: 0,
    falando: NINGUEM,
    testandoMicrofone: false,
    camOn: false,
    facingMode: "user",
    screenOn: false,
    screenQuality: SCREEN_QUALITY_PADRAO,
    screenAudio: true,
    audio: carregarAudio(),
    erroDeSupressao: null,
    volumes: {},
    silenciados: {},
    focado: null,
    focoAutomatico: true,
    telaCheia: false,
    assistindo: new Set<string>(),
    previa: null,
    call: CHAMADA_INICIAL,

    loadGuild: async (guildId) => {
      try {
        const estados = await api.guildVoiceStates(guildId);
        const porCanal: Record<string, VoiceStateEvent[]> = {};
        for (const e of estados) (porCanal[e.channelId] ??= []).push(e);
        // a resposta é a verdade **deste** servidor: some com os canais dele que
        // esvaziaram, e preserva o cache dos outros — trocar de servidor não pode
        // apagar quem está nas salas do anterior (a barra lateral e o palco leem
        // daqui mesmo com o servidor em segundo plano)
        set((s) => {
          const outros = Object.fromEntries(
            Object.entries(s.states).filter(([, lista]) => lista[0]?.guildId !== guildId),
          );
          return { states: { ...outros, ...porCanal } };
        });
        await get().retomarSeReconectando();
      } catch {
        // servidor sem voz ou sem acesso: a barra lateral fica sem bolinhas
      }
    },

    loadDM: async (channelId) => {
      try {
        const estados = await api.dmVoiceStates(channelId);
        // a resposta é a verdade **desta** conversa; as outras salas ficam como estão
        set((s) => ({ states: { ...s.states, [channelId]: estados } }));
        await get().retomarSeReconectando();
      } catch {
        // conversa que sumiu ou sem acesso: a faixa de chamada simplesmente não aparece
      }
    },

    recarregarAposReconexao: async (guildAtivo) => {
      const { channelId, guildId } = get();
      const pedidos: Promise<Recarga>[] = [];
      const doServidor = (id: string) =>
        api
          .guildVoiceStates(id)
          .then((estados): Recarga => ({ escopo: "servidor", guildId: id, estados }))
          .catch((): Recarga => ({ escopo: "servidor", guildId: id, estados: null }));
      if (guildAtivo) pedidos.push(doServidor(guildAtivo));
      // a minha sala: uma conversa tem rota própria; um canal de voz de outro
      // servidor vem com o servidor dele (o ativo já cobre o próprio)
      if (channelId && !guildId) {
        pedidos.push(
          api
            .dmVoiceStates(channelId)
            .then((estados): Recarga => ({ escopo: "sala", channelId, estados }))
            .catch((): Recarga => ({ escopo: "sala", channelId, estados: null })),
        );
      } else if (guildId && guildId !== guildAtivo) {
        pedidos.push(doServidor(guildId));
      }
      const recargas = await Promise.all(pedidos);
      set((s) => ({ states: estadosAposReconexao(s.states, recargas) }));
    },

    retomarSeReconectando: async () => {
      const alvo = chamadaARetomar({
        states: get().states,
        meuId: useAuth.getState().user?.id,
        conectadoEm: get().channelId,
        lembrada: salaLembrada(),
      });
      if (!alvo) return;
      // duas cargas podem terminar quase juntas (servidor ativo + sala
      // lembrada): a primeira a chegar aqui esquece a sala e a segunda não
      // acha nada. `connect` volta a lembrar
      esquecerSala();
      if (alvo.guildId) {
        await get().connect({ id: alvo.channelId, guildId: alvo.guildId, name: alvo.name, type: "VOICE" });
        // com os canais do servidor já na tela, abre o palco; senão a barra do
        // rodapé mostra a conexão e o clique no canal encontra a sala já ocupada
        const canal = useChannels.getState().channels.find((c) => c.id === alvo.channelId);
        // `"retomada"`: quem decidiu reconectar foi o `chamadaARetomar` logo
        // acima. O `select` aqui só põe o canal na tela — se ele entrasse por
        // conta própria, um F5 fora da carência viraria uma entrada nova
        if (canal) useChannels.getState().select(canal, "retomada");
        return;
      }
      // a chamada de conversa é a tela em que a pessoa estava: volta para ela
      await abrirConversa(alvo.channelId);
      await get().connect({ id: alvo.channelId, guildId: null, name: "", type: "DM" });
    },

    applyState: (evento) => {
      const meuCanal = get().channelId;
      const eu = evento.user.id === useAuth.getState().user?.id;
      const jaEstava = (get().states[evento.channelId] ?? []).some(
        (e) => e.user.id === evento.user.id,
      );
      // entrar e sair da **minha** sala tem som, como no Discord; movimento em
      // outro canal é ruído para quem não está lá
      if (!eu && evento.channelId === meuCanal && evento.connected !== jaEstava) {
        tocarSom(evento.connected ? "alguem-entrou" : "alguem-saiu");
      }
      set((s) => {
        const atual = s.states[evento.channelId] ?? [];
        const semEle = atual.filter((e) => e.user.id !== evento.user.id);
        const lista = evento.connected ? [...semEle, evento] : semEle;
        return { states: { ...s.states, [evento.channelId]: lista } };
      });
      // **Outra pessoa** entrou na minha chamada de DM: ela deixou de estar
      // "tocando". O `!eu` é o que fazia o ringback não existir: `startCall`
      // aplica os estados que o `POST /dms/:id/call` devolve, e o primeiro
      // deles sou **eu** entrando na sala — a chamada virava `active` antes de
      // o outro lado atender, o `<audio loop>` da `VoiceLayer` parava no mesmo
      // instante e quem ligava ouvia silêncio. Quem confirma a chamada é
      // sempre o outro lado
      const { call, channelId } = get();
      if (!eu && evento.connected && evento.channelId === channelId && call.phase !== "idle") {
        get().dispatchCall({ type: "connected", channelId: evento.channelId });
      }
      // **a minha conta** entrou nesta chamada, e não foi por esta janela:
      // atendi no celular, no desktop ou na outra aba. Desde o #117 os eventos
      // vão para todas as sessões da conta, e sem isto a segunda continuava
      // tocando os 30 s inteiros com o cartão "Atender" na tela — e atender ali
      // entraria na sala com a **mesma identidade**, expulsando a sessão que
      // já estava na chamada. Não é recusa: nada é avisado ao gateway, o
      // telefone só se cala
      if (
        eu &&
        evento.connected &&
        call.phase === "incoming" &&
        call.channelId === evento.channelId &&
        channelId !== evento.channelId
      ) {
        get().dispatchCall({ type: "reset" });
      }
    },

    /**
     * O `user` dentro de `VoiceStateEvent` é o retrato de quem a pessoa era
     * quando entrou na chamada — o servidor só reemite esse evento quando
     * alguém entra, sai ou muda mudo/vídeo. Trocar a foto ou o nome no meio da
     * chamada não mexia em nada aqui, e por isso a mudança só aparecia depois
     * de sair e voltar.
     *
     * Reescrever a lista é barato porque ela é pequena por definição (quem está
     * numa chamada), ao contrário de `members`/`messages` — que continuam
     * resolvendo pelo overlay de `usePresence` na hora de desenhar.
     */
    aplicarPerfil: (user) =>
      set((s) => {
        let mudou = false;
        const states: Record<string, VoiceStateEvent[]> = {};
        for (const [canal, lista] of Object.entries(s.states)) {
          if (!lista.some((e) => e.user.id === user.id)) {
            states[canal] = lista;
            continue;
          }
          mudou = true;
          states[canal] = lista.map((e) => (e.user.id === user.id ? { ...e, user } : e));
        }
        // sem `mudou`, um `user.updated` de quem não está em chamada nenhuma
        // trocaria a referência de `states` e re-renderizaria toda a grade
        return mudou ? { states } : s;
      }),

    statesOf: (channelId) =>
      (get().states[channelId] ?? [])
        .slice()
        .sort((a, b) => a.user.username.localeCompare(b.user.username)),

    connect: async (channel, opcoes) => {
      const anterior = get().channelId;
      // já estou (ou estou entrando) nesta sala: o pedido não tem o que fazer.
      // Sem esta linha, o segundo clique no mesmo canal abria uma **segunda**
      // `Room` com a mesma identidade e o LiveKit derrubava a primeira — a
      // "queda de alguns segundos" que também levava a tela compartilhada
      if (!opcoes?.forcar && jaNaChamada(instantaneo(get()), channel.id)) return;
      // trocar de sala não é sair: a coluna do canal de destino fica de pé
      if (anterior && anterior !== channel.id) sairDaSalaAtual("troca-de-sala", !!channel.guildId);

      set({
        channelId: channel.id,
        guildId: channel.guildId,
        channelName: channel.name ?? "voz",
        // reconectar depois de uma queda de mídia passa por aqui com o mesmo
        // canal: zerar o relógio ali diria que a call recomeçou, e ela não
        desde: anterior === channel.id ? get().desde ?? Date.now() : Date.now(),
        status: "connecting",
        erro: null,
        midiaDisponivel: false,
        // o microfone desta sala ainda não subiu — quem o sobe é
        // `publicarMicrofone`, depois de a sala estar de pé
        microfonePronto: false,
        falando: NINGUEM,
        camOn: false,
        screenOn: false,
        focado: null,
        focoAutomatico: true,
        assistindo: new Set<string>(),
        previa: null,
      });
      lembrarSala({ channelId: channel.id, guildId: channel.guildId, name: channel.name ?? "" });
      // `som: false` é de quem já tocou o próprio aviso — hoje só o `movido`,
      // que tem som próprio e não pode soar como uma entrada que eu escolhi
      if (opcoes?.som !== false) tocarSom("entrar");

      // 1) o estado de voz não depende do LiveKit: avisa o gateway primeiro,
      //    para que os outros já vejam você no canal mesmo sem mídia
      emit(WS_EVENTS.VOICE_JOIN, { channelId: channel.id });
      emit(WS_EVENTS.VOICE_UPDATE, flags());

      // 2) mídia, se houver
      const r = await conectarMidia(channel, set, rerender, get);
      if (r.tipo === "falha") {
        set({ status: "error", midiaDisponivel: false, erro: r.erro });
        return;
      }
      set({
        status: "connected",
        midiaDisponivel: r.tipo === "ok",
        erro: null,
      });
      if (r.tipo === "ok") get().syncFlags();
    },

    /** Sair porque o usuário quis (botão, atalho, "desligar", fim da chamada). */
    disconnect: async () => {
      sairDaSalaAtual("usuario");
    },

    expulsoDaVoz: ({ channelId, novoCanalId }) => {
      // já tinha saído daqui por conta própria: nada a desfazer
      if (get().channelId !== channelId) return;
      // sem `voice.leave`: o servidor já me tirou, e o aviso derrubaria a
      // conexão nova da conta. A coluna fecha — o painel mostraria uma sala em
      // que não estou mais
      sairDaSalaAtual("expulso");
      ui.toast(
        channelId === novoCanalId
          ? OUTRO_LUGAR
          : "Você entrou em outro canal de voz em outro dispositivo.",
      );
    },

    movidoDeCanal: async (evento) => {
      if (decidirMovido(evento, get().channelId) === "ignorar") return;
      // o servidor já me tirou do canal antigo e me pôs no novo: `movido` não
      // manda `voice.leave` (desfaria o move) nem toca o som de sair, e mantém
      // a coluna do canal de pé — para quem foi movido a chamada não acabou
      sairDaSalaAtual("movido");
      tocarSomDeMovido();
      ui.toast(`${displayNameOf(evento.movedBy)} moveu você para ${evento.channelName}`);
      // o nome vem no evento porque a lista de canais pode não ter o destino
      // ainda (canal criado agora, ou `channel.created` que chegou atrasado)
      const canal = useChannels.getState().channels.find((c) => c.id === evento.channelId);
      await get().connect(
        {
          id: evento.channelId,
          guildId: evento.guildId,
          name: canal?.name ?? evento.channelName,
          type: "VOICE",
        },
        { som: false },
      );
    },

    reconnect: async () => {
      const { channelId, guildId, channelName } = get();
      if (!channelId) return;
      // não passa por `sairDaSalaAtual`: refazer a mídia da **mesma** sala não
      // é sair dela — o gateway continua me vendo lá, o relógio não zera e a
      // coluna do canal fica como está
      fecharSala();
      await get().connect(
        {
          id: channelId,
          guildId,
          name: channelName,
          type: guildId ? "VOICE" : "DM",
        },
        // a guarda de "já estou nesta sala" existe contra o clique repetido;
        // refazer a mídia da mesma sala é o caso legítimo de repetir
        { forcar: true },
      );
    },

    /**
     * Socket voltou: reentra na sala de voz.
     *
     * O gateway perdeu o `voiceChannelId` junto com o socket antigo e está
     * contando a carência para tirar o usuário da chamada. Reemitir o join é o
     * que a cancela — sem isto a pessoa voltava "online", continuava vendo a
     * própria call na tela e sumia dela sozinha segundos depois, sem aviso
     * nenhum. Antes daqui, só as salas de **texto** reentravam.
     */
    rejoinAposReconexao: async () => {
      const { channelId, status } = get();
      // fora de chamada, ou já entrando numa: não há o que reentrar
      if (!channelId || status === "idle" || status === "connecting") return;

      emit(WS_EVENTS.VOICE_JOIN, { channelId });
      emit(WS_EVENTS.VOICE_UPDATE, flags());

      // A mídia tem reconexão própria: o LiveKit se restabelece quando só a
      // rede oscilou, e refazer a sala por cima publicaria a mesma câmera duas
      // vezes. Só refaz quando ela caiu de vez junto com o socket.
      const room = salaAtual();
      if (room && room.state !== ConnectionState.Disconnected) return;
      await get().reconnect();
    },

    toggleCam: async () => {
      const lp = sala?.localParticipant;
      if (!lp) {
        ui.toast(SEM_SALA, "error");
        return;
      }
      const proximo = !lp.isCameraEnabled;
      try {
        const cameraId = useVoiceDevicesStore.getState().cameraId;
        // A resolução vai explícita porque passar `captureOptions` substitui o
        // `videoCaptureDefaults` da sala em vez de completá-lo: sem isto, ligar
        // a câmera com um dispositivo escolhido cairia no padrão do navegador.
        await lp.setCameraEnabled(proximo, {
          // O lado escolhido no celular vale também ao **religar** a câmera:
          // quem virou para a traseira e desligou não espera a frontal de volta.
          // `deviceId` tem precedência quando existe (é escolha explícita das
          // configurações, feita num computador); sem ele, manda o lado.
          ...(cameraId ? { deviceId: cameraId } : { facingMode: get().facingMode }),
          resolution: {
            width: MEDIA_QUALITY.camera.width,
            height: MEDIA_QUALITY.camera.height,
            frameRate: MEDIA_QUALITY.camera.frameRate,
          },
        });
        set({ camOn: proximo });
      } catch (e) {
        set({ camOn: false });
        ui.toast(errorMessage(e, "Não foi possível ligar a câmera"), "error");
      }
      get().syncFlags();
      rerender();
    },

    virarCamera: async () => {
      const lp = sala?.localParticipant;
      if (!lp) {
        ui.toast(SEM_SALA, "error");
        return;
      }
      const alvo = get().facingMode === "user" ? "environment" : "user";
      const faixa = lp.getTrackPublication(Track.Source.Camera)?.videoTrack;
      try {
        if (faixa) {
          await faixa.restartTrack({
            facingMode: alvo,
            resolution: {
              width: MEDIA_QUALITY.camera.width,
              height: MEDIA_QUALITY.camera.height,
              frameRate: MEDIA_QUALITY.camera.frameRate,
            },
          });
        }
        // Escolher um lado desfaz a escolha por dispositivo: as duas mandam na
        // mesma captura, e manter o `deviceId` faria o próximo `toggleCam`
        // voltar para a câmera de antes sem ninguém ter pedido.
        useVoiceDevicesStore.getState().setCamera(null);
        set({ facingMode: alvo });
      } catch (e) {
        // aparelho com uma câmera só, ou o lado pedido indisponível: a faixa
        // antiga continua no ar (o SDK não a derruba antes de conseguir a nova)
        ui.toast(errorMessage(e, "Não foi possível trocar de câmera"), "error");
      }
      rerender();
    },

    /**
     * A captura vem pronta de fora porque `getDisplayMedia` só funciona no
     * gesto do usuário: quem a chama é o botão (`ScreenShareButton`, no
     * navegador), com as restrições de `restricoesDeCaptura`, e aqui só
     * publicamos o que ele já obteve. No desktop a tela não passa por aqui —
     * vai pelo Rust, em `publicarTelaNativa`.
     */
    publicarTela: async (stream) => {
      const lp = sala?.localParticipant;
      if (!lp) {
        stream.getTracks().forEach((t) => t.stop());
        ui.toast(SEM_SALA, "error");
        return;
      }
      const [video] = stream.getVideoTracks();
      if (!video) return;
      const preset = SCREEN_QUALITY[get().screenQuality];
      // `contentHint` avisa o encoder de que o conteúdo é texto/detalhe: ele
      // passa a preservar nitidez em vez de suavizar o quadro (o que faria com
      // uma câmera). É o ganho de legibilidade mais barato que existe aqui.
      video.contentHint = "detail";
      try {
        await lp.publishTrack(new LocalVideoTrack(video), {
          source: Track.Source.ScreenShare,
          // sem isto a faixa sobe com o bitrate padrão do SDK, calibrado para
          // 1080p — em 1440p o resultado seria mais pixels, todos borrados
          videoEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate },
          // simulcast de tela em alta gasta CPU de quem transmite para produzir
          // camadas reduzidas que ninguém quer: quem abre uma tela quer lê-la
          simulcast: false,
          // com banda apertada, derrubar quadros preserva o texto legível;
          // derrubar resolução o transformaria em borrão
          degradationPreference: "maintain-resolution",
        });
        const [audio] = stream.getAudioTracks();
        if (audio && get().screenAudio) {
          await lp.publishTrack(new LocalAudioTrack(audio), {
            source: Track.Source.ScreenShareAudio,
            // áudio de tela é música/jogo/vídeo, não voz: estéreo, bitrate alto
            // e sem DTX, que existe para cortar silêncio de conversa
            audioPreset: { maxBitrate: MEDIA_QUALITY.screenAudioBitrate },
            forceStereo: true,
            dtx: false,
            red: false,
          });
        }
        // parar pelo botão do próprio navegador precisa refletir aqui, senão a
        // UI continuaria anunciando uma transmissão que já morreu
        video.addEventListener("ended", () => void get().pararTela(), { once: true });
        set({ screenOn: true });
        tocarSom("transmissao-iniciada");
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        set({ screenOn: false });
        ui.toast(errorMessage(e, "Não foi possível compartilhar a tela"), "error");
      }
      get().syncFlags();
      rerender();
    },

    /**
     * Pré-conecta o `#tela` enquanto o seletor está aberto.
     *
     * **É onde estava a maior parte do atraso do clique.** Ir ao ar era, em
     * ordem: `POST /tela-token` (ida e volta à API), abrir a captura, entrar
     * na sala do LiveKit (sinal `wss`, join, ICE, DTLS) e só então publicar —
     * tudo depois do clique, com o seletor ainda aberto na frente. As duas
     * primeiras não dependem da fonte escolhida, então acontecem agora, com o
     * usuário olhando a grade.
     *
     * Não lança e não avisa nada: se falhar, `publicarTelaNativa` faz o
     * caminho inteiro como antes.
     */
    prepararTelaNativa: async () => {
      const { channelId, screenOn } = get();
      // com a tela já no ar, uma segunda conexão com a identidade `#tela`
      // expulsaria a que está transmitindo (o LiveKit não aceita duas iguais)
      if (!channelId || !sala || screenOn || !isTauri()) return;
      if (telaPreparada?.channelId === channelId) return;
      const geracao = ++geracaoDeTela;
      try {
        const creds = await api.telaToken(channelId);
        // o seletor fechou, ou troquei de canal, enquanto o token vinha
        if (geracao !== geracaoDeTela || useVoice.getState().channelId !== channelId) return;
        await pontePrepararTela(creds);
        if (geracao !== geracaoDeTela) {
          // fechou enquanto a conexão subia: desfazer, senão fica um `#tela`
          // mudo na sala até o LiveKit expirá-lo
          void ponteDescartarTela();
          return;
        }
        telaPreparada = { ...creds, channelId };
      } catch {
        if (geracao === geracaoDeTela) telaPreparada = null;
      }
    },

    /** O seletor fechou sem ninguém escolher: tira o `#tela` da sala. */
    descartarTelaNativa: async () => {
      geracaoDeTela += 1;
      telaPreparada = null;
      await ponteDescartarTela();
    },

    publicarTelaNativa: async (fonteId) => {
      const { channelId, screenQuality, screenAudio } = get();
      if (!channelId || !sala) {
        ui.toast(SEM_SALA, "error");
        return;
      }
      const comeco = performance.now();
      // a pré-conexão desta rodada acaba aqui: ou vira transmissão, ou o Rust
      // a descarta por não servir. Uma que ainda estivesse subindo se desfaz.
      geracaoDeTela += 1;
      try {
        // A credencial da pré-conexão, quando é deste canal: o Rust reconhece
        // o mesmo par url+token e reaproveita a sala já conectada.
        const preparada = telaPreparada?.channelId === channelId ? telaPreparada : null;
        const creds = preparada ?? (await api.telaToken(channelId));
        const tempos = await iniciarTelaNativa(
          montarPedido(fonteId, screenQuality, creds, screenAudio),
        );
        // a sala pré-conectada foi consumida (ou descartada) pelo Rust
        telaPreparada = null;
        telaNativa = true;
        set({ screenOn: true });
        tocarSom("transmissao-iniciada");
        // O tempo por etapa, para o dia em que alguém disser "demorou": sem
        // isto a única medida é a impressão de quem clicou.
        console.debug("[tela] ao vivo", {
          ...tempos,
          cliqueAteAoVivoMs: Math.round(performance.now() - comeco),
        });
      } catch (e) {
        telaPreparada = null;
        telaNativa = false;
        set({ screenOn: false });
        ui.toast(errorMessage(e, "Não foi possível compartilhar a tela"), "error");
      }
      get().syncFlags();
      rerender();
    },

    pararTela: async () => {
      const lp = sala?.localParticipant;
      // só avisa quem estava mesmo no ar: `pararTela` também chega pelo botão
      // do navegador e por um segundo clique, e som de fim sem começo confunde
      const estava = get().screenOn;
      set({ screenOn: false });
      if (estava) tocarSom("transmissao-encerrada");
      if (telaNativa) {
        telaNativa = false;
        await pararTelaNativa();
      }
      if (lp) {
        for (const pub of Array.from(lp.trackPublications.values())) {
          if (
            pub.source === Track.Source.ScreenShare ||
            pub.source === Track.Source.ScreenShareAudio
          ) {
            if (pub.track) await lp.unpublishTrack(pub.track, true).catch(() => {});
          }
        }
      }
      get().syncFlags();
      rerender();
    },

    setScreenQuality: (screenQuality) => set({ screenQuality }),
    setScreenAudio: (screenAudio) => set({ screenAudio }),

    setAudioPref: (patch) => {
      const anterior = get().audio;
      const audio: AudioPrefs = {
        ...anterior,
        ...patch,
        processamento: { ...anterior.processamento, ...(patch.processamento ?? {}) },
      };
      set({ audio });
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify(audio));
      } catch {
        // sem storage a preferência vale só nesta sessão
      }
      // processamento e volume de entrada são a **captura**: quem os aplica na
      // faixa que já está no ar é o dono dela. O volume anda numa rampa dentro
      // da cadeia (nada é republicado); o processamento pode exigir reiniciar a
      // captura, e é o dono que decide qual dos dois é o caso
      const mudouProcessamento =
        !!patch.processamento &&
        (Object.keys(patch.processamento) as (keyof AudioPrefs["processamento"])[]).some(
          (k) => patch.processamento?.[k] !== anterior.processamento[k],
        );
      const mudouEntrada = patch.entrada !== undefined && patch.entrada !== anterior.entrada;
      // escolher o nível de novo é pedir uma nova tentativa: sem esquecer o
      // veredito anterior, quem viu "indisponível" uma vez nunca mais teria a
      // avançada nesta aba — nem o aviso de que ela continua fora
      if (patch.processamento?.ruido && patch.processamento.ruido !== anterior.processamento.ruido) {
        esquecerSupressaoIndisponivel();
        set({ erroDeSupressao: null });
      }
      if (mudouProcessamento || mudouEntrada) void republicarMicrofone(audio);
    },

    setVolume: (userId, volume) =>
      set((s) => ({ volumes: { ...s.volumes, [userId]: Math.max(0, Math.min(2, volume)) } })),

    toggleSilenciado: (userId) =>
      set((s) => ({ silenciados: { ...s.silenciados, [userId]: !s.silenciados[userId] } })),

    // Trocar o palco troca a **qualidade** pedida: o que sobe ao destaque passa
    // a valer alta, e o que desce para a faixa (188×106) vira miniatura. Sem
    // reaplicar aqui, a tela que acabou de subir continuaria em baixa até o
    // próximo evento do SDK.
    setFocado: (focado) => {
      set((s) => ({ focado: s.focado === focado ? null : focado, focoAutomatico: false }));
      aplicarAssinaturasDeTela();
    },
    focarAutomaticamente: (focado) => {
      set({ focado });
      aplicarAssinaturasDeTela();
    },
    setTelaCheia: (telaCheia) => set({ telaCheia }),

    // Um `Set` novo a cada mudança, e não `add`/`delete` no mesmo: zustand
    // compara por referência, e mutar o conjunto no lugar não re-renderizaria
    // tile nenhum.
    assistir: (userId) => {
      set((s) => (s.assistindo.has(userId) ? s : { assistindo: new Set(s.assistindo).add(userId) }));
      aplicarAssinaturasDeTela();
    },
    pararDeAssistir: (userId) => {
      set((s) => {
        if (!s.assistindo.has(userId)) return s;
        const assistindo = new Set(s.assistindo);
        assistindo.delete(userId);
        // o tile sai do palco junto: deixar o foco apontando para uma tela que
        // não se assiste mais daria um palco com o convite "Assistir" em tela
        // cheia, que é o oposto do que o clique pediu
        const focado = s.focado?.startsWith(`${userId}:`) || s.focado === userId ? null : s.focado;
        return { assistindo, focado };
      });
      aplicarAssinaturasDeTela();
    },
    abrirPrevia: (previa) => {
      set({ previa });
      aplicarAssinaturasDeTela();
    },

    // ── chamada em conversa direta ──

    startCall: async (channelId, comVideo) => {
      // clicar de novo no telefone enquanto a chamada sai **não** é pedir outra
      // chamada. Sem esta guarda, o segundo clique refazia tudo: `POST
      // /dms/:id/call` de novo, uma segunda `Room` com a mesma identidade (que
      // o LiveKit derruba), a tela compartilhada marcada como desligada e o
      // ringback interrompido. O botão da conversa também fica cinza aqui
      // (`botaoDeChamadaBloqueado`), mas a guarda mora nos dois lugares: quem
      // clica não é só o botão — a faixa "entrar" e o teclado chegam aqui
      if (jaNaChamada(instantaneo(get()), channelId)) return;
      // uma conexão de voz por vez: o servidor já garante isso, o cliente
      // precisa fechar a sala antiga para não ficar com duas conexões de mídia.
      // A chamada mora na conversa, então a coluna do canal de voz fecha
      if (get().channelId && get().channelId !== channelId) sairDaSalaAtual("troca-de-sala");
      get().dispatchCall({ type: "start", channelId });
      set({
        channelId,
        guildId: null,
        channelName: "",
        desde: Date.now(),
        status: "connecting",
        erro: null,
        camOn: false,
        screenOn: false,
      });
      lembrarSala({ channelId, guildId: null, name: "" });
      try {
        await abrirConversa(channelId);
        const r = await api.startCall(channelId);
        for (const e of r.states) get().applyState(e);
        if (!r.voice) {
          // sem LiveKit a chamada ainda toca e o estado de voz vale: só não há som
          set({ status: "connected", midiaDisponivel: false, erro: null });
          return;
        }
        await entrarNaSala(r.voice, set, rerender, get);
        set({ status: "connected", midiaDisponivel: true, erro: null });
        get().syncFlags();
        if (comVideo) await get().toggleCam();
      } catch (e) {
        set({ status: "error", erro: errorMessage(e, "Não foi possível iniciar a chamada") });
        get().dispatchCall({ type: "ended", channelId, reason: "ended" });
        ui.toast(errorMessage(e, "Não foi possível iniciar a chamada"), "error");
      }
    },

    acceptCall: async () => {
      const channelId = get().call.channelId;
      if (!channelId) return;
      // só se atende o que está tocando: um segundo clique em "Atender" (ou o
      // atalho junto com o clique) entrava na sala duas vezes
      if (get().call.phase !== "incoming") return;
      if (get().channelId && get().channelId !== channelId) sairDaSalaAtual("troca-de-sala");
      get().dispatchCall({ type: "accept" });
      emit(WS_EVENTS.CALL_ACCEPT, { channelId });
      set({ channelId, guildId: null, desde: Date.now(), status: "connecting", erro: null });
      lembrarSala({ channelId, guildId: null, name: "" });
      await abrirConversa(channelId);
      // atender entra pela mesma rota de quem liga: ela é a que sabe de conversa
      // direta (o token de canal de voz recusaria uma DM com 400)
      try {
        const r = await api.startCall(channelId);
        for (const e of r.states) get().applyState(e);
        if (r.voice) await entrarNaSala(r.voice, set, rerender, get);
        set({ status: "connected", midiaDisponivel: !!r.voice, erro: null });
      } catch {
        // sem mídia a chamada ainda vale: o estado de voz já põe os dois na sala
        set({ status: "connected", midiaDisponivel: false, erro: null });
      }
      get().syncFlags();
    },

    declineCall: () => {
      const channelId = get().call.channelId;
      if (!channelId) return;
      emit(WS_EVENTS.CALL_DECLINE, { channelId });
      get().dispatchCall({ type: "decline" });
      // recusar não deixa nada na tela: volta ao repouso na hora
      get().dispatchCall({ type: "reset" });
    },

    endCall: async () => {
      const channelId = get().call.channelId ?? get().channelId;
      if (channelId) emit(WS_EVENTS.CALL_END, { channelId });
      await get().disconnect();
    },

    handleRing: (evento) => {
      // chamada recebida não abre modal: o cartão flutuante do canto vive na
      // `VoiceLayer` e reage à fase `incoming` sozinho, sem travar a interface
      get().dispatchCall({ type: "ring", channelId: evento.channelId, from: evento.from });
    },

    handleEnded: (evento) => {
      get().dispatchCall({
        type: "ended",
        channelId: evento.channelId,
        reason: evento.reason,
      });
      const { call, channelId } = get();
      if (call.phase === "ended") {
        if (evento.reason === "declined" && evento.by) {
          ui.toast(`${evento.by.username} recusou a chamada`);
        } else if (evento.reason === "timeout") {
          ui.toast("Ninguém atendeu");
        } else if (evento.reason === "alone") {
          // o servidor derrubou a chamada porque sobrou uma pessoa só; sem o
          // aviso ela veria a tela fechar do nada
          ui.toast("Chamada encerrada: você ficou sozinho");
        }
        // a chamada acabou para mim: sai como se eu tivesse desligado
        if (channelId === evento.channelId) sairDaSalaAtual("fim-da-chamada");
        else get().dispatchCall({ type: "reset" });
      }
    },

    dispatchCall: (action) => {
      set((s) => ({ call: callReducer(s.call, action, Date.now()) }));
    },

    syncFlags: () => {
      const f = flags();
      // durante o teste de microfone as preferências **são** mudo e surdo: o
      // gateway recebe isso, e os outros me veem como o Discord os mostraria
      emit(WS_EVENTS.VOICE_UPDATE, f);
      if (!sala) return;
      // NÃO é `setMicrophoneEnabled`: sem publicação, ele criaria uma faixa
      // crua (sem restrições e sem cadeia) por baixo do dono — era isso que
      // "voltava ao normal" alguns segundos depois de entrar. Quem decide se o
      // microfone está aberto é `micAberto()`; quem decide se ele está **na
      // sala** é o teste de microfone, e essa parte mora em `aplicarTesteNaSala`
      void definirMicrofoneAberto(!f.muted)
        .then(rearmarDetectorLocal)
        .catch(() => {});
    },

    iniciarTesteDeMicrofone: () => {
      if (get().testandoMicrofone) return;
      const { estado, aplicar } = iniciarTeste(estadoDoTeste(), prefsDeVoz());
      anteriorDoTeste = estado.anterior;
      set({ testandoMicrofone: true });
      // tirar o microfone da sala primeiro: entre o clique e o mudo não pode
      // haver uma fatia de segundo em que a sala ainda me ouve
      aplicarTesteNaSala();
      if (aplicar) useVoicePrefs.getState().setMuteDeafen(aplicar);
    },

    pararTesteDeMicrofone: () => encerrarTeste(true),
  };
});

/**
 * O mudo/surdo de antes do teste de microfone; `null` fora do teste.
 *
 * Fica fora da store porque não é para a tela: quem a tela lê é
 * `testandoMicrofone`. Aqui é só a memória da restauração, e ela vive tanto
 * quanto a aba.
 */
let anteriorDoTeste: PrefsDeVoz | null = null;

/** O par mudo/surdo de agora, do jeito que a máquina do teste o lê. */
function prefsDeVoz(): PrefsDeVoz {
  const prefs = useVoicePrefs.getState();
  return { muted: prefs.muted, deafened: prefs.deafened };
}

/** O estado do teste, montado das duas metades que o guardam. */
function estadoDoTeste(): EstadoDoTeste {
  return { testando: useVoice.getState().testandoMicrofone, anterior: anteriorDoTeste };
}

/**
 * Aplica (ou desfaz) o teste na sala: só o microfone publicado muda aqui — a
 * saída dos outros é decidida pelo `<audio>` de cada faixa, em
 * `AudioRemotoHost`, que lê o mesmo estado.
 *
 * O `voice.update` não sai daqui: quem o dispara é a escrita de mudo/surdo em
 * `voicePrefs` (a assinatura no fim deste arquivo), e é por isso que os outros
 * me veem mudo e surdo durante o teste — como no Discord.
 */
function aplicarTesteNaSala() {
  if (!sala) return;
  // o dono **não fecha** a faixa: ela sai da sala e continua rodando, porque é
  // dela que o teste tira o retorno e o medidor. Ver `definirMicrofoneEmTeste`
  void definirMicrofoneEmTeste(useVoice.getState().testandoMicrofone)
    .then(rearmarDetectorLocal)
    .catch(() => {});
}

/**
 * Leva a tela para a conversa da chamada. Atender sem isso deixaria o usuário
 * olhando outro canal, sem nenhum sinal de onde a chamada está acontecendo.
 */
async function abrirConversa(channelId: string) {
  ui.setView("dm");
  // `abrirPorId` cobre a conversa que ainda não estava na lista (alguém ligou
  // primeiro) e a que estava fechada — esta o `GET /dms` não devolve, e a
  // chamada ficava sem tela nenhuma
  await useDMs.getState().abrirPorId(channelId);
}

/**
 * Pede o token e entra na sala.
 *
 * A distinção que importa é entre **não ter mídia** e **a mídia ter falhado**:
 * a primeira é uma instalação sem LiveKit (dev), e insistir seria inútil; a
 * segunda é uma queda de rede, e aí o usuário precisa de um "tentar de novo".
 *
 * Numa conversa direta o token vem de `POST /dms/:id/call` — a rota de canal
 * de voz recusa DM com 400. Entrar numa chamada que já está rolando por ali é
 * silencioso (não toca de novo), então é o caminho certo tanto para "tentar
 * novamente" quanto para voltar depois de um F5. Sem isto, reconectar numa
 * chamada de conversa dava "conectado", sem som.
 */
async function conectarMidia(
  channel: Pick<Channel, "id" | "guildId">,
  set: AjustarVoz,
  rerender: () => void,
  get: () => VoiceStoreState,
): Promise<ResultadoMidia> {
  const crono = cronometroDeVoz("conectarMidia");
  let creds: { token: string; url: string; room: string } | null;
  if (channel.guildId) {
    try {
      creds = await api.voiceToken(channel.id);
      crono.etapa("token do LiveKit");
    } catch {
      // 503 (sem credenciais) ou canal que não é de voz: sem mídia, e ponto
      return { tipo: "sem-config" };
    }
  } else {
    try {
      const r = await api.startCall(channel.id);
      for (const e of r.states) get().applyState(e);
      creds = r.voice;
    } catch (e) {
      // aqui não é falta de configuração: a conversa recusou (bloqueio, acesso)
      return { tipo: "falha", erro: errorMessage(e, FALHA_MIDIA) };
    }
  }
  if (!creds?.token || !/^wss?:\/\//i.test(creds.url ?? "")) return { tipo: "sem-config" };
  try {
    await entrarNaSala(creds, set, rerender, get);
    crono.etapa("na sala (o palco já pode aparecer)");
    return { tipo: "ok" };
  } catch (e) {
    // credenciais existiam e mesmo assim não conectou: isso é falha
    return { tipo: "falha", erro: errorMessage(e, FALHA_MIDIA) };
  }
}

/** Conecta o `Room` e liga os eventos do SDK ao `tick`/`falando` da store. */
async function entrarNaSala(
  creds: { token: string; url: string },
  set: AjustarVoz,
  rerender: () => void,
  get: () => VoiceStoreState,
) {
  // **Nunca duas `Room` ao mesmo tempo.** O LiveKit não aceita a mesma
  // identidade duas vezes: a conexão nova derruba a anterior, e a anterior —
  // com os ouvintes ainda pendurados — anunciava "a conexão de voz caiu" e
  // apagava `sala`, matando a conexão boa e a transmissão de tela junto
  desmontarSala();
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: {
        width: MEDIA_QUALITY.camera.width,
        height: MEDIA_QUALITY.camera.height,
        frameRate: MEDIA_QUALITY.camera.frameRate,
      },
    },
    // Câmera e microfone publicam com os tetos do contrato, não com o padrão do
    // SDK (calibrado para sala grande em rede ruim). `dtx: false` mantém o
    // fluxo de áudio contínuo: com DTX o encoder corta o silêncio e a primeira
    // sílaba depois de uma pausa chega mutilada — economia de banda que se paga
    // em inteligibilidade. `red` duplica os pacotes de voz e é o que segura a
    // qualidade quando a rede perde pacote, que é a falha comum de verdade.
    publishDefaults: {
      videoEncoding: {
        maxBitrate: MEDIA_QUALITY.camera.maxBitrate,
        maxFramerate: MEDIA_QUALITY.camera.frameRate,
      },
      audioPreset: { maxBitrate: MEDIA_QUALITY.micBitrate },
      dtx: false,
      red: true,
    },
  });
  sala = room;

  /**
   * Recalcula o conjunto de falantes a partir do que a sala diz **agora**.
   *
   * Não basta ouvir `ActiveSpeakersChanged` e guardar o que ele traz: quem sai
   * da sala no meio de uma frase (ou muta) sai da lista de participantes sem
   * gerar um novo aviso de fala, e o anel dele ficava aceso para sempre. Por
   * isso o conjunto é recomposto também quando alguém entra, sai ou muta.
   */
  const recomporFalantes = () => {
    const eu = donoDaIdentidade(room.localParticipant.identity ?? "");
    // as minhas identidades ficam de fora: quem decide o meu anel é o detector
    // local, e o `<userId>#tela` da transmissão nativa não é a minha voz
    const outros = room.activeSpeakers.filter((p) => donoDaIdentidade(p.identity) !== eu);
    const proximo = falantesDeIdentidades(outros.map((p) => p.identity));
    if (useVoice.getState().falando.has(eu)) proximo.add(eu);
    set((s) => ({ falando: proximoConjunto(s.falando, proximo) }));
  };

  room
    .on(RoomEvent.ParticipantConnected, () => {
      recomporFalantes();
      rerender();
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      recomporFalantes();
      rerender();
    })
    // `TrackPublished`/`TrackUnpublished` são de participante **remoto**: é por
    // eles que uma transmissão que começa é notada na hora. Sem eles, a única
    // notícia vinha do `autoSubscribe` já tendo baixado a faixa — ou seja, o
    // gasto que a regra de assinatura existe para evitar acontecia antes de a
    // regra rodar, e uma tela que ninguém fosse assistir chegava a ser baixada
    .on(RoomEvent.TrackPublished, rerender)
    .on(RoomEvent.TrackUnpublished, rerender)
    .on(RoomEvent.TrackSubscribed, rerender)
    .on(RoomEvent.TrackUnsubscribed, rerender)
    .on(RoomEvent.LocalTrackPublished, () => {
      rearmarDetectorLocal();
      rerender();
    })
    .on(RoomEvent.LocalTrackUnpublished, () => {
      rearmarDetectorLocal();
      rerender();
    })
    .on(RoomEvent.TrackMuted, () => {
      rearmarDetectorLocal();
      recomporFalantes();
      rerender();
    })
    .on(RoomEvent.TrackUnmuted, () => {
      rearmarDetectorLocal();
      recomporFalantes();
      rerender();
    })
    .on(RoomEvent.ActiveSpeakersChanged, recomporFalantes)
    .on(RoomEvent.Disconnected, () => {
      // esta sala já não é a minha (troquei de canal, ou refiz a conexão):
      // quem chegou depois manda, e uma sala aposentada não tem o direito de
      // anunciar queda nem de zerar `sala`
      if (sala !== room) return;
      // sair de propósito passa por `fecharSala`, que remove os ouvintes antes:
      // se este handler rodou, a sala caiu sozinha
      sala = null;
      pararMedicaoDePing();
      desarmarDetectorLocal(() => {});
      set({
        midiaDisponivel: false,
        microfonePronto: false,
        falando: NINGUEM,
        status: "error",
        erro: QUEDA_MIDIA,
      });
      rerender();
    });

  const crono = cronometroDeVoz("entrarNaSala");
  await room.connect(creds.url, creds.token);
  crono.etapa("room.connect (ICE + sinalização)");
  // o ping da barra "Voz conectada" mora numa store própria (não no `tick`)
  iniciarMedicaoDePing(room);
  // **A sala está de pé: a entrada acabou aqui.** O que vem depois — a saída de
  // áudio escolhida e o microfone — não é condição para ouvir ninguém, e era
  // exatamente por ser esperado neste ponto que o palco só aparecia segundos
  // depois do clique. Medido nos logs do LiveKit em produção (168 h, 213
  // entradas), o intervalo entre a sessão RTC começar e o microfone ser
  // publicado tem p50 de 457 ms, p75 de 833 ms, p90 de 3,5 s e p95 de 12,3 s:
  // 23% das entradas passavam de um segundo **de tela de espera** por causa do
  // `getUserMedia` e do `publishTrack`, com o áudio dos outros já chegando.
  // Agora é como no Discord: entra e ouve primeiro, o microfone vem em seguida.
  void aplicarSaidaEscolhida(room);
  void publicarMicrofone(room, set, crono);
  void get; // o `get` fica na assinatura para futuras leituras de estado
  rerender();
}

/**
 * A saída de áudio escolhida nas configurações, aplicada **sem** segurar a
 * entrada. `switchActiveDevice` percorre os elementos de áudio e pode esperar
 * pelo `setSinkId` do navegador; ninguém precisa disso para estar na sala.
 */
async function aplicarSaidaEscolhida(room: Room) {
  const { outputId } = useVoiceDevicesStore.getState();
  if (!outputId) return;
  await room.switchActiveDevice("audiooutput", outputId).catch(() => {});
}

/**
 * Abre o microfone e o publica na sala que já está de pé.
 *
 * O microfone entra pelo dono da faixa (`lib/microfone`), com a cadeia de
 * captura já montada — nunca por `setMicrophoneEnabled`, que ignora as opções
 * quando a publicação já existe e não consegue montar processador nenhum (#107).
 * Entrar numa sala no meio de um teste de microfone abre a faixa mas **não** a
 * publica: o teste é surdo dos dois lados enquanto dura.
 *
 * Duas guardas por ser assíncrono em relação à entrada:
 *
 * 1. `sala !== room` no fim: quem saiu (ou trocou de canal) enquanto o
 *    `getUserMedia` pensava não pode ganhar um microfone publicado numa sala
 *    aposentada, nem a bandeira de "pronto" de uma sala que já não é a dele.
 * 2. o mudo é **reaplicado** depois de a faixa nascer: um `toggleMute` que
 *    aconteça durante a abertura chega em `definirMicrofoneAberto` quando ainda
 *    não há faixa nenhuma, e sem esta linha o clique se perderia — a pessoa
 *    veria o botão mudo e a sala a ouviria.
 */
async function publicarMicrofone(room: Room, set: AjustarVoz, crono: CronometroDeVoz) {
  try {
    await abrirMicrofone(
      salaDoMicrofone(room),
      preferenciasDoMicrofone(useVoice.getState().audio),
      useVoice.getState().testandoMicrofone,
    );
    crono.etapa("microfone aberto e publicado");
  } catch {
    // ficar sem microfone não tira ninguém da sala: continua ouvindo
    crono.etapa("microfone falhou");
  }
  if (sala !== room) return;
  await definirMicrofoneAberto(useVoicePrefs.getState().micAberto()).catch(() => {});
  set({ microfonePronto: true });
  // a faixa acabou de nascer: é aqui que o detector local ganha o que medir
  rearmarDetectorLocal();
}

/**
 * Religa o detector local de fala à faixa de microfone publicada **agora**.
 *
 * Precisa ser chamada por todo caminho que troca a faixa, e não só pelos
 * eventos do SDK: `switchActiveDevice` (trocar de microfone nas configurações)
 * reinicia a faixa por dentro, sem emitir `LocalTrackPublished`, e um
 * analisador preso à faixa anterior mede silêncio para sempre — é uma das
 * causas de "o anel parou de acender depois que eu mexi nas configurações".
 */
function rearmarDetectorLocal() {
  const room = sala;
  if (!room) return;
  armarDetectorLocal(room, (falando) => {
    const eu = room.localParticipant.identity;
    if (!eu) return;
    useVoice.setState((s) => ({
      falando: comFalante(s.falando, donoDaIdentidade(eu), falando),
    }));
  });
}

/**
 * Restrições de captura do microfone.
 *
 * A supressão nativa e a avançada são **excludentes**: encadeadas, a nativa
 * volta a comprimir o que a rede neural já limpou e a voz sai metálica. Por
 * isso `noiseSuppression` só vai ligada no nível "padrão".
 *
 * O processador **não** vem daqui. Passá-lo em `captureOptions` era o defeito
 * de origem dos dois primeiros relatos: ver o cabeçalho de `lib/microfone.ts`.
 */
export function restricoesDeCaptura(audio: AudioPrefs): RestricoesDeMicrofone {
  const nivel = audio.processamento.ruido;
  const deviceId = useVoiceDevicesStore.getState().inputId;
  // quem escolheu "Avançada" e não pode tê-la (CSP, navegador sem WebAssembly,
  // `/supressor/` fora do ar) fica com a do navegador em vez de **nenhuma**:
  // desligar as duas deixaria a pessoa pior do que antes de escolher
  const avancadaCaiu = nivel === "avancada" && supressaoIndisponivel() !== null;
  return {
    ...(deviceId ? { deviceId } : {}),
    echoCancellation: audio.processamento.eco,
    noiseSuppression: nivel === "padrao" || avancadaCaiu,
    autoGainControl: audio.processamento.ganho,
  };
}

/** O que o dono da faixa precisa saber, lido das três stores de uma vez. */
function preferenciasDoMicrofone(audio: AudioPrefs): PreferenciasDoMicrofone {
  return {
    restricoes: restricoesDeCaptura(audio),
    supressao: audio.processamento.ruido === "avancada" && supressaoIndisponivel() === null,
    ganho: audio.entrada,
    aberto: useVoicePrefs.getState().micAberto(),
  };
}

/**
 * A `Room` vista pelo dono da faixa.
 *
 * A faixa é criada e publicada por nós, e não por `setMicrophoneEnabled`,
 * porque só assim ela sobe com a cadeia de captura já montada — o SDK monta o
 * processador *depois* de publicar (quando monta), e é essa janela que se ouve
 * como áudio cru nos primeiros segundos.
 */
function salaDoMicrofone(room: Room): SalaDoMicrofone {
  return {
    criarFaixa: async (restricoes) => {
      const faixas = await createLocalTracks({ audio: { ...restricoes }, video: false });
      const faixa = faixas.find((f): f is LocalAudioTrack => f instanceof LocalAudioTrack);
      if (!faixa) {
        faixas.forEach((f) => f.stop());
        throw new Error("O navegador não devolveu nenhuma faixa de microfone.");
      }
      return faixa;
    },
    publicar: async (faixa) => {
      // `publishDefaults` da sala (bitrate, dtx, red) continuam valendo: o SDK
      // os mescla com estas opções
      await room.localParticipant.publishTrack(faixa as LocalAudioTrack, {
        source: Track.Source.Microphone,
      });
    },
    despublicar: async (faixa) => {
      // `false`: quem para a faixa é o dono, na ordem dele
      await room.localParticipant.unpublishTrack(faixa as LocalAudioTrack, false);
    },
  };
}

/** Aplica as preferências novas na faixa que está no ar (sem republicar nada). */
async function republicarMicrofone(audio: AudioPrefs) {
  if (!sala) return;
  // trocar a supressão no meio de um teste de microfone não devolve o microfone
  // para a sala: quem manda enquanto o teste dura é o teste, e o dono da faixa
  // guarda esse estado (`definirMicrofoneEmTeste`)
  await atualizarMicrofone(preferenciasDoMicrofone(audio))
    .then(rearmarDetectorLocal)
    .catch(() => {
      // o microfone pode ter sumido no meio da troca; o próximo toggle resolve
    });
}

/**
 * A supressão avançada deixa de falhar em silêncio.
 *
 * Este é o defeito relatado: no desktop, ligar a "Avançada" não fazia efeito —
 * na verdade fazia pior, publicava **silêncio** —, e não havia erro em lugar
 * nenhum, porque o WebAssembly do RNNoise é instanciado dentro do
 * `AudioWorkletGlobalScope`, onde a rejeição não sai. Agora a cadeia recusa
 * antes (a sonda de `lib/supressor-ruido.ts`), avisa aqui, e a captura volta a
 * pedir a supressão do navegador.
 */
aoFalharASupressao((motivo) => {
  if (useVoice.getState().erroDeSupressao === motivo) return;
  useVoice.setState({ erroDeSupressao: motivo });
  ui.toast(`Supressão avançada indisponível: ${motivo}. Usando a do navegador.`, "error");
  // sem isto a pessoa ficaria sem nenhuma das duas supressões: `avisar` chega
  // no meio da montagem da cadeia, com as restrições da captura já aplicadas
  void republicarMicrofone(useVoice.getState().audio);
});

/** A sala LiveKit corrente (ou null). Os componentes leem daqui, nunca a guardam. */
export function salaAtual(): Room | null {
  return sala;
}

/**
 * Paga adiantado o que a entrada na call pagaria no pior momento.
 *
 * Chamado quando o app abre e quando o mouse passa por um canal de voz: as duas
 * são horas em que o usuário não está esperando nada. O que se pré-aquece é a
 * supressão avançada (chunk do pacote, os dois `.wasm` e o `addModule`), porque
 * é a única peça da cadeia que baixa alguma coisa da rede — o `getUserMedia`
 * não dá para adiantar sem acender a luz do microfone sem motivo.
 *
 * Só quem escolheu "Avançada" paga esse custo: para o nível padrão a cadeia nem
 * chega a existir (`precisaDeCadeia`), e baixar um modelo que não vai ser usado
 * é gastar a rede de quem não pediu.
 */
export function preaquecerCadeiaDeVoz() {
  const { audio } = useVoice.getState();
  if (audio.processamento.ruido !== "avancada") return;
  if (supressaoIndisponivel() !== null) return;
  void preaquecerSupressor();
}

/** Participantes da sala: eu primeiro, como no Discord. */
export function participantesDaSala(): Participant[] {
  if (!sala) return [];
  return [sala.localParticipant, ...sala.remoteParticipants.values()];
}

/** Faixas de vídeo publicadas por um participante (câmera e tela). */
export function videosDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Video && !!pub.track && !pub.isMuted,
  );
}

/** Só a câmera: a tela tem tile próprio e regra própria (ver `telasDe`). */
export function camerasDe(p: Participant) {
  return videosDe(p).filter((pub) => pub.source !== Track.Source.ScreenShare);
}

/**
 * Telas publicadas por um participante — **com ou sem faixa baixada**.
 *
 * Diferente de `videosDe`, que exige `pub.track`: uma transmissão que ninguém
 * está assistindo fica *desassinada*, e então não há faixa nenhuma. O tile
 * precisa existir mesmo assim, senão o botão "Assistir transmissão" não teria
 * onde morar e a transmissão sumiria do palco.
 */
export function telasDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare,
  );
}

/** O meu `userId` nesta sala (a identidade local nunca tem sufixo, mas custa nada). */
function meuIdNaSala(): string | null {
  const identity = sala?.localParticipant.identity;
  return identity ? donoDaIdentidade(identity) : null;
}

/**
 * Os participantes da sala reduzidos ao que a regra de assinatura lê.
 *
 * O `instanceof RemoteTrackPublication` é a fronteira: **faixa local não se
 * assina**, e é por ela que a tela do navegador (publicada no meu próprio
 * participante) segue no ar sem depender de assinatura nenhuma. No desktop a
 * minha tela chega como remota, pelo participante `<userId>#tela`, e aí a
 * regra vale para ela como para as outras.
 */
function participantesComTelas(): ParticipanteDeTela[] {
  return participantesDaSala().map((p) => {
    const publicacoes = Array.from(p.trackPublications.values());
    return {
      dono: donoDaIdentidade(p.identity),
      telas: publicacoes.filter(
        (pub): pub is RemoteTrackPublication =>
          pub instanceof RemoteTrackPublication &&
          pub.kind === Track.Kind.Video &&
          pub.source === Track.Source.ScreenShare,
      ),
      audios: publicacoes.filter(
        (pub): pub is RemoteTrackPublication =>
          pub instanceof RemoteTrackPublication &&
          pub.kind === Track.Kind.Audio &&
          pub.source === Track.Source.ScreenShareAudio,
      ),
    };
  });
}

/**
 * Assina as telas que têm um tile mostrando vídeo, e desassina o resto.
 *
 * A regra inteira mora em `stores/assinaturas-de-tela.ts` (com o porquê de cada
 * caso e o teste); aqui só se traduz a sala do LiveKit para ela. Chamada a cada
 * evento do SDK e a cada mudança de `assistindo`/`previa`/`focado` — quem muda
 * o palco muda a qualidade pedida.
 */
export function aplicarAssinaturasDeTela() {
  const { assistindo, previa, focado } = useVoice.getState();
  aplicarAssinaturas(participantesComTelas(), {
    meuId: meuIdNaSala(),
    assistindo,
    previa,
    focado,
  });
}

/** Alguém publicou tela nesta sala (mesmo sem eu estar assistindo)? */
export function telaPublicadaDe(userId: string): TrackPublication | null {
  for (const p of participantesDe(userId)) {
    const [tela] = telasDe(p);
    if (tela) return tela;
  }
  return null;
}

/** Faixas de áudio publicadas por um participante. */
export function audiosDe(p: Participant) {
  return Array.from(p.trackPublications.values()).filter(
    (pub) => pub.kind === Track.Kind.Audio && !!pub.track && !pub.isMuted,
  );
}

/**
 * Usuário do estado de voz correspondente a uma identidade do LiveKit. A
 * identidade pode ser a da pessoa (`userId`) ou a do participante de tela
 * dela (`userId#tela`, a captura nativa do desktop): o dono é o mesmo.
 */
export function usuarioDaIdentidade(channelId: string, identity: string): PublicUser | null {
  const estados = useVoice.getState().states[channelId] ?? [];
  const dono = donoDaIdentidade(identity);
  return estados.find((e) => e.user.id === dono)?.user ?? null;
}

/**
 * Todos os participantes da sala que pertencem a um usuário: a pessoa e, se
 * ela transmite pelo desktop, o `#tela`. A pessoa vem primeiro — é o
 * participante de quem se lê "falando" e o microfone.
 */
export function participantesDe(userId: string): Participant[] {
  return participantesDaSala()
    .filter((p) => donoDaIdentidade(p.identity) === userId)
    .sort((a, b) => Number(a.identity !== userId) - Number(b.identity !== userId));
}

// A transmissão nativa pode acabar sem ninguém pedir: a janela fechou, a sala
// do `#tela` caiu. O Rust avisa por evento e a store volta ao repouso — sem
// isto o botão continuaria dizendo "ao vivo" com ninguém do outro lado.
if (typeof window !== "undefined" && isTauri()) {
  ouvirTelaEncerrada((motivo) => {
    if (!telaNativa) return;
    telaNativa = false;
    useVoice.setState((s) => ({ screenOn: false, tick: s.tick + 1 }));
    tocarSom("transmissao-encerrada");
    useVoice.getState().syncFlags();
    ui.toast(
      motivo === "fonteSumiu"
        ? "A janela compartilhada foi fechada; a transmissão parou."
        : motivo === "desconectado"
          ? "A transmissão caiu: a conexão com a sala foi perdida."
          : "A transmissão parou: a captura de tela falhou.",
      "error",
    );
  });
}

// Trocar de microfone/saída nas configurações vale **na hora**, sem sair da
// call: o SDK republica a faixa com o novo dispositivo. A câmera é a exceção —
// ela só troca no próximo `setCameraEnabled`, porque republicar vídeo no meio
// de uma frase pisca a imagem para todo mundo.
if (typeof window !== "undefined") {
  let anteriores = "";
  useVoiceDevicesStore.subscribe((devices) => {
    const chave = `${devices.inputId}|${devices.outputId}`;
    if (chave === anteriores) return;
    anteriores = chave;
    const room = sala;
    if (!room) return;
    // A entrada passa pelo dono da faixa, que reinicia a captura com a cadeia
    // junto — e não por `switchActiveDevice`, que mexeria na faixa por baixo
    // dele. Reiniciar a faixa troca a identidade dela sem emitir
    // `LocalTrackPublished`: sem rearmar, o anel de fala local morre ao trocar
    // de microfone.
    void republicarMicrofone(useVoice.getState().audio);
    if (devices.outputId) void room.switchActiveDevice("audiooutput", devices.outputId).catch(() => {});
  });
}

// ── Chamada em segundo plano no Android ────────────────────────────────────
//
// O serviço de primeiro plano (`ChamadaService.kt`) é o que impede o Android de
// derrubar o áudio quando o app sai da frente. Ele é ligado quando a call
// conecta e desligado quando ela acaba — e a ligação com a store é uma
// **assinatura**, não uma chamada espalhada pelos sete caminhos de saída e
// pelos três de entrada. Motivo: `reconnect()` passa por `fecharSala()` sem
// passar por `sairDaSalaAtual`, e `RoomEvent.Disconnected` mexe no `status` sem
// mexer no `channelId`; anotar cada um desses pontos à mão seria esquecer um.
// Aqui a regra mora em `decidirServicoDeChamada` (pura e testada) e este bloco
// só evita repetir a mesma ordem.
//
// A assinatura **só é criada no app Android**: no desktop, no iOS e no
// navegador este `if` é falso e não há ouvinte nenhum pendurado na store.
if (typeof window !== "undefined" && ehAndroidNoTauri()) {
  let ultima = "";

  const sincronizar = () => {
    const s = useVoice.getState();
    const acao = decidirServicoDeChamada({
      ehAndroid: true,
      status: s.status,
      channelId: s.channelId,
      guildId: s.guildId,
      channelName: s.channelName,
    });
    const chave = chaveDaAcao(acao);
    if (chave === ultima) return;
    ultima = chave;
    if (acao.acao === "iniciar") void iniciarServicoDeChamada(acao.titulo, acao.texto);
    else if (acao.acao === "parar") void pararServicoDeChamada();
  };

  useVoice.subscribe(sincronizar);

  // O botão "Sair da chamada" da notificação. `disconnect()` é o mesmo caminho
  // do botão de desligar do rodapé — passa por `sairDaSalaAtual("usuario")`,
  // avisa o gateway e zera o `channelId`, o que faz a assinatura acima parar o
  // serviço. Ou seja: o Kotlin não desliga nada por conta própria.
  ouvirSaidaPelaNotificacao(() => {
    if (useVoice.getState().channelId) void useVoice.getState().disconnect();
  });
}

// Mudo/surdo do rodapé e push-to-talk valem dentro da call: qualquer troca é
// reenviada ao gateway e aplicada no SDK. A assinatura fica aqui (e não num
// componente) para valer mesmo com o painel de voz fechado.
if (typeof window !== "undefined") {
  let anterior = "";
  useVoicePrefs.subscribe((prefs) => {
    const chave = `${prefs.muted}|${prefs.deafened}|${prefs.pushToTalk}|${prefs.pttAtivo}`;
    if (chave === anterior) return;
    anterior = chave;
    // desmutar ou dessurdar na mão no meio do teste **para** o teste: quem
    // clicou no rodapé (ou no Ctrl+Shift+M/D) quer voltar para a call, e a
    // escolha dele é mais nova que a nossa — `pararTeste` não a desfaz
    if (
      useVoice.getState().testandoMicrofone &&
      !testeSobrevive({ muted: prefs.muted, deafened: prefs.deafened })
    ) {
      useVoice.getState().pararTesteDeMicrofone();
    }
    if (useVoice.getState().channelId) useVoice.getState().syncFlags();
  });
}
