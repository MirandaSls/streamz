"use client";

import { useEffect, useState } from "react";
import { BotaoDeToque } from "@/components/mobile/pecas";
import Marca from "@/components/ui/Marca";
import { Upload, X } from "@/components/ui/icones";
import { isTauri } from "@/lib/desktop";
import {
  avisoDeInstalacao,
  dispensaGuardada,
  ehIOS,
  ehSafari,
  guardarDispensa,
  jaInstalado,
} from "@/lib/instalacao";
import { ehMobileAgora } from "@/hooks/useEhMobile";

/**
 * "Adicionar à tela de início" — a faixa discreta que oferece instalar o app.
 *
 * São **dois** avisos com a mesma cara e caminhos opostos, porque os dois
 * sistemas resolvem instalação de maneiras diferentes:
 *
 *  - **Chrome (Android)**: o navegador avisa que dá para instalar pelo evento
 *    `beforeinstallprompt`. O evento é guardado e o botão o dispara — o
 *    diálogo é do sistema, e depois dele (aceito ou recusado) o evento morre e
 *    não volta nesta sessão. Por isso a faixa some nos dois desfechos: com
 *    "instalar" ela já não faz sentido, e com "agora não" insistir seria pior.
 *  - **Safari (iOS)**: não existe `beforeinstallprompt` e **não vai existir**.
 *    Instalar no iPhone é um item do menu de compartilhar, e a única coisa que
 *    dá para fazer em código é ensinar o caminho — daí a faixa de instrução,
 *    sem botão de ação.
 *
 * Toda a decisão de **qual** faixa (ou nenhuma) está em `lib/instalacao.ts`,
 * que é puro e tem teste: dentro do Tauri, já instalado, dispensado, no
 * computador, iOS fora do Safari — cada um desses é um caso onde a faixa não
 * pode aparecer, e nenhum deles se reproduz olhando a tela.
 *
 * ## Onde ela fica
 *
 * `position: fixed`, acima do rodapé, e montada uma vez no `app/layout.tsx` —
 * o que a faz valer também no login e num convite, que é onde a maioria das
 * pessoas chega antes de ter conta. O afastamento de baixo é
 * `56px + env(safe-area-inset-bottom)`: 48 é a altura útil da barra de abas do
 * celular (`components/mobile/BarraDeAbas.tsx`) e 8 é a folga, então dentro do
 * app a faixa encosta logo acima das abas sem cobrir nenhuma delas; nas telas
 * públicas, que não têm barra, ela flutua a essa mesma distância da borda. A
 * área segura entra por fora da conta porque a própria barra de abas já a usa
 * como `padding-bottom`.
 *
 * **Limitação conhecida**: com uma chamada em curso a `BarraDeVozMobile` ocupa
 * essa mesma faixa e o aviso passa por cima dela. É aceito — a faixa aparece
 * uma vez, some no primeiro toque em qualquer um dos dois botões, e entrar
 * numa chamada antes de instalar o app é a exceção, não o caminho.
 */

/**
 * O evento do Chrome. Não está no `lib.dom` do TypeScript porque não é padrão
 * — é uma extensão do Chromium, e é por isso que ele é declarado aqui em vez
 * de vir de `@types/`.
 */
type PedidoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function AvisoDeInstalacao() {
  /**
   * Tudo começa "não mostrar", e só um efeito muda isso. Não é preferência de
   * estilo: o HTML do export estático é o mesmo para o navegador e para o app
   * de desktop, e qualquer coisa que este componente desenhasse na primeira
   * renderização apareceria no `out/` — ou seja, dentro do Tauri, no quadro
   * antes de o JS decidir escondê-la. Nascendo vazio, o desktop nunca vê nada.
   */
  const [qual, setQual] = useState<"chrome" | "ios" | null>(null);
  const [pedido, setPedido] = useState<PedidoDeInstalacao | null>(null);

  useEffect(() => {
    if (isTauri()) return;

    /** Relê o ambiente inteiro e decide. Chamada a cada evento que muda algo. */
    const decidir = (comPedido: PedidoDeInstalacao | null) => {
      const ua = navigator.userAgent;
      setQual(
        avisoDeInstalacao({
          ehTauri: false,
          ehMobile: ehMobileAgora(),
          jaInstalado: jaInstalado(),
          ehIOS: ehIOS(ua, navigator.platform ?? "", navigator.maxTouchPoints ?? 0),
          ehSafari: ehSafari(ua),
          temPedidoDoChrome: comPedido !== null,
          dispensado: dispensaGuardada(),
        }),
      );
    };

    decidir(null);

    /*
     * `preventDefault` é obrigatório: sem ele o Chrome mostra a barra de
     * instalação **dele** no rodapé e o evento não fica utilizável depois. Com
     * ele, o navegador cala a barra nativa e a oferta passa a ser esta faixa,
     * no nosso leiaute e em português.
     */
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      const pedidoDoChrome = e as PedidoDeInstalacao;
      setPedido(pedidoDoChrome);
      decidir(pedidoDoChrome);
    };

    /*
     * Instalou (por aqui, pelo menu do navegador, de outra aba): a faixa sai
     * de cena na hora. O `appinstalled` é o único aviso que chega quando a
     * instalação não passou pelo nosso botão.
     */
    const aoInstalar = () => {
      setPedido(null);
      setQual(null);
    };

    window.addEventListener("beforeinstallprompt", aoOferecer);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoOferecer);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (!qual) return null;

  const dispensar = () => {
    guardarDispensa();
    setQual(null);
  };

  const instalar = async () => {
    if (!pedido) return;
    // some antes da resposta: o diálogo é do sistema e cobre a tela, e voltar
    // dele para a faixa ainda ali é o que faz parecer que nada aconteceu
    setQual(null);
    try {
      await pedido.prompt();
      const { outcome } = await pedido.userChoice;
      // recusou: não insistir. O evento não volta nesta sessão de qualquer
      // jeito, mas guardar a dispensa é o que faz a decisão valer amanhã.
      if (outcome === "dismissed") guardarDispensa();
    } catch {
      // o Chrome recusa um `prompt()` repetido ou fora de gesto do usuário;
      // não há o que fazer nem o que mostrar
    } finally {
      setPedido(null);
    }
  };

  return (
    <div
      className="fixed inset-x-0 z-40 px-3"
      /* ver o cabeçalho: 48 da barra de abas + 8 de folga, mais a área segura */
      style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Instalar o Streamz"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3 py-2 shadow-lg">
        <Marca size={26} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-txt-primary">
            Instalar o Streamz
          </p>
          {qual === "chrome" ? (
            <p className="text-xs leading-tight text-txt-muted">
              Fica na tela de início, sem barra de navegador.
            </p>
          ) : (
            /* iOS: o caminho é o menu de compartilhar do Safari. O glifo é o
               `Upload` do vocabulário (seta para cima saindo de uma base) —
               **não** é o quadrado-com-seta da Apple, que não existe no acervo
               de ícones do app; está relatado no PR. O ícone entra na frase
               para a pessoa reconhecer o botão sem ter de traduzir o nome. */
            <p className="flex flex-wrap items-center gap-1 text-xs leading-tight text-txt-muted">
              <span>Toque em</span>
              <Upload size={14} aria-hidden="true" className="shrink-0 text-txt-secondary" />
              <span>e em &ldquo;Adicionar à Tela de Início&rdquo;.</span>
            </p>
          )}
        </div>
        {qual === "chrome" && (
          <button
            type="button"
            onClick={() => void instalar()}
            className="h-[36px] shrink-0 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink transition active:bg-accent-press"
          >
            Instalar
          </button>
        )}
        <BotaoDeToque label="Dispensar" onClick={dispensar} className="-mr-1">
          <X size={18} />
        </BotaoDeToque>
      </div>
    </div>
  );
}
