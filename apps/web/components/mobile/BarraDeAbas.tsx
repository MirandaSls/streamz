"use client";

import { useEffect, useState } from "react";
import { Bell } from "@/components/ui/icones";
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
 * Barra de abas do rodapé — as **três** do app do Discord no celular, medidas
 * em `docs/Reference/mobile/discord-mobile-servidor-2024.png`: **Início**,
 * **Notificações** e **Você**.
 *
 * Ela é o único elemento fixo do leiaute: a pilha de telas acontece acima
 * dela, e trocar de aba nunca a esconde (exceto as duas vezes que ela mesma
 * some — ver os dois últimos itens). Medidas e comportamento que fazem essa
 * barra funcionar num telefone:
 *
 * - **44px de altura útil**, mais o `env(safe-area-inset-bottom)` embaixo. A
 *   barra do Discord mede **78pt no total, com 34 de área segura e 44 de faixa
 *   útil** (medido em `docs/Reference/mobile/discord-mobile-voce.png`,
 *   1px=1pt, confirmado em `-notificacoes.png` e, a 1,97×, em
 *   `-servidor-2024.png`; `MEDIDAS.md` §2). Antes esta barra usava 48 —
 *   pensando em dar folga acima do piso de toque de 44 —, mas 44 **é** a
 *   medida do Discord e já é o piso: não havia tensão para resolver com folga.
 *   Sem a área segura a fileira fica atrás da barra de gestos do iPhone e do
 *   Android — e o toque em "Você" vira "voltar para a tela inicial".
 * - **Não há aba de mensagens.** As conversas entram pela bolha no topo da
 *   rail, e a coluna da direita troca de conteúdo com a rail ainda à vista —
 *   ver `discord-mobile-dms-2024.png` e `components/mobile/telas-base.tsx`.
 * - O ícone de "Início" é o **símbolo da marca**, e não uma casa: o acervo de
 *   ativos do Discord (`docs/Reference/Discord assets icons/`) não tem glifo de
 *   casa, e §6.2 do processo manda relatar o que falta em vez de desenhar. É
 *   também o que a rail já usa para o mesmo destino. **24px** — um dos três
 *   tamanhos padrão do acervo (16/20/24) e o mais próximo da caixa nominal
 *   `~24pt` que o glifo do Discord ocupa (`MEDIDAS.md` §2: 21×20 em "Home",
 *   19×22 no sino).
 * - **Alvo da largura inteira da aba**, não do ícone. O dedo mira o meio da
 *   coluna; um alvo de 24px no meio de 90 erra por baixo e por cima.
 * - **Toque com `active:`**, nunca `hover:` — no dedo não existe "passar o
 *   mouse", e `hover:` deixaria o último item tocado aceso até o próximo
 *   toque em qualquer lugar da tela.
 * - **Some com uma tela empilhada em cima** (conversa, canal, voz, amigos):
 *   isso já é decisão de `components/mobile/ShellMobile.tsx`
 *   (`{topo === null && <BarraDeAbas />}`), não deste arquivo — é exatamente o
 *   que `discord-mobile-chat-canal-2024.png` mostra: a conversa aberta vai do
 *   cabeçalho ao composer, sem barra nenhuma embaixo.
 * - **Some quando o teclado abre**, mesmo dentro de uma aba-base sem tela
 *   empilhada — a busca de conversas da aba Início (`layout/DMList.tsx`) tem
 *   campo de texto, e o Discord recolhe a barra para devolver a faixa ao
 *   conteúdo em vez de empurrá-la para cima do teclado. Ver `useTecladoAberto`
 *   abaixo.
 *
 * O selo de não lidas de cada aba reaproveita as mesmas contas do desktop
 * (`stores/nao-lidas.ts`): número em Mensagens (mensagem não lida em conversa
 * conta uma a uma) e ponto/número nas outras.
 */

