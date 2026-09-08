"use client";

import { Inbox, MessageSquare } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import Marca from "@/components/ui/Marca";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { rotuloDoContador, somarNaoLidas } from "@/stores/nao-lidas";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { ABAS_MOBILE, useMobile, type AbaMobile } from "@/stores/mobile";

/**
 * Barra de abas do rodapé — as quatro do app do Discord no celular:
 * **Servidores**, **Mensagens**, **Notificações** e **Você**.
 *
 * Ela é o único elemento fixo do leiaute: a pilha de telas acontece acima
 * dela, e trocar de aba nunca a esconde. Duas medidas fazem essa barra
 * funcionar num telefone:
 *
 * - **48px de altura útil**, mais o `env(safe-area-inset-bottom)` embaixo. A
 *   barra do Discord mede **78pt no total, com 34 de área segura e 44 de faixa
 *   útil** (medido em `docs/Reference/mobile/discord-mobile-voce.png`, 1px=1pt,
 *   `MEDIDAS.md` §2); ficamos em 48 porque o alvo de toque mínimo é 44 e o
 *   rótulo cabe com folga. Sem a área segura a fileira fica atrás da barra de
 *   gestos do iPhone e do Android — e o toque em "Você" vira "voltar para a
 *   tela inicial".
 * - **Quatro abas**, e não as três do Discord (Home / Notificações / Você): as
 *   conversas diretas ganham aba própria em vez de dividir a "Home" com os
 *   servidores. É uma diferença deliberada, pedida pelo usuário, e está
 *   registrada no PR.
 * - **Alvo da largura inteira da aba**, não do ícone. O dedo mira o meio da
 *   coluna; um alvo de 24px no meio de 90 erra por baixo e por cima.
 *
 * O selo de não lidas de cada aba reaproveita as mesmas contas do desktop
 * (`stores/nao-lidas.ts`): número em Mensagens (mensagem não lida em conversa
 * conta uma a uma) e ponto/número nas outras.
 */

const ROTULOS: Record<AbaMobile, string> = {
  servidores: "Servidores",
  mensagens: "Mensagens",
  notificacoes: "Notificações",
  voce: "Você",
};

/** Selo vermelho no canto do ícone da aba; `0` some. */
function Selo({ contagem, ponto }: { contagem: number; ponto: boolean }) {
  if (contagem <= 0 && !ponto) return null;
  if (contagem <= 0) {
    return (
      <span
        aria-hidden="true"
        className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-red ring-[3px] ring-panel"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white ring-[3px] ring-panel"
    >
      {rotuloDoContador(contagem)}
    </span>
  );
}

export default function BarraDeAbas() {
  const aba = useMobile((s) => s.aba);
  const irParaAba = useMobile((s) => s.irParaAba);
  const user = useAuth((s) => s.user);
  const profiles = usePresence((s) => s.profiles);
  const statuses = usePresence((s) => s.statuses);
  const dms = useDMs((s) => s.channels);
  const mencoesEmServidores = useGuilds((s) => s.guilds.reduce((n, g) => n + g.mentionCount, 0));
  const temServidorNaoLido = useGuilds((s) => s.guilds.some((g) => g.unread));
  const pedidos = useFriends((s) => s.incoming.length);
  const naoLidasEmConversas = somarNaoLidas(dms);

  const vivo = user ? resolveUser(profiles, user) : null;

  const selos: Record<AbaMobile, { contagem: number; ponto: boolean }> = {
    servidores: { contagem: mencoesEmServidores, ponto: temServidorNaoLido },
    mensagens: { contagem: naoLidasEmConversas, ponto: false },
    // pedidos de amizade e menções moram na caixa de entrada, que é esta aba
    notificacoes: { contagem: pedidos, ponto: mencoesEmServidores > 0 },
    voce: { contagem: 0, ponto: false },
  };

  function icone(id: AbaMobile) {
    switch (id) {
      case "servidores":
        return <Marca size={22} />;
      case "mensagens":
        return <MessageSquare size={22} />;
      case "notificacoes":
        return <Inbox size={22} />;
      case "voce":
        // como no Discord: a aba do usuário é a foto dele, com a bolinha de
        // status — é o atalho para "quem eu sou agora"
        return vivo ? (
          <Avatar
            user={vivo}
            size="sm"
            status={resolveStatus(statuses, vivo)}
            surface="border-panel"
          />
        ) : (
          <span className="h-6 w-6 rounded-full bg-hov" aria-hidden="true" />
        );
    }
  }

  return (
    <nav
      aria-label="Seções"
      /* `pb` com a área segura: no iPhone e no Android com gestos há uma faixa
         embaixo que o sistema reserva, e o conteúdo que cair nela não recebe
         toque. `bg-panel` até a borda de baixo para a faixa não virar um
         retângulo de outra cor. */
      className="relative z-30 flex shrink-0 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)]"
    >
      {ABAS_MOBILE.map((id) => {
        const ativa = aba === id;
        const selo = selos[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => irParaAba(id)}
            aria-current={ativa ? "page" : undefined}
            aria-label={
              selo.contagem > 0 ? `${ROTULOS[id]} (${selo.contagem})` : ROTULOS[id]
            }
            className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 transition ${
              ativa ? "text-txt-primary" : "text-txt-muted"
            }`}
          >
            <span className="relative grid h-6 w-6 place-items-center">
              {icone(id)}
              <Selo contagem={selo.contagem} ponto={selo.ponto} />
            </span>
            <span className={`text-[10px] leading-none ${ativa ? "font-semibold" : ""}`}>
              {ROTULOS[id]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
