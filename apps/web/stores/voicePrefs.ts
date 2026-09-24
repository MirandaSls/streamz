import { create } from "zustand";
import { PTT_RELEASE_MS } from "@streamz/shared";
import { definirSurdoParaSons, tocarSom, type SomDeVoz } from "@/lib/ringtone";
import { PTT_INICIAL, pttAberto, pttFechaEm, pttPress, pttRelease, type PttState } from "@/stores/ptt-core";
import type { PrefsDeVoz } from "@/stores/teste-de-microfone";

/**
 * Microfone e áudio do usuário — os dois botões do rodapé, como no Discord,
 * mais o push-to-talk. Valem para qualquer call: o `voice` store lê daqui ao
 * entrar e reage às trocas. Persistido no browser para sobreviver ao reload
 * (preferência, não sessão).
 *
 * `pttAtivo` é o único campo **transitório**: representa a tecla apertada agora
 * e não faz sentido guardar entre sessões.
 *
 * **O som mora aqui**, dentro de `toggleMute`/`toggleDeafen`/`setMuteDeafen`,
 * e não em quem chama. Antes ele estava só no `VoiceHotkeys`: o atalho Ctrl+Shift+M avisava,
 * mas o mesmo botão do rodapé do usuário (e o da barra da call) trocava o
 * estado em silêncio. Com o som na store, todo caminho — botão, atalho, menu —
 * soa igual, e continua soando **fora** de qualquer chamada, porque mudo e
 * surdo são preferências do app, não da call.
 */
interface VoicePrefsState {
  muted: boolean;
  deafened: boolean;
  /** microfone fechado por padrão, abrindo só enquanto a tecla estiver apertada. */
  pushToTalk: boolean;
  /** `KeyboardEvent.code` da tecla escolhida; null = ainda não definida. */
  pttKey: string | null;
  /** a tecla está apertada (ou dentro da folga de fechamento). */
  pttAtivo: boolean;

  toggleMute: () => void;
  toggleDeafen: () => void;
  /**
   * Põe mudo e surdo num valor **absoluto**, como se o usuário tivesse
   * clicado: persiste, avisa o gateway (pela assinatura em `stores/voice.ts`)
   * e toca **um** som — ver `somDaMudanca`.
   *
   * É o caminho de quem restaura um par guardado, e não de quem alterna: o
   * teste de microfone ensurdece ao começar e devolve o estado de antes ao
   * parar. Fazer isso com dois `toggle` tocaria dois sons e passaria por um
   * estado intermediário que ninguém pediu.
   */
  setMuteDeafen: (alvo: PrefsDeVoz) => void;
  setPushToTalk: (ativo: boolean) => void;
  setPttKey: (code: string | null) => void;
  /** tecla de PTT pressionada/solta — chamado pelo ouvinte global de teclado. */
  pressPtt: () => void;
  releasePtt: () => void;
  /** O microfone deve estar aberto agora? É o que a call aplica no SDK. */
  micAberto: () => boolean;
}

const KEY = "voicePrefs";

type Persistido = Pick<VoicePrefsState, "muted" | "deafened" | "pushToTalk" | "pttKey">;

const PADRAO: Persistido = {
  muted: false,
  deafened: false,
  pushToTalk: false,
  // sem tecla padrão de propósito: qualquer escolha nossa roubaria um atalho do
  // usuário (Espaço rolaria a conversa, Ctrl abriria menu) — ele define a dele
  pttKey: null,
};

function load(): Persistido {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return { ...PADRAO, ...(JSON.parse(raw) as Partial<Persistido>) };
  } catch {
    // storage indisponível ou corrompido: volta ao padrão
  }
  return PADRAO;
}

function save(state: Persistido) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // sem storage não há o que persistir
  }
}

/** Estado puro do PTT + o relógio que fecha o microfone depois da folga. */
let ptt: PttState = PTT_INICIAL;
let fecharEm: ReturnType<typeof setTimeout> | null = null;

