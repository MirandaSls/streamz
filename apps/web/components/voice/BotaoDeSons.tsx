"use client";

import { useRef, useState } from "react";
import { Soundboard } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import PainelDeSons from "@/components/voice/PainelDeSons";
import { BotaoDeChamada } from "@/components/voice/controles-de-chamada";

/**
 * O botão que abre o painel de efeitos sonoros.
 *
 * Ele existe em **dois lugares**, e os dois estão nos prints do Discord:
 *
 * - na barra que flutua sobre o palco (`VoiceControls`), na cápsula do que eu
 *   acrescento à sala — ao lado de compartilhar tela;
 * - na fileira larga da barra "Voz conectada" (`VoiceConnectedBar`), que é onde
 *   o print `2026-09-08 103452` o mostra: quarto botão, depois de câmera e
 *   tela. (O terceiro do Discord é "atividades", que não existe aqui — §6.6:
 *   "Loja, Missões e Ativo agora: não criar".)
 *
 * Dois lugares, um componente: o painel é o mesmo, o estado de aberto é local a
 * cada instância, e só um deles está na tela por vez em qualquer situação real
 * (o palco e a barra de "não estou olhando a call" não convivem).
 *
 * Enquanto o painel está aberto o botão fica **aceso**, como no print — é o que
 * diz de onde aquela caixa saiu quando ela cobre metade da tela.
 */
export default function BotaoDeSons({
  variante = "barra",
}: {
  /** `largo` é o botão de largura total da barra "Voz conectada". */
  variante?: "barra" | "largo";
}) {
  const [aberto, setAberto] = useState(false);
  // o wrapper, e não o botão: `BotaoDeChamada` não repassa `ref`, e o que o
  // popover precisa é de um retângulo para se ancorar
  const caixa = useRef<HTMLDivElement>(null);

  const label = "Efeitos sonoros";
  const alternar = () => setAberto((v) => !v);

  return (
    <>
      {variante === "largo" ? (
        <Tooltip label={label} className="min-w-0 flex-1">
          <div ref={caixa} className="flex min-w-0 flex-1">
            <button
              type="button"
              onClick={alternar}
              aria-label={label}
              aria-expanded={aberto}
              className={`grid h-8 w-full place-items-center rounded-lg transition ${
                aberto
                  ? "bg-border-strong text-text-strong"
                  : "bg-border-normal/60 text-text-subtle hover:bg-border-normal hover:text-text-strong"
              }`}
            >
              <Soundboard size={20} />
            </button>
          </div>
        </Tooltip>
      ) : (
        <div ref={caixa} className="flex">
          <BotaoDeChamada
            label={label}
            onClick={alternar}
            tom={aberto ? "ativo" : "neutro"}
            expandido={aberto}
          >
            <Soundboard size={22} />
          </BotaoDeChamada>
        </div>
      )}

      <PainelDeSons ancora={caixa} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  );
}
