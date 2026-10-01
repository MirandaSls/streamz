"use client";

import { AlertTriangle } from "@/components/ui/icones";
import { X } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { WEB_URL } from "@/lib/config";
import { abrirNoSistema, isTauri } from "@/lib/desktop";
import { useVersaoCliente } from "@/stores/versao-cliente";
import { useAtualizacao } from "./useAtualizacao";

/**
 * Reação ao `client.outdated` do servidor (ver `stores/versao-cliente.ts`).
 *
 * "Atualizar" reaproveita o `abrir()` do `useAtualizacao` — o mesmo clique da
 * setinha verde da barra de título, que abre a janelinha de atualização. Se ele
 * falhar, o `useAtualizacao` já avisa por toast; no bloqueio, onde o usuário não
 * tem outra saída, o link de download da página raiz fica sempre à mão.
 */
export default function AvisoDeVersao() {
  const nivel = useVersaoCliente((s) => s.nivel);
  const versaoMinima = useVersaoCliente((s) => s.versaoMinima);
  const dispensar = useVersaoCliente((s) => s.dispensar);
  const atualizacao = useAtualizacao();

  if (!nivel || !isTauri()) return null;

  if (nivel === "aviso") {
    return (
      <div
        role="status"
        className="pointer-events-none fixed left-1/2 top-3 z-[60] flex max-w-[90vw] -translate-x-1/2 justify-center"
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-background-surface-higher py-1.5 pl-4 pr-2 text-sm text-text-default shadow-popout anim-menu">
          <span className="min-w-0">
            Há uma versão nova do Streamz. Atualize para evitar problemas.
          </span>
          <Button tamanho="sm" onClick={() => void atualizacao.abrir()}>
            Atualizar
          </Button>
          <button
            type="button"
            aria-label="Dispensar aviso"
            onClick={dispensar}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="versao-bloqueada-titulo"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background-base-lower p-6"
    >
      <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
        <AlertTriangle size={32} aria-hidden="true" className="text-status-warning" />
        <h2 id="versao-bloqueada-titulo" className="text-xl font-semibold text-text-strong">
          Esta versão do Streamz não é mais aceita
        </h2>
        <p className="text-text-default">
          Para continuar, atualize o aplicativo
          {versaoMinima ? ` para a versão ${versaoMinima} ou mais nova` : ""}.
        </p>
        <Button onClick={() => void atualizacao.abrir()}>Atualizar agora</Button>
        <p className="text-sm text-text-subtle">
          Não funcionou?{" "}
          <button
            type="button"
            className="text-text-link hover:underline"
            onClick={() => void abrirNoSistema(WEB_URL || "https://streamz.chat")}
          >
            Baixe a versão mais recente
          </button>
        </p>
      </div>
    </div>
  );
}
