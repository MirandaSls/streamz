"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { isTauri } from "@/lib/desktop";
import PaginaDeDownload from "@/components/download/PaginaDeDownload";

/**
 * Raiz do site. No navegador ela virou a vitrine do app (`PaginaDeDownload`) —
 * quem só quer o chat usa o atalho "Abrir no navegador" de lá.
 *
 * ARMADILHA: o app desktop e o Android/iOS embutem esta mesma web como export
 * estático, e a janela principal abre em `/` (`index.html`). Se a raiz virasse
 * download sem checar onde está rodando, o app **instalado** abriria na tela
 * de download em vez do chat. Por isso, dentro do Tauri o comportamento
 * continua o de sempre — carregar a sessão e seguir para `/app` ou `/login`.
 *
 * A escolha só acontece depois de montar: o HTML é pré-renderizado sem
 * `window`, então `isTauri()` não tem resposta no servidor, e decidir no
 * primeiro render arriscaria piscar a página de download dentro do app antes
 * do redirecionamento (daí o estado inicial "carregando").
 */
export default function Home() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuth();
  const [ambiente, setAmbiente] = useState<"carregando" | "tauri" | "web">("carregando");

  useEffect(() => {
    setAmbiente(isTauri() ? "tauri" : "web");
  }, []);

  useEffect(() => {
    if (ambiente !== "tauri") return;
    loadFromStorage();
  }, [ambiente, loadFromStorage]);

  useEffect(() => {
    if (ambiente !== "tauri") return;
    router.replace(user ? "/app" : "/login");
  }, [ambiente, user, router]);

  if (ambiente === "web") return <PaginaDeDownload />;

  return (
    <main className="flex h-screen items-center justify-center text-text-muted">
      Carregando…
    </main>
  );
}
