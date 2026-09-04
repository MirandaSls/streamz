"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Marca from "@/components/ui/Marca";
import { bloquearMenuNativo, isTauri } from "@/lib/desktop";
import { ALTURA, ControlesDaJanela, useMaximizada } from "./BarraDeTitulo";

/**
 * Barra de título das telas SEM usuário (login, cadastro, senha, e-mail,
 * convite) no desktop.
 *
 * A janela nasce sem moldura (`decorations: false`) e a barra completa só
 * existe dentro do app logado (`app/app/page.tsx`); sem esta, quem abria o
 * app deslogado não tinha como mover, minimizar nem fechar a janela — só pela
 * bandeja (relato do usuário, 2026-09-04). Aqui é o mínimo: a área de arrasto,
 * a marca e os três controles; nada de histórico, caixa de entrada ou
 * atualização, que dependem da sessão.
 *
 * Montada no `layout` raiz e desligada nas rotas que têm a barra própria
 * (`/app`) ou não têm janela (`/splash`).
 */
export default function BarraDeTituloMinima() {
  const rota = usePathname();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(isTauri());
  }, []);
  const cabe = desktop && !!rota && !rota.startsWith("/app") && !rota.startsWith("/splash");

  useEffect(() => {
    if (!cabe) return;
    const raiz = document.documentElement;
    raiz.style.setProperty("--barra-de-titulo", `${ALTURA}px`);
    const soltar = bloquearMenuNativo();
    return () => {
      raiz.style.removeProperty("--barra-de-titulo");
      soltar();
    };
  }, [cabe]);

  if (!cabe) return null;
  return <Barra />;
}

function Barra() {
  const maximizada = useMaximizada();
  return (
    <header
      data-tauri-drag-region
      aria-label="Barra de título"
      style={{ height: ALTURA }}
      className="fixed inset-x-0 top-0 z-40 flex select-none items-center bg-panel text-txt-secondary"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pl-4 text-xs font-semibold">
        <Marca size={15} />
        <span data-tauri-drag-region>Streamz</span>
      </div>
      <div data-tauri-drag-region className="ml-auto flex h-full items-center">
        <ControlesDaJanela maximizada={maximizada} />
      </div>
    </header>
  );
}
