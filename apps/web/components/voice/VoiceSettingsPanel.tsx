"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Keyboard, Mic, Video } from "@/components/ui/icones";
import { pttRotulo } from "@/stores/ptt-core";
import { BarraDeNivel, Chave, SliderDeVolume as Slider } from "@/components/voice/pecas-de-voz";
import { useTesteDeMicrofone } from "@/components/voice/useTesteDeMicrofone";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import { explicarMidia, opcoesDe, useVoiceDevices } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * O conteúdo da aba "Voz e vídeo": dispositivos, volumes, modo de entrada,
 * processamento de voz e os dois testes (microfone e câmera).
 *
 * Fica num componente à parte (e não dentro do modal de configurações) porque
 * tem dois lugares de origem: a aba das configurações e o popover do palco, que
 * é onde o usuário percebe que escolheu o microfone errado.
 *
 * O teste de microfone existe porque "escolhi o dispositivo certo?" não se
 * responde por uma lista de nomes: responde-se falando e **se ouvindo**. É o
 * mesmo teste do popover de supressão e da aba das configurações — um hook só
 * (`useTesteDeMicrofone`), que muta e ensurdece de verdade enquanto dura e
 * devolve o seu som na saída escolhida. Parar (ou fechar o painel) restaura o
 * mudo/surdo de antes.
 *
 * O nome do dispositivo só existe com permissão de mídia concedida — sem ela o
 * browser devolve a lista anônima, e é isso que o aviso explica. A lista se
 * atualiza sozinha em `devicechange` (`useVoiceDevices`): plugar um fone não
 * pode exigir um botão de "atualizar".
 */
