"use client";

import { useEffect, useState } from "react";
import { MonitorUp, MonitorX, Radio, Volume2, VolumeX } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import ScreenSharePicker from "@/components/voice/ScreenSharePicker";
import { BotaoDeChamada } from "@/components/voice/controles-de-chamada";
import { SEM_CAPTURA_DE_TELA, suportaCapturaDeTela } from "@/lib/captura-de-tela";
import { capacidadesDeTela, isTauri } from "@/lib/desktop";
import { ui } from "@/stores/ui";
import { acaoDoBotaoDeTela } from "@/stores/parar-transmissao";
import { useVoice } from "@/stores/voice";

/**
 * A captura nativa existe? Perguntado ao Rust uma vez por sessão e guardado,
 * porque o clique precisa da resposta **na hora**: `getDisplayMedia` só vale
 * dentro do gesto, e um `await` antes dele o perderia. `null` = ainda não
 * respondeu (o clique abre o seletor, que espera a resposta sozinho).
 */
let nativoConhecido: boolean | null = null;
function conhecerCapacidades() {
  if (nativoConhecido !== null || !isTauri()) return;
  void capacidadesDeTela().then((c) => {
    nativoConhecido = c.nativo;
  });
}

/**
 * Compartilhar tela — **um caminho só: o nosso seletor** (`ScreenSharePicker`).
 *
 * No desktop ele lista janelas e monitores pelo Rust; no navegador ele decide
 * qualidade, taxa de quadros e áudio do sistema e então abre o diálogo do
 * próprio browser, que é a única coisa capaz de enumerar telas ali (ver o
 * cabeçalho do seletor). Um tempo o navegador pulou o modal e foi direto ao
 * diálogo; isso tirou do usuário a escolha que é nossa e não foi pedido — o
 * modal voltou.
 *
 * `acaoDoBotaoDeTela` continua respondendo **qual motor de captura** vale
 * aqui; quem transforma isso em tela é este botão, e para "nativo" e
 * "navegador" a resposta é a mesma: abrir o seletor, que sabe se virar nos
 * dois. Só "indisponivel" (aparelho sem `getDisplayMedia` e sem Rust) não abre
 * modal — abrir uma caixa sem nenhum caminho dentro é pior que a frase.
 *
 * A qualidade (resolução, taxa de quadros e áudio do sistema) fica no rodapé do
 * seletor e também na aba Voz das configurações — a mesma store nos dois, e os
 * mesmos segmentos (`SegmentosDeQualidade`). O rodapé serve a escolha de antes
 * de ir ao ar; as configurações são o único lugar que serve a troca **durante**
 * a transmissão, quando o modal já fechou.
 *
 * No ar o botão fica **verde**, não vermelho, e **é ele que para a
 * transmissão** — como no Discord (print `p2`: o botão de tela do painel de voz
 * aceso; print `p5`: o mesmo botão na barra de controles do rodapé). Vermelho
 * cheio na barra é o desligar, e só ele: transmitindo, o botão está *ligado*,
 * não em erro — quem lê a fileira de longe precisa achar um vermelho só, o que
 * encerra a chamada.
 */