/**
 * O teclado virtual está aberto?
 *
 * `app/layout.tsx` já usa `interactiveWidget: "resizes-content"`, que encolhe
 * o `100dvh` do shell para caber acima do teclado — sem isso o composer
 * ficaria atrás dele. Mas encolher o layout não é o mesmo que **esconder**
 * esta barra: o Discord recolhe a barra de abas quando o teclado sobe (é a
 * diferença entre "dá para rolar até ver" e "a lista de resultados da busca
 * tem 44px extra"), e nada no shell faz isso — é esta barra que decide sair.
 *
 * A técnica: observar `visualViewport.height` e comparar com o maior valor
 * visto **desde a última mudança de largura**. O teclado tira bem mais de
 * 120px de altura útil; a barra de endereço do navegador que aparece/some ao
 * rolar tira menos que isso. Resetar ao mudar a largura é o que impede o giro
 * do aparelho (que também troca a altura do `visualViewport`) de ser lido como
 * teclado abrindo.
 *
 * **Não visto num teclado de verdade** (nenhum agente tem celular físico nem
 * emulador com IME neste passeio) — só a lógica, que é pura e testável. Se o
 * `visualViewport` não existir (SSR, navegador antigo), a resposta é sempre
 * `false` e a barra nunca some por este motivo.
 */
function useTecladoAberto(): boolean {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let largura = vv.width;
    let alturaCheia = vv.height;

    function medir() {
      if (vv!.width !== largura) {
        // girou o aparelho: a referência de "sem teclado" desta largura não
        // existe ainda — não é teclado abrindo, é orientação trocando
        largura = vv!.width;
        alturaCheia = vv!.height;
        setAberto(false);
        return;
      }
      alturaCheia = Math.max(alturaCheia, vv!.height);
      setAberto(alturaCheia - vv!.height > 120);
    }

    vv.addEventListener("resize", medir);
    return () => vv.removeEventListener("resize", medir);
  }, []);

  return aberto;
}

const ROTULOS: Record<AbaMobile, string> = {
  inicio: "Início",
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
        className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-[3px] ring-background-base-lowest"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold leading-none text-control-critical-primary-text-default ring-[3px] ring-background-base-lowest"
    >
      {rotuloDoContador(contagem)}
    </span>
  );
}

export default function BarraDeAbas() {
  const tecladoAberto = useTecladoAberto();
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

  // depois de todos os hooks (regra do React): o teclado aberto tira a barra
  // por inteiro, como o Discord faz — não é um estado visual, é ela sumindo
  if (tecladoAberto) return null;

  const vivo = user ? resolveUser(profiles, user) : null;

  const selos: Record<AbaMobile, { contagem: number; ponto: boolean }> = {
    // Início carrega servidores **e** conversas: as duas coisas moram nela
    inicio: {
      contagem: mencoesEmServidores + naoLidasEmConversas,
      ponto: temServidorNaoLido,
    },
    // pedidos de amizade e menções moram na caixa de entrada, que é esta aba
    notificacoes: { contagem: pedidos, ponto: mencoesEmServidores > 0 },
    voce: { contagem: 0, ponto: false },
  };

  function icone(id: AbaMobile) {
    switch (id) {
      case "inicio":
        return <Marca size={24} />;
      case "notificacoes":
        return <Bell size={24} />;
      case "voce":
        // como no Discord: a aba do usuário é a foto dele, com a bolinha de
        // status — é o atalho para "quem eu sou agora"
        return vivo ? (
          <Avatar
            user={vivo}
            size="sm"
            status={resolveStatus(statuses, vivo)}
            surface="border-background-base-lowest"
          />
        ) : (
          <span className="h-6 w-6 rounded-full bg-interactive-background-hover" aria-hidden="true" />
        );
    }
  }

  return (
    <nav
      aria-label="Seções"
      /* `pb` com a área segura: no iPhone e no Android com gestos há uma faixa
         embaixo que o sistema reserva, e o conteúdo que cair nela não recebe
         toque. `bg-background-base-lowest` até a borda de baixo para a faixa não virar um
         retângulo de outra cor. */
      className="relative z-30 flex shrink-0 border-t border-border-subtle bg-background-base-lowest pb-[env(safe-area-inset-bottom)]"
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
            className={`flex h-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition active:bg-interactive-background-hover ${
              ativa ? "text-text-strong" : "text-text-muted"
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
