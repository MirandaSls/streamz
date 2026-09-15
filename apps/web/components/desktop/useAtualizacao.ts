"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ehMacNoTauri, isTauri } from "@/lib/desktop";
import { ui } from "@/stores/ui";
import {
  EVENTO_DE_ERRO_DA_SPLASH,
  JANELA_SPLASH,
  LIMITE_DA_CHECAGEM,
} from "./janela-splash";

/**
 * A atualização do app de desktop, como estado para a barra de título.
 *
 * Só existe dentro do Tauri: no navegador, atualizar é recarregar a página, e
 * o hook devolve `"nada"` sem tocar em nada. Os módulos do atualizador entram
 * por `import()` dinâmico pelo mesmo motivo do resto de `lib/desktop` — o
 * bundle do browser não paga por eles.
 *
 * **Quem baixa e instala é a janelinha** (`JanelaSplash`), não este hook. Na
 * abertura ela roda antes de o app aparecer; com o app já aberto, a setinha
 * verde chama {@link Atualizacao.abrir}, que **esconde a janela principal** e
 * abre a mesma janelinha em `?modo=atualizar`. Aqui ficam só as duas coisas que
 * a barra precisa: se existe versão nova (para a setinha aparecer) e o clique.
 *
 * A checagem se repete a cada {@link INTERVALO_DE_CHECAGEM} e também quando a
 * janela ganha foco (com folga de {@link FOLGA_ENTRE_CHECAGENS}): sem isso a
 * setinha seria decoração — a janelinha já checou na abertura, e quem fica com
 * o app aberto o dia inteiro nunca veria a versão publicada depois do almoço.
 * Eram 30 min; o usuário publicou e ficou esperando a setinha (2026-09-04).
 */
export type EstadoDaAtualizacao = "nada" | "disponivel";

export interface Atualizacao {
  estado: EstadoDaAtualizacao;
  /** versão nova, quando há uma. */
  versao: string | null;
  notas: string | null;
  /** esconde a principal e abre a janelinha de atualização. */
  abrir: () => Promise<void>;
}

/** De quanto em quanto tempo perguntar de novo se há versão nova (ms). */
const INTERVALO_DE_CHECAGEM = 5 * 60 * 1000;
/** Ao ganhar foco, não perguntar de novo antes disto (ms). */
const FOLGA_ENTRE_CHECAGENS = 60 * 1000;

/**
 * A janelinha de atualização é a mesma da abertura, com as medidas do
 * `tauri.conf.json` repetidas aqui porque esta é criada em tempo de execução.
 * Se as duas divergirem, a janela da setinha sai de outro tamanho — mudou lá,
 * mude aqui.
 */
const JANELA = {
  url: "splash/?modo=atualizar",
  title: "Streamz",
  width: 300,
  height: 350,
  center: true,
  resizable: false,
  maximizable: false,
  minimizable: false,
  decorations: false,
  transparent: true,
  shadow: false,
  // nasce escondida e se mostra no primeiro quadro (ver `JanelaSplash`)
  visible: false,
  focus: true,
} as const;

/**
 * A mesma janela como o `tauri.macos.conf.json` a descreve: sem
 * `macOSPrivateApi` o Mac não faz janela transparente, e o fundo passa a ser o
 * `bg-chat` do cartão (motivo no topo do `JanelaSplash.tsx`). O
 * `backgroundColor` pinta a `NSWindow` e a sobrerrolagem, não o primeiro quadro
 * do webview — esse fica escondido porque a janela nasce `visible: false`.
 */
const JANELA_NO_MAC = { ...JANELA, transparent: false, backgroundColor: "#1a1a1e" } as const;

/** Quanto esperar pela criação da janela antes de desistir (ms). */
const LIMITE_DA_CRIACAO = 5000;

export function useAtualizacao(): Atualizacao {
  const [estado, setEstado] = useState<EstadoDaAtualizacao>("nada");
  const [versao, setVersao] = useState<string | null>(null);
  const [notas, setNotas] = useState<string | null>(null);
  const achou = useRef(false);

  // ── existe versão nova? (abertura + de tempos em tempos) ──────────────────
  useEffect(() => {
    if (!isTauri()) return;
    let vivo = true;

    const verificar = async () => {
      if (!vivo || achou.current) return;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const pacote = await check({ timeout: LIMITE_DA_CHECAGEM });
        if (!vivo || !pacote) return;
        achou.current = true;
        setVersao(pacote.version);
        setNotas(pacote.body?.trim() || null);
        setEstado("disponivel");
      } catch {
        // servidor fora, sem rede, endpoint não configurado: não há o que
        // avisar. Atualização é conveniência — falhar aqui não pode virar erro
        // na cara de quem só está usando o app
      }
    };

    let ultima = 0;
    const verificarComFolga = () => {
      const agora = Date.now();
      if (agora - ultima < FOLGA_ENTRE_CHECAGENS) return;
      ultima = agora;
      void verificar();
    };
    verificarComFolga();
    const relogio = window.setInterval(verificarComFolga, INTERVALO_DE_CHECAGEM);
    // voltar para o app depois de um tempo fora é a hora natural de perguntar
    const aoFocar = () => verificarComFolga();
    const aoVisivel = () => {
      if (document.visibilityState === "visible") verificarComFolga();
    };
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoVisivel);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoVisivel);
    };
  }, []);

  // ── a janelinha falhou: o aviso é aqui, que é onde há tela ────────────────
  useEffect(() => {
    if (!isTauri()) return;
    let cancelado = false;
    let parar: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const desligar = await listen<string>(EVENTO_DE_ERRO_DA_SPLASH, ({ payload }) => {
          ui.toast(payload || "Não foi possível atualizar.", "error");
        });
        if (cancelado) desligar();
        else parar = desligar;
      } catch {
        // sem o evento o erro fica só na janelinha, que fecha sozinha
      }
    })();
    return () => {
      cancelado = true;
      parar?.();
    };
  }, []);

  /**
   * Esconde o app e põe a janelinha no lugar dele. A principal só some **depois
   * de a janela existir** (`tauri://created`): se a criação falhar, ficaria uma
   * bandeja e nada na tela.
   */
  const abrir = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

      // normalmente não existe: a da abertura fecha antes de a barra aparecer.
      // Se existir (uma atualização já em curso), o certo é trazê-la para a
      // frente, não criar outra — o rótulo é único
      const existente = await WebviewWindow.getByLabel(JANELA_SPLASH);
      if (existente) {
        await existente.show();
        await existente.setFocus();
      } else {
        const janela = new WebviewWindow(JANELA_SPLASH, ehMacNoTauri() ? JANELA_NO_MAC : JANELA);
        await esperarACriacao(janela);
      }
      await getCurrentWindow().hide();
    } catch {
      ui.toast("Não foi possível abrir a atualização.", "error");
    }
  }, []);

  return { estado, versao, notas, abrir };
}

/** Resolve no `tauri://created` da janela, rejeita no erro e no tempo limite. */
async function esperarACriacao(janela: WebviewWindow): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const relogio = window.setTimeout(
      () => reject(new Error("a janela de atualização não abriu")),
      LIMITE_DA_CRIACAO,
    );
    const pronto = () => {
      window.clearTimeout(relogio);
      resolve();
    };
    void janela.once("tauri://created", pronto);
    void janela.once("tauri://error", () => {
      window.clearTimeout(relogio);
      reject(new Error("a janela de atualização não abriu"));
    });
  });
}
