"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Mic, RefreshCw, Video } from "@/components/ui/icones";
import { PTT_RELEASE_MS } from "@streamz/shared";
import { RadioCards, Section, Select, Slider, ToggleLinha } from "@/components/ui/controls";
import { SegmentosDeQualidade } from "@/components/voice/qualidade-de-tela";
import { useTesteDeMicrofone } from "@/components/voice/useTesteDeMicrofone";
import { useT } from "@/lib/i18n";
import { estimativaDeBanda } from "@/lib/seletor-de-tela";
import { pttRotulo } from "@/stores/ptt-core";
import { useSettings } from "@/stores/settings";
import { explicarMidia, motivoDaFalha, opcoesDe, useVoiceDevices } from "@/stores/voiceDevices";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Voz e vídeo: dispositivos, volumes, modo de transmissão, teste de microfone
 * e prévia da câmera.
 *
 * Entrada e saída ficam **lado a lado**, com o volume de cada uma logo abaixo
 * da sua coluna: é o pareamento do Discord e é o que deixa claro qual slider
 * mexe em qual dispositivo. Empilhados, os dois volumes ficavam longe do
 * seletor a que pertencem.
 *
 * Os seletores são montados aqui, e não pelo `VoiceSettingsPanel`: aquele
 * painel é a versão de uma coluna que abre *durante* a chamada, onde não há
 * largura para duas. Os dois escrevem na mesma store (`voiceDevices`), então a
 * escolha continua valendo nos dois lugares.
 *
 * Toda trilha aberta aqui é parada ao sair da aba: um microfone que fica
 * gravando depois de fechar a tela é o tipo de bug que ninguém percebe. O
 * teste de microfone é o mesmo do popover de supressão de ruído e vem do mesmo
 * hook (`useTesteDeMicrofone`): enquanto ele corre você fica mudo e surdo de
 * verdade — a sala não te ouve, você não ouve ninguém e os outros te veem
 * assim — e escuta o seu próprio microfone. Parar devolve o par de antes.
 *
 * A seção "Compartilhar tela" está aqui porque no **navegador** o botão de
 * transmitir não abre mais modal nenhum — ele chama `getDisplayMedia` direto e
 * publica (`ScreenShareButton`). A escolha de resolução, taxa de quadros e
 * áudio do sistema precisava de um lugar calmo, e é este; no desktop os mesmos
 * controles continuam no rodapé do seletor, escrevendo na mesma store, então
 * não há duas verdades.
 */
