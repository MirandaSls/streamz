"use client";

import { useState } from "react";
import { Keyboard, RefreshCw } from "lucide-react";
import { PTT_RELEASE_MS } from "@streamz/shared";
import { pttRotulo } from "@/stores/ptt-core";
import { useVoiceDevices } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * O conteúdo da aba "Voz e vídeo": microfone, saída, câmera e push-to-talk.
 *
 * Fica num componente à parte (e não dentro do modal de configurações) porque
 * tem dois lugares de origem: a aba das configurações e o próprio painel de
 * voz, onde é onde o usuário percebe que escolheu o microfone errado.
 *
 * O nome do dispositivo só existe com permissão de mídia concedida — sem ela o
 * browser devolve a lista anônima, e é isso que o aviso explica.
 */
export default function VoiceSettingsPanel() {
  const devices = useVoiceDevices();
  const pushToTalk = useVoicePrefs((s) => s.pushToTalk);
  const pttKey = useVoicePrefs((s) => s.pttKey);
  const setPushToTalk = useVoicePrefs((s) => s.setPushToTalk);
  const setPttKey = useVoicePrefs((s) => s.setPttKey);
  const [capturando, setCapturando] = useState(false);

  return (
    <div className="space-y-4 text-sm text-txt-normal">
      <Seletor
        label="Dispositivo de entrada"
        value={devices.inputId}
        options={devices.inputs}
        onChange={devices.setInput}
        vazio="Nenhum microfone encontrado"
      />
      <Seletor
        label="Dispositivo de saída"
        value={devices.outputId}
        options={devices.outputs}
        onChange={devices.setOutput}
        vazio="Nenhuma saída encontrada"
      />
      <Seletor
        label="Câmera"
        value={devices.cameraId}
        options={devices.cameras}
        onChange={devices.setCamera}
        vazio="Nenhuma câmera encontrada"
      />

      <div className="flex items-center justify-between">
        {!devices.autorizado && (
          <p className="text-xs text-yellow">
            Conceda acesso ao microfone para ver o nome dos dispositivos.
          </p>
        )}
        <button
          type="button"
          onClick={() => void devices.refresh()}
          className="ml-auto flex items-center gap-1.5 text-xs text-txt-muted transition hover:text-txt-primary"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Atualizar lista
        </button>
      </div>

      <div className="space-y-2 border-t border-[#3f4147] pt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pushToTalk}
            onChange={(e) => setPushToTalk(e.target.checked)}
            className="accent-accent"
          />
          Push-to-talk (o microfone só abre com a tecla apertada)
        </label>

        <div className="flex items-center gap-2">
          <span className="text-txt-muted">Tecla:</span>
          <button
            type="button"
            onClick={() => setCapturando(true)}
            onKeyDown={(e) => {
              if (!capturando) return;
              e.preventDefault();
              // Esc limpa a tecla: é como se desfaz a escolha sem outro botão
              setPttKey(e.code === "Escape" ? null : e.code);
              setCapturando(false);
            }}
            onBlur={() => setCapturando(false)}
            aria-label="Definir a tecla de push-to-talk"
            className={`flex h-8 items-center gap-1.5 rounded-[3px] px-3 text-sm transition ${
              capturando ? "bg-accent text-white" : "bg-rail text-txt-normal hover:bg-hov"
            }`}
          >
            <Keyboard size={16} aria-hidden="true" />
            {capturando ? "Aperte uma tecla (Esc limpa)" : pttRotulo(pttKey)}
          </button>
        </div>

        <p className="text-xs text-txt-muted">
          O microfone continua aberto por {PTT_RELEASE_MS} ms depois de soltar, para a última
          sílaba não sumir.
        </p>
      </div>
    </div>
  );
}

/** Um `<select>` de dispositivo, com "padrão do sistema" como primeira opção. */
function Seletor({
  label,
  value,
  options,
  onChange,
  vazio,
}: {
  label: string;
  value: string | null;
  options: MediaDeviceInfo[];
  onChange: (id: string | null) => void;
  vazio: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={options.length === 0}
        className="h-9 w-full rounded-[3px] bg-rail px-2 text-sm text-txt-normal outline-none disabled:opacity-50"
      >
        <option value="">{options.length === 0 ? vazio : "Padrão do sistema"}</option>
        {options.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
