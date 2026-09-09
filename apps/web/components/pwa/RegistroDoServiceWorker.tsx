"use client";

import { useEffect } from "react";
import { isTauri } from "@/lib/desktop";
import { deveRegistrarServiceWorker } from "@/lib/instalacao";

/**
 * Registra `/sw.js` — o único motivo de o site ser instalável.
 *
 * Não desenha nada; existe só para o efeito. Fica montado no `app/layout.tsx`
 * porque o registro tem de acontecer em **qualquer** rota: quem chega por um
 * link de convite ou pela tela de login também precisa poder instalar, e essas
 * telas não passam pelo shell do app.
 *
 * A decisão de registrar (ou não) mora em `lib/instalacao.ts`, com teste. Aqui
 * fica só a leitura do ambiente e a chamada.
 *
 * O `catch` engole a falha de propósito: registrar um SW pode ser recusado por
 * política do navegador (contexto não seguro, armazenamento bloqueado, aba
 * anônima de alguns navegadores) e nada disso pode aparecer como erro para
 * quem só quer conversar. O preço de falhar é o site não ser instalável
 * naquele navegador — que é exatamente onde ele já não seria.
 */
export default function RegistroDoServiceWorker() {
  useEffect(() => {
    const registrar = deveRegistrarServiceWorker({
      ehTauri: isTauri(),
      producao: process.env.NODE_ENV === "production",
      temSuporte: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    });
    if (!registrar) return;
    /*
     * Escopo `/` (o padrão, por o arquivo estar na raiz): o app instalado abre
     * em `/app`, mas o login, o registro e os convites estão fora dali e
     * precisam do mesmo SW controlando — senão o Chrome só considera o site
     * instalável depois de a pessoa já ter entrado.
     */
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return null;
}