export const useVoicePrefs = create<VoicePrefsState>((set, get) => ({
  ...load(),
  pttAtivo: false,

  toggleMute: () => {
    // desativar o áudio implica microfone mudo; reativar o microfone tira o "surdo"
    const muted = !get().muted;
    const next = { muted, deafened: muted ? get().deafened : false };
    persistir(get, set, next);
    // um som por ação, não um por campo mudado: quem desmuta com o "surdo"
    // ligado pediu uma coisa só e ouve uma coisa só
    tocarSom(muted ? "mudo" : "desmudo");
  },

  toggleDeafen: () => {
    const deafened = !get().deafened;
    persistir(get, set, { deafened, muted: deafened ? true : get().muted });
    tocarSom(deafened ? "surdo" : "nao-surdo");
  },

  setMuteDeafen: (alvo) => {
    const antes: PrefsDeVoz = { muted: get().muted, deafened: get().deafened };
    // surdo implica mudo, a mesma regra do `toggleDeafen`: um par
    // "surdo sem mudo" mostraria um ícone que o resto do app não sabe desenhar
    const depois: PrefsDeVoz = { muted: alvo.deafened || alvo.muted, deafened: alvo.deafened };
    const som = somDaMudanca(antes, depois);
    persistir(get, set, depois);
    if (som) tocarSom(som);
  },

  setPushToTalk: (pushToTalk) => {
    ptt = PTT_INICIAL;
    set({ pttAtivo: false });
    persistir(get, set, { pushToTalk });
  },

  setPttKey: (pttKey) => persistir(get, set, { pttKey }),

  pressPtt: () => {
    if (fecharEm) {
      clearTimeout(fecharEm);
      fecharEm = null;
    }
    ptt = pttPress(ptt, Date.now());
    if (!get().pttAtivo) set({ pttAtivo: true });
  },

  releasePtt: () => {
    const agora = Date.now();
    ptt = pttRelease(ptt, agora);
    const falta = pttFechaEm(ptt, agora, PTT_RELEASE_MS);
    if (falta === null) {
      set({ pttAtivo: false });
      return;
    }
    if (fecharEm) clearTimeout(fecharEm);
    fecharEm = setTimeout(() => {
      fecharEm = null;
      // reconfere pelo estado puro: uma nova pressionada no meio cancela o fecho
      if (!pttAberto(ptt, Date.now(), PTT_RELEASE_MS)) set({ pttAtivo: false });
    }, falta);
  },

  micAberto: () => {
    const s = get();
    if (s.muted || s.deafened) return false;
    return s.pushToTalk ? s.pttAtivo : true;
  },
}));

// ringtone.ts não pode importar este store (ciclo); registra daqui quem diz se está surdo.
definirSurdoParaSons(() => useVoicePrefs.getState().deafened);

/**
 * O som de uma mudança de mudo/surdo — **um só**, o que o usuário percebe.
 *
 * O surdo manda quando muda, porque é a mudança maior (ele arrasta o mudo
 * junto); só quando ele fica onde estava é que o mudo fala. Nada mudou, nada
 * toca: restaurar o teste de quem já estava surdo é silencioso, como tem de
 * ser — a pessoa não fez nada.
 */
export function somDaMudanca(antes: PrefsDeVoz, depois: PrefsDeVoz): SomDeVoz | null {
  if (antes.deafened !== depois.deafened) return depois.deafened ? "surdo" : "nao-surdo";
  if (antes.muted !== depois.muted) return depois.muted ? "mudo" : "desmudo";
  return null;
}

/** Grava só o que é preferência (o `pttAtivo` fica de fora) e atualiza a store. */
function persistir(
  get: () => VoicePrefsState,
  set: (partial: Partial<VoicePrefsState>) => void,
  patch: Partial<Persistido>,
) {
  const s = get();
  const next: Persistido = {
    muted: s.muted,
    deafened: s.deafened,
    pushToTalk: s.pushToTalk,
    pttKey: s.pttKey,
    ...patch,
  };
  save(next);
  set(next);
}
