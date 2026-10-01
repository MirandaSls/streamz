"use client";

import { Chave, MedidorSegmentado } from "@/components/voice/pecas-de-voz";
import { useTesteDeMicrofone } from "@/components/voice/useTesteDeMicrofone";
import { Button } from "@/components/ui/primitivos";
import { useVoice } from "@/stores/voice";

/**
 * O que o ícone de ondas do painel "Voz conectada" abre.
 *
 * **Não é um interruptor direto**, e essa é a diferença que importa: no print o
 * ícone abre uma caixa com o toggle, a explicação do que a supressão faz e um
 * teste de microfone ali dentro. Faz sentido — quem clica ali está com dúvida
 * ("estou pegando o ventilador?"), e a resposta é falar e ver a barra mexer,
 * não alternar às cegas e torcer.
 *
 * O toggle vai entre a supressão **avançada** e a **padrão**, nunca até
 * "desligada": tirar toda a redução de ruído sem dizer nada é armadilha, e
 * desligar de vez continua sendo escolha consciente, nas configurações.
 *
 * O teste é o mesmo da aba "Voz e vídeo", e por isso vem do mesmo hook: ele
 * muta e ensurdece de verdade enquanto dura — os ícones do rodapé mostram os
 * dois e os outros me veem assim — e devolve o seu próprio som (ver
 * `useTesteDeMicrofone`). Fechar o popover para o teste e devolve mudo e surdo
 * ao que eram.
 */
export default function PopoverDeRuido() {
  const { testando, nivel, erro, alternar } = useTesteDeMicrofone();
  const processamento = useVoice((s) => s.audio.processamento);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const avancada = processamento.ruido === "avancada";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Chave
          titulo
          rotulo="Supressão de ruído"
          ligado={avancada}
          onChange={(ligar) =>
            setAudioPref({
              processamento: { ...processamento, ruido: ligar ? "avancada" : "padrao" },
            })
          }
        />
        <p className="text-sm leading-5 text-text-default">
          Ative a supressão de ruído! Tente fazer barulho, como bater palmas, enquanto
          você fala. Seus amigos só ouvirão a sua linda voz.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold text-text-strong">Teste do microfone</p>
        <div className="flex items-center gap-3">
          <Button variante="secundario" tamanho="md" onClick={alternar} className="shrink-0">
            {testando ? "Parar" : "Testar"}
          </Button>
          <span className="flex min-w-0 flex-1 justify-end">
            <MedidorSegmentado nivel={nivel} />
          </span>
        </div>
        {/* O aviso de que o teste muta e ensurdece continua existindo, só não é
            mais visual: o Discord não o mostra no cartão. Fica para leitor de
            tela (aria-live avisa ao começar o teste). */}
        <p className="sr-only" aria-live="polite">
          {testando
            ? "Fale: você está se ouvindo. Enquanto o teste durar você fica mudo e surdo — a sala não te ouve e você não ouve ninguém."
            : ""}
        </p>
        {erro && <p className="text-xs text-status-danger">{erro}</p>}
      </div>

      {/* Crédito honesto: o motor é o RNNoise, o mesmo que o Jitsi usa. Sem ele
          esta caixa insinuaria tecnologia própria que não é nossa. O nome ocupa
          o lugar do logo do fornecedor no Discord. */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-strong">Fornecido por</p>
          <p className="text-xl font-semibold leading-6 text-text-strong">RNNoise</p>
        </div>
        <a
          href="https://github.com/xiph/rnnoise"
          target="_blank"
          rel="noreferrer"
          className="py-2 text-sm text-text-link hover:underline"
        >
          Saiba mais
        </a>
      </div>
    </div>
  );
}
