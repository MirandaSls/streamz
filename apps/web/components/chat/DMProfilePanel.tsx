"use client";

import { useEffect, useState } from "react";
import { Clock, MoreHorizontal, UserCheck, UserPlus } from "@/components/ui/icones";
import { displayNameOf, type PublicUser, type UserProfile } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import { Button } from "@/components/ui/primitivos";
import Tooltip from "@/components/ui/Tooltip";
import UsernameCopiavel from "@/components/ui/UsernameCopiavel";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useFriends, useRelationship } from "@/stores/friends";
import { useNotas } from "@/stores/notas";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Coluna 4 quando a conversa é **1:1**: o perfil do contato.
 *
 * É a regra do Discord — em grupo a coluna mostra quem está na conversa
 * (`DMMemberList`), em conversa direta mostra a pessoa com quem se fala. Uma
 * "lista" de um participante só nunca disse nada que o cabeçalho já não
 * dissesse.
 *
 * O cartão flutua na coluna (raio, borda e recuo dos quatro lados) em vez de
 * ser uma faixa colada na borda da janela, e o fundo dele é mais claro que o do
 * chat: é o que separa o perfil da conversa sem precisar de divisória.
 *
 * A coluna **começa abaixo do cabeçalho da conversa**, que atravessa a largura
 * toda (ver `DMView`). É o que põe os dois botões do canto do cartão no lugar
 * do Discord — antes eles subiam até a altura da busca.
 *
 * **Nada aqui é inventado.** O que o `PublicUser` da store já traz (nome,
 * username, foto, status) aparece na hora; o resto (banner, "membro desde",
 * amigos e servidores em comum) vem do `GET /users/:id/profile`, que é
 * calculado por espectador — e **cada seção some inteira quando o dado não
 * existe**. Não há contagem zero de amigos/servidores mútuos, nem data de
 * entrada aproximada: ou é verdade, ou não está na tela.
 *
 * Estados cobertos (cartão 5f-dm-painel-perfil):
 * - **vazio**: contato sem banner/mútuos/`createdAt` — cada bloco some (ver
 *   acima), sobra avatar + nome + usuário + o rodapé. Nunca um bloco vazio.
 * - **carregando**: enquanto `GET /profile` não volta, `estado` fica
 *   `"carregando"` e só a faixa do banner pulsa (`animate-pulse`) — o resto do
 *   cartão já é o que a store da DM tinha antes do pedido, sem esqueleto para
 *   não trocar de forma pelo que ainda nem é dado. Mesmo racional do
 *   `Esqueleto` de `components/modals/UserProfileModal.tsx`.
 * - **erro**: `estado` vira `"erro"`; a faixa para de pulsar e assenta no
 *   mesmo fundo neutro do "sem banner" — visualmente é o mesmo caso de "sem
 *   dado" (as seções que dependiam da resposta continuam ausentes), só não
 *   fica pulsando para sempre como se ainda estivesse buscando.
 * - **sem permissão**: não existe aqui — `GET /users/:id/profile` não checa
 *   nada além de "a conta existe" (mesmo comentário em `UserProfileModal.tsx`,
 *   `abrirMenu`); quem tem a conversa vê o perfil.
 * - **hover/foco**: os discos do canto usam `:hover` de `CANTO`; o CTA e a
 *   linha de mútuos (amigos/servidores, logo abaixo do username, como no
 *   Discord — sem recolhíveis) são `<button>` nativo, cobertos pelo
 *   `:focus-visible` global de `globals.css` (ver `Button.tsx`); a linha
 *   sublinha no hover e abre o perfil completo já na aba certa.
 * - **desabilitado**: pedido de amizade já enviado (`relacao === "outgoing"`)
 *   mostra o disco cinza do relógio — `aria-disabled`, não o atributo nativo,
 *   para a dica continuar aparecendo (mesma família `bannerButton_fb7f94` de
 *   `BotaoDeIcone.tsx`, item 8 do cabeçalho, medida no mesmo print 111402).
 */

/** "30 de jan. de 2018" — o formato do "membro desde" no print de referência. */
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

/**
 * Os discos do canto do cartão: 30px, medidos no print. É a mesma família
 * `.bannerButton_fb7f94` (`css-bruto/865647…css`) que o kebab do cabeçalho de
 * `CabecalhoDoPerfil.tsx` já usa: fundo
 * `--control-overlay-secondary-background-default`, borda 1px
 * `--opacity-white-8`, e hover/active em `-active` — o CSS deles usa a MESMA
 * variável nos dois estados (`.bannerButton_fb7f94:active,
 * .bannerButton_fb7f94:hover{background:var(--control-overlay-secondary-
 * background-active)}`), não uma `-hover` separada. O ícone por cima é branco
 * puro sobre imagem, por isso `text-icon-overlay-light`.
 */
