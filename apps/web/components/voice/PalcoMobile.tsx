"use client";

import { useEffect, useState } from "react";
import { displayNameOf } from "@streamz/shared";
import { Maximize, RefreshCw } from "@/components/ui/icones";
import TelaCheiaDeVideo from "@/components/voice/TelaCheiaDeVideo";
import { VoiceTile, type AcoesDoTile, type Tile } from "@/components/voice/TileDeVoz";
import {
  FAIXA_ALTURA_MOBILE,
  FAIXA_GAP_MOBILE,
  FAIXA_LARGURA_MOBILE,
  dividirPalco,
  podeAbrirEmTelaCheia,
} from "@/components/voice/palco-mobile";
import { useEhPaisagem } from "@/hooks/useOrientacao";
import { useVoice } from "@/stores/voice";
import { useVoiceDevices } from "@/stores/voiceDevices";

/**
 * O palco da chamada no celular: **um destaque grande e uma tira rolável**.
 *
 * A grade do desktop não sobrevive a 390pt de largura. `melhorArranjo` sempre
 * escolhe uma coluna nessa largura, e o resultado é uma pilha vertical de 16:9
 * que, com quatro pessoas, dá tiles de 55px de altura — menores que o avatar
 * que eles deveriam mostrar. O app do Discord no telefone resolve isso do jeito
 * que todo aplicativo de chamada resolve, e é o que está aqui: **um** tile
 * ocupa a área útil e os outros viram miniaturas numa faixa que rola de lado.
 *
 * Medidas (`docs/Reference/mobile/MEDIDAS.md` §12, `discord-mobile-call.png` a
 * 1,8779 px/pt): margem lateral dos tiles ~32px de tela cheia = **16pt de cada
 * lado** no par empilhado; raio do tile **≈16**; fundo do palco **preto**
 * (`#000000` — aqui `bg-void`, que é o preto que o projeto já tem: §6.6, a
 * paleta não muda). O tamanho da faixa **não é medido** — não há print do
 * Discord com destaque + faixa no telefone —, e está registrado como tal em
 * `palco-mobile.ts`.
 *
 * ## O que um toque faz
 *
 * - **na faixa**: troca o foco. É o gesto do Discord (um toque, não dois) e é o
 *   único jeito de trazer alguém para o destaque sem menu.
 * - **no destaque, quando há imagem**: abre em **tela cheia**, com pinça
 *   (`TelaCheiaDeVideo`). Foi o item mais pedido: ver a tela de outra pessoa no
 *   telefone só serve se der para ampliar o que está escrito nela.
 * - **no destaque sem imagem**: nada. Ampliar um avatar não leva a lugar
 *   nenhum, e um toque que às vezes responde é pior que um que nunca responde.
 *
 * A fileira de ações do canto do tile (volume, silenciar, "…") não é desenhada
 * aqui: ela é `group-hover`, e o dedo não paira. As mesmas ações continuam no
 * **toque longo**, que dispara o `contextmenu` que o tile já escuta, e o menu
 * sobe como folha inferior.
 *
 * ## Paisagem
 *
 * Girar o telefone é o gesto de "quero ver isso maior": o destaque passa a
 * ocupar a tela inteira e a faixa **flutua por cima**, encolhida, em vez de
 * roubar altura de uma tela que já só tem 390pt dela. Os controles seguem a
 * mesma regra e se escondem sozinhos (ver `ControlesMobile`).
 */
