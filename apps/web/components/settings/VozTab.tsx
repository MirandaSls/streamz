"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Keyboard, Mic, RefreshCw, Video } from "@/components/ui/icones";
import { PTT_RELEASE_MS, type CameraFps } from "@streamz/shared";
import { RadioCards, Section, Select, Slider, ToggleLinha } from "@/components/ui/controls";
import { Button } from "@/components/ui/primitivos";
import {
  AJUDA_FPS_DA_CAMERA,
  SeletorDeFpsDaCamera,
  restricoesDaPrevia,
} from "@/components/voice/fps-da-camera";
import { SegmentosDeQualidade } from "@/components/voice/qualidade-de-tela";
import { useTesteDeMicrofone } from "@/components/voice/useTesteDeMicrofone";
import { useT, type ChaveDeTexto } from "@/lib/i18n";
import {
  ehMicrofoneDeFoneBluetooth,
  useSistemaDeAudio,
  type SistemaDeAudio,
} from "@/lib/microfone";
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
 * A seção "Compartilhar tela" está aqui porque o seletor **só existe antes de
 * ir ao ar**: com a transmissão no ar não há onde trocar a qualidade, e o
 * popout que o Discord abre no tile ao vivo não foi construído. Os mesmos
 * controles estão no rodapé do seletor (nos dois caminhos, navegador e
 * desktop) e escrevem na mesma store, então não há duas verdades.
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
  // taxa de quadros da câmera — a mesma que a setinha do botão e o painel da
  // chamada escrevem; a prévia daqui pede essa taxa para mostrar o que sai
  const cameraFps = useVoice((v) => v.cameraFps);

  const [erro, setErro] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [atualizandoLista, setAtualizandoLista] = useState(false);
  const [abrindoCamera, setAbrindoCamera] = useState(false);
  const { testando, nivel, erro: erroDoTeste, alternar: alternarTeste } = useTesteDeMicrofone();

  const videoRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);
  // cada abertura da prévia ganha um número; a resposta de um `getUserMedia`
  // que já foi superado (desligar, trocar o fps, sair da aba) é jogada fora e
  // a trilha dela é parada, em vez de ficar com a luz da câmera acesa
  const pedido = useRef(0);
  // a pessoa quer a prévia ligada? (inclui o vão em que ela ainda está abrindo)
  const previaPedida = useRef(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pararCamera = useCallback(() => {
    pedido.current += 1;
    previaPedida.current = false;
    setAbrindoCamera(false);
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

  // "Atualizar lista" é o pedido explícito de tentar de novo a permissão
  // (ver o comentário no botão); o estado `carregando` do `Button` é o único
  // aviso de que o clique pegou — sem ele, uma permissão que demora parece um
  // botão morto.
  async function atualizarLista() {
    setAtualizandoLista(true);
    try {
      await devices.refresh(true);
    } finally {
      setAtualizandoLista(false);
    }
  }

  const abrirPrevia = useCallback(
    async (cameraId: string | null, fps: CameraFps) => {
      const meu = ++pedido.current;
      previaPedida.current = true;
      setAbrindoCamera(true);
      // a trilha anterior sai **antes** de pedir a nova: há câmera (e driver
      // no Windows) que não abre o mesmo aparelho duas vezes, e a troca de fps
      // falharia com "aparelho ocupado" por causa da nossa própria prévia
      camStream.current?.getTracks().forEach((track) => track.stop());
      camStream.current = null;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: restricoesDaPrevia(cameraId, fps),
        });
        if (meu !== pedido.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        camStream.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setErro(null);
        setCamera(true);
        setAbrindoCamera(false);
        void refresh();
      } catch {
        if (meu !== pedido.current) return;
        setErro(explicarMidia(motivoDaFalha()) ?? t("voz.semPermissao"));
        pararCamera();
      }
    },
    [pararCamera, refresh, t],
  );

  function alternarCamera() {
    if (camera || previaPedida.current) {
      pararCamera();
      return;
    }
    void abrirPrevia(devices.cameraId, cameraFps);
  }

  // trocar a taxa com a prévia ligada reabre a câmera na taxa nova — senão a
  // prévia continuaria mostrando a taxa antiga e o seletor pareceria morto
  // (o aparelho entra nas dependências só por ser lido; quem decide reabrir é
  // a comparação com o fps da última abertura)
  const fpsDaPrevia = useRef(cameraFps);
  const cameraId = devices.cameraId;
  useEffect(() => {
    if (fpsDaPrevia.current === cameraFps) return;
    fpsDaPrevia.current = cameraFps;
    if (previaPedida.current) void abrirPrevia(cameraId, cameraFps);
  }, [cameraFps, cameraId, abrirPrevia]);

  /*
    O preset existe porque o compromisso do processamento de voz é invisível:
    com `eco`/`ganho` ligados (o padrão) quem limpa o microfone é o sistema;
    desligados, quem limpa é a supressão avançada (o RNNoise), que roda aqui
    dentro e custa CPU. Daí as duas pontas nomeadas, em vez de dois
    interruptores soltos que ninguém liga ao sintoma.

    **O texto desta seção já errou nos dois sentidos, e cada erro estava certo
    em alguma plataforma.** Primeiro prometeu que "No app" tirava o sistema do
    modo de comunicação (falso no Windows); depois, corrigindo demais, afirmou
    que *nenhuma* opção muda o som dos outros aplicativos (falso no macOS, onde
    o WebKit liga a `VoiceProcessingIO` exatamente quando o cancelamento de eco
    está ligado, e ela abaixa o áudio dos outros apps). A resposta certa depende
    do sistema, então ela saiu daqui e virou `sistemaDeAudio` em
    `lib/microfone.ts`, que é onde ficam as referências ao código do Chromium e
    do WebKit. O preset volta a falar só do que ele de fato decide: eco e CPU.

    O valor é **derivado** das preferências que já existem — não há campo novo na
    store —, então mexer num dos interruptores abaixo reposiciona o preset
    sozinho, sem chance de os dois discordarem.
  */
  // qual explicação de "e o som dos outros aplicativos?" vale nesta máquina
  const sistema = useSistemaDeAudio();

  const tratamento = processamento.eco || processamento.ganho ? "sistema" : "app";
  const aplicarTratamento = (valor: "sistema" | "app") =>
    setAudioPref({
      processamento:
        valor === "sistema"
          ? { ...processamento, eco: true, ganho: true }
          : // a avançada entra junto: sem ela, desligar eco e ganho deixaria o
            // microfone cru — a troca seria uma piora audível
            { ...processamento, eco: false, ganho: false, ruido: "avancada" },
    });

  // mesma lista e mesmos nomes dos menus da setinha (`opcoesDe`), só no
  // formato que o `Select` pede
  const opcoes = (lista: MediaDeviceInfo[], prefixo: string) =>
    opcoesDe(lista, prefixo).map((o) => ({ value: o.id, label: o.nome }));

  /*
    O microfone escolhido é o de um fone Bluetooth?

    É a causa mais comum de "entrei na call e o som dos outros apps ficou
    abafado", e é a única que **nenhuma** opção desta tela conserta: abrir a
    captura do fone obriga o sistema — Windows **e** macOS — a trocar o perfil
    do aparelho de A2DP (estéreo, banda cheia) para o de chamada (mono, banda
    estreita), e a troca vale para o fone inteiro. Por isso o aviso aponta para
    a saída que existe — usar outro microfone —, em vez de prometer um
    interruptor.

    Com "Padrão do sistema" não dá para saber qual aparelho o sistema vai usar;
    o que dá é ver se existe um candidato na lista e dizer isso com essa
    ressalva, em vez de afirmar o que não se sabe.
  */
  const micEscolhido = devices.inputs.find((d) => d.deviceId === devices.inputId);
  const foneEscolhido = ehMicrofoneDeFoneBluetooth(micEscolhido?.label) ? micEscolhido : undefined;
  const foneNaLista =
    devices.inputId === null
      ? devices.inputs.find((d) => ehMicrofoneDeFoneBluetooth(d.label))
      : undefined;

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

        {foneEscolhido && (
          <AvisoDeFoneBluetooth>
            O microfone escolhido é o do fone Bluetooth (<strong>{foneEscolhido.label}</strong>).
            Enquanto ele estiver aberto numa chamada, o sistema põe o fone em modo mãos-livres —
            mono e de banda estreita —, e <strong>tudo</strong> que tocar nele sai abafado: música,
            jogo, vídeo e os outros aplicativos. Vale igual no Windows e no Mac, e é do Bluetooth,
            não do Streamz: nenhuma opção desta tela desfaz. A saída é escolher outro microfone
            aqui (o do notebook, um USB ou um de mesa) e deixar o fone só como <em>saída</em> — aí
            ele fica em estéreo.
          </AvisoDeFoneBluetooth>
        )}
        {foneNaLista && (
          <AvisoDeFoneBluetooth>
            A entrada está em “Padrão do sistema” e há um microfone de fone Bluetooth na lista (
            <strong>{foneNaLista.label}</strong>). Se for ele que o sistema usar, o fone entra em
            modo mãos-livres durante a chamada e tudo que tocar nele fica abafado. Para não
            depender do palpite do sistema, escolha aqui um microfone que não seja o do fone.
          </AvisoDeFoneBluetooth>
        )}

        <div className="mt-3 flex items-center gap-3">
          {!devices.autorizado && (
            // o motivo real, e não sempre "conceda a permissão": no desktop a
            // captura é aceita e mesmo assim os nomes não vêm
            <p className="min-w-0 flex-1 text-xs text-status-warning">
              {explicarMidia(devices.motivo) ??
                "Conceda acesso ao microfone para ver o nome dos dispositivos."}
            </p>
          )}
          <Button
            variante="link"
            tamanho="xs"
            icone={<RefreshCw size={14} aria-hidden="true" />}
            // `true`: este botão é o pedido explícito de tentar de novo, e tem
            // de furar a trava que impede um prompt por abertura de menu
            onClick={() => void atualizarLista()}
            // estado "carregando": o próprio primitivo troca o rótulo pelos
            // três pontos (`Button.tsx`) — sem isso, um pedido de permissão
            // que demora parece um clique que não pegou
            carregando={atualizandoLista}
            className="ml-auto celular:min-h-[44px]"
          >
            Atualizar lista
          </Button>
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
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
              {t("voz.pttTecla")}
            </p>
            <Button
              variante={capturando ? "primario" : "secundario"}
              tamanho="md"
              icone={<Keyboard size={16} aria-hidden="true" />}
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
              className="celular:h-[44px]"
            >
              {capturando ? t("voz.apertePara") : pttRotulo(pttKey)}
            </Button>
            <p className="mt-1.5 text-xs text-text-muted">
              O microfone continua aberto por {PTT_RELEASE_MS} ms depois de soltar, para a última
              sílaba não sumir.
            </p>
          </div>
        )}
      </Section>

      <Section id="processamento" title={t("voz.processamento")}>
        {/* A divisória fica no invólucro, e não no `RadioCards`: com ela no
            fieldset o texto de ajuda cairia **depois** do traço e pareceria
            legenda da redução de ruído, que é o bloco seguinte. */}
        <div className="border-b border-border-subtle py-3">
          <RadioCards
            semDivisoria
            legend={t("voz.tratamento")}
            value={tratamento}
            onChange={aplicarTratamento}
            options={[
              {
                value: "sistema",
                label: t("voz.tratamentoSistema"),
                hint: t("voz.tratamentoSistemaAjuda"),
              },
              {
                value: "app",
                label: t("voz.tratamentoApp"),
                hint: t("voz.tratamentoAppAjuda"),
              },
            ]}
          />
          <p className="mt-2 text-xs text-text-muted">{t("voz.tratamentoAjuda")}</p>
        </div>
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
        <p className="-mt-1 pb-3 text-xs text-text-muted">{t("voz.ruidoAjuda")}</p>
        <ToggleLinha
          titulo={t("voz.eco")}
          hint={t("voz.ecoAjuda")}
          checked={processamento.eco}
          onChange={(eco) => setAudioPref({ processamento: { ...processamento, eco } })}
        />
        <ToggleLinha
          titulo={t("voz.ganho")}
          hint={t("voz.ganhoAjuda")}
          checked={processamento.ganho}
          onChange={(ganho) => setAudioPref({ processamento: { ...processamento, ganho } })}
        />
        {/*
          A pergunta que traz a pessoa a esta tela quase nunca é "onde tratar o
          meu microfone": é "por que a minha música baixa quando eu entro na
          call". A resposta muda com o sistema — e no macOS existe um botão que
          resolve —, por isso ela fica no fim da seção, depois dos interruptores
          que ela cita, e só aparece quando já sabemos em que sistema estamos.
        */}
        {sistema && (
          <div className="border-t border-border-subtle pt-3">
            <h4 className="text-xs font-semibold text-text-default">{t("voz.outrosApps")}</h4>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {t(AJUDA_DE_OUTROS_APPS[sistema])}
            </p>
            {sistema === "macos-webkit" && processamento.eco && (
              <Button
                className="mt-2"
                variante="secundario"
                tamanho="sm"
                onClick={() => setAudioPref({ processamento: { ...processamento, eco: false } })}
              >
                {t("voz.desligarEco")}
              </Button>
            )}
          </div>
        )}
      </Section>

      <Section id="testar" title={t("voz.testarMic")}>
        {/*
          Grade `auto 1fr`, não `flex`: é o leiaute medido do "Mic Test" do
          Discord (`.micTest__011b7{display:grid;grid-template-columns:auto
          1fr;column-gap:var(--space-16);align-items:center}`,
          `docs/referencias-discord/tokens/css-bruto/333008.90c167df50b44f04.css`)
          — o botão fica na primeira
          coluna, o medidor ocupa o resto, e a legenda embaixo (`.micTestCaption
          __011b7{grid-column:2;min-height:var(--space-32)}`) começa alinhada
          com o medidor, não com o botão. `gap-4` = 16px (`--space-16`).
        */}
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 py-3">
          <Button
            variante="primario"
            // 32px: medido no mesmo print (`Captura de tela 2026-09-01
            // 113445.png`, botão "Testar" em x175–236/y448–479 = 61×32),
            // igual ao botão do popover de supressão (`PopoverDeRuido.tsx`)
            // — os dois testes são o mesmo hook, então o mesmo botão.
            tamanho="sm"
            icone={<Mic size={14} aria-hidden="true" />}
            onClick={testarMicrofone}
            className="shrink-0 celular:h-[44px]"
          >
            {testando ? t("voz.parar") : t("voz.testar")}
          </Button>
          <MedidorDeMicrofone nivel={nivel} rotulo={t("voz.volumeEntrada")} />
          {/* `min-h-8` (32px) reserva a altura da legenda antes de ela trocar
              de texto — sem a reserva, o erro do teste empurra o resto da
              seção para baixo quando aparece. `col-start-2`: por baixo do
              medidor, como no `.micTestCaption__011b7` medido acima. */}
          <p className="col-start-2 min-h-8 text-xs text-text-muted">
            {/* O que o teste faz, dito antes de a pessoa estranhar o silêncio
                (e os dois ícones acesos no rodapé): o Discord também
                ensurdece, e sem o aviso parece que a call caiu. */}
            {testando
              ? "Você está se ouvindo. Enquanto o teste durar você fica mudo e surdo — a sala não te ouve e você não ouve ninguém."
              : "Você vai se ouvir; enquanto o teste durar você fica mudo e surdo, e a chamada fica em silêncio dos dois lados."}
          </p>
          {erroDoTeste && (
            <p className="col-start-2 text-xs text-status-danger">{erroDoTeste}</p>
          )}
        </div>
      </Section>

      <Section id="tela" title={t("voz.tela")}>
        <div className="py-3">
          <SegmentosDeQualidade quality={screenQuality} onQualidade={setScreenQuality} />
        </div>
        {/* O custo de subida é a única coisa que o usuário não consegue deduzir
            sozinho, e é o que decide se 1440p vai funcionar na conexão dele. */}
        <p className="-mt-1 pb-3 text-xs text-text-muted">
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
          {/* `flex-wrap`: no celular (segmentos de 44) rótulo e sulco não cabem
              numa linha de 358px, e sem quebra o sulco espremia cada "15 fps"
              em duas linhas. `mt-2`: os mesmos 8px entre sulco e legenda da
              seção da tela, logo acima. */}
          <div className="mt-3">
            <SeletorDeFpsDaCamera className="flex flex-wrap items-center gap-2" />
          </div>
          <p className="mt-2 text-xs text-text-muted">{AJUDA_FPS_DA_CAMERA}</p>
          <div className="my-3 grid aspect-video w-full max-w-[420px] place-items-center overflow-hidden rounded-lg bg-input-background-default">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label={t("voz.previaCamera")}
              className={`h-full w-full object-cover ${camera ? "" : "hidden"}`}
            />
            {!camera && <Video size={40} className="text-channels-default" aria-hidden="true" />}
          </div>
          <Button
            variante="secundario"
            tamanho="md"
            onClick={alternarCamera}
            carregando={abrindoCamera}
            className="celular:h-[44px]"
          >
            {camera ? t("voz.desligarCamera") : t("voz.ligarCamera")}
          </Button>
        </div>
      </Section>

      {erro && <p className="text-sm text-status-danger">{erro}</p>}
    </>
  );
}

