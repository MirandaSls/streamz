"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DownloadPlataforma } from "@streamz/shared";
import { Check, Copy } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { API_URL } from "@/lib/config";
import { comandoDoTerminalMac, ORIGEM_PADRAO_DO_INSTALADOR, origemDoInstalador } from "./plataformas";

/** Âncora do bloco do Terminal — o topo da página aponta para ela no Mac. */
export const ID_DO_TERMINAL_MAC = "terminal-mac";

/**
 * Instalação do macOS pelo Terminal — a opção recomendada nessa plataforma.
 *
 * O app não é notarizado (não há conta Apple Developer). O `.dmg` baixado pelo
 * navegador ganha `com.apple.quarantine` e o Gatekeeper barra a primeira
 * abertura; o `curl` não põe quarentena, então pelo Terminal o app abre direto.
 * Não é um atalho que pula verificação: o `instalar-mac.sh` confere o selo da
 * assinatura e o identificador antes de copiar (e o certificado, com o pin).
 *
 * A montagem do comando (aspas, origem, `STREAMZ_API`) é lógica pura em
 * `plataformas.ts`, com teste.
 */
export function InstalarPeloTerminal({ className = "" }: { className?: string }) {
  const [origem, setOrigem] = useState(ORIGEM_PADRAO_DO_INSTALADOR);
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null);
  const codigoRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // no efeito, não no render: a página é pré-renderizada sem `window`, e ler
    // a origem durante o render desencontraria a hidratação
    setOrigem(origemDoInstalador(window.location.protocol, window.location.origin));
  }, []);

  // o retorno some sozinho, para um segundo clique voltar a dizer alguma coisa
  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(null), 2500);
    return () => window.clearTimeout(t);
  }, [copiado]);

  const comando = comandoDoTerminalMac(origem, API_URL);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado("sim");
    } catch {
      // `navigator.clipboard` só existe em contexto seguro (https/localhost) e
      // pode ser negado; sem ele, deixa o texto selecionado para o Cmd+C
      const el = codigoRef.current;
      const selecao = window.getSelection();
      if (el && selecao) {
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        selecao.removeAllRanges();
        selecao.addRange(faixa);
      }
      setCopiado("falhou");
    }
  }

  return (
    <div
      id={ID_DO_TERMINAL_MAC}
      role="group"
      aria-labelledby={`${ID_DO_TERMINAL_MAC}-titulo`}
      // `scroll-mt`: o link do topo não deixa o título colado na borda da janela
      className={`w-full max-w-[560px] scroll-mt-8 text-left ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={`${ID_DO_TERMINAL_MAC}-titulo`} className="text-text-md font-semibold text-text-strong">
          No Mac, instale pelo Terminal (recomendado)
        </h3>
        <Button
          variante="secundario"
          tamanho="sm"
          aria-label="Copiar o comando do Terminal"
          icone={copiado === "sim" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          onClick={copiar}
          className="shrink-0 celular:h-[44px]"
        >
          {copiado === "sim" ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <code
        ref={codigoRef}
        className="block select-all overflow-x-auto whitespace-nowrap rounded-lg border border-border-subtle bg-background-base-lower px-3 py-2.5 font-mono text-text-sm text-text-default"
      >
        {comando}
      </code>
      <p className="mt-2 text-text-sm text-text-muted">
        {copiado === "falhou"
          ? "Não deu para copiar sozinho — o comando ficou selecionado, use Cmd+C."
          : "Cole no Terminal: o app abre direto, sem o aviso do macOS. Ele pede a mesma senha de acesso."}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {copiado === "sim" ? "Comando copiado" : ""}
      </p>
    </div>
  );
}

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
