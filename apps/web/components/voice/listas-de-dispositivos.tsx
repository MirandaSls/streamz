"use client";

import { Camera, Check } from "@/components/ui/icones";
import { explicarMidia, opcoesDe, useVoiceDevices } from "@/stores/voiceDevices";

/**
 * A lista de câmeras que a setinha da câmera abre, no palco.
 *
 * Monta `useVoiceDevices`, e é por isso que vive num componente separado em vez
 * de num nó pronto: o hook pede permissão de mídia para conseguir os **rótulos**
 * dos aparelhos, e ter isso na árvore junto da barra faria o navegador
 * perguntar sozinho, sem ninguém ter clicado em nada. Só entra quando o menu
 * abre.
 *
 * Microfone e saída saíram daqui: viraram os menus curtos de
 * `menus-de-audio.tsx`, que é o que os prints mostram. A câmera continua sendo
 * uma lista — ali não há nada além do aparelho para escolher.
 */

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
      <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
        {icone}
        {titulo}
      </p>
      <Opcao rotulo="Padrão do sistema" escolhida={atual === null} onSelect={() => onEscolher(null)} />
      {/* o nome (e o "Câmera N" de quando não há rótulo) sai de `opcoesDe`, que
          é o mesmo que os menus do rodapé e a aba Voz usam */}
      {opcoesDe(opcoes, titulo).map((o) => (
        <Opcao
          key={o.id}
          rotulo={o.nome}
          escolhida={atual === o.id}
          onSelect={() => onEscolher(o.id)}
        />
      ))}
      {aviso && <p className="px-2 pb-1 pt-2 text-xs text-text-muted">{aviso}</p>}
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
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-text-default transition hover:bg-brand-500 hover:text-control-primary-text-default"
    >
      <span className="w-4 shrink-0">{escolhida && <Check size={16} />}</span>
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
    </button>
  );
}