// 44px no celular: com 30 os dois discos ficavam abaixo do piso de toque, e
// eles são o único caminho para "adicionar amigo" e para o menu de bloquear
// dentro do painel deslizante do telefone.
const CANTO =
  "grid h-[30px] w-[30px] place-items-center rounded-full border border-opacity-white-8 bg-control-overlay-secondary-background-default text-icon-overlay-light transition-colors duration-[50ms] ease-in hover:bg-control-overlay-secondary-background-active hover:duration-150 hover:ease-out active:bg-control-overlay-secondary-background-active celular:h-[44px] celular:w-[44px]";

/** Três fases da busca do perfil rico — só o banner reage a isso (ver o comentário do topo do arquivo). */
type EstadoDoPerfil = "carregando" | "pronto" | "erro";

export default function DMProfilePanel({ user: raw }: { user: PublicUser }) {
  const me = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const send = useFriends((s) => s.send);
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);
  // Aceitar/recusar pedem o id do PEDIDO, não do usuário — só a página Amigos
  // (ou quem mais precisar) carrega as duas listas. Idempotente (o mesmo
  // `load` que `UserProfileModal.tsx` chama): não repete a busca se alguém já
  // carregou antes.
  const loadFriends = useFriends((s) => s.load);
  const incoming = useFriends((s) => s.incoming);
  const outgoing = useFriends((s) => s.outgoing);
  const accept = useFriends((s) => s.accept);
  const dismiss = useFriends((s) => s.dismiss);
  const nota = useNotas((s) => s.nota(raw.id));
  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  // o perfil rico não cabe no PublicUser que a store da DM guarda
  const [perfil, setPerfil] = useState<UserProfile | null>(null);
  const [estado, setEstado] = useState<EstadoDoPerfil>("carregando");
  useEffect(() => {
    setPerfil(null);
    setEstado("carregando");
    let vivo = true;
    void api
      .profile(raw.id)
      .then((p) => {
        if (!vivo) return;
        setPerfil(p);
        setEstado("pronto");
      })
      // sem perfil o painel continua de pé com o que a store já tem — ele só
      // perde as seções que dependiam da resposta (ver "erro" no topo do arquivo)
      .catch(() => {
        if (vivo) setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [raw.id]);

  // a relação vem das listas em memória, não da resposta: assim o botão de
  // adicionar some no mesmo instante em que o pedido é enviado
  const relacao = useRelationship(raw.id, me?.id);
  const user = resolveUser(profiles, raw);
  const status = resolveStatus(statuses, user);
  const nome = displayNameOf(user);
  const mutuosAmigos = perfil?.mutualFriends ?? [];
  const mutuosServidores = perfil?.mutualGuilds ?? [];
  const temMutuos = mutuosAmigos.length > 0 || mutuosServidores.length > 0;
  // achado pelo id do outro lado — `undefined` enquanto `incoming`/`outgoing`
  // ainda não chegaram (mesmo padrão de `UserProfileModal.tsx`)
  const meuPedido =
    relacao === "incoming"
      ? incoming.find((r) => r.user.id === user.id)
      : relacao === "outgoing"
        ? outgoing.find((r) => r.user.id === user.id)
        : undefined;

  /**
   * O menu do boneco com o visto: um item só, "Remover amigo". É o que o botão
   * faz no Discord, e é a mesma ação que o "…" ao lado já oferece — o botão
   * existe para **dizer** que a amizade existe, não para trazer ação nova.
   */
  function abrirMenuDeAmizade(alvo: HTMLElement) {
    const r = anchorOf(alvo);
    ui.openContextMenu(r.x, r.y + r.height + 4, [
      { label: "Remover amigo", danger: true, onSelect: () => void remove(user) },
    ]);
  }

  function abrirMenu(alvo: HTMLElement) {
    const itens: MenuItem[] = [];
    if (relacao === "friend") {
      itens.push({ label: "Remover amigo", danger: true, onSelect: () => void remove(user) });
    }
    // "Aceitar pedido" já é o disco do canto (ver abaixo); aqui só a recusa —
    // mesmo par de `abrirMenu` em `UserProfileModal.tsx`.
    if (relacao === "incoming" && meuPedido) {
      itens.push({ label: "Recusar pedido", danger: true, onSelect: () => void dismiss(meuPedido.id) });
    }
    if (relacao === "outgoing" && meuPedido) {
      itens.push({ label: "Cancelar pedido", danger: true, onSelect: () => void dismiss(meuPedido.id) });
    }
    // nota privada (`docs/CONTRATO-MENUS.md` §2) — não depende da relação:
    // dá para anotar sobre qualquer usuário, amigo ou não
    itens.push({
      label: nota ? "Editar nota" : "Adicionar nota",
      description: "Visível apenas para você",
      onSelect: () => ui.openModal({ kind: "notaDeUsuario", userId: user.id }),
    });
    itens.push(
      relacao === "blocked"
        ? { label: "Desbloquear", onSelect: () => void unblock(user.id) }
        : { label: "Bloquear", danger: true, onSelect: () => void block(user) },
    );
    const r = anchorOf(alvo);
    ui.openContextMenu(r.x, r.y + r.height + 4, itens);
  }

  return (
    <aside
      aria-label={`Perfil de ${nome}`}
      // o vão é do fundo do chat, não do painel: o cartão é que flutua.
      // Medido no print `2026-09-04 102757`: 7px nos quatro lados (topo contado
      // da linha do cabeçalho) e cartão de 306 — 320 de coluna. Os 7 da
      // esquerda somam com os 10 do `px-2.5` do composer e dão os 17px que
      // separam a caixa de escrever do cartão no Discord. Largura em px, não
      // `w-80`: o `html` deste app tem 15,5px de base, então `rem` aqui daria
      // 310.
      className="flex w-[320px] shrink-0 flex-col bg-background-base-lower p-[7px]"
    >
      {/* Raio 8, e não os 10 de antes: a rampa de antisserrilhado do canto no
          print (26 → 32, 37, 42, 44) bate com a de um `border-radius: 8px`
          renderizado no mesmo Chromium (26 → 34, 38, 42, 44); com 10 a rampa
          começa um pixel mais tarde. Em px porque `rounded-lg` é `rem`, e a
          base deste app é 15,5px. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-border-subtle bg-chat-background-default">
        {/* a faixa rola junto com o conteúdo: se o `overflow-y-auto` começasse
            depois dela, ele recortaria a metade do avatar que sobe por cima da
            faixa (`-mt-[55px]` logo abaixo) — foi o que a captura
            `dm-conversa` de 2026-09-14 mostrou */}
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative shrink-0">
          {estado === "carregando" ? (
            // pulsa só enquanto busca — nos outros dois desfechos a faixa fica
            // parada (mesma regra do `Esqueleto` de `UserProfileModal.tsx`:
            // "carregando pulsa, erro não", porque erro não vai se resolver sozinho)
            <div className="h-[105px] w-full animate-pulse bg-background-base-lowest" />
          ) : perfil?.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={perfil.bannerUrl} alt="" className="h-[105px] w-full object-cover" />
          ) : (
            <div
              // a cor é do usuário quando ele tem uma; sem ela (ou com erro na
              // busca) o banner é uma superfície neutra do tema — pôr a cor da
              // marca aqui faria o painel afirmar algo sobre a pessoa que
              // ninguém disse
              style={perfil?.bannerColor ? { backgroundColor: perfil.bannerColor } : undefined}
              className={`h-[105px] w-full ${perfil?.bannerColor ? "" : "bg-background-base-lowest"}`}
            />
          )}

          {/*
            Ações sobre a faixa. Medidas no print `2026-09-04 102757`: dois
            discos de 30, 10px entre eles, 11px do topo e da borda do cartão.

            São **sempre dois**. O da esquerda troca de significado com a
            relação, como no Discord: "adicionar amigo" sem relação nenhuma, o
            boneco com o visto já amigos, o relógio cinza com pedido enviado, e
            o boneco com o visto (clicável, aceita) com pedido recebido — só
            "bloqueado" não ganha disco (a ação de desbloquear mora só no "…",
            como no Discord).
          */}
          <div className="absolute right-[11px] top-[11px] flex items-center gap-[10px]">
            {relacao === "none" && (
              <Tooltip label="Adicionar amigo">
                <button
                  type="button"
                  onClick={() => void send(user.username)}
                  aria-label={`Adicionar ${nome} como amigo`}
                  className={CANTO}
                >
                  <UserPlus size={18} />
                </button>
              </Tooltip>
            )}
            {relacao === "friend" && (
              <Tooltip label="Amigos">
                <button
                  type="button"
                  onClick={(e) => abrirMenuDeAmizade(e.currentTarget)}
                  aria-label={`Você e ${nome} são amigos`}
                  aria-haspopup="menu"
                  className={CANTO}
                >
                  {/* 16 e não 18: neste ativo a tinta ocupa mais do quadro
                      que a dos vizinhos, e é com `size={16}` que ela sai com
                      os 15×14 medidos no print — o "…" ao lado, a 18, sai com
                      os 14 de largura que o print tem */}
                  <UserCheck size={16} />
                </button>
              </Tooltip>
            )}
            {relacao === "incoming" && meuPedido && (
              <Tooltip label="Aceitar pedido">
                <button
                  type="button"
                  onClick={() => void accept(meuPedido.id)}
                  aria-label={`Aceitar pedido de amizade de ${nome}`}
                  className={CANTO}
                >
                  <UserCheck size={16} />
                </button>
              </Tooltip>
            )}
            {relacao === "outgoing" && (
              <Tooltip label="Pedido enviado">
                {/* desabilitado como `.bannerButton_fb7f94.disabled_fb7f94`
                    (a mesma família destes discos, medida em `BotaoDeIcone.tsx`
                    item 8 no mesmo print 111402): opacidade 50%, cursor normal,
                    e `aria-disabled` em vez do atributo nativo — sem `onClick`
                    o clique já não faz nada, e sem `disabled` nativo a dica que
                    explica o cinza continua aparecendo no hover. */}
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label={`Pedido de amizade enviado a ${nome}`}
                  className={`${CANTO} cursor-default opacity-50`}
                >
                  <Clock size={18} />
                </button>
              </Tooltip>
            )}
            <Tooltip label="Mais opções">
              <button
                type="button"
                onClick={(e) => abrirMenu(e.currentTarget)}
                aria-label={`Mais opções para ${nome}`}
                aria-haspopup="menu"
                className={CANTO}
              >
                <MoreHorizontal size={18} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* rola por conta própria (mesmo padrão de `DMMemberList.tsx` e
            `HeaderPopover.tsx`, a coluna 4 irmã): com um contato de muitos mútuos, o conteúdo passa da altura
            que sobra entre a faixa e o rodapé fixo */}
          {/*
            O avatar sobe por cima da faixa: 31px dele ficam abaixo dela, e o
            "anel" de 6px é a própria cor do cartão — recorte, não borda
            desenhada. O `-55px` é `31 - 80 - 6`: o anel sobe 6px a mais que o
            avatar, e o `10px` da esquerda deixa o **avatar** nos 16px de recuo
            em que os textos também começam.
          */}
          <div className="relative -mt-[55px] ml-[10px] w-fit rounded-full border-[6px] border-chat-background-default">
            <Avatar user={user} size="xl" />
            {/*
              O selo do `Avatar` fica no canto da caixa; aqui ele precisa pousar
              no ponto de 45° da circunferência. Mesma geometria medida no print
              `2026-09-03 161607` para o avatar de 80: disco de 16 dentro de um
              anel de 6 (caixa de 28), com o centro em 0,84375 × 80 = 67,5 —
              `-right-px` sobre a caixa de recheio (o avatar) põe o centro em 67.
              O fundo `bg-chat-background-default` é o que aparece pelos recortes vazados.
            */}
            <span
              role="img"
              aria-label={STATUS_LABEL[status]}
              className="absolute -bottom-px -right-px h-7 w-7 rounded-full border-[6px] border-chat-background-default bg-chat-background-default"
            >
              <IconeDeStatus status={status} className="h-full w-full" />
            </span>
          </div>

          {/* tudo alinhado nos mesmos 16px do avatar; sem divisória entre seções */}
          <div className="px-4 pb-4">
            {/* 21px do avatar até o nome — 6px deles já são o anel */}
            <h2 className="mt-[15px] truncate text-[20px] font-bold leading-[21px] text-text-strong">
              {nome}
            </h2>
            {/* o username é branco, não apagado; os 21px de topo a topo saem da
                entrelinha do nome, não de uma margem */}
            <p className="truncate text-sm leading-[21px] text-text-strong"><UsernameCopiavel username={user.username} /></p>

            {/* como no Discord: uma linha cinza e clicável sob o username, não
                recolhíveis. Some inteira sem mútuos (nada de contagem zero); o
                anel na cor do cartão é o que recorta os avatares sobrepostos. */}
            {temMutuos && (
              <div className="mt-[10px] flex flex-wrap items-center gap-x-1 text-sm leading-[18px] text-text-muted">
                {mutuosAmigos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => ui.openModal({ kind: "userProfile", userId: user.id, aba: "amigos" })}
                    className="flex items-center gap-1 hover:text-text-default hover:underline"
                  >
                    <span className="flex items-center" aria-hidden="true">
                      {mutuosAmigos.slice(0, 3).map((amigo, i) => (
                        <span
                          key={amigo.id}
                          className={`rounded-full ring-2 ring-chat-background-default ${i > 0 ? "-ml-1" : ""}`}
                        >
                          <Avatar user={amigo} size="xs" />
                        </span>
                      ))}
                    </span>
                    {mutuosAmigos.length === 1 ? "1 amigo em comum" : `${mutuosAmigos.length} amigos em comum`}
                  </button>
                )}
                {mutuosAmigos.length > 0 && mutuosServidores.length > 0 && (
                  <span aria-hidden="true">•</span>
                )}
                {mutuosServidores.length > 0 && (
                  <button
                    type="button"
                    onClick={() => ui.openModal({ kind: "userProfile", userId: user.id, aba: "servidores" })}
                    className="flex items-center gap-1 hover:text-text-default hover:underline"
                  >
                    <span className="flex items-center" aria-hidden="true">
                      {mutuosServidores.slice(0, 3).map((g, i) =>
                        g.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={g.id}
                            src={g.iconUrl}
                            alt=""
                            className={`h-4 w-4 shrink-0 rounded-[4px] object-cover ring-2 ring-chat-background-default ${i > 0 ? "-ml-1" : ""}`}
                          />
                        ) : (
                          <span
                            key={g.id}
                            className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-input-background-default text-[8px] font-bold text-text-strong ring-2 ring-chat-background-default ${i > 0 ? "-ml-1" : ""}`}
                          >
                            {g.name.slice(0, 2).toUpperCase()}
                          </span>
                        ),
                      )}
                    </span>
                    {mutuosServidores.length === 1 ? "1 servidor mútuo" : `${mutuosServidores.length} servidores mútuos`}
                  </button>
                )}
              </div>
            )}

            {perfil?.createdAt && (
              <>
                <h3 className={`${temMutuos ? "mt-[20px]" : "mt-[25px]"} text-xs font-bold leading-4 text-text-strong`}>
                  Membro desde
                </h3>
                {/* 26px de topo a topo com a linha de 16px acima */}
                <p className="mt-[10px] text-sm leading-[18px] text-text-default">
                  {DATA.format(new Date(perfil.createdAt))}
                </p>
              </>
            )}
          </div>
        </div>

        {/*
          O perfil completo já existe em modal; o rodapé só o abre.

          QUEBRADO (revisão 2026-09-11, ref 111402 coluna x=1760 y=850–889):
          este botão saía **esticado** (289×455px) porque `larguraTotal` bota
          `w-full flex-1` no próprio `<button>` (`Button.tsx` linha ~291), e
          `flex-1` faz `flex-grow`, não só a largura — dentro deste pai
          `flex-col` (a coluna acima do rodapé é `flex-1` também), os dois
          brigavam pelo espaço vertical que sobrava e o botão virava um bloco
          cinza enorme. `shrink-0` (que já estava aqui) não resolve: ele zera
          `flex-shrink`, não `flex-grow`. Como `Button.tsx` é primitivo — fora
          da lista deste cartão —, o conserto é não pedir `larguraTotal`: sem
          ela o botão nasce `flex-none` (não cresce, não encolhe) e a largura
          cheia vem de um `w-full` comum aqui, que não mexe em `flex-grow`.
          Altura 40 (`tamanho="md"`) bate com os 850–889 do print; margem 16px
          nos três lados (`mx-4 mb-4`) bate com os 1628–1911 do card (17px de
          folga) medidos no mesmo print.
          Largura por `self-stretch`, não `w-full`: `w-full` é 100% **mais** as
          margens, e o botão passava 16px da borda direita do cartão.
        */}
        <Button
          variante="secundario"
          tamanho="md"
          onClick={() => ui.openModal({ kind: "userProfile", userId: user.id })}
          className="mx-4 mb-4 shrink-0 self-stretch celular:mb-[max(1rem,env(safe-area-inset-bottom))] celular:h-[48px]"
        >
          Ver Perfil Completo
        </Button>
      </div>
    </aside>
  );
}
