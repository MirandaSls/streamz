"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { goToMessage } from "@/stores/messages-navigate";

/**
 * Destino do "copiar link da mensagem" (`/app/channels/:guildId/:channelId/:messageId`,
 * com `@me` no lugar do servidor nas conversas diretas).
 *
 * A rota não desenha nada: manda para `/app` — que é o app inteiro — e pede o
 * pulo até a mensagem. O `replace` evita que voltar no navegador repita o pulo.
 */
export default function MessageLinkPage() {
  const router = useRouter();
  const params = useParams<{ guildId: string; channelId: string; messageId: string }>();

  useEffect(() => {
    const { guildId, channelId, messageId } = params;
    if (!channelId || !messageId) return;
    router.replace("/app");
    // o app precisa estar montado (stores carregadas) antes do pulo
    const timer = setTimeout(() => {
      void goToMessage({
        guildId: guildId === "@me" ? null : guildId,
        channelId,
        messageId,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [params, router]);

  return (
    <main className="grid h-screen place-items-center bg-chat text-txt-muted">
      Abrindo a mensagem…
    </main>
  );
}
