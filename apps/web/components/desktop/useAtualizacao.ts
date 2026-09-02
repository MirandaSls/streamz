"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@/lib/desktop";
import { ui } from "@/stores/ui";

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
 * A única coisa que fala com o usuário daqui é o erro, por toast; o resto é a
 * setinha verde na barra, que é quem consome este hook.
 */
export type EstadoDaAtualizacao = "nada" | "disponivel" | "baixando" | "pronta" | "erro";

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

  const iniciar = useCallback(async () => {
    const atual = pacote.current;
    if (!atual) return;
    try {
      if (estado === "pronta") {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
        return;
      }
      if (estado === "baixando") return;
      let total = 0;
      let baixado = 0;
      setProgresso(0);
      setEstado("baixando");
      await atual.downloadAndInstall((evento) => {
        if (evento.event === "Started") total = evento.data?.contentLength ?? 0;
        if (evento.event === "Progress") {
          baixado += evento.data?.chunkLength ?? 0;
          setProgresso(total > 0 ? baixado / total : 0);
        }
        if (evento.event === "Finished") setProgresso(1);
      });
      // instalado: o app precisa reabrir para valer. No Windows o instalador
      // encerra o app sozinho; nas outras plataformas fica a setinha pedindo o
      // reinício — sem o `relaunch` o usuário fica na versão velha até fechar
      // por conta
      setEstado("pronta");
    } catch {
      ui.toast("Não foi possível atualizar agora. Tente mais tarde.", "error");
      setEstado("erro");
    }
  }, [estado]);

  return {
    estado,
    versao: pacote.current?.version ?? null,
    notas: pacote.current?.body?.trim() || null,
    progresso,
    iniciar,
  };
}
