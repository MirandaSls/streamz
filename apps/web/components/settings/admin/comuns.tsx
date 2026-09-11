"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Hash, Lock, MessagesSquare, Users, Volume2 } from "@/components/ui/icones";
import { displayNameOf, type AdminCallLocation, type ChannelType } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";

// re-exportada aqui porque as abas importam tudo do painel de um lugar só
export { duracao } from "./duracao";

/**
 * As peças que as quatro abas do painel repetem.
 *
 * Ficam aqui, e não em `components/ui`, porque só o painel fala nesses termos —
 * "onde a chamada está", "quanto tempo faz", "carregue de novo a cada 5 s". O
 * vocabulário geral do app continua em `ui/controls.tsx`.
 */

/**
 * Carrega, e recarrega sozinho enquanto a aba está aberta.
 *
 * O painel mostra estado **vivo** (quem está em chamada agora), e o estado de
 * voz não é do banco: mora na memória da API e é difundido por sala do
 * WebSocket, salas das quais o administrador não é membro. Entrar nelas só
 * para observar mudaria o significado de "sala" no gateway; recarregar de
 * tempos em tempos custa uma requisição e não mexe em nada.
 *
 * O relógio **não** conta enquanto a aba está escondida: uma janela esquecida
 * aberta a noite inteira não deve bater na API 17 mil vezes.
 */
export function usePainel<T>(
  carregar: () => Promise<T>,
  intervaloMs?: number,
): { dados: T | null; erro: string | null; carregando: boolean; recarregar: () => void } {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  // a função nova a cada render não pode reiniciar o efeito (e o relógio)
  const fn = useRef(carregar);
  fn.current = carregar;

  const buscar = useCallback(async () => {
    try {
      setDados(await fn.current());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tique = () => {
      if (!vivo || document.hidden) return;
      void buscar();
    };
    void buscar();
    if (intervaloMs) {
      timer = setInterval(tique, intervaloMs);
      // voltar para a aba não espera o próximo tique para mostrar o estado atual
      document.addEventListener("visibilitychange", tique);
    }
    return () => {
      vivo = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", tique);
    };
  }, [buscar, intervaloMs]);

  return { dados, erro, carregando, recarregar: () => void buscar() };
}

/** Bloco de estado da aba: erro, carregando ou lista vazia. */
export function Estado({
  erro,
  carregando,
  vazio,
  children,
}: {
  erro: string | null;
  carregando: boolean;
  vazio?: string;
  children?: ReactNode;
}) {
  if (erro) {
    return (
      <p role="alert" className="rounded-[6px] bg-panel px-3 py-3 text-sm text-red">
        {erro}
      </p>
    );
  }
  if (carregando) return <p className="text-sm text-txt-muted">Carregando…</p>;
  if (vazio) return <p className="py-1 text-sm text-txt-muted">{vazio}</p>;
  return <>{children}</>;
}

/** Cartão de contador da visão geral. */
export function Numero({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
}) {
  return (
    <div className="rounded-[6px] border border-border bg-panel px-3 py-3">
      <p className="text-2xl font-bold tabular-nums text-txt-primary">
        {valor.toLocaleString("pt-BR")}
      </p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.02em] text-txt-secondary">
        {rotulo}
      </p>
      {detalhe && <p className="mt-1 text-xs text-txt-muted">{detalhe}</p>}
    </div>
  );
}

/** Etiqueta pequena — "admin", "desativada", "privado". */
export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "accent" | "alerta" | "perigo";
}) {
  const cores = {
    neutro: "bg-sel text-txt-secondary",
    accent: "bg-accent text-accent-ink",
    alerta: "bg-yellow/15 text-yellow",
    perigo: "bg-red/15 text-red",
  }[tom];
  return (
    <span
      className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.02em] ${cores}`}
    >
      {children}
    </span>
  );
}

/** Ícone que diz de que espécie é o canal, sem depender só do texto. */
export function IconeDeCanal({ tipo, privado }: { tipo: ChannelType; privado?: boolean }) {
  if (privado) return <Lock size={14} aria-hidden="true" className="shrink-0 text-txt-muted" />;
  if (tipo === "VOICE") return <Volume2 size={14} aria-hidden="true" className="shrink-0 text-txt-muted" />;
  if (tipo === "GROUP") return <Users size={14} aria-hidden="true" className="shrink-0 text-txt-muted" />;
  if (tipo === "DM") return <MessagesSquare size={14} aria-hidden="true" className="shrink-0 text-txt-muted" />;
  return <Hash size={14} aria-hidden="true" className="shrink-0 text-txt-muted" />;
}

/**
 * **Onde** a chamada acontece, em uma linha — a resposta que o painel existe
 * para dar. Canal de servidor vira "Servidor › #canal"; conversa vira
 * "Privado · fulano, beltrano", com os avatares de quem está nela.
 */
export function LocalDaChamada({
  local,
  comAvatares = false,
}: {
  local: AdminCallLocation;
  comAvatares?: boolean;
}) {
  if (local.tipo === "guild") {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="truncate font-medium text-txt-primary">{local.guildName}</span>
        <span aria-hidden="true" className="text-txt-faint">
          ›
        </span>
        <Volume2 size={13} aria-hidden="true" className="shrink-0 text-txt-muted" />
        <span className="truncate text-txt-normal">{local.channelName}</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm">
      <Etiqueta tom="alerta">{local.tipo === "grupo" ? "Grupo" : "Privado"}</Etiqueta>
      {comAvatares && (
        <span className="flex shrink-0 -space-x-1.5">
          {local.participantes.slice(0, 4).map((p) => (
            <Avatar key={p.id} user={p} size="xs" surface="border-panel" />
          ))}
        </span>
      )}
      <span className="truncate text-txt-normal">{local.nome}</span>
    </span>
  );
}

/** Nome de exibição com o `@usuario` em cinza ao lado. */
export function NomeDoUsuario({
  user,
}: {
  user: { id: string; username: string; displayName: string | null; avatarUrl?: string | null };
}) {
  const nome = displayNameOf(user);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate font-medium text-txt-primary">{nome}</span>
      {nome !== user.username && (
        <span className="truncate text-xs text-txt-muted">@{user.username}</span>
      )}
    </span>
  );
}
