"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@/lib/desktop";

/**
 * A atualização do app de desktop, como estado para a barra de título.
 *
 * Só existe dentro do Tauri: no navegador, atualizar é recarregar a página, e
 * o hook devolve `"nada"` sem tocar em nada. Os módulos do atualizador entram
 * por `import()` dinâmico pelo mesmo motivo do resto de `lib/desktop` — o
 * bundle do browser não paga por eles.
 *
 * A verificação acontece **uma vez**, na abertura. O download só começa por
 * clique (`iniciar`): baixar sozinho pareceria educado e não é — são dezenas
 * de MB na conexão de alguém que talvez esteja numa call. Quando a versão
 * nova já está instalada (`"pronta"`), `iniciar` reinicia o app.
 *
 * Quem fala com o usuário é a `TelaDeAtualizacao` (tela cheia, aberta pela
 * setinha verde da barra). Este hook não dá toast: erro é estado, e a tela é
 * quem mostra a mensagem e o "Tentar de novo".
 *
 * **No Windows a instalação não devolve o controle.** Com
 * `plugins.updater.windows.installMode: "quiet"` o plugin dispara o instalador
 * NSIS com `/S /R` por `ShellExecute` e chama `std::process::exit(0)` em
 * seguida: o app morre ali, e quem reabre a versão nova é o próprio instalador
 * (`/R`). Ou seja, `"reiniciando"` e o `relaunch()` só se veem fora do Windows
 * — no Windows a última tela que aparece é `"instalando"`. O caminho continua
 * escrito porque é ele que fecha o ciclo nas outras plataformas e quando o
 * `exit(0)` não acontece.
 */
export type EstadoDaAtualizacao =
  | "nada"
  | "disponivel"
  | "baixando"
  | "instalando"
  | "reiniciando"
  | "pronta"
  | "erro";

export interface Atualizacao {
  estado: EstadoDaAtualizacao;
  /** versão nova, quando há uma. */
  versao: string | null;
  notas: string | null;
  /** 0..1 durante o download. */
  progresso: number;
  /** baixa e instala; quando já está pronta, reinicia. */
  iniciar: () => Promise<void>;
}

/** O que usamos do pacote devolvido pelo `check()` do plugin. */
interface PacoteDeAtualizacao {
  version: string;
  body?: string;
  downloadAndInstall: (
    aoProgredir?: (evento: {
      event: string;
      data?: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
}

export function useAtualizacao(): Atualizacao {
  const [estado, setEstado] = useState<EstadoDaAtualizacao>("nada");
  const [progresso, setProgresso] = useState(0);
  const pacote = useRef<PacoteDeAtualizacao | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let vivo = true;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const achado = (await check()) as PacoteDeAtualizacao | null;
        if (!vivo || !achado) return;
        pacote.current = achado;
        setEstado("disponivel");
      } catch {
        // servidor fora, sem rede, endpoint não configurado: não há o que
        // avisar. Atualização é conveniência — falhar aqui não pode virar erro
        // na cara de quem só abriu o app
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Reabre o app na versão nova. Se o `relaunch` não for possível (permissão
   * ausente, plataforma sem suporte), a versão **já está instalada** — o
   * estado vira `"pronta"` e a tela passa a pedir o reinício em vez de dar
   * erro por algo que já deu certo.
   */
  const reiniciar = useCallback(async () => {
    setEstado("reiniciando");
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setEstado("pronta");
    }
  }, []);

  const iniciar = useCallback(async () => {
    const atual = pacote.current;
    if (!atual) return;
    // já em curso: o clique só reabre a tela, não recomeça o download
    if (estado === "baixando" || estado === "instalando" || estado === "reiniciando") return;
    if (estado === "pronta") {
      await reiniciar();
      return;
    }
    try {
      let total = 0;
      let baixado = 0;
      setProgresso(0);
      setEstado("baixando");
      await atual.downloadAndInstall((evento) => {
        if (evento.event === "Started") total = evento.data?.contentLength ?? 0;
        if (evento.event === "Progress") {
          baixado += evento.data?.chunkLength ?? 0;
          // o servidor pode mentir no `contentLength`; a barra não passa de 100%
          setProgresso(total > 0 ? Math.min(1, baixado / total) : 0);
        }
        // baixou tudo: daqui em diante é o instalador. No Windows este é o
        // último quadro que o usuário vê antes de o processo morrer
        if (evento.event === "Finished") {
          setProgresso(1);
          setEstado("instalando");
        }
      });
      await reiniciar();
    } catch {
      // rede caída no meio, assinatura recusada, UAC negado no Windows
      // (o `ShellExecute` volta com acesso negado): tudo cai aqui, e a tela
      // oferece "Tentar de novo"
      setEstado("erro");
    }
  }, [estado, reiniciar]);

  return {
    estado,
    versao: pacote.current?.version ?? null,
    notas: pacote.current?.body?.trim() || null,
    progresso,
    iniciar,
  };
}
