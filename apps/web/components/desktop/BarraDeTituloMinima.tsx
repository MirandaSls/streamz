"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Marca from "@/components/ui/Marca";
import { bloquearMenuNativo, ehMacNoTauri, isTauri } from "@/lib/desktop";
import { ehMobileAgora } from "@/hooks/useEhMobile";
import {
  ALTURA,
  ControlesDaJanela,
  useMaximizada,
  useReservaDosSemaforos,
  useZoomDoApp,
} from "./BarraDeTitulo";

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
 *
 * **`isTauri()` sozinho deixou de bastar.** O mesmo export estático agora é
 * embutido também no app de Android, e lá esta barra seria uma faixa de
 * arrasto com um "minimizar/maximizar/fechar" que não existem — controles de
 * janela num aparelho que não tem janelas. Por isso o gate é "Tauri **de
 * desktop**": `ehMobileAgora()` é a mesma regra do `useEhMobile`, que dentro
 * do Tauri responde pela plataforma.
 *
 * No macOS vale o mesmo acerto da barra completa (ver `BarraDeTitulo`): os
 * semáforos são nativos, então aqui some o trio de controles e a marca começa
 * depois do espaço reservado para eles — com altura e reserva divididas pelo
 * zoom do app, para medirem pontos de verdade como os semáforos.
 */
export default function BarraDeTituloMinima() {
  const rota = usePathname();
  const [desktop, setDesktop] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setDesktop(isTauri() && !ehMobileAgora());
    setMac(ehMacNoTauri());
  }, []);
  const cabe = desktop && !!rota && !rota.startsWith("/app") && !rota.startsWith("/splash");
  const zoom = useZoomDoApp(cabe && mac);
  const altura = ALTURA / zoom;

  useEffect(() => {
    if (!cabe) return;
    const raiz = document.documentElement;
    raiz.style.setProperty("--barra-de-titulo", `${altura}px`);
    const soltar = bloquearMenuNativo();
    return () => {
      raiz.style.removeProperty("--barra-de-titulo");
      soltar();
    };
  }, [cabe, altura]);

  if (!cabe) return null;
  return <Barra mac={mac} zoom={zoom} />;
}

function Barra({ mac, zoom }: { mac: boolean; zoom: number }) {
  const maximizada = useMaximizada();
  const reserva = useReservaDosSemaforos(mac);
  return (
    <header
      data-tauri-drag-region
      aria-label="Barra de título"
      style={{ height: ALTURA / zoom }}
      className="fixed inset-x-0 top-0 z-40 flex select-none items-center bg-panel text-txt-secondary"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 pl-4 text-xs font-semibold"
        style={reserva ? { paddingLeft: reserva / zoom } : undefined}
      >
        <Marca size={15} />
        <span data-tauri-drag-region>Streamz</span>
      </div>
      {!mac && (
        <div data-tauri-drag-region className="ml-auto flex h-full items-center">
          <ControlesDaJanela maximizada={maximizada} />
        </div>
      )}
    </header>
  );
}