export default function PalcoMobile({
  tiles,
  acoes,
  focado,
  meId,
}: {
  tiles: Tile[];
  acoes: AcoesDoTile;
  focado: string | null;
  meId?: string;
}) {
  const paisagem = useEhPaisagem();
  const { principal, faixa } = dividirPalco(tiles, focado);
  /** chave do tile aberto em tela cheia; `null` = ninguém. */
  const [emTelaCheia, setEmTelaCheia] = useState<string | null>(null);

  // o tile aberto pode sumir (a pessoa saiu, a transmissão acabou): sem isto a
  // vista ficaria preta e sem conteúdo, com o botão de fechar como única saída
  const aberto = emTelaCheia ? (tiles.find((t) => t.key === emTelaCheia) ?? null) : null;
  useEffect(() => {
    if (emTelaCheia && !aberto) setEmTelaCheia(null);
  }, [emTelaCheia, aberto]);

  if (!principal) return null;

  const podeExpandir = podeAbrirEmTelaCheia(principal);

  const destaque = (
    <div className={paisagem ? "absolute inset-0" : "relative min-h-0 flex-1"}>
      <div
        className="h-full w-full"
        // Um toque no destaque abre a tela cheia. O `VoiceTile` já tem o clique
        // dele (trocar o foco), que no destaque só faria voltar para… o
        // destaque: `setFocado` alterna, e sem foco o palco do celular escolhe
        // o mesmo tile de novo. Então o clique de fora vem antes, na captura, e
        // o de dentro continua valendo para os botões (assistir, parar).
        onClickCapture={(e) => {
          if (!podeExpandir) return;
          const alvo = e.target as HTMLElement | null;
          // um toque no "Assistir transmissão" é do botão, não do palco
          if (alvo?.closest("button")) return;
          e.stopPropagation();
          setEmTelaCheia(principal.key);
        }}
      >
        <VoiceTile
          tile={principal}
          {...acoes}
          grande
          semAcoes
          raio={paisagem ? 0 : 16}
          ajusteDoVideo={ajusteDe(principal)}
        />
      </div>

      {/* Botão explícito de expandir: o toque no quadro já funciona, mas nada na
          tela diria isso. 44px de alvo, no **alto à esquerda** — o único canto
          livre nas duas orientações. Ele já esteve embaixo à direita, e deitado
          isso o punha exatamente sobre o **desligar**: a cápsula de controles
          se esconde sozinha em paisagem, o toque a acordava, e o clique que
          vinha depois do dedo caía no botão vermelho que tinha acabado de
          aparecer ali (visto na captura `14` da bancada — a Ana saiu da
          chamada em vez de ampliar). Em cima à direita mora o selo "Ao vivo";
          embaixo à esquerda, o nome e a tira de miniaturas. */}
      {podeExpandir && (
        <button
          type="button"
          onClick={() => setEmTelaCheia(principal.key)}
          aria-label={`Ver ${displayNameOf(principal.state.user)} em tela cheia`}
          className="absolute left-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition active:bg-black/70"
        >
          <Maximize size={20} />
        </button>
      )}

      {/* ao lado do expandir, e não em cima dele: os dois só convivem quando eu
          estou de câmera ligada e sou o destaque, mas quando convivem têm de
          caber lado a lado */}
      <BotaoDeVirarCamera deslocado={podeExpandir} />
    </div>
  );

  const tira = faixa.length > 0 && (
    <div
      // `-mx-3 px-3`: a rolagem chega às bordas da tela (o último tile não fica
      // preso atrás de um padding), mas o primeiro nasce alinhado com o resto
      className={`flex shrink-0 gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        paisagem
          ? "pointer-events-auto absolute inset-x-0 bottom-0 z-10 px-3 pb-2"
          : "-mx-3 px-3 pt-2"
      }`}
      style={{ height: paisagem ? FAIXA_ALTURA_MOBILE * 0.8 + 8 : FAIXA_ALTURA_MOBILE, gap: FAIXA_GAP_MOBILE }}
    >
      {faixa.map((t) => (
        <div
          key={t.key}
          className="shrink-0"
          style={{
            width: paisagem ? FAIXA_LARGURA_MOBILE * 0.8 : FAIXA_LARGURA_MOBILE,
            height: paisagem ? FAIXA_ALTURA_MOBILE * 0.8 : FAIXA_ALTURA_MOBILE,
          }}
        >
          <VoiceTile
            tile={t}
            {...acoes}
            compacto
            semAcoes
            rotuloPequeno
            raio={12}
            ajusteDoVideo={ajusteDe(t)}
          />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div
        data-palco-mobile
        className={
          paisagem
            ? // Deitado a cápsula de controles **flutua sobre o vídeo** e se
              // esconde sozinha: reservar 88pt embaixo numa tela de 390 de
              // altura deixava uma faixa morta de um quarto do aparelho.
              "relative h-full min-h-0 w-full bg-void"
            : // Em pé a cápsula é fixa, então o palco lhe reserva a altura
              // (68 da barra + 8 de folga + 12) mais a área segura. A reserva é
              // daqui, e não do `VoicePanel`, porque ela depende da orientação.
              "flex h-full min-h-0 w-full flex-col bg-void px-3 pb-[calc(88px+env(safe-area-inset-bottom,0px))]"
        }
      >
        {destaque}
        {tira}
      </div>

      {aberto?.publication && (
        <TelaCheiaDeVideo
          publication={aberto.publication}
          titulo={`${displayNameOf(aberto.state.user)}${aberto.tela ? " — tela compartilhada" : ""}`}
          espelhar={aberto.userId === meId && !aberto.tela}
          onFechar={() => setEmTelaCheia(null)}
        />
      )}
    </>
  );
}

/**
 * Como o vídeo preenche o tile no telefone.
 *
 * **Tela compartilhada: `contain`, sempre.** Cortar as bordas de uma tela é
 * cortar o que a pessoa abriu para ler — e é a mesma razão pela qual girar para
 * paisagem preenche sem esticar em vez de recortar.
 *
 * **Câmera: `cover`.** O tile do destaque no celular é quase quadrado; um 16:9
 * contido nele desenha duas tarjas pretas mais altas que o rosto (visto na
 * primeira captura desta bancada). O rosto está no meio do quadro, que é
 * exatamente o que `cover` preserva.
 */
function ajusteDe(t: Tile): string {
  return t.tela ? "object-contain" : "object-cover";
}

/**
 * Alternar frontal/traseira.
 *
 * Flutuante sobre o palco, e não na barra de controles: a barra já tem seis
 * botões, e virar a câmera só existe enquanto a câmera está ligada — um sétimo
 * que aparece e some faria os outros dançarem de lugar no meio da chamada.
 *
 * **Só aparece quando há mais de uma câmera.** `enumerateDevices` é quem
 * responde isso, e ele só entrega a lista depois da permissão — que já foi
 * concedida, porque o botão exige `camOn`. Num tablet com uma câmera só, ou num
 * notebook, o botão simplesmente não existe.
 *
 * Ícone: `RefreshCw`, o único "girar" do vocabulário. **Falta um ativo de
 * "virar a câmera"** no acervo do Discord (§6.2 manda relatar, não criar) —
 * está no PR.
 */
function BotaoDeVirarCamera({ deslocado = false }: { deslocado?: boolean }) {
  const camOn = useVoice((s) => s.camOn);
  const virarCamera = useVoice((s) => s.virarCamera);
  const facingMode = useVoice((s) => s.facingMode);
  const { cameras } = useVoiceDevices();

  if (!camOn || cameras.length < 2) return null;

  const label = facingMode === "user" ? "Usar a câmera traseira" : "Usar a câmera frontal";
  return (
    <button
      type="button"
      onClick={() => void virarCamera()}
      aria-label={label}
      className={`absolute top-2 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition active:bg-black/70 ${
        deslocado ? "left-[60px]" : "left-2"
      }`}
    >
      <RefreshCw size={20} />
    </button>
  );
}
