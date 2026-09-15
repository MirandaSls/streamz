"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { lerUsuarioGuardado } from "@/lib/usuario-guardado";
import { goToChannel } from "@/stores/messages-navigate";

/**
 * Destino do link de canal (`/app/channels/:guildId/:channelId`, com `@me` no
 * lugar do servidor nas conversas diretas). Espelho de `LinkDeMensagem`: manda
 * para `/app` e pede a abertura do canal.
 *
 * Sem sessão, mandar direto para `/app` perderia o canal: aquela tela só sabe
 * voltar para `/login` puro (ver `app/app/page.tsx`), sem lembrar de onde
 * veio. Por isso a checagem de sessão mora aqui, antes do `replace` — igual ao
 * link de convite, que já resolve o mesmo problema com `?next=`: sem sessão
 * este link manda para `/login?next=<este link>`, e o login devolve para cá já
 * autenticado, quando o efeito abaixo completa a navegação normalmente.
 *
 * Canal de voz aberto por aqui **não entra** na chamada: `goToChannel` usa a
 * origem padrão (`navegacao`, ver `voice-entrada.ts`), e quem chega do app de
 * Linux encontra a vista do canal com o "Entrar" à mão — entrar abre o
 * microfone, e isso é decisão de quem clica, não de um link.
 */
export default function LinkDeCanal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ guildId: string; channelId: string }>();

  useEffect(() => {
    const { guildId, channelId } = params;
    if (!channelId) return;
    if (!lerUsuarioGuardado()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    router.replace("/app");
    // o app precisa estar montado (stores carregadas) antes de trocar de canal
    const timer = setTimeout(() => {
      // `@` pode chegar codificado (`%40me`), a depender de quem montou o link
      const conversa = decodeURIComponent(guildId ?? "") === "@me";
      void goToChannel({ guildId: conversa ? null : guildId, channelId });
    }, 300);
    return () => clearTimeout(timer);
  }, [params, pathname, router]);

  return (
    <main className="grid h-screen place-items-center bg-chat text-txt-muted">
      Abrindo o canal…
    </main>
  );
}
