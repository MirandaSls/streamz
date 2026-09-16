"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Soundboard,
  Video,
  VideoOff,
} from "@/components/ui/icones";
import PainelDeSons from "@/components/voice/PainelDeSons";
import { microfoneAbrindo } from "@/components/voice/estado-do-microfone";
import { BARRA_ALTURA, BARRA_MARGEM, BOTAO } from "@/components/voice/palco-mobile";
import { useEhPaisagem } from "@/hooks/useOrientacao";
import {
  SEM_CAPTURA_DE_TELA,
  capturarTelaNoNavegador,
  suportaCapturaDeTela,
} from "@/lib/captura-de-tela";
import { ehCancelamento, mensagemDeErro } from "@/lib/seletor-de-tela";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/** `useLayoutEffect` no cliente; no servidor o React avisa que não roda. */
const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A barra de controles da chamada no celular.
 *
 * **Medidas** (`docs/Reference/mobile/MEDIDAS.md` §12, `discord-mobile-call.png`
 * a 1,8779 px/pt): barra de **68pt** de altura e 365 de largura numa tela de
 * 390 (13 de margem de cada lado), em cápsula, com **5 botões de ~42pt** e o de
 * encerrar em `#F23F43` — que é o `red` do projeto, e não uma cor nova (§6.6:
 * a paleta não muda).
 *
 * Duas diferenças conscientes com o print:
 *
 * - **seis botões, não cinco.** O Discord põe mudo, câmera, conversa, um
 *   quarto que varia (foguete/atividades em 2024, efeitos em 2026) e encerrar.
 *   Aqui a conversa da call ainda não tem tela no celular e "atividades" não
 *   existe (§6.6), então o lugar dos dois fica com o que o nosso app faz e o
 *   celular precisa: **surdo** — o botão que cala a chamada inteira quando
 *   alguém entra na sala — e **compartilhar tela**.
 * - **44pt de alvo**, e não 42. É o piso do HIG e do Material e o mesmo número
 *   do resto do leiaute (`BotaoDeToque`); dois pontos não mudam o desenho e
 *   mudam o acerto do polegar. O círculo desenhado tem 48, dentro dos 68 da
 *   barra. Os dois saem de `palco-mobile.ts` em px — fonte única com o resto
 *   do leiaute do celular —, e não de `h-11`/`h-12` (a raiz do app é 16px,
 *   ADR-0009).
 *
 * A barra fica **acima da área segura**: o print mede 34pt entre a base dela e
 * a base da tela, que é exatamente o indicador de home do iPhone. Quem paga
 * esse `env(safe-area-inset-bottom)` é a `TelaEmpilhada` que envolve toda tela
 * do celular — aqui sobra só a folga de 8.
 *
 * ## Retrato e paisagem
 *
 * Em retrato ela está **sempre** visível: é a única superfície de controle da
 * tela, e escondê-la depois de três segundos parados (que é o que o
 * `useOcultarInativo` faz para o mouse) deixaria a pessoa sem microfone e sem
 * desligar. Em paisagem ela flutua sobre o vídeo e **some junto com a moldura**
 * — ali a tela é a transmissão, e um toque a traz de volta.
 */
