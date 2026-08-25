import { create } from "zustand";

/**
 * Microfone e áudio do usuário — os dois botões do rodapé, como no Discord.
 * Valem para qualquer call: o VoicePanel lê daqui ao entrar e reage às trocas.
 * Persistido no browser para sobreviver ao reload (preferência, não sessão).
 */
interface VoicePrefsState {
  muted: boolean;
  deafened: boolean;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

const KEY = "voicePrefs";

function load(): Pick<VoicePrefsState, "muted" | "deafened"> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return JSON.parse(raw) as Pick<VoicePrefsState, "muted" | "deafened">;
  } catch {
    // storage indisponível ou corrompido: volta ao padrão
  }
  return { muted: false, deafened: false };
}

function save(state: Pick<VoicePrefsState, "muted" | "deafened">) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // sem storage não há o que persistir
  }
}

export const useVoicePrefs = create<VoicePrefsState>((set, get) => ({
  ...load(),

  toggleMute: () => {
    // desativar o áudio implica microfone mudo; reativar o microfone tira o "surdo"
    const muted = !get().muted;
    const next = { muted, deafened: muted ? get().deafened : false };
    save(next);
    set(next);
  },

  toggleDeafen: () => {
    const deafened = !get().deafened;
    const next = { deafened, muted: deafened ? true : get().muted };
    save(next);
    set(next);
  },
}));
