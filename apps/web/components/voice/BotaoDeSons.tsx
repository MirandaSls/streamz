"use client";

import { useRef, useState } from "react";
import { Soundboard } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";
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
        // o wrapper continua sendo o retângulo do popover; o botão vira largura
        // total via className (BotaoDeIcone por si é sempre quadrado)
        //
        // `h-[30px]`, não `h-8` (32): o invólucro de `VoiceConnectedBar` já é
        // 74×30 (medido nos prints 101842/160106), e os 32 daqui vazavam 2px
        // por baixo dele — ver o comentário lá ("faltando" do cartão anterior).
        <div ref={caixa} className="flex min-w-0 flex-1">
          <BotaoDeIcone
            rotulo={label}
            icone={<Soundboard size={20} />}
            onClick={alternar}
            aria-expanded={aberto}
            ativo={aberto}
            // cápsula igual às de câmera e tela (`bg-border-normal/60`): a
            // família `sempre` do primitivo pinta `background-base-lower`, que
            // sobre o cartão de voz sai mais escuro que o próprio cartão e lia
            // como "sem cápsula". `hover` não emite fundo de repouso, então a
            // classe não briga com a do primitivo. Medida em `style`, não
            // `w-full`: a dica embrulha o botão num `span` sem largura, e o
            // `w-full` encolhia a cápsula para 20px (bancada, 2026-09-14).
            fundo="hover"
            tamanho="md"
            className="bg-border-normal/60"
            style={{ width: 74, height: 30 }}
          />
        </div>
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
