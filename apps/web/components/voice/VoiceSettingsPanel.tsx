"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Video } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { RadioCards, Select, Slider, ToggleLinha } from "@/components/ui/controls";
import { pttRotulo } from "@/stores/ptt-core";
import type { CameraFps } from "@streamz/shared";
import {
  AJUDA_FPS_DA_CAMERA,
  SeletorDeFpsDaCamera,
  restricoesDaPrevia,
} from "@/components/voice/fps-da-camera";
import { BarraDeNivel } from "@/components/voice/pecas-de-voz";
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
 *
 * ADR-0009 (onda 6h): este painel reinventava dropdown, rádio e lista de
 * redução de ruído com marcação própria — cada um com hover e foco escritos
 * de novo, e nenhum deles no vocabulário que a aba "Voz e vídeo" (`VozTab`)
 * já usa para o mesmo dado. Agora os dois lêem a mesma escolha (`Select`,
 * `RadioCards`, `ToggleLinha` de `ui/controls.tsx`) e só a **densidade** muda
 * — aqui é a variante compacta (`.small__011b7{column-gap:var(--space-8)}` do
 * CSS medido, contra o `--space-16` da aba cheia), porque este painel abre
 * numa coluna de 380px, não numa página.
 */
export default function VoiceSettingsPanel({ compacto = false }: { compacto?: boolean }) {
  const devices = useVoiceDevices();
  const pushToTalk = useVoicePrefs((s) => s.pushToTalk);
  const pttKey = useVoicePrefs((s) => s.pttKey);
  const setPushToTalk = useVoicePrefs((s) => s.setPushToTalk);
  const setPttKey = useVoicePrefs((s) => s.setPttKey);
  const audio = useVoice((s) => s.audio);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const cameraFps = useVoice((s) => s.cameraFps);

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

  // mesma lista e mesmos nomes dos menus da setinha (`opcoesDe`), só no
  // formato que o `Select` pede — igual ao helper de `VozTab.tsx`
  const opcoes = (lista: MediaDeviceInfo[], prefixo: string) =>
    opcoesDe(lista, prefixo).map((o) => ({ value: o.id, label: o.nome }));

  return (
    <div className="space-y-5 text-sm text-text-default">
      <section className="space-y-3">
        <Select
          semDivisoria
          label="Dispositivo de entrada"
          value={devices.inputId ?? ""}
          options={opcoes(devices.inputs, "entrada")}
          onChange={(id) => devices.setInput(id || null)}
          emptyLabel="Nenhum microfone encontrado"
          disabled={devices.inputs.length === 0}
        />
        <Select
          semDivisoria
          label="Dispositivo de saída"
          value={devices.outputId ?? ""}
          options={opcoes(devices.outputs, "saída")}
          onChange={(id) => devices.setOutput(id || null)}
          emptyLabel="Nenhuma saída encontrada"
          disabled={devices.outputs.length === 0}
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
          value={Math.round(audio.entrada * 100)}
          min={0}
          max={200}
          format={(v) => `${v}%`}
          onChange={(v) => setAudioPref({ entrada: v / 100 })}
        />
        <Slider
          label="Volume de saída"
          value={Math.round(audio.saida * 100)}
          min={0}
          max={200}
          format={(v) => `${v}%`}
          onChange={(v) => setAudioPref({ saida: v / 100 })}
        />
      </section>

      <section className="space-y-2 border-t border-border-subtle pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
          Teste de microfone
        </h3>
        {/*
          Grade `auto 1fr`, gap de 8px: a variante compacta do "Mic Test"
          medido (`.small__011b7{column-gap:var(--space-8)}`,
          `docs/referencias-discord/tokens/css-bruto/333008.90c167df50b44f04.css`)
          — a mesma peça da aba
          "Voz e vídeo" (`VozTab.tsx`), só com a folga menor da coluna
          estreita. A legenda fica em `col-start-2`, embaixo do medidor, como
          `.micTestCaption__011b7{grid-column:2}` mede.
        */}
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
          <Button
            variante="secundario"
            // 32px: o mesmo botão medido em `Captura de tela 2026-09-01
            // 113445.png` (x175–236/y448–479 = 61×32) — é o mesmo popover.
            tamanho="sm"
            icone={<Mic size={14} aria-hidden="true" />}
            onClick={alternarTeste}
            className="shrink-0"
          >
            {testandoMic ? "Parar" : "Vamos verificar"}
          </Button>
          <BarraDeNivel nivel={nivel} />
          <p className="col-start-2 min-h-8 text-xs text-text-muted">
            {testandoMic
              ? "Você está se ouvindo. Enquanto o teste durar você fica mudo e surdo — a sala não te ouve e você não ouve ninguém."
              : "Com problemas? Comece uma verificação e diga algo divertido — você vai se ouvir, e a barra se mexe se a gente estiver ouvindo você. Enquanto durar, você fica mudo e surdo."}
          </p>
          {erroDoTeste && <p className="col-start-2 text-xs text-status-danger">{erroDoTeste}</p>}
        </div>
      </section>

      <section className="space-y-3 border-t border-border-subtle pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
          Modo de entrada
        </h3>
        <RadioCards
          legend="Modo de entrada"
          legendaOculta
          value={pushToTalk ? "ptt" : "atividade"}
          onChange={(v) => setPushToTalk(v === "ptt")}
          options={[
            { value: "atividade", label: "Atividade de voz" },
            { value: "ptt", label: "Aperte para falar" },
          ]}
        />

        {!pushToTalk ? (
          <div className="space-y-2 pl-1">
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
              // mesmo trilho `--slider-track-background` do `Slider`/
              // `SliderMarcas` (`ui/controls.tsx`) — um `<input>` cru sem essa
              // classe pinta o trilho vazio com a cor do sistema operacional,
              // não com o token do app
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slider-track-background accent-brand-500"
            />
          </div>
        ) : (
          <div className="space-y-3 pl-1">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Tecla:</span>
              <Button
                variante={capturando ? "primario" : "secundario"}
                tamanho="sm"
                icone={<Keyboard size={14} aria-hidden="true" />}
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
              >
                {capturando ? "Aperte uma tecla (Esc limpa)" : pttRotulo(pttKey)}
              </Button>
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
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slider-track-background accent-brand-500"
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
        <ToggleLinha
          titulo="Cancelamento de eco"
          checked={audio.processamento.eco}
          onChange={(eco) => setAudioPref({ processamento: { ...audio.processamento, eco } })}
        />
        <RadioCards
          legend="Redução de ruído"
          value={audio.processamento.ruido}
          columns={1}
          onChange={(ruido: NivelDeRuido) =>
            setAudioPref({ processamento: { ...audio.processamento, ruido } })
          }
          options={[
            { value: "off", label: "Desligada", hint: "microfone cru" },
            { value: "padrao", label: "Padrão", hint: "do navegador" },
            { value: "avancada", label: "Avançada", hint: "rede neural, usa mais CPU" },
          ]}
        />
        <ToggleLinha
          titulo="Controle automático de ganho"
          checked={audio.processamento.ganho}
          onChange={(ganho) => setAudioPref({ processamento: { ...audio.processamento, ganho } })}
        />
      </section>

      <section className="space-y-3 border-t border-border-subtle pt-4">
        <Select
          semDivisoria
          label="Câmera"
          value={devices.cameraId ?? ""}
          options={opcoes(devices.cameras, "câmera")}
          onChange={(id) => devices.setCamera(id || null)}
          emptyLabel="Nenhuma câmera encontrada"
          disabled={devices.cameras.length === 0}
        />
        {/* rótulo e sulco quebram em duas linhas se a coluna de 380px não
            couber os quatro segmentos ao lado do rótulo */}
        <SeletorDeFpsDaCamera className="flex flex-wrap items-center gap-2" />
        <p className="text-xs text-text-muted">{AJUDA_FPS_DA_CAMERA}</p>
        <Button
          variante="secundario"
          tamanho="sm"
          icone={<Video size={14} aria-hidden="true" />}
          onClick={() => setTestandoCam((v) => !v)}
        >
          {testandoCam ? "Parar vídeo" : "Testar vídeo"}
        </Button>
        {testandoCam && <PreviaDaCamera deviceId={devices.cameraId} fps={cameraFps} />}
      </section>
    </div>
  );
}

/**
 * Pede a taxa escolhida (`restricoesDaPrevia`) para mostrar o que a chamada
 * vai mandar; trocar o fps com a prévia aberta refaz o efeito, e a limpeza do
 * efeito anterior para a trilha antiga antes da nova abrir.
 */
function PreviaDaCamera({ deviceId, fps }: { deviceId: string | null; fps: CameraFps }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState(false);
  const [abrindo, setAbrindo] = useState(true);

  useEffect(() => {
    let parado = false;
    let stream: MediaStream | null = null;
    setAbrindo(true);
    setErro(false);
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: restricoesDaPrevia(deviceId, fps),
        });
        if (parado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) video.current.srcObject = stream;
      } catch {
        if (!parado) setErro(true);
      } finally {
        if (!parado) setAbrindo(false);
      }
    })();
    return () => {
      parado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId, fps]);

  if (erro) return <p className="text-xs text-status-warning">Não foi possível abrir a câmera.</p>;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-input-background-default">
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        // espelhado: é assim que a pessoa se reconhece na prévia
        className={`h-full w-full -scale-x-100 object-cover transition-opacity ${abrindo ? "opacity-0" : "opacity-100"}`}
      />
      {/* estado "carregando": entre o clique e o primeiro quadro há um vão em
          que a caixa ficaria vazia sem explicação — o mesmo tipo de espera
          que o botão "Atualizar lista" de `VozTab.tsx` cobre com `carregando`. */}
      {abrindo && (
        <p className="absolute inset-0 grid place-items-center text-xs text-text-muted">
          Abrindo câmera…
        </p>
      )}
    </div>
  );
}
