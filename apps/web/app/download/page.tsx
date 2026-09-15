"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * `/download` virou a raiz (`app/page.tsx`) — este arquivo só existe para não
 * quebrar quem já tem `streamz.chat/download` gravado (apps Android
 * instalados, docs, favoritos antigos). Redireciona no cliente porque o
 * export estático que o Tauri embute não roda `redirects()` do
 * `next.config.ts` (não há servidor Next ali para aplicá-lo).
 */
export default function DownloadRedirecionamento() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="flex h-screen items-center justify-center text-txt-muted">
      Carregando…
    </main>
  );
}
