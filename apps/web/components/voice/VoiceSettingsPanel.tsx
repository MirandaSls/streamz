"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Keyboard, Mic, Video } from "@/components/ui/icones";
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
import {
  ehMicrofoneDeFoneBluetooth,
  useSistemaDeAudio,
  type SistemaDeAudio,
} from "@/lib/microfone";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import { escolhaDeSaida, explicarMidia, opcoesDe, useVoiceDevices } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * A versão curta de "e o som dos outros aplicativos?", por sistema.
 *
 * A longa, nos dois idiomas, está em `voz.outrosApps*` (`lib/i18n.ts`); este
 * painel é todo pt-BR literal (ver o cabeçalho), e trazer `t()` para uma seção
 * só deixaria o inglês pela metade. O porquê de cada frase — com as linhas do
 * Chromium e do WebKit — está em `sistemaDeAudio`, em `lib/microfone.ts`.
 */
const OUTROS_APPS_CURTO: Record<SistemaDeAudio, string> = {
  windows:
    "A música e o vídeo baixam porque o Windows trata todo microfone aberto como chamada e abaixa o resto em 80%. Nada nesta tela muda isso — quem muda é Som ▸ Comunicações, no Windows.",
  "macos-webkit":
    "No Mac, o cancelamento de eco liga o processamento de voz do sistema, e é ele que abaixa o som dos outros aplicativos. Desligá-lo resolve na hora; a redução de ruído não tem efeito nenhum sobre isso.",
  "macos-chromium":
    "Neste navegador nada aqui mexe no som dos outros aplicativos. Se ele muda durante a chamada, o suspeito é o fone Bluetooth.",
  outro: "Nada nesta tela mexe no som dos outros aplicativos: tudo aqui trata só a sua voz.",
};

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

  /*
    Preset do processamento — a mesma regra de `settings/VozTab.tsx`. Ele
    escolhe **onde a sua voz é tratada**: com `eco`/`ganho` ligados quem trata é
    o sistema (de graça); desligados, a limpeza vira a supressão avançada, que
    roda aqui dentro e custa CPU. Se ele mexe ou não no áudio dos **outros**
    aplicativos depende do sistema, e a resposta está no bloco do fim desta
    seção (e em `sistemaDeAudio`, em `lib/microfone.ts`): no Windows não mexe,
    no macOS o cancelamento de eco mexe. O valor é **derivado** das preferências que já existem —
    nenhum campo novo na store —, então os interruptores abaixo e o preset nunca
    podem discordar.
  */
  const tratamento = audio.processamento.eco || audio.processamento.ganho ? "sistema" : "app";
  const aplicarTratamento = (valor: "sistema" | "app") =>
    setAudioPref({
      processamento:
        valor === "sistema"
          ? { ...audio.processamento, eco: true, ganho: true }
          : // a avançada entra junto: sem ela, tirar o tratamento do sistema
            // deixaria o microfone cru — a troca seria uma piora audível
            { ...audio.processamento, eco: false, ganho: false, ruido: "avancada" },
    });

  // mesma lista e mesmos nomes dos menus da setinha (`opcoesDe`), só no
  // formato que o `Select` pede — igual ao helper de `VozTab.tsx`
  const opcoes = (lista: MediaDeviceInfo[], prefixo: string) =>
    opcoesDe(lista, prefixo).map((o) => ({ value: o.id, label: o.nome }));

  /*
    O aviso de fone Bluetooth também mora aqui, e não só na aba "Voz e vídeo".
    O sintoma — "entrei na call e tudo ficou abafado" — aparece **durante** a
    chamada, e este painel é o que a pessoa abre quando isso acontece; mandá-la
    ao modal de configurações para entender o que acabou de ouvir seria tirá-la
    do lugar onde percebeu o problema (é o mesmo motivo do preset, abaixo).
    Aqui só o caso do microfone já escolhido: a versão cheia (`VozTab.tsx`)
    cobre também o "Padrão do sistema" com um fone na lista, e esta coluna de
    380px não comporta dois blocos de aviso.
  */
  const micEscolhido = devices.inputs.find((d) => d.deviceId === devices.inputId);
  const fone = ehMicrofoneDeFoneBluetooth(micEscolhido?.label) ? micEscolhido : undefined;

  // qual explicação de "e o som dos outros aplicativos?" vale nesta máquina
  const sistema = useSistemaDeAudio();

  /*
    Lista de saída só onde escolher muda alguma coisa — a mesma regra do menu
    da setinha do fone e da aba cheia (`escolhaDeSaida`). Sem `setSinkId` (o
    WKWebView do Mac antes do macOS 15.4, por exemplo) o `aplicarSaida` volta
    em silêncio: o seletor obedecia à store e o som ficava no mesmo aparelho.
    O `motivoFixo` vira o `hint` do campo, porque desabilitar sem dizer por quê
    só troca um defeito mudo por outro.
  */
  const saida = escolhaDeSaida(devices, sistema, "saída");

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
          value={saida.escolhido ?? ""}
          options={saida.opcoes.map((o) => ({ value: o.id, label: o.nome }))}
          onChange={(id) => devices.setOutput(id || null)}
          // sem escolha possível a linha única é a saída do sistema, e é isso
          // que ela tem de dizer — "Nenhuma saída encontrada" seria falso
          emptyLabel={saida.motivoFixo ? "Padrão do sistema" : "Nenhuma saída encontrada"}
          disabled={saida.opcoes.length === 0}
          hint={saida.motivoFixo}
        />
        {fone && (
          // mesma moldura do aviso da aba cheia (`AvisoDeFoneBluetooth` em
          // `settings/VozTab.tsx`): traço sutil sobre `background-base-lowest`
          // e o triângulo em `status-warning` — recado para ler, não erro
          <div className="flex items-start gap-2 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-2">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0 text-status-warning"
              aria-hidden="true"
            />
            <p className="min-w-0 text-xs leading-relaxed text-text-muted">
              O microfone é o do fone Bluetooth (<strong>{fone.label}</strong>). Enquanto ele
              estiver em uso, o sistema (Windows ou Mac) põe o fone em modo mãos-livres e{" "}
              <strong>todo</strong> o áudio sai abafado — música, jogo, vídeo. Escolha outro
              microfone e deixe o fone só como <em>saída</em>.
            </p>
          </div>
        )}
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
        {/* O preset está aqui, e não só na aba cheia, porque é **aqui** que a
            pessoa repara na própria voz: ela entra na chamada, se ouve com eco
            (ou com o ventilador junto) e abre este painel. Mandá-la ao modal de
            configurações para ajustar o que acabou de ouvir seria pedir que
            saísse do lugar onde percebeu o problema. A densidade se resolve com
            uma coluna só, como a redução de ruído logo abaixo. O texto repete o da aba
            (`voz.tratamento*` em `lib/i18n.ts`): este painel ainda é todo em
            pt-BR literal, e misturar `t()` numa seção só deixaria o inglês pela
            metade. A divisória fica no invólucro (e não no `RadioCards`) pelo
            mesmo motivo da aba cheia: no fieldset, o traço cairia entre o
            preset e a sua ajuda. */}
        <div className="border-b border-border-subtle pb-3">
          <RadioCards
            semDivisoria
            legend="Onde tratar o seu microfone"
            columns={1}
            value={tratamento}
            onChange={aplicarTratamento}
            options={[
              {
                value: "sistema",
                label: "Sistema",
                hint: "trata o eco melhor; não custa CPU",
              },
              { value: "app", label: "No app", hint: "limpa o ruído aqui dentro; usa mais CPU" },
            ]}
          />
          <p className="mt-2 text-xs text-text-muted">
            Escolhe onde a sua voz é tratada. “Sistema” usa o cancelamento de eco e o ganho do seu
            computador: é o melhor para quem fala no alto-falante e não custa processador. “No app”
            desliga os dois e deixa a limpeza com a supressão avançada, que roda aqui dentro.
          </p>
        </div>
        <ToggleLinha
          titulo="Cancelamento de eco"
          hint="Tira da sua voz o eco do que sai pelos alto-falantes, para os outros não se ouvirem de volta. Quem usa fone pode desligar sem ganhar eco."
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
          hint="Nivela o seu volume quando você fala perto ou longe do microfone. Trata só a sua voz."
          checked={audio.processamento.ganho}
          onChange={(ganho) => setAudioPref({ processamento: { ...audio.processamento, ganho } })}
        />
        {/*
          "Por que a minha música baixou?" é perguntado **aqui**, no meio da
          chamada — por isso a resposta também mora neste painel, e não só na
          aba cheia. Versão curta: a longa, nos dois idiomas, está em
          `voz.outrosApps*` (`lib/i18n.ts`), e o porquê de cada frase está em
          `sistemaDeAudio` (`lib/microfone.ts`). O botão só aparece onde ele de
          fato resolve: no WebKit do macOS, onde o cancelamento de eco é o que
          liga a `VoiceProcessingIO`.
        */}
        {sistema && (
          <div className="border-t border-border-subtle pt-3">
            <p className="text-xs leading-relaxed text-text-muted">
              {OUTROS_APPS_CURTO[sistema]}
            </p>
            {sistema === "macos-webkit" && audio.processamento.eco && (
              <Button
                className="mt-2"
                variante="secundario"
                tamanho="sm"
                onClick={() =>
                  setAudioPref({ processamento: { ...audio.processamento, eco: false } })
                }
              >
                Desligar o cancelamento de eco
              </Button>
            )}
          </div>
        )}
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
