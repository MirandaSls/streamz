"use client";

import { useEffect, useState } from "react";
import IconeAnimado from "@/components/ui/IconeAnimado";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";

/**
 * A tela de abertura do app — a do Discord, no navegador e no desktop.
 *
 * Enquanto a sessão sai do `localStorage` e as duas listas do boot chegam
 * (servidores e conversas, disparadas por `useRealtime`), o shell de quatro
 * colunas já está montado e vazio: rail sem ícone, coluna sem conversa,
 * cabeçalho sem nome. Esta tela cobre esse meio-tempo com o fundo do app, a
 * marca respirando e uma linha discreta.
 *
 * Duas regras de tempo, e as duas existem para não piscar:
 *
 *  - **só aparece depois de 150ms.** Com a API perto (ou com cache), as listas
 *    voltam em algumas dezenas de milissegundos; mostrar e esconder nesse
 *    intervalo é pior do que não mostrar nada.
 *  - **some com fade de 200ms.** Cortar de estalo chama mais atenção do que a
 *    própria espera.
 *
 * E uma regra de estado: **abre uma vez por sessão**. Quem termina o boot não
 * volta para cá — o socket cai e reconecta várias vezes num dia de uso, e cada
 * reconexão recarrega as mesmas listas (`refreshList`); sem a trava, o app
 * daria um flash de tela de abertura no meio de uma conversa. Por isso `"fim"`
 * é terminal.
 *
 * Fica em `z-30`: acima de tudo que o shell desenha e **abaixo** da barra de
 * título (`z-40`). Se a carga travar, a janela continua arrastável, minimizável
 * e fechável — uma tela de boot não pode prender ninguém.
 */

/** Só aparece se a carga passar disto (ms). */
const ATRASO = 150;
/** Duração do fade de saída (ms) — igual ao `duration-200` da classe. */
const FADE = 200;

type Fase = "oculto" | "visivel" | "saindo" | "fim";

export default function TelaDeAbertura() {
  const carregando = useCargaInicial();
  const [fase, setFase] = useState<Fase>("oculto");

  useEffect(() => {
    if (fase === "fim") return;

    if (carregando) {
      // só arma o relógio uma vez: depois de visível, ficar é o certo
      if (fase !== "oculto") return;
      const t = window.setTimeout(() => setFase("visivel"), ATRASO);
      return () => window.clearTimeout(t);
    }

    // carregou antes dos 150ms: some sem nunca ter aparecido
    if (fase === "oculto") {
      setFase("fim");
      return;
    }
    if (fase === "visivel") {
      setFase("saindo");
      return;
    }
    const t = window.setTimeout(() => setFase("fim"), FADE);
    return () => window.clearTimeout(t);
  }, [carregando, fase]);

  if (fase === "oculto" || fase === "fim") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // no desktop a barra de título é região de arrasto; aqui também, senão a
      // janela ficaria imóvel enquanto a tela está no ar
      data-tauri-drag-region
      className={`fixed inset-0 z-30 flex select-none flex-col items-center justify-center gap-7 bg-chat transition-opacity duration-200 ${
        fase === "saindo" ? "pointer-events-none opacity-0" : "anim-overlay opacity-100"
      }`}
    >
      <IconeAnimado size={92} />
      <p className="text-sm text-txt-muted">Iniciando…</p>
    </div>
  );
}

/**
 * O boot ainda está acontecendo?
 *
 * São as três coisas que a tela logada precisa ter para não nascer vazia: a
 * sessão (que `loadFromStorage` lê num efeito, então o primeiro quadro sempre
 * cai aqui), a lista de servidores e a lista de conversas. Sem sessão a página
 * redireciona para o login — e até o redirecionamento acontecer, a tela de
 * abertura é o que se vê, que é melhor do que o shell vazio.
 */
function useCargaInicial(): boolean {
  const usuario = useAuth((s) => s.user);
  const servidores = useGuilds((s) => s.loading);
  const conversas = useDMs((s) => s.loadingList);
  return !usuario || servidores || conversas;
}
