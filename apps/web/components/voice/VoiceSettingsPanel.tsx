"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Keyboard, Mic, Video } from "lucide-react";
import { pttRotulo } from "@/stores/ptt-core";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import { useVoiceDevices } from "@/stores/voiceDevices";
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
 * responde por uma lista de nomes: responde-se falando e vendo a barra mexer.
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
  const [testandoMic, setTestandoMic] = useState(false);
  const [testandoCam, setTestandoCam] = useState(false);

  // a barra de nível serve aos dois: ao teste e ao limiar de sensibilidade.
  // Ela só liga com o teste — abrir o microfone só por exibir a aba pediria
  // permissão sem que o usuário tenha pedido nada
  const nivel = useNivelDoMicrofone(testandoMic, devices.inputId);

  return (
    <div className="space-y-5 text-sm text-txt-normal">
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
          <p className="text-xs text-yellow">
            Conceda acesso ao microfone para ver o nome dos dispositivos.
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

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
          Teste de microfone
        </h3>
        <p className="text-xs text-txt-muted">
          Com problemas? Comece uma verificação e diga algo divertido — a barra se mexe se a gente
          estiver ouvindo você.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTestandoMic((v) => !v)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] bg-border-strong px-3 text-xs font-semibold text-txt-primary transition hover:bg-border-strong-hover"
          >
            <Mic size={14} aria-hidden="true" />
            {testandoMic ? "Parar" : "Vamos verificar"}
          </button>
          <BarraDeNivel nivel={nivel} />
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
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
            <span className="block text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
              Sensibilidade de entrada
            </span>
            <BarraDeNivel nivel={nivel} limiar={audio.sensibilidade} />
            {!testandoMic && (
              <p className="text-xs text-txt-muted">
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
              className="w-full accent-accent"
            />
          </div>
        ) : (
          <div className="space-y-3 pl-6">
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
                  capturando ? "bg-accent text-accent-ink" : "bg-rail text-txt-normal hover:bg-hov"
                }`}
              >
                <Keyboard size={16} aria-hidden="true" />
                {capturando ? "Aperte uma tecla (Esc limpa)" : pttRotulo(pttKey)}
              </button>
            </div>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
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
                className="w-full accent-accent"
              />
            </label>
            <p className="text-xs text-txt-muted">
              O microfone continua aberto por esse tempo depois de soltar, para a última sílaba não
              sumir.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
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

      <section className="space-y-3 border-t border-border pt-4">
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
          className="flex h-8 items-center gap-1.5 rounded-[3px] bg-border-strong px-3 text-xs font-semibold text-txt-primary transition hover:bg-border-strong-hover"
        >
          <Video size={14} aria-hidden="true" />
          {testandoCam ? "Parar vídeo" : "Testar vídeo"}
        </button>
        {testandoCam && <PreviaDaCamera deviceId={devices.cameraId} />}
      </section>
    </div>
  );
}

/**
 * Nível do microfone em tempo real (RMS do sinal).
 *
 * Abre uma captura **própria**, separada da call: o teste tem de funcionar sem
 * estar em nenhuma sala, que é justamente quando as pessoas conferem o
 * microfone.
 */
function useNivelDoMicrofone(ativo: boolean, deviceId: string | null) {
  const [nivel, setNivel] = useState(0);
  const processamento = useVoice((s) => s.audio.processamento);

  useEffect(() => {
    if (!ativo || typeof navigator === "undefined" || !navigator.mediaDevices) {
      setNivel(0);
      return;
    }
    let parado = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let quadro = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: processamento.eco,
            // o teste ouve a captura do navegador; a supressão avançada
            // acontece depois, no processador da faixa publicada
            noiseSuppression: processamento.ruido === "padrao",
            autoGainControl: processamento.ganho,
          },
        });
        if (parado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        const fonte = ctx.createMediaStreamSource(stream);
        const analisador = ctx.createAnalyser();
        analisador.fftSize = 1024;
        fonte.connect(analisador);
        const amostras = new Uint8Array(analisador.fftSize);
        const ler = () => {
          analisador.getByteTimeDomainData(amostras);
          let soma = 0;
          for (const v of amostras) {
            const x = (v - 128) / 128;
            soma += x * x;
          }
          // ×3 porque fala normal fica em RMS baixo: sem o ganho visual a barra
          // mal sairia do lugar e o teste não provaria nada
          setNivel(Math.min(1, Math.sqrt(soma / amostras.length) * 3));
          quadro = requestAnimationFrame(ler);
        };
        ler();
      } catch {
        // sem permissão de microfone não há o que medir
      }
    })();

    return () => {
      parado = true;
      cancelAnimationFrame(quadro);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setNivel(0);
    };
  }, [ativo, deviceId, processamento.eco, processamento.ruido, processamento.ganho]);

  return nivel;
}

/** Barra de nível; com `limiar`, marca onde a voz passa a contar. */
function BarraDeNivel({ nivel, limiar }: { nivel: number; limiar?: number }) {
  const acima = limiar === undefined || nivel >= limiar;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-rail">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${acima ? "bg-accent" : "bg-txt-faint"}`}
        style={{ width: `${Math.round(nivel * 100)}%` }}
      />
      {limiar !== undefined && (
        <span
          aria-hidden="true"
          style={{ left: `${Math.round(limiar * 100)}%` }}
          className="absolute inset-y-0 w-0.5 bg-txt-primary"
        />
      )}
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

  if (erro) return <p className="text-xs text-yellow">Não foi possível abrir a câmera.</p>;
  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      // espelhado: é assim que a pessoa se reconhece na prévia
      className="aspect-video w-full -scale-x-100 rounded-lg bg-rail object-cover"
    />
  );
}