/**
 * Bloco de aviso da seção de dispositivos.
 *
 * Mesma moldura dos outros avisos das configurações (`AlertTriangle` em
 * `--status-warning` sobre `--background-base-lowest`, ver
 * `NotificacoesTab`/`SegurancaTab`): é um recado que a pessoa precisa ler, não
 * um erro que quebrou alguma coisa — e é por isso que ele não usa vermelho nem
 * some sozinho.
 */
/**
 * A explicação de "por que a minha música baixa na call", por sistema.
 *
 * O mapa é exaustivo por construção (`Record<SistemaDeAudio, …>`): plataforma
 * nova em `sistemaDeAudio` quebra o typecheck aqui, que é onde deve doer.
 */
const AJUDA_DE_OUTROS_APPS: Record<SistemaDeAudio, ChaveDeTexto> = {
  windows: "voz.outrosAppsWindows",
  "macos-webkit": "voz.outrosAppsMacWebkit",
  "macos-chromium": "voz.outrosAppsMacChromium",
  outro: "voz.outrosAppsOutro",
};

function AvisoDeFoneBluetooth({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-status-warning"
        aria-hidden="true"
      />
      <p className="min-w-0 text-xs leading-relaxed text-text-muted">{children}</p>
    </div>
  );
}

const BLOCOS = 20;

