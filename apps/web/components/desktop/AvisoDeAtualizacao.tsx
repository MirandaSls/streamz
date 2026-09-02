"use client";

import { useEffect, useState } from "react";
import { Download, X } from "@/components/ui/icones";
import { isTauri } from "@/lib/desktop";
import { ui } from "@/stores/ui";

/**
 * O aviso de "tem versão nova" do app de desktop.
 *
 * Só existe dentro do Tauri: no navegador, atualizar é recarregar a página, e
 * um cartão pedindo isso seria ruído. Os módulos do atualizador entram por
 * `import()` dinâmico pelo mesmo motivo do resto de `lib/desktop` — o bundle do
 * browser não paga por eles.
 *
 * **Fechar não é "não quero".** O cartão volta na próxima abertura do app, de
 * propósito: a escolha não é persistida em lugar nenhum. Um "não perturbe"
 * gravado transformaria um adiamento de cinco segundos numa versão parada para
 * sempre, e quem adia geralmente só está no meio de uma conversa. O que o
 * fechar promete é **esta sessão** em paz — e isso ele cumpre.
 *
 * O download só começa por clique. Baixar sozinho pareceria educado e não é:
 * são dezenas de MB na conexão de alguém que talvez esteja numa call.
 */
type Estado =
  | { fase: "verificando" }
  | { fase: "nada" }
  | { fase: "disponivel"; versao: string; notas: string }
  | { fase: "baixando"; progresso: number }
  | { fase: "instalando" };

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

export default function AvisoDeAtualizacao() {
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });
  const [fechado, setFechado] = useState(false);
  const [pacote, setPacote] = useState<PacoteDeAtualizacao | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setEstado({ fase: "nada" });
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const achado = (await check()) as PacoteDeAtualizacao | null;
        if (!vivo) return;
        if (!achado) {
          setEstado({ fase: "nada" });
          return;
        }
        setPacote(achado);
        setEstado({
          fase: "disponivel",
          versao: achado.version,
          notas: achado.body?.trim() || "Correções e melhorias.",
        });
      } catch {
        // servidor fora, sem rede, endpoint não configurado: não há o que
        // avisar. Atualização é conveniência — falhar aqui não pode virar erro
        // na cara de quem só abriu o app
        if (vivo) setEstado({ fase: "nada" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function atualizar() {
    if (!pacote) return;
    let total = 0;
    let baixado = 0;
    setEstado({ fase: "baixando", progresso: 0 });
    try {
      await pacote.downloadAndInstall((evento) => {
        if (evento.event === "Started") total = evento.data?.contentLength ?? 0;
        if (evento.event === "Progress") {
          baixado += evento.data?.chunkLength ?? 0;
          setEstado({ fase: "baixando", progresso: total > 0 ? baixado / total : 0 });
        }
        if (evento.event === "Finished") setEstado({ fase: "instalando" });
      });
      // instalado: o app precisa reabrir para valer. Sem o `relaunch` o usuário
      // fica na versão velha até fechar por conta
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      ui.toast("Não foi possível atualizar agora. Tente mais tarde.", "error");
      setEstado({ fase: "nada" });
    }
  }

  if (fechado || estado.fase === "verificando" || estado.fase === "nada") return null;

  const ocupado = estado.fase === "baixando" || estado.fase === "instalando";

  return (
    <div
      role="status"
      aria-live="polite"
      className="anim-modal fixed bottom-4 right-4 z-[70] w-[340px] rounded-lg bg-overlay p-4 shadow-high"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"
        >
          <Download size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt-primary">
            {estado.fase === "disponivel"
              ? `Versão ${estado.versao} disponível`
              : estado.fase === "baixando"
                ? "Baixando a atualização…"
                : "Instalando…"}
          </p>
          {estado.fase === "disponivel" && (
            <p className="mt-0.5 line-clamp-3 text-xs text-txt-muted">{estado.notas}</p>
          )}
          {estado.fase === "baixando" && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rail">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${Math.round(estado.progresso * 100)}%` }}
              />
            </div>
          )}
          {estado.fase === "instalando" && (
            <p className="mt-0.5 text-xs text-txt-muted">O app vai reabrir sozinho.</p>
          )}
        </div>

        {!ocupado && (
          <button
            type="button"
            onClick={() => setFechado(true)}
            aria-label="Agora não"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] text-txt-muted transition hover:bg-hov hover:text-txt-primary"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {estado.fase === "disponivel" && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setFechado(true)}
            className="h-8 rounded-[3px] px-3 text-sm font-medium text-txt-normal transition hover:underline"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => void atualizar()}
            className="h-8 rounded-[3px] bg-accent px-3 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover"
          >
            Atualizar e reiniciar
          </button>
        </div>
      )}
    </div>
  );
}