/** Slider de volume 0–200% com o valor ao lado. */
function Slider({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {label}
        <span className="tabular-nums normal-case tracking-normal">{Math.round(valor * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={200}
        value={Math.round(valor * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="w-full accent-accent"
      />
    </label>
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
        className="accent-accent"
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
      <p className="pb-1.5 text-sm text-txt-normal">Redução de ruído</p>
      <div role="radiogroup" aria-label="Redução de ruído" className="flex flex-col gap-0.5">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            onClick={() => onChange(o.valor)}
            className={`flex items-center justify-between rounded-[3px] px-2 py-1.5 text-left text-sm transition ${
              valor === o.valor ? "bg-sel text-txt-primary" : "text-txt-normal hover:bg-hov"
            }`}
          >
            <span className="font-medium">{o.rotulo}</span>
            <span className="text-xs text-txt-muted">{o.ajuda}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Interruptor do Discord: pílula que desliza, não caixa de seleção. */
function Chave({
  rotulo,
  ligado,
  onChange,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{rotulo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => onChange(!ligado)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          ligado ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
            ligado ? "left-5" : "left-1"
          }`}
        />
      </button>
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
  const atual = options.find((d) => d.deviceId === value);
  const texto = vazia ? vazio : atual ? atual.label || label : "Padrão do sistema";

  return (
    <div ref={caixa} className="relative">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {label}
      </span>
      <button
        type="button"
        disabled={vazia}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[3px] bg-rail px-3 text-left text-sm text-txt-normal transition hover:bg-hov disabled:opacity-50"
      >
        <span className="truncate">{texto}</span>
        <ChevronDown size={16} className="shrink-0 text-txt-muted" aria-hidden="true" />
      </button>

      {aberto && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[4px] bg-overlay p-1 shadow-high anim-menu"
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
          {options.map((d, i) => (
            <OpcaoDoDropdown
              key={d.deviceId}
              marcada={value === d.deviceId}
              onSelect={() => {
                onChange(d.deviceId);
                setAberto(false);
              }}
            >
              {d.label || `${label} ${i + 1}`}
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
        className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm text-txt-normal transition hover:bg-accent hover:text-accent-ink"
      >
        <Check size={14} className={marcada ? "" : "invisible"} aria-hidden="true" />
        <span className="truncate">{children}</span>
      </button>
    </li>
  );
}