export default function VozTab() {
  const t = useT();
  const s = useSettings();
  const devices = useVoiceDevices();
  const { refresh } = devices;
  const pushToTalk = useVoicePrefs((p) => p.pushToTalk);
  const pttKey = useVoicePrefs((p) => p.pttKey);
  const setPushToTalk = useVoicePrefs((p) => p.setPushToTalk);
  const setPttKey = useVoicePrefs((p) => p.setPttKey);
  // o processamento vive na store da voz (a mesma que o painel de dentro da
  // chamada escreve), então a escolha vale nos dois lugares
  const processamento = useVoice((v) => v.audio.processamento);
  const setAudioPref = useVoice((v) => v.setAudioPref);
  // preset da transmissão de tela — o mesmo que o rodapé do seletor escreve
  const screenQuality = useVoice((v) => v.screenQuality);
  const screenAudio = useVoice((v) => v.screenAudio);
  const setScreenQuality = useVoice((v) => v.setScreenQuality);
  const setScreenAudio = useVoice((v) => v.setScreenAudio);

  const [erro, setErro] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const { testando, nivel, erro: erroDoTeste, alternar: alternarTeste } = useTesteDeMicrofone();

  const videoRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pararCamera = useCallback(() => {
    camStream.current?.getTracks().forEach((track) => track.stop());
    camStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(false);
  }, []);

  // sair da aba (ou do modal) tem de fechar a câmera; o microfone do teste é
  // encerrado pelo próprio hook ao desmontar
  useEffect(() => () => pararCamera(), [pararCamera]);

  function testarMicrofone() {
    alternarTeste();
    // rótulos de dispositivo só existem depois da permissão
    void refresh();
  }

  async function alternarCamera() {
    if (camera) {
      pararCamera();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: devices.cameraId ? { deviceId: { exact: devices.cameraId } } : true,
      });
      camStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setErro(null);
      setCamera(true);
      void refresh();
    } catch {
      setErro(explicarMidia(motivoDaFalha()) ?? t("voz.semPermissao"));
      pararCamera();
    }
  }

  // mesma lista e mesmos nomes dos menus da setinha (`opcoesDe`), só no
  // formato que o `Select` pede
  const opcoes = (lista: MediaDeviceInfo[], prefixo: string) =>
    opcoesDe(lista, prefixo).map((o) => ({ value: o.id, label: o.nome }));

  return (
    <>
      <Section id="dispositivos" title={t("voz.dispositivos")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            semDivisoria
            label={t("voz.entrada")}
            value={devices.inputId ?? ""}
            options={opcoes(devices.inputs, t("voz.entrada"))}
            onChange={(id) => devices.setInput(id || null)}
            emptyLabel={t("voz.padraoSistema")}
            disabled={devices.inputs.length === 0}
          />
          <Select
            semDivisoria
            label={t("voz.saida")}
            value={devices.outputId ?? ""}
            options={opcoes(devices.outputs, t("voz.saida"))}
            onChange={(id) => devices.setOutput(id || null)}
            emptyLabel={t("voz.padraoSistema")}
            disabled={devices.outputs.length === 0}
          />
          <Slider
            label={t("voz.volumeEntrada")}
            value={s.inputVolume}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(inputVolume) => s.set({ inputVolume })}
          />
          <Slider
            label={t("voz.volumeSaida")}
            value={s.outputVolume}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(outputVolume) => s.set({ outputVolume })}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          {!devices.autorizado && (
            // o motivo real, e não sempre "conceda a permissão": no desktop a
            // captura é aceita e mesmo assim os nomes não vêm
            <p className="min-w-0 flex-1 text-xs text-yellow">
              {explicarMidia(devices.motivo) ??
                "Conceda acesso ao microfone para ver o nome dos dispositivos."}
            </p>
          )}
          <button
            type="button"
            // `true`: este botão é o pedido explícito de tentar de novo, e tem
            // de furar a trava que impede um prompt por abertura de menu
            onClick={() => void devices.refresh(true)}
            className="ml-auto flex items-center gap-1.5 text-xs text-txt-muted transition hover:text-txt-primary celular:min-h-[44px]"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Atualizar lista
          </button>
        </div>
      </Section>

      <Section id="modo" title={t("voz.modo")}>
        <RadioCards
          legend={t("voz.modo")}
          legendaOculta
          value={pushToTalk ? "ptt" : "atividade"}
          onChange={(v) => setPushToTalk(v === "ptt")}
          options={[
            { value: "atividade", label: t("voz.atividade") },
            { value: "ptt", label: t("voz.ptt") },
          ]}
        />
        {pushToTalk && (
          <div className="py-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
              {t("voz.pttTecla")}
            </p>
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
              aria-label={t("voz.gravarTecla")}
              className={`flex h-9 celular:h-[44px] items-center gap-1.5 rounded-[3px] px-3 text-sm transition ${
                capturando ? "bg-accent text-accent-ink" : "bg-void text-txt-normal hover:bg-hov"
              }`}
            >
              <Keyboard size={16} aria-hidden="true" />
              {capturando ? t("voz.apertePara") : pttRotulo(pttKey)}
            </button>
            <p className="mt-1.5 text-xs text-txt-muted">
              O microfone continua aberto por {PTT_RELEASE_MS} ms depois de soltar, para a última
              sílaba não sumir.
            </p>
          </div>
        )}
      </Section>

      <Section id="processamento" title={t("voz.processamento")}>
        <RadioCards
          legend={t("voz.ruido")}
          columns={3}
          value={processamento.ruido}
          onChange={(ruido: NivelDeRuido) =>
            setAudioPref({ processamento: { ...processamento, ruido } })
          }
          options={[
            { value: "off", label: t("voz.ruidoOff") },
            { value: "padrao", label: t("voz.ruidoPadrao") },
            { value: "avancada", label: t("voz.ruidoAvancada") },
          ]}
        />
        <p className="-mt-1 pb-3 text-xs text-txt-muted">{t("voz.ruidoAjuda")}</p>
        <ToggleLinha
          titulo={t("voz.eco")}
          checked={processamento.eco}
          onChange={(eco) => setAudioPref({ processamento: { ...processamento, eco } })}
        />
        <ToggleLinha
          titulo={t("voz.ganho")}
          checked={processamento.ganho}
          onChange={(ganho) => setAudioPref({ processamento: { ...processamento, ganho } })}
        />
      </Section>

      <Section id="testar" title={t("voz.testarMic")}>
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            onClick={testarMicrofone}
            className="flex h-9 celular:h-[44px] shrink-0 items-center gap-2 rounded-[3px] bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-accent-hover"
          >
            <Mic size={16} aria-hidden="true" />
            {testando ? t("voz.parar") : t("voz.testar")}
          </button>
          <MedidorDeMicrofone nivel={nivel} rotulo={t("voz.volumeEntrada")} />
        </div>
        {/* O que o teste faz, dito antes de a pessoa estranhar o silêncio (e
            os dois ícones acesos no rodapé): o Discord também ensurdece, e sem
            o aviso parece que a call caiu. */}
        <p className="-mt-1 pb-3 text-xs text-txt-muted">
          {testando
            ? "Você está se ouvindo. Enquanto o teste durar você fica mudo e surdo — a sala não te ouve e você não ouve ninguém."
            : "Você vai se ouvir; enquanto o teste durar você fica mudo e surdo, e a chamada fica em silêncio dos dois lados."}
        </p>
        {erroDoTeste && <p className="pb-3 text-xs text-red">{erroDoTeste}</p>}
      </Section>

      <Section id="tela" title={t("voz.tela")}>
        <div className="py-3">
          <SegmentosDeQualidade quality={screenQuality} onQualidade={setScreenQuality} />
        </div>
        {/* O custo de subida é a única coisa que o usuário não consegue deduzir
            sozinho, e é o que decide se 1440p vai funcionar na conexão dele. */}
        <p className="-mt-1 pb-3 text-xs text-txt-muted">
          Usa cerca de {estimativaDeBanda(screenQuality)} da sua internet de subida
        </p>
        <ToggleLinha
          titulo={t("voz.telaAudio")}
          hint={t("voz.telaAudioAjuda")}
          checked={screenAudio}
          onChange={setScreenAudio}
        />
      </Section>

      <Section id="camera" title={t("voz.previaCamera")} semDivisoria>
        <div className="py-3">
          <Select
            semDivisoria
            label={t("voz.camera")}
            value={devices.cameraId ?? ""}
            options={opcoes(devices.cameras, t("voz.camera"))}
            onChange={(id) => devices.setCamera(id || null)}
            emptyLabel={t("voz.padraoSistema")}
            disabled={devices.cameras.length === 0}
          />
          <div className="my-3 grid aspect-video w-full max-w-[420px] place-items-center overflow-hidden rounded-lg bg-void">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label={t("voz.previaCamera")}
              className={`h-full w-full object-cover ${camera ? "" : "hidden"}`}
            />
            {!camera && <Video size={40} className="text-txt-faint" aria-hidden="true" />}
          </div>
          <button
            type="button"
            onClick={() => void alternarCamera()}
            className="h-9 celular:h-[44px] rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover"
          >
            {camera ? t("voz.desligarCamera") : t("voz.ligarCamera")}
          </button>
        </div>
      </Section>

      {erro && <p className="text-sm text-red">{erro}</p>}
    </>
  );
}

const BLOCOS = 20;

/**
 * O medidor do Discord é segmentado, não uma barra lisa.
 *
 * Não é decoração: com blocos discretos dá para ver *quantos* acendem e voltar
 * ao mesmo ponto depois de mexer no volume — uma barra contínua a 40% e a 45%
 * é a mesma imagem.
 */
function MedidorDeMicrofone({ nivel, rotulo }: { nivel: number; rotulo: string }) {
  const acesos = Math.round(nivel * BLOCOS);
  return (
    <div
      role="meter"
      aria-label={rotulo}
      aria-valuenow={Math.round(nivel * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="flex h-2 flex-1 gap-[3px]"
    >
      {Array.from({ length: BLOCOS }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-full flex-1 rounded-[1px] transition-colors duration-75 ${
            i < acesos ? "bg-green" : "bg-void"
          }`}
        />
      ))}
    </div>
  );
}