export default function ControlesMobile({
  onLeave,
  leaveLabel = "Desconectar",
  oculto = false,
}: {
  onLeave: () => void;
  leaveLabel?: string;
  oculto?: boolean;
}) {
  const paisagem = useEhPaisagem();
  const camOn = useVoice((s) => s.camOn);
  const toggleCam = useVoice((s) => s.toggleCam);
  const muted = useVoicePrefs((s) => s.muted);
  const deafened = useVoicePrefs((s) => s.deafened);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  const toggleDeafen = useVoicePrefs((s) => s.toggleDeafen);
  // a faixa ainda não subiu: a sala já me ouviria, mas não há o que ouvir
  const abrindoMicrofone = useVoice(microfoneAbrindo);

  // só a paisagem esconde a barra; ver o comentário do componente
  const escondida = paisagem && oculto;

  return (
    <>
      {/*
        **O toque que acorda os controles não pode fazer mais nada.**

        Com a cápsula escondida em paisagem ela é `pointer-events-none`, então o
        toque atravessava até o palco: o `onPointerDown` da raiz acordava a
        moldura *e* o `click` seguia para o destaque, que abre a tela cheia
        (`PalcoMobile`) — ou para uma miniatura, que troca o foco. Quem só
        queria ver onde estava o botão de desligar caía num player em tela
        cheia, e precisava fechá-lo para tentar de novo.

        Esta camada só existe enquanto a cápsula está escondida. Ela deixa o
        `pointerdown` **subir** (é ele que o `useOcultarInativo` escuta na raiz
        do palco, e é assim que a moldura volta) e segura o `click`, que é o
        evento que os tiles usam. O primeiro toque mostra os controles; o
        segundo faz o que a pessoa quiser.
      */}
      {escondida && (
        <div
          aria-hidden="true"
          onClick={(e) => e.stopPropagation()}
          onClickCapture={(e) => e.stopPropagation()}
          className="absolute inset-0 z-10"
        />
      )}

      <div
        style={{
          height: BARRA_ALTURA,
          left: BARRA_MARGEM,
          right: BARRA_MARGEM,
          // 8, e não `8 + env(safe-area-inset-bottom)`: a moldura da tela
          // empilhada (`TelaEmpilhada`) já paga a área segura por todo mundo, e
          // somá-la de novo aqui levantaria a cápsula 34pt acima do indicador de
          // home num iPhone — o dobro da folga que o print mostra.
          bottom: 8,
        }}
        className={`absolute z-20 flex items-center justify-between rounded-full bg-background-surface-higher/95 px-2.5 shadow-popout backdrop-blur transition-opacity duration-200 ${
          escondida ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <BotaoDaBarra
          label={abrindoMicrofone ? "Ativando microfone…" : muted ? "Desativar mudo" : "Silenciar"}
          onClick={toggleMute}
          tom={muted || abrindoMicrofone ? "mudo" : "neutro"}
          pressionado={muted}
        >
          {muted || abrindoMicrofone ? <MicOff size={22} /> : <Mic size={22} />}
        </BotaoDaBarra>

        <BotaoDaBarra
          label={deafened ? "Reativar áudio" : "Ficar surdo"}
          onClick={toggleDeafen}
          tom={deafened ? "mudo" : "neutro"}
          pressionado={deafened}
        >
          {deafened ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
        </BotaoDaBarra>

        <BotaoDaBarra
          label={camOn ? "Desligar câmera" : "Ligar câmera"}
          onClick={() => void toggleCam()}
          tom={camOn ? "ativo" : "neutro"}
          pressionado={camOn}
        >
          {camOn ? <Video size={22} /> : <VideoOff size={22} />}
        </BotaoDaBarra>

        <BotaoDeTelaMobile />
        <BotaoDeSonsMobile />

        <BotaoDaBarra label={leaveLabel} onClick={onLeave} tom="desligar">
          <PhoneOff size={24} />
        </BotaoDaBarra>
      </div>
    </>
  );
}

/**
 * Compartilhar a tela **a partir do telefone** — por detecção de recurso, e
 * nunca em silêncio.
 *
 * `getDisplayMedia` existe → é o caminho de sempre do navegador: sem seletor
 * nosso (§7 do processo), a captura direto no gesto do toque, com o preset da
 * store. Cancelar o diálogo não é erro e não vira aviso.
 *
 * Não existe (Safari do iOS, Chrome do Android) → o botão fica **desabilitado**,
 * apagado, e o toque explica onde a coisa funciona. Ele não some: sumir faria a
 * pessoa procurar. E não se tenta contornar — capturar a própria aba não
 * compartilha a tela do telefone, compartilha o Streamz consigo mesmo.
 */
function BotaoDeTelaMobile() {
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);
  const pedindo = useRef(false);
  // Em estado, e não lido no render: o HTML servido antes da hidratação não tem
  // `navigator`, e ler ali daria divergência de hidratação. `useLayoutEffect`
  // (e não `useEffect`) porque ele roda **antes da pintura** — sem isso haveria
  // um quadro com o botão aceso num navegador que não sabe compartilhar nada.
  const [suporta, setSuporta] = useState(true);
  useEfeitoDeLeiaute(() => {
    setSuporta(suportaCapturaDeTela());
  }, []);

  async function acionar() {
    // parar antes de perguntar se o aparelho captura: no ar, o toque sempre
    // encerra, venha a transmissão de onde vier (`acaoDoBotaoDeTela`)
    if (useVoice.getState().screenOn) return void pararTela();
    if (!suporta) {
      ui.toast(SEM_CAPTURA_DE_TELA, "error");
      return;
    }
    if (pedindo.current) return;
    pedindo.current = true;
    const { screenQuality, screenAudio, publicarTela } = useVoice.getState();
    try {
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

  const label = screenOn
    ? "Parar transmissão"
    : !suporta
      ? "Compartilhar tela (indisponível neste navegador)"
      : "Compartilhar tela";

  return (
    <BotaoDaBarra
      label={label}
      onClick={() => void acionar()}
      tom={screenOn ? "aoVivo" : "neutro"}
      pressionado={screenOn}
      apagado={!suporta && !screenOn}
    >
      {screenOn ? <MonitorX size={22} /> : <MonitorUp size={22} />}
    </BotaoDaBarra>
  );
}

/** Efeitos sonoros; o painel é o mesmo do desktop e no celular vira folha. */
function BotaoDeSonsMobile() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  return (
    <div ref={caixa} className="flex">
      <BotaoDaBarra
        label="Efeitos sonoros"
        onClick={() => setAberto((v) => !v)}
        tom={aberto ? "ativo" : "neutro"}
      >
        <Soundboard size={22} />
      </BotaoDaBarra>
      <PainelDeSons ancora={caixa} aberto={aberto} onFechar={() => setAberto(false)} />
    </div>
  );
}

type Tom = "neutro" | "ativo" | "aoVivo" | "mudo" | "desligar";

/**
 * Os mesmos tons de `controles-de-chamada.tsx`, e pelo mesmo motivo: o vermelho
 * cheio é do desligar e existe **uma vez** na fileira; o mudo é ícone vermelho
 * sobre um véu do mesmo vermelho.
 */
const TOM: Record<Tom, string> = {
  neutro: "bg-control-secondary-background-default text-control-secondary-text-default active:bg-control-secondary-background-active",
  ativo: "bg-control-overlay-primary-background-default text-control-overlay-primary-text-default active:bg-control-overlay-primary-background-active",
  aoVivo: "bg-status-positive text-control-primary-text-default",
  mudo: "bg-status-danger/15 text-status-danger",
  desligar: "bg-status-danger text-control-critical-primary-text-default",
};

/** Círculo de 48 com alvo de 44 garantido; ver o cabeçalho do arquivo. */
function BotaoDaBarra({
  label,
  onClick,
  tom = "neutro",
  pressionado,
  apagado = false,
  children,
}: {
  label: string;
  onClick: () => void;
  tom?: Tom;
  pressionado?: boolean;
  /**
   * Apagado mas **clicável**: o toque tem de poder explicar por que não
   * funciona. `disabled` de verdade não dispara evento nenhum, e o resultado
   * seria a falha em silêncio que este botão existe para evitar.
   */
  apagado?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressionado}
      aria-disabled={apagado || undefined}
      // `style`, e não `h-12`: o valor vem de `palco-mobile.ts`, fonte única em
      // px para esta barra (a raiz do app é 16px, ADR-0009). Medida em px é px.
      style={{ height: BOTAO, width: BOTAO }}
      className={`grid shrink-0 place-items-center rounded-full transition ${TOM[tom]} ${
        apagado ? "opacity-40" : ""
      }`}
    >
      {children}
    </button>
  );
}