export default function VoiceSettingsPanel({ compacto = false }: { compacto?: boolean }) {
  const devices = useVoiceDevices();
  const pushToTalk = useVoicePrefs((s) => s.pushToTalk);
  const pttKey = useVoicePrefs((s) => s.pttKey);
  const setPushToTalk = useVoicePrefs((s) => s.setPushToTalk);
  const setPttKey = useVoicePrefs((s) => s.setPttKey);
  const audio = useVoice((s) => s.audio);
  const setAudioPref = useVoice((s) => s.setAudioPref);

  const [capturando, setCapturando] = useState(false);
  const [testandoCam, setTestandoCam] = useState(false);

  // a barra de nível serve aos dois: ao teste e ao limiar de sensibilidade.
  // Ela só liga com o teste — abrir o microfone só por exibir a aba pediria
  // permissão sem que o usuário tenha pedido nada
  const {
    testando: testandoMic,
    nivel,
    erro: erroDoTeste,
    alternar: alternarTeste,
  } = useTesteDeMicrofone();

  return (
    <div className="space-y-5 text-sm text-text-default">
      <section className="space-y-3">
        <Dropdown
          label="Dispositivo de entrada"
          value={devices.inputId}
          options={devices.inputs}
          onChange={devices.setInput}
          vazio="Nenhum microfone encontrado"
        />
        <Dropdown
          label="Dispositivo de saída"
          value={devices.outputId}
          options={devices.outputs}
          onChange={devices.setOutput}
          vazio="Nenhuma saída encontrada"
        />
        {!devices.autorizado && (
          <p className="text-xs text-status-warning">
            {explicarMidia(devices.motivo) ??
              "Conceda acesso ao microfone para ver o nome dos dispositivos."}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <Slider
          label="Volume de entrada"
          valor={audio.entrada}
          onChange={(v) => setAudioPref({ entrada: v })}
        />
        <Slider
          label="Volume de saída"
          valor={audio.saida}
          onChange={(v) => setAudioPref({ saida: v })}
        />
      </section>

      <section className="space-y-2 border-t border-border-subtle pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
          Teste de microfone
        </h3>
        <p className="text-xs text-text-muted">
          {testandoMic
            ? "Você está se ouvindo. Enquanto o teste durar você fica mudo e surdo — a sala não te ouve e você não ouve ninguém."
            : "Com problemas? Comece uma verificação e diga algo divertido — você vai se ouvir, e a barra se mexe se a gente estiver ouvindo você. Enquanto durar, você fica mudo e surdo."}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={alternarTeste}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] bg-border-normal px-3 text-xs font-semibold text-text-strong transition hover:bg-border-strong"
          >
            <Mic size={14} aria-hidden="true" />
            {testandoMic ? "Parar" : "Vamos verificar"}
          </button>
          <BarraDeNivel nivel={nivel} />
        </div>
        {erroDoTeste && <p className="text-xs text-status-danger">{erroDoTeste}</p>}
      </section>

      <section className="space-y-3 border-t border-border-subtle pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
          Modo de entrada
        </h3>
        <Radio
          nome="modo-entrada"
          rotulo="Atividade de voz"
          marcado={!pushToTalk}
          onSelect={() => setPushToTalk(false)}
        />
        <Radio
          nome="modo-entrada"
          rotulo="Aperte para falar"
          marcado={pushToTalk}
          onSelect={() => setPushToTalk(true)}
        />

        {!pushToTalk ? (
          <div className="space-y-2 pl-6">
            <span className="block text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
              Sensibilidade de entrada
            </span>
            <BarraDeNivel nivel={nivel} limiar={audio.sensibilidade} />
            {!testandoMic && (
              <p className="text-xs text-text-muted">
                Comece a verificação acima para ver seu nível na barra.
              </p>
            )}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audio.sensibilidade * 100)}
              onChange={(e) => setAudioPref({ sensibilidade: Number(e.target.value) / 100 })}
              aria-label="Sensibilidade de entrada"
              className="w-full accent-brand-500"
            />
          </div>
        ) : (
          <div className="space-y-3 pl-6">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Tecla:</span>
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
                  capturando ? "bg-brand-500 text-control-primary-text-default" : "bg-input-background-default text-text-default hover:bg-interactive-background-hover"
                }`}
              >
                <Keyboard size={16} aria-hidden="true" />
                {capturando ? "Aperte uma tecla (Esc limpa)" : pttRotulo(pttKey)}
              </button>
            </div>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
                Atraso de liberação
                <span className="tabular-nums normal-case tracking-normal">
                  {audio.pttAtrasoMs} ms
                </span>
              </span>
              <input
                type="range"
                min={20}
                max={2000}
                step={20}
                value={audio.pttAtrasoMs}
                onChange={(e) => setAudioPref({ pttAtrasoMs: Number(e.target.value) })}
                aria-label="Atraso de liberação do push-to-talk"
                className="w-full accent-brand-500"
              />
            </label>
            <p className="text-xs text-text-muted">
              O microfone continua aberto por esse tempo depois de soltar, para a última sílaba não
              sumir.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-border-subtle pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
          Processamento de voz
        </h3>
        <Chave
          rotulo="Cancelamento de eco"
          ligado={audio.processamento.eco}
          onChange={(eco) => setAudioPref({ processamento: { ...audio.processamento, eco } })}
        />
        <NivelDeRuidoControle
          valor={audio.processamento.ruido}
          onChange={(ruido) => setAudioPref({ processamento: { ...audio.processamento, ruido } })}
        />
        <Chave
          rotulo="Controle automático de ganho"
          ligado={audio.processamento.ganho}
          onChange={(ganho) => setAudioPref({ processamento: { ...audio.processamento, ganho } })}
        />
      </section>

      <section className="space-y-3 border-t border-border-subtle pt-4">
        <Dropdown
          label="Câmera"
          value={devices.cameraId}
          options={devices.cameras}
          onChange={devices.setCamera}
          vazio="Nenhuma câmera encontrada"
        />
        <button
          type="button"
          onClick={() => setTestandoCam((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-[3px] bg-border-normal px-3 text-xs font-semibold text-text-strong transition hover:bg-border-strong"
        >
          <Video size={14} aria-hidden="true" />
          {testandoCam ? "Parar vídeo" : "Testar vídeo"}
        </button>
        {testandoCam && <PreviaDaCamera deviceId={devices.cameraId} />}
      </section>
    </div>
  );
}

function PreviaDaCamera({ deviceId }: { deviceId: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let parado = false;
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        if (parado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) video.current.srcObject = stream;
      } catch {
        setErro(true);
      }
    })();
    return () => {
      parado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  if (erro) return <p className="text-xs text-status-warning">Não foi possível abrir a câmera.</p>;
  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      // espelhado: é assim que a pessoa se reconhece na prévia
      className="aspect-video w-full -scale-x-100 rounded-lg bg-input-background-default object-cover"
    />
  );
}

function Radio({
  nome,
  rotulo,
  marcado,
  onSelect,
}: {
  nome: string;
  rotulo: string;
  marcado: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="radio"
        name={nome}
        checked={marcado}
        onChange={onSelect}
        className="accent-brand-500"
      />
      {rotulo}
    </label>
  );
}

/**
 * Nível de redução de ruído.
 *
 * Três opções em vez de uma chave porque as duas supressões são coisas
 * diferentes: a "Padrão" é a do navegador, que sempre existiu aqui, e a
 * "Avançada" é uma rede neural rodando no cliente. Quem tem máquina modesta
 * precisa poder ficar na primeira, e quem usa microfone bom precisa poder
 * desligar as duas.
 */
function NivelDeRuidoControle({
  valor,
  onChange,
}: {
  valor: NivelDeRuido;
  onChange: (nivel: NivelDeRuido) => void;
}) {
  const opcoes: { valor: NivelDeRuido; rotulo: string; ajuda: string }[] = [
    { valor: "off", rotulo: "Desligada", ajuda: "microfone cru" },
    { valor: "padrao", rotulo: "Padrão", ajuda: "do navegador" },
    { valor: "avancada", rotulo: "Avançada", ajuda: "rede neural, usa mais CPU" },
  ];
  return (
    <div className="py-1">
      <p className="pb-1.5 text-sm text-text-default">Redução de ruído</p>
      <div role="radiogroup" aria-label="Redução de ruído" className="flex flex-col gap-0.5">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            onClick={() => onChange(o.valor)}
            className={`flex items-center justify-between rounded-[3px] px-2 py-1.5 text-left text-sm transition ${
              valor === o.valor ? "bg-interactive-background-selected text-text-strong" : "text-text-default hover:bg-interactive-background-hover"
            }`}
          >
            <span className="font-medium">{o.rotulo}</span>
            <span className="text-xs text-text-muted">{o.ajuda}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Dropdown próprio: o `<select>` nativo é desenhado pelo sistema operacional e
 * destoa de tudo à volta — e é o único controle da tela que não obedece ao
 * tema.
 */
function Dropdown({
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
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const vazia = options.length === 0;
  const atual = opcoesDe(options, label).find((o) => o.id === value);
  const texto = vazia ? vazio : (atual?.nome ?? "Padrão do sistema");

  return (
    <div ref={caixa} className="relative">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
        {label}
      </span>
      <button
        type="button"
        disabled={vazia}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[3px] bg-input-background-default px-3 text-left text-sm text-text-default transition hover:bg-interactive-background-hover disabled:opacity-50"
      >
        <span className="truncate">{texto}</span>
        <ChevronDown size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
      </button>

      {aberto && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[4px] bg-background-surface-higher p-1 shadow-popout anim-menu"
        >
          <OpcaoDoDropdown
            marcada={value === null}
            onSelect={() => {
              onChange(null);
              setAberto(false);
            }}
          >
            Padrão do sistema
          </OpcaoDoDropdown>
          {opcoesDe(options, label).map((o) => (
            <OpcaoDoDropdown
              key={o.id}
              marcada={value === o.id}
              onSelect={() => {
                onChange(o.id);
                setAberto(false);
              }}
            >
              {o.nome}
            </OpcaoDoDropdown>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpcaoDoDropdown({
  children,
  marcada,
  onSelect,
}: {
  children: React.ReactNode;
  marcada: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={marcada}
        onClick={onSelect}
        className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm text-text-default transition hover:bg-brand-500 hover:text-control-primary-text-default"
      >
        <Check size={14} className={marcada ? "" : "invisible"} aria-hidden="true" />
        <span className="truncate">{children}</span>
      </button>
    </li>
  );
}
