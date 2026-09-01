"use client";

import { Camera, Check, Headphones, Mic } from "lucide-react";
import { explicarMidia, useVoiceDevices } from "@/stores/voiceDevices";

/**
 * As listas de dispositivos que as setinhas abrem — no palco e no painel do
 * usuário.
 *
 * Todas montam `useVoiceDevices`, e é por isso que vivem num componente
 * separado em vez de num nó pronto: o hook pede permissão de mídia para
 * conseguir os **rótulos** dos aparelhos, e ter isso na árvore junto da barra
 * faria o navegador perguntar sozinho, sem ninguém ter clicado em nada. Só
 * entram quando o menu abre.
 */

export function ListaDeMicrofones() {
  const devices = useVoiceDevices();
  return (
    <ListaDeFontes
      titulo="Microfone"
      icone={<Mic size={16} />}
      opcoes={devices.inputs}
      atual={devices.inputId}
      onEscolher={devices.setInput}
      aviso={explicarMidia(devices.motivo)}
    />
  );
}

export function ListaDeCameras({ camLigada }: { camLigada: boolean }) {
  const devices = useVoiceDevices();
  return (
    <ListaDeFontes
      titulo="Câmera"
      icone={<Camera size={16} />}
      opcoes={devices.cameras}
      atual={devices.cameraId}
      onEscolher={devices.setCamera}
      aviso={
        explicarMidia(devices.motivo) ??
        // republicar vídeo no meio de uma frase pisca a imagem para todo mundo,
        // então a troca espera o próximo `setCameraEnabled` (ver `stores/voice`)
        (camLigada ? "A troca vale na próxima vez que você ligar a câmera." : null)
      }
    />
  );
}

/** Saída de áudio — a seta do fone, no painel do usuário. */
export function ListaDeSaidas() {
  const devices = useVoiceDevices();
  return (
    <ListaDeFontes
      titulo="Saída"
      icone={<Headphones size={16} />}
      opcoes={devices.outputs}
      atual={devices.outputId}
      onEscolher={devices.setOutput}
      aviso={explicarMidia(devices.motivo)}
    />
  );
}

/** Menu de escolha de dispositivo, com "padrão do sistema" sempre no topo. */
function ListaDeFontes({
  titulo,
  icone,
  opcoes,
  atual,
  onEscolher,
  aviso,
}: {
  titulo: string;
  icone: React.ReactNode;
  opcoes: MediaDeviceInfo[];
  atual: string | null;
  onEscolher: (id: string | null) => void;
  aviso: string | null;
}) {
  return (
    <>
      <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {icone}
        {titulo}
      </p>
      <Opcao rotulo="Padrão do sistema" escolhida={atual === null} onSelect={() => onEscolher(null)} />
      {opcoes.map((d, i) => (
        <Opcao
          key={d.deviceId}
          // sem permissão o `label` vem vazio: numerar é melhor que uma linha em branco
          rotulo={d.label || `${titulo} ${i + 1}`}
          escolhida={atual === d.deviceId}
          onSelect={() => onEscolher(d.deviceId)}
        />
      ))}
      {aviso && <p className="px-2 pb-1 pt-2 text-xs text-txt-muted">{aviso}</p>}
    </>
  );
}

function Opcao({
  rotulo,
  escolhida,
  onSelect,
}: {
  rotulo: string;
  escolhida: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={escolhida}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-txt-normal transition hover:bg-accent hover:text-accent-ink"
    >
      <span className="w-4 shrink-0">{escolhida && <Check size={16} />}</span>
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
    </button>
  );
}
