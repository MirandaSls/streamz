"use client";

import { useRef, useState } from "react";
import { MonitorUp, MonitorX, Radio } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import ScreenSharePicker from "@/components/voice/ScreenSharePicker";
import { BotaoDeChamada } from "@/components/voice/controles-de-chamada";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { useEhMobile } from "@/hooks/useEhMobile";
import { SEM_CAPTURA_DE_TELA, capturarTelaNoNavegador } from "@/lib/captura-de-tela";
import { isTauri } from "@/lib/desktop";
import { ehCancelamento, mensagemDeErro } from "@/lib/seletor-de-tela";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Compartilhar tela — dois caminhos, um botão.
 *
 * **No desktop** abre o seletor próprio (`ScreenSharePicker`): lá o Rust sabe
 * listar janelas e monitores, e a grade de miniaturas é a escolha.
 *
 * **No navegador** não abre modal nenhum. Quem lista as fontes é o próprio
 * browser, e `getDisplayMedia` só pode ser chamada no gesto do usuário: o modal
 * antes dela era um "Escolher janela" que abria o diálogo de verdade, virava a
 * captura numa miniatura e ainda pedia um clique nela — dois passos para uma
 * escolha que já tinha sido feita. Agora o clique chama a captura direto, com o
 * preset que está na store, e publica. Cancelar o diálogo do navegador é uma
 * decisão, não um erro: não acontece nada, sem aviso.
 *
 * A qualidade (resolução, taxa de quadros e áudio do sistema) fica no rodapé do
 * seletor no desktop e na **aba Voz das configurações** no navegador — a mesma
 * store nos dois, e os mesmos segmentos (`SegmentosDeQualidade`).
 *
 * No ar o botão fica **verde**, não vermelho. Vermelho cheio na barra é o
 * desligar, e só ele: transmitindo, o botão está *ligado*, não em erro — quem
 * lê a fileira de longe precisa achar um vermelho só, o que encerra a chamada.
 */
export default function ScreenShareButton({
  variante = "barra",
}: {
  /** `largo` é o botão de largura total da barra "Voz conectada". */
  variante?: "barra" | "largo";
}) {
  const [seletor, setSeletor] = useState(false);
  // o diálogo do navegador já está aberto: um segundo clique só faria o browser
  // recusar a chamada (o botão continua clicável porque a fileira não tem
  // estado "ocupado" — o que falta é a segunda chamada, não o clique)
  const pedindo = useRef(false);
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);

  const label = screenOn ? "Parar transmissão" : "Compartilhar tela";

  async function capturarNoNavegador() {
    if (pedindo.current) return;
    pedindo.current = true;
    const { screenQuality, screenAudio, publicarTela } = useVoice.getState();
    try {
      // `null` = o navegador não tem `getDisplayMedia` (Safari do iOS, Chrome
      // do Android). Aqui isso é raro — quem chega neste botão está num
      // computador —, e no celular o botão já nasce apagado com a mesma frase
      // (ver `ControlesMobile`). O aviso fica porque falhar calado é pior.
      const captura = await capturarTelaNoNavegador(screenQuality, screenAudio);
      if (!captura) {
        ui.toast(SEM_CAPTURA_DE_TELA, "error");
        return;
      }
      await publicarTela(captura);
    } catch (e) {
      if (!ehCancelamento(e)) ui.toast(mensagemDeErro(e), "error");
    } finally {
      pedindo.current = false;
    }
  }

  const acionar = () => {
    if (screenOn) return void pararTela();
    // `isTauri()` no clique, não na renderização: o valor não muda em runtime e
    // ler no evento evita divergir do HTML servido antes da hidratação
    if (isTauri()) return setSeletor(true);
    void capturarNoNavegador();
  };

  return (
    <>
      {variante === "largo" ? (
        // Só ícone, como no painel do Discord: o rótulo comia mais da metade da
        // largura do botão e ainda precisava ser abreviado ("Tela") para caber
        // na largura de meio cartão. O nome inteiro vive no tooltip.
        //
        // `h-[30px]`, não `h-8` (32): o invólucro de `VoiceConnectedBar` já é
        // 74×30 (medido nos prints 101842/160106), e os 32 daqui vazavam 2px
        // por baixo dele — ver o comentário lá ("faltando" do cartão anterior).
        <Tooltip label={label} className="min-w-0 flex-1">
          <button
            type="button"
            onClick={acionar}
            aria-label={label}
            aria-pressed={screenOn}
            className={`grid h-[30px] w-full place-items-center rounded-lg transition ${
              screenOn
                ? "bg-status-positive/20 text-status-positive hover:bg-status-positive/30"
                : "bg-border-normal/60 text-text-subtle hover:bg-border-normal hover:text-text-strong"
            }`}
          >
            {screenOn ? <MonitorX size={24} /> : <MonitorUp size={20} />}
          </button>
        </Tooltip>
      ) : (
        <BotaoDeChamada
          label={label}
          onClick={acionar}
          tom={screenOn ? "aoVivo" : "neutro"}
          pressionado={screenOn}
        >
          {screenOn ? <MonitorX size={22} /> : <MonitorUp size={22} />}
        </BotaoDeChamada>
      )}

      {seletor && <ScreenSharePicker onClose={() => setSeletor(false)} />}
    </>
  );
}

/**
 * Selo "Você está ao vivo" — o lembrete que impede alguém de continuar
 * transmitindo sem perceber. Fica no palco, não no botão: o botão pode estar
 * fora da tela, e o palco não.
 */
export function AoVivoIndicador() {
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);
  const ehMobile = useEhMobile();
  if (!screenOn) return null;

  // `w-max` + `nowrap`: o mesmo selo é usado no cabeçalho do palco e no do
  // painel de canal, contêineres de larguras bem diferentes. Sem isto ele se
  // deixava espremer, quebrava "Você está ao vivo" uma palavra por linha e o
  // botão subia por cima do texto.
  return (
    <div className="flex w-max items-center gap-2 rounded-full bg-status-danger/15 py-1 pl-3 pr-1 text-xs font-semibold text-status-danger">
      <Radio size={14} className="shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">Você está ao vivo</span>
      {/* No telefone este é o botão que tira a sua tela do ar, e ele media 21px
          de altura (`py-1` sobre 11px de texto): metade do piso de toque, em
          cima de um palco onde tudo o mais tem 44 ou 48. Cresce para
          `ALVO_MINIMO`, em px pelo motivo de sempre (a raiz é 16). O selo é a
          única coisa que a barra de controles do celular não repete com folga —
          o botão de tela dela também para a transmissão, mas quem lê "Você está
          ao vivo" está olhando para cá. */}
      <button
        type="button"
        onClick={() => void pararTela()}
        style={ehMobile ? { height: ALVO_MINIMO } : undefined}
        className={`shrink-0 whitespace-nowrap rounded-full bg-status-danger px-2 text-[11px] font-bold text-control-critical-primary-text-default transition hover:bg-control-critical-primary-background-hover ${
          ehMobile ? "" : "py-1"
        }`}
      >
        Parar transmissão
      </button>
    </div>
  );
}
