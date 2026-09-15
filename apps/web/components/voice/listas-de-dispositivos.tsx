"use client";

import { CAMERA_FPS_OPCOES } from "@streamz/shared";
import { Camera, Check } from "@/components/ui/icones";
import { rotuloFps } from "@/components/voice/fps-da-camera";
import { useVoice } from "@/stores/voice";
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
 * uma lista: o aparelho e, embaixo de uma divisória, a taxa de quadros — as
 * duas coisas que se escolhem da câmera. A taxa vale na hora (a store republica
 * a câmera ligada), então o aviso de "vale na próxima vez" fica só no bloco do
 * aparelho, que é a quem ele se refere.
 */

export function ListaDeCameras({ camLigada }: { camLigada: boolean }) {
  const devices = useVoiceDevices();
  const cameraFps = useVoice((v) => v.cameraFps);
  const setCameraFps = useVoice((v) => v.setCameraFps);
  return (
    <>
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
      {/* a mesma divisória de `menus-de-audio.tsx` entre blocos do menu */}
      <div aria-hidden="true" className="my-1 h-px bg-border-subtle" />
      <div role="group" aria-label="Taxa de quadros da câmera">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
          Taxa de quadros
        </p>
        {CAMERA_FPS_OPCOES.map((fps) => (
          <Opcao
            key={fps}
            rotulo={rotuloFps(fps)}
            escolhida={cameraFps === fps}
            onSelect={() => setCameraFps(fps)}
          />
        ))}
      </div>
    </>
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

/**
 * O Discord não pinta item de menu com a cor de marca (design.md, "Menu de
 * contexto"): hover e selecionado são cinza (`--interactive-background-hover`
 * / `-selected`), como em `Escolha` de `menus-de-audio.tsx` — a mesma peça,
 * repetida aqui porque a lista de câmeras vive num componente à parte. Antes
 * este botão pintava `bg-brand-500` no hover, o que teria acendido a lista
 * inteira de limão a cada passada do mouse.
 */
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
      className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm transition ${
        escolhida
          ? "bg-interactive-background-selected text-text-strong"
          : "text-text-default hover:bg-interactive-background-hover"
      }`}
    >
      <span className="w-4 shrink-0">{escolhida && <Check size={16} />}</span>
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
    </button>
  );
}
