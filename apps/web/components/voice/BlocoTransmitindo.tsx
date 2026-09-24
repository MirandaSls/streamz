"use client";

import { MonitorUp, MonitorX } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { useVoice } from "@/stores/voice";

/**
 * Linha "Transmitir" — topo do painel flutuante, acima de "Voz conectada",
 * só quando a **minha** tela está no ar (`screenOn`). É o equivalente do
 * bloco que o Discord mostra ali enquanto o usuário compartilha: a fonte
 * transmitida à esquerda e um jeito de parar sem procurar o botão na barra
 * de controles.
 *
 * Sem subtítulo com o nome da janela/aba: a store (`stores/voice.ts`) não
 * guarda qual fonte foi escolhida no seletor, só o fato de estar no ar
 * (`screenOn`) — inventar um nome aqui seria mentir um dado que não existe.
 *
 * O quadrado à esquerda usa `bg-brand-500`/`text-control-primary-text-default`
 * (o par "controle interativo e marca" do design.md, o mesmo do botão
 * primário) — não é decoração atrás de um ícone solto (ver o comentário de
 * `WelcomeModal.tsx`), é o selo de que uma transmissão está ativa agora.
 *
 * Parar por aqui chama o mesmo `pararTela` que `ScreenShareButton` já usa: um
 * caminho só de "encerrar a captura", como o resto do produto exige (§ o
 * comentário de `AoVivoIndicador`, que por essa mesma razão não duplica um
 * botão de parar).
 */
export function BlocoTransmitindo() {
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);

  if (!screenOn) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-muted px-3.5 py-3">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-control-primary-text-default"
      >
        <MonitorUp size={18} />
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-strong">Transmitir</span>

      <BotaoDeIcone
        rotulo="Parar de transmitir"
        icone={<MonitorX size={20} />}
        tamanho="md"
        comFundo
        onClick={() => void pararTela()}
      />
    </div>
  );
}
