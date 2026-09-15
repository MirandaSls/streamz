"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { lerUsuarioGuardado } from "@/lib/usuario-guardado";
import { goToMessage } from "@/stores/messages-navigate";

/**
 * Destino do "copiar link da mensagem" (`/app/channels/:guildId/:channelId/:messageId`,
 * com `@me` no lugar do servidor nas conversas diretas).
 *
 * A rota não desenha nada: manda para `/app` — que é o app inteiro — e pede o
 * pulo até a mensagem. O `replace` evita que voltar no navegador repita o pulo.
 *
 * Sem sessão, mandar direto para `/app` perderia a mensagem: aquela tela só
 * sabe voltar para `/login` puro (ver `app/app/page.tsx`), sem lembrar de onde
 * veio. Por isso a checagem de sessão mora aqui, antes do `replace` — igual ao
 * `LinkDeCanal`: sem sessão este link manda para `/login?next=<este link>`, e o
 * login devolve para cá já autenticado, quando o efeito abaixo completa o pulo
 * normalmente.
 */
export default function LinkDeMensagem() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ guildId: string; channelId: string; messageId: string }>();

  useEffect(() => {
    const { guildId, channelId, messageId } = params;
    if (!channelId || !messageId) return;
    if (!lerUsuarioGuardado()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
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
  }, [params, pathname, router]);

  return (
    <main className="grid h-screen place-items-center bg-chat text-txt-muted">
      Abrindo a mensagem…
    </main>
  );
}