/**
 * O medidor do Discord é segmentado, não uma barra lisa.
 *
 * Não é decoração: com blocos discretos dá para ver *quantos* acendem e voltar
 * ao mesmo ponto depois de mexer no volume — uma barra contínua a 40% e a 45%
 * é a mesma imagem.
 *
 * As duas cores vêm do mesmo print, medidas em repouso (nenhum bloco aceso):
 * `linha 463, x175–420` de `Captura de tela 2026-09-01 113445.png` dá o traço
 * em `#46474f`, que bate exato com `--neutral-56` e quase exato (dist. 6, a
 * antisserrilhado) com `--slider-track-background` (`#474851`) — o mesmo
 * trilho que o `Slider`/`SliderMarcas` de `ui/controls.tsx` já usa para "sem
 * valor". O aceso não aparece em nenhum print parado; fica `--brand-500`, o
 * preenchido desses dois sliders (e do `accent-brand-500` do `<input
 * type=range>` do modo PTT/sensibilidade) — não `--status-positive` (verde):
 * essa é a cor do anel de quem fala (`AnelDeFala`) e da bolinha "on-line", não
 * de medidor de volume, e o Discord não mistura as duas.
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
            i < acesos ? "bg-brand-500" : "bg-slider-track-background"
          }`}
        />
      ))}
    </div>
  );
}
