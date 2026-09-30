import type { ReactNode } from "react";
import type { DownloadPlataforma } from "@streamz/shared";

/**
 * Instrução curta de pós-download, só para as plataformas onde o sistema
 * atravessa no caminho — Windows e Android abrem o instalador de um duplo
 * clique/toque normal e não precisam de nada aqui.
 *
 * O `.dmg` do macOS é **universal** (Intel e Apple Silicon/M1–M4): o
 * `User-Agent` não diz o chip, então não haveria como escolher build por ele
 * mesmo se quiséssemos — `detectarSistema` não muda por causa disso.
 *
 * O desvio do Gatekeeper mudou no macOS 15 (Sequoia): o "botão direito →
 * Abrir" deixou de liberar app não notarizado, e o caminho passou a ser Ajustes
 * do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim", que só aparece
 * depois de uma tentativa de abrir (e vale por cerca de uma hora). Fontes:
 * - https://developer.apple.com/news/?id=saqachfa ("Updates to runtime
 *   protection in macOS Sequoia": "users will no longer be able to
 *   Control-click to override Gatekeeper")
 * - https://support.apple.com/guide/mac-help/mh40616/15.0/mac/15.0 (15: só
 *   Privacidade e Segurança → Abrir Mesmo Assim)
 * - https://support.apple.com/guide/mac-help/mh40616/14.0/mac/14.0 (14 e
 *   anteriores: Control-clique no app → Abrir)
 */
export function notaDeInstalacao(plataforma: DownloadPlataforma): ReactNode | null {
  if (plataforma === "macos") {
    return (
      <>
        <strong className="font-semibold text-text-default">macOS:</strong> o .dmg serve para Intel e Apple
        Silicon. Arraste para Aplicativos. Na primeira abertura o macOS bloqueia (o app não é notarizado pela
        Apple): no macOS 15 ou mais novo, tente abrir e vá em Ajustes do Sistema → Privacidade e Segurança →
        Abrir Mesmo Assim; no 12 ao 14, clique com o botão direito no app → Abrir.
      </>
    );
  }
  if (plataforma === "linux") {
    return (
      <>
        <strong className="font-semibold text-text-default">Linux:</strong> é um AppImage (x86_64). Dê
        permissão de execução com{" "}
        <code className="rounded border border-border-subtle bg-background-code px-[0.2em] font-mono text-text-code">
          chmod +x Streamz_*.AppImage
        </code>{" "}
        e abra.
      </>
    );
  }
  return null;
}
