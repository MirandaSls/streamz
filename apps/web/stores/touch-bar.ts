import {
  atualizarTouchBar,
  ehMacNoTauri,
  focarJanela,
  ouvirTouchBar,
  type AcaoDaTouchBar,
  type EstadoDaTouchBar,
} from "@/lib/desktop";
import { pedirTrocaDeTela } from "@/lib/pedido-de-troca-de-tela";
import { useVoice, type VoiceStatus } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Touch Bar do Mac durante a call: o Rust troca os controles de mídia do
 * WKWebView pelos nossos botões (mudo, ensurdecer, câmera, tela, desligar) —
 * ver `ehMacNoTauri`/`atualizarTouchBar`/`ouvirTouchBar` em `lib/desktop.ts`.
 * Este módulo é a ponte pura + a assinatura que liga isso às stores de voz.
 *
 * Fica em módulo próprio, e não dentro de `stores/voice.ts`, pelo mesmo motivo
 * do bloco do serviço de chamada Android (ver `servico-de-chamada.ts`): a
 * regra "o que a Touch Bar deve mostrar agora" é pura e testável sem LiveKit
 * nem Tauri por perto, e o efeito colateral que a liga à store fica isolado —
 * quem não é Mac no Tauri não paga nada além do `if` de guarda.
 */

/** O recorte das stores de voz que a Touch Bar precisa para decidir o que mostrar. */
export interface EntradaDaTouchBar {
  /** `useVoice().status` — só `"connected"` conta como "estou numa call". */
  status: VoiceStatus;
  /** `useVoice().channelId` — `null` fora de qualquer call. */
  channelId: string | null;
  /**
   * `useVoicePrefs().muted` — o estado **cru**, o mesmo que o botão do rodapé
   * usa para pintar o ícone vermelho (`UserFooter`). Não é `!micAberto()`: o
   * push-to-talk fecha o microfone entre apertos sem o usuário ter pedido
   * mudo, e a Touch Bar piscaria "mudo" a cada solta de tecla — o rodapé não
   * pisca assim, e a Touch Bar deve concordar com o que a tela já mostra.
   */
  muted: boolean;
  /** `useVoicePrefs().deafened`. */
  deafened: boolean;
  /** `useVoice().camOn`. */
  camOn: boolean;
  /** `useVoice().screenOn`. */
  screenOn: boolean;
}

/**
 * O que a Touch Bar deve mostrar agora — `null` quando não há call conectada
 * (sem `channelId`, ou `status` ainda `"connecting"`/`"error"`: aí os botões
 * de call não fazem sentido e o Rust volta aos controles de mídia do sistema).
 */
export function estadoDaTouchBar(entrada: EntradaDaTouchBar): EstadoDaTouchBar | null {
  if (entrada.status !== "connected" || !entrada.channelId) return null;
  return {
    mudo: entrada.muted,
    surdo: entrada.deafened,
    camera: entrada.camOn,
    tela: entrada.screenOn,
  };
}

/** Chave de dedupe: dois estados iguais (inclusive os dois `null`) viram a mesma string. */
function chaveDoEstado(estado: EstadoDaTouchBar | null): string {
  return estado ? `${estado.mudo}|${estado.surdo}|${estado.camera}|${estado.tela}` : "-";
}

// ── Efeito colateral: só existe no app de Mac no Tauri ──────────────────────
//
// Fora dali `ehMacNoTauri()` é sempre `false` (inclusive em SSR, onde a guarda
// de `window` já barra antes) e este bloco inteiro não roda — nenhuma
// assinatura fica pendurada nas stores de voz em Windows, Linux, Android, iOS
// ou navegador.
if (typeof window !== "undefined" && ehMacNoTauri()) {
  let ultima = "";

  const sincronizar = () => {
    const voz = useVoice.getState();
    const prefs = useVoicePrefs.getState();
    const estado = estadoDaTouchBar({
      status: voz.status,
      channelId: voz.channelId,
      muted: prefs.muted,
      deafened: prefs.deafened,
      camOn: voz.camOn,
      screenOn: voz.screenOn,
    });
    const chave = chaveDoEstado(estado);
    if (chave === ultima) return;
    ultima = chave;
    void atualizarTouchBar(estado);
  };

  // as duas stores mudam independentes (mudo é `voicePrefs`, câmera/tela são
  // `voice`) e qualquer uma pode tirar o estado do "igual ao de antes" —
  // por isso as duas assinaturas chamam a mesma função de sincronizar.
  useVoice.subscribe(sincronizar);
  useVoicePrefs.subscribe(sincronizar);
  // sem isto a Touch Bar só apareceria na **próxima** troca de estado — se
  // este módulo carregar com uma call já em curso (recarregar a página em
  // dev, por exemplo), os botões antigos do sistema ficariam até lá.
  sincronizar();

  // Mapeia o toque em cada botão para o MESMO caminho dos controles do
  // rodapé/barra da call — a Touch Bar não reimplementa a ação, só a dispara.
  ouvirTouchBar((acao: AcaoDaTouchBar) => {
    switch (acao) {
      case "mudo":
        useVoicePrefs.getState().toggleMute();
        break;
      case "surdo":
        useVoicePrefs.getState().toggleDeafen();
        break;
      case "camera":
        void useVoice.getState().toggleCam();
        break;
      case "tela":
        if (useVoice.getState().screenOn) {
          void useVoice.getState().pararTela();
        } else {
          // o seletor de tela é um modal da janela do app: sem focar antes,
          // ele podia abrir atrás de outro app se a call estivesse minimizada
          // (é para isto que a Touch Bar existe — controlar sem trazer o app
          // à frente —, mas escolher a fonte da transmissão precisa da janela
          // visível). `pedirTrocaDeTela` é o mesmo pedido do menu "Alterar a
          // Transmissão" (`participant-menu.tsx`); `ScreenShareButton` reage
          // aos dois chamadores abrindo o seletor (ver o comentário lá).
          void focarJanela().then(() => pedirTrocaDeTela());
        }
        break;
      case "sair":
        // só faz sentido com `channelId`: sem call, "sair" não tem o que fazer
        // (e `disconnect()` sem sala é o mesmo caminho que o botão de desligar
        // do rodapé usa, incluindo o aviso ao gateway).
        if (useVoice.getState().channelId) void useVoice.getState().disconnect();
        break;
    }
  });
}