export default function ScreenShareButton({
  variante = "barra",
}: {
  /** `largo` é o botão de largura total da barra "Voz conectada". */
  variante?: "barra" | "largo";
}) {
  const [seletor, setSeletor] = useState(false);
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);
  const telaComSom = useVoice((s) => s.telaComSom);
  const audioDaTelaMudo = useVoice((s) => s.audioDaTelaMudo);
  const alternarAudioDaTela = useVoice((s) => s.alternarAudioDaTela);

  const label = screenOn ? "Parar transmissão" : "Compartilhar tela";
  // Áudio da transmissão é um mudo à parte do microfone: existe só enquanto a
  // tela está no ar **e** subiu com som (nem toda janela/aba tem áudio).
  const mostrarMudoDaTela = screenOn && telaComSom;
  const labelMudoDaTela = audioDaTelaMudo
    ? "Reativar áudio da transmissão"
    : "Silenciar áudio da transmissão";

  useEffect(conhecerCapacidades, []);

  const acionar = () => {
    // `isTauri()` no clique, não na renderização: o valor não muda em runtime e
    // ler no evento evita divergir do HTML servido antes da hidratação.
    const acao = acaoDoBotaoDeTela({
      noAr: useVoice.getState().screenOn,
      tauri: isTauri(),
      nativo: nativoConhecido,
      navegadorCaptura: suportaCapturaDeTela(),
    });
    if (acao === "parar") return void pararTela();
    // Sem nenhum motor de captura (Safari do iOS, Chrome do Android) o botão
    // já nasce apagado na barra do celular, com esta mesma frase — aqui o
    // aviso fica porque falhar calado é pior.
    if (acao === "indisponivel") return ui.toast(SEM_CAPTURA_DE_TELA, "error");
    // "nativo" e "navegador" abrem o mesmo modal: é lá dentro que a diferença
    // aparece (grade do Rust ou diálogo do browser).
    setSeletor(true);
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
        //
        // Sem o mudo, o botão principal continua ocupando o invólucro inteiro
        // (`w-full` direto, sem `flex-1`). Com o mudo, os 74px viram uma
        // divisão de espaço: `flex-1 min-w-0` no principal cede os 30px fixos
        // do mudo (mesma altura, `h-[30px]`) + 4px de `gap-1` — sem isso o
        // segundo botão estourava a largura fixa do invólucro.
        <div className={mostrarMudoDaTela ? "flex w-full gap-1" : "flex h-full w-full items-center"}>
          <Tooltip label={label} className={mostrarMudoDaTela ? "min-w-0 flex-1" : "w-full"}>
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

          {/* Silenciar só o áudio da transmissão, sem mexer no microfone —
              por isso é um botão à parte do de parar, não um estado dele.
              Mesmo par de cores do mudo do microfone em `VoiceControls`
              (`TOM.mudo`/`TOM.neutro` de `controles-de-chamada.tsx`), porque
              é o mesmo tipo de estado: silenciado ou não.
              `w-[30px]` já no invólucro do tooltip (não só no botão): o alvo
              do tooltip é `inline-flex` e sem largura própria encolheria pelo
              conteúdo — travar os 30px aqui garante a divisão exata com o
              `flex-1` do botão principal. */}
          {mostrarMudoDaTela && (
            <Tooltip label={labelMudoDaTela} className="w-[30px] shrink-0">
              <button
                type="button"
                onClick={() => void alternarAudioDaTela()}
                aria-label={labelMudoDaTela}
                aria-pressed={audioDaTelaMudo}
                className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg transition ${
                  audioDaTelaMudo
                    ? "bg-status-danger/15 text-status-danger hover:bg-status-danger/25"
                    : "bg-border-normal/60 text-text-subtle hover:bg-border-normal hover:text-text-strong"
                }`}
              >
                {audioDaTelaMudo ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </Tooltip>
          )}
        </div>
      ) : (
        <>
          <BotaoDeChamada
            label={label}
            onClick={acionar}
            tom={screenOn ? "aoVivo" : "neutro"}
            pressionado={screenOn}
          >
            {screenOn ? <MonitorX size={22} /> : <MonitorUp size={22} />}
          </BotaoDeChamada>

          {/* Mesmo botão da variante "largo" acima, com as cores do sistema de
              `tom` desta barra: `mudo` é exatamente o vermelho que o
              microfone usa quando está mudo (ver `controles-de-chamada.tsx`). */}
          {mostrarMudoDaTela && (
            <BotaoDeChamada
              label={labelMudoDaTela}
              onClick={() => void alternarAudioDaTela()}
              tom={audioDaTelaMudo ? "mudo" : "neutro"}
              pressionado={audioDaTelaMudo}
            >
              {audioDaTelaMudo ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </BotaoDeChamada>
          )}
        </>
      )}

      {seletor && <ScreenSharePicker onClose={() => setSeletor(false)} />}
    </>
  );
}

/**
 * Selo "Você está ao vivo" — o lembrete que impede alguém de continuar
 * transmitindo sem perceber.
 *
 * **É só um selo: não tem botão de parar.** Ele chegou a ganhar um "Parar
 * transmissão" ao lado, e isso não existe em lugar nenhum do Discord — nem no
 * cabeçalho do palco (print `p5`: ali o canto direito é a pílula de qualidade
 * + "AO VIVO", e mais nada) nem no painel de voz (print `p2`). Parar é do
 * **botão de tela da barra de controles**, que fica aceso enquanto a
 * transmissão está no ar e a desliga (`ScreenShareButton` acima, nas três
 * barras: a do palco, a de "Voz conectada" e a do celular). Duas portas para a
 * mesma ação, sendo que uma delas o Discord não tem, é uma porta a mais para
 * manter e uma divergência a explicar.
 *
 * Por isso também **não fica no cabeçalho do palco** (`CallStage`): lá o
 * Discord desenha a trilha `@conversa · Tela de fulano` à esquerda e a pílula
 * de qualidade à direita. O selo sobrou onde ainda não há equivalente medido —
 * o cabeçalho do canal de voz e o alto do palco no celular (`VoicePanel`).
 *
 * `w-max` + `nowrap`: os dois contêineres têm larguras bem diferentes, e sem
 * isto o selo se deixava espremer e quebrava "Você está ao vivo" uma palavra
 * por linha.
 */
export function AoVivoIndicador() {
  const screenOn = useVoice((s) => s.screenOn);
  if (!screenOn) return null;

  return (
    <div className="flex w-max items-center gap-2 rounded-full bg-status-danger/15 px-3 py-1 text-xs font-semibold text-status-danger">
      <Radio size={14} className="shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">Você está ao vivo</span>
    </div>
  );
}
