"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Settings } from "@/components/ui/icones";
import { SliderDeVolume } from "@/components/voice/pecas-de-voz";
import { ui } from "@/stores/ui";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import { explicarMidia, useVoiceDevices } from "@/stores/voiceDevices";

/**
 * O que a setinha do microfone e a do fone abrem, no painel do usuário.
 *
 * **Não é uma lista de aparelhos.** Era, e estava errado: no print a seta abre
 * um menu curto — o aparelho atual (que leva à lista), o ajuste que se mexe com
 * mais frequência, e a porta para as configurações de voz. A lista crua obriga
 * a ler dez nomes de driver para descobrir qual está valendo agora, que é
 * justamente a pergunta que se faz ao clicar ali.
 *
 * A lista continua existindo: ela entra **no lugar** do menu, com um cabeçalho
 * de voltar. O Discord abre um submenu lateral; em cima de uma caixa flutuante
 * ancorada no rodapé, um segundo nível flutuante teria de resolver sozinho o
 * mesmo problema de borda de tela que acabamos de consertar — a troca no lugar
 * é a mesma navegação com uma camada a menos.
 */

const RUIDO: Record<NivelDeRuido, string> = {
  off: "Desligada",
  padrao: "Padrão",
  avancada: "Avançada",
};

/** Linha de menu: título, o valor atual embaixo e a seta de entrar. */
function LinhaComSeta({
  titulo,
  valor,
  onSelect,
}: {
  titulo: string;
  valor: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left transition hover:bg-hov"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-txt-primary">{titulo}</span>
        <span className="block truncate text-xs text-txt-muted">{valor}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-txt-muted" aria-hidden="true" />
    </button>
  );
}

/** Cabeçalho da sub-tela: volta para o menu. */
function Voltar({ titulo, onVoltar }: { titulo: string; onVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={onVoltar}
      className="mb-1 flex w-full items-center gap-1.5 rounded-[3px] px-2 py-2 text-left text-sm font-semibold text-txt-primary transition hover:bg-hov"
    >
      <ChevronLeft size={16} className="shrink-0 text-txt-muted" aria-hidden="true" />
      {titulo}
    </button>
  );
}

function Escolha({
  rotulo,
  marcada,
  onSelect,
}: {
  rotulo: string;
  marcada: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={marcada}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm transition ${
        marcada ? "bg-sel text-txt-primary" : "text-txt-normal hover:bg-hov"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
    </button>
  );
}

function AtalhoDeConfiguracoes() {
  return (
    <>
      <div aria-hidden="true" className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={() => ui.openModal({ kind: "settings", tab: "voz" })}
        className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-txt-normal transition hover:bg-hov hover:text-txt-primary"
      >
        <Settings size={16} className="shrink-0" aria-hidden="true" />
        Configurações de voz
      </button>
    </>
  );
}

/** Nome legível do aparelho escolhido, ou o padrão do sistema. */
function nomeDoAparelho(lista: MediaDeviceInfo[], id: string | null, tipo: string): string {
  if (id === null) return "Padrão do sistema";
  const achado = lista.find((d) => d.deviceId === id);
  // sem permissão os rótulos vêm vazios; dizer o índice é melhor que nada
  return achado?.label || `${tipo} ${lista.indexOf(achado as MediaDeviceInfo) + 1}`;
}

/**
 * Menu do microfone.
 *
 * O **volume de entrada** do print não entra: `audio.entrada` é guardado e não
 * chega à captura (ganho exigiria um grafo Web Audio antes de publicar, ver
 * `stores/voice`). Ele já aparece assim na aba de voz; repeti-lo aqui, onde a
 * mão vai no meio de uma conversa, seria pôr um controle morto no caminho mais
 * usado. Volta quando o ganho existir de verdade.
 */
export function MenuDeEntrada() {
  const devices = useVoiceDevices();
  const [tela, setTela] = useState<"menu" | "aparelho" | "ruido">("menu");
  const processamento = useVoice((s) => s.audio.processamento);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const aviso = explicarMidia(devices.motivo);

  if (tela === "aparelho") {
    return (
      <>
        <Voltar titulo="Dispositivo de entrada" onVoltar={() => setTela("menu")} />
        <Escolha
          rotulo="Padrão do sistema"
          marcada={devices.inputId === null}
          onSelect={() => devices.setInput(null)}
        />
        {devices.inputs.map((d, i) => (
          <Escolha
            key={d.deviceId}
            rotulo={d.label || `Microfone ${i + 1}`}
            marcada={devices.inputId === d.deviceId}
            onSelect={() => devices.setInput(d.deviceId)}
          />
        ))}
        {aviso && <p className="px-2 pb-1 pt-2 text-xs text-txt-muted">{aviso}</p>}
      </>
    );
  }

  if (tela === "ruido") {
    return (
      <>
        <Voltar titulo="Redução de ruído" onVoltar={() => setTela("menu")} />
        {(["off", "padrao", "avancada"] as NivelDeRuido[]).map((nivel) => (
          <Escolha
            key={nivel}
            rotulo={RUIDO[nivel]}
            marcada={processamento.ruido === nivel}
            onSelect={() => setAudioPref({ processamento: { ...processamento, ruido: nivel } })}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <LinhaComSeta
        titulo="Dispositivo de entrada"
        valor={nomeDoAparelho(devices.inputs, devices.inputId, "Microfone")}
        onSelect={() => setTela("aparelho")}
      />
      <LinhaComSeta
        titulo="Redução de ruído"
        valor={RUIDO[processamento.ruido]}
        onSelect={() => setTela("ruido")}
      />
      <AtalhoDeConfiguracoes />
    </>
  );
}

/** Menu do fone: aparelho de saída e o volume geral, que este sim vale. */
export function MenuDeSaida() {
  const devices = useVoiceDevices();
  const [tela, setTela] = useState<"menu" | "aparelho">("menu");
  const saida = useVoice((s) => s.audio.saida);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const aviso = explicarMidia(devices.motivo);

  if (tela === "aparelho") {
    return (
      <>
        <Voltar titulo="Dispositivo de saída" onVoltar={() => setTela("menu")} />
        <Escolha
          rotulo="Padrão do sistema"
          marcada={devices.outputId === null}
          onSelect={() => devices.setOutput(null)}
        />
        {devices.outputs.map((d, i) => (
          <Escolha
            key={d.deviceId}
            rotulo={d.label || `Saída ${i + 1}`}
            marcada={devices.outputId === d.deviceId}
            onSelect={() => devices.setOutput(d.deviceId)}
          />
        ))}
        {aviso && <p className="px-2 pb-1 pt-2 text-xs text-txt-muted">{aviso}</p>}
      </>
    );
  }

  return (
    <>
      <LinhaComSeta
        titulo="Dispositivo de saída"
        valor={nomeDoAparelho(devices.outputs, devices.outputId, "Saída")}
        onSelect={() => setTela("aparelho")}
      />
      <div className="px-2 py-2">
        <SliderDeVolume
          label="Volume de saída"
          valor={saida}
          onChange={(v) => setAudioPref({ saida: v })}
        />
      </div>
      <AtalhoDeConfiguracoes />
    </>
  );
}
