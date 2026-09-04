"use client";

import { BarraDeNivel, Chave } from "@/components/voice/pecas-de-voz";
import { useTesteDeMicrofone } from "@/components/voice/useTesteDeMicrofone";
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
 * ensurdece durante o teste e devolve o seu próprio som (ver
 * `useTesteDeMicrofone`). Fechar o popover para o teste.
 */
export default function PopoverDeRuido() {
  const { testando, nivel, erro, alternar } = useTesteDeMicrofone();
  const processamento = useVoice((s) => s.audio.processamento);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const avancada = processamento.ruido === "avancada";

  return (
    <div className="space-y-3">
      <Chave
        rotulo="Supressão de ruído"
        ligado={avancada}
        onChange={(ligar) =>
          setAudioPref({
            processamento: { ...processamento, ruido: ligar ? "avancada" : "padrao" },
          })
        }
      />

      <p className="text-xs leading-relaxed text-txt-muted">
        Tira o barulho de fundo do seu microfone — ventilador, teclado, a rua —
        e deixa passar só a voz. Desligada, vale a redução comum do navegador.
      </p>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-txt-primary">Teste do microfone</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alternar}
            className="h-8 shrink-0 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-primary transition hover:bg-border-strong-hover"
          >
            {testando ? "Parar" : "Testar"}
          </button>
          <span className="min-w-0 flex-1">
            <BarraDeNivel nivel={nivel} />
          </span>
        </div>
        <p className="text-xs text-txt-muted">
          {testando
            ? "Fale: você está se ouvindo. Enquanto o teste durar, a sala não te ouve e você não ouve ninguém."
            : "Fale, ou bata palmas: com a supressão ligada, o outro lado ouve só você."}
        </p>
        {erro && <p className="text-xs text-red">{erro}</p>}
      </div>

      {/* Crédito honesto: o motor é o RNNoise, o mesmo que o Jitsi usa. Sem ele
          esta caixa insinuaria tecnologia própria que não é nossa. */}
      <p className="border-t border-border pt-2 text-xs text-txt-faint">
        Supressão avançada por RNNoise
      </p>
    </div>
  );
}
