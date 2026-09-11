"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AtSign,
  Check,
  CheckCheck,
  CornerUpRight,
  Hash,
  Inbox,
  MessageCircle,
  PedidoDeAmizade,
  SlidersHorizontal,
} from "@/components/ui/icones";
import type { InboxMention, InboxUnreadChannel } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import MessagePreview, { AcaoDoCartao } from "@/components/chat/MessagePreview";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { EVENTO_CAIXA_DE_ENTRADA } from "@/lib/caixa-de-entrada";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useInbox } from "@/stores/messages-inbox";
import { badgeDaCaixa, rotuloDoContador, somarNaoLidas } from "@/stores/nao-lidas";
import { goToChannel, goToMessage } from "@/stores/messages-navigate";
import { ui } from "@/stores/ui";

/**
 * Caixa de entrada — a do Discord, medida nos prints
 * (`docs/Reference/Captura de tela 2026-09-02 152336.png` e `152351.png`).
 *
 * Painel de 600×466 com raio 8, alinhado pela direita ao ícone que o abriu.
 * Cabeçalho com o ícone e "Caixa de Entrada" a 21px da borda; à direita, um
 * botão quadrado de 32px que muda com a aba (duplo-visto "marcar tudo como
 * lido" nas não lidas, filtros nas menções) e a pílula de 58×32 dos pedidos
 * de amizade com o contador. Depois, **duas** abas de meia largura — "Não
 * lidas" e "Menções" — com o indicador de 2px na base da ativa e uma linha de
 * 1px separando do corpo.
 *
 * Havia uma terceira aba, "Para Você", que misturava menções e respostas. O
 * `GET /me/mentions` não separa as duas, e é o conteúdo dela que agora mora em
 * "Menções": resposta a mim é, na prática, alguém falando comigo, e sumir com
 * ela por causa do nome da aba seria perder aviso.
 */
type Aba = "naoLidas" | "mencoes";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "naoLidas", rotulo: "Não lidas" },
  { id: "mencoes", rotulo: "Menções" },
];

/** O painel do Discord: 600 de largura por 466 de altura, no print. */
const LARGURA = 600;
const ALTURA = 466;

/** Rótulo de um canal na caixa: `#canal` no servidor, o nome na conversa. */
function rotuloDoCanal(c: Pick<InboxUnreadChannel, "channelName" | "channelType">): string {
  if (c.channelType === "DM" || c.channelType === "GROUP") return c.channelName ?? "Conversa";
  return `#${c.channelName ?? "canal"}`;
}

export default function InboxPopover({
  tamanhoDoIcone = 20,
  anelDaSuperficie = "ring-background-base-lower",
  modoTela = false,
}: {
  /** o ícone é de 20px no cabeçalho e de 19px na barra de título do desktop. */
  tamanhoDoIcone?: number;
  /** a caixa como **tela**: é a aba "Notificações" do celular (`HeaderPopover`). */
  modoTela?: boolean;
  /**
   * Cor do anel do badge: é a **superfície atrás do ícone**, não uma cor nova
   * (`ring-background-base-lower` no cabeçalho de Amigos, `ring-input-background-default` na barra de título). O
   * anel existe para descolar o vermelho do ícone, e só funciona se for
   * exatamente o fundo — ver o badge do rail em `GuildRail`.
   */
  anelDaSuperficie?: string;
} = {}) {
  const [aba, setAba] = useState<Aba>("naoLidas");
  /** "este servidor" filtra os não-lidos pelo servidor aberto. */
  const [soEsteServidor, setSoEsteServidor] = useState(false);
  /** menções já resolvidas nesta sessão do painel (o contrato não tem "ler uma"). */
  const [lidas, setLidas] = useState<Set<string>>(new Set());
  const guildAtiva = useGuilds((s) => s.activeGuildId);
  const mentions = useInbox((s) => s.mentions);
  const unread = useInbox((s) => s.unread);
  const loading = useInbox((s) => s.loading);
  const load = useInbox((s) => s.load);
  const markAllRead = useInbox((s) => s.markAllRead);
  const pedidos = useFriends((s) => s.incoming.length);
  // o badge lê o mesmo não-lido do rail e da lista de conversas, e não o
  // `useInbox`: aquele é um retrato tirado quando o painel abre, e um ícone que
  // só sabe da novidade depois de ser clicado não serve para nada
  const mencoesEmServidores = useGuilds((s) => s.guilds.reduce((n, g) => n + g.mentionCount, 0));
  const temServidorNaoLido = useGuilds((s) => s.guilds.some((g) => g.unread));
  const naoLidasEmConversas = useDMs((s) => somarNaoLidas(s.channels));
  const badge = badgeDaCaixa({
    mencoes: mencoesEmServidores,
    conversas: naoLidasEmConversas,
    temServidorNaoLido,
  });

  const mencoes = useMemo(
    () => mentions.filter((m) => !lidas.has(m.message.id)),
    [mentions, lidas],
  );
  const naoLidas = useMemo(
    () => (soEsteServidor ? unread.filter((g) => g.guildId === guildAtiva) : unread),
    [unread, soEsteServidor, guildAtiva],
  );

  /** Marca o canal da menção como lido e tira o cartão da lista. */
  function marcarComoLida(m: InboxMention) {
    setLidas((s) => new Set(s).add(m.message.id));
    const channelId = m.message.channelId;
    // a chamada é direta porque a menção pode ser de um servidor que não está
    // aberto — as stores só conhecem os canais do servidor/conversas carregados
    void api.markRead(channelId).catch(() => undefined);
    void useChannels.getState().markRead(channelId);
    void useDMs.getState().markRead(channelId);
  }

  /** A pílula: abre a página Amigos na aba de pedidos pendentes. */
  function verPedidos(fechar: () => void) {
    fechar();
    ui.setView("dm");
    useChannels.getState().leaveVoice();
    const amigos = useFriends.getState();
    amigos.setTab("pendentes");
    amigos.setOpen(true);
  }

  return (
    <HeaderPopover
      label={rotuloDoBotao(badge)}
      title="Caixa de Entrada"
      icon={<Inbox size={tamanhoDoIcone} />}
      badge={<BadgeDaCaixa estado={badge} anel={anelDaSuperficie} />}
      largura={LARGURA}
      altura={ALTURA}
      modoTela={modoTela}
      evento={modoTela ? undefined : EVENTO_CAIXA_DE_ENTRADA}
      corpoClassName="flex flex-col"
      onOpen={() => void load()}
      cabecalho={(fechar) => (
        <header className="shrink-0">
          {/* título a 19px do topo, 36px de linha, 21px das bordas */}
          <div className="flex h-9 items-center gap-2 px-[21px] pt-[19px] celular:h-[44px] celular:px-4">
            <Inbox size={20} aria-hidden="true" className="shrink-0 text-text-subtle" />
            <h2 className="min-w-0 truncate text-xl font-bold text-text-strong">
              Caixa de Entrada
            </h2>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {aba === "naoLidas" ? (
                <BotaoDoCabecalho label="Marcar tudo como lido" onClick={() => void markAllRead()}>
                  <CheckCheck size={20} />
                </BotaoDoCabecalho>
              ) : (
                // o Discord filtra as menções por servidor aqui; o nosso contrato
                // ainda não tem esse filtro, então o botão existe e não faz nada
                <BotaoDoCabecalho label="Filtros" inerte>
                  <SlidersHorizontal size={20} />
                </BotaoDoCabecalho>
              )}
              <Tooltip label="Ver pedidos de amizade" side="bottom">
                <button
                  type="button"
                  onClick={() => verPedidos(fechar)}
                  aria-label={`Ver pedidos de amizade (${pedidos})`}
                  className="flex h-8 w-[58px] items-center justify-center gap-1 rounded-lg bg-interactive-background-hover text-text-subtle transition hover:bg-interactive-background-selected hover:text-text-strong celular:h-[44px] celular:w-[66px]"
                >
                  <PedidoDeAmizade size={20} aria-hidden="true" />
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-background-surface-higher px-1 text-xs font-bold leading-none text-text-default">
                    {pedidos}
                  </span>
                </button>
              </Tooltip>
            </div>
          </div>

          {/* duas abas de meia largura; o indicador cobre a linha de baixo */}
          <div
            role="tablist"
            aria-label="Caixa de entrada"
            className="mx-1 mt-[22px] flex h-[50px] gap-2.5 border-b border-border-subtle"
          >
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={`relative h-full flex-1 text-sm font-medium transition celular:text-base ${
                  aba === a.id
                    ? "text-brand-500 after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-brand-500"
                    : "text-text-subtle hover:text-text-default"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </header>
      )}
    >
      {(fechar) => (
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
          {loading && <p className="p-4 text-center text-sm text-text-muted">Carregando…</p>}

          {!loading && aba === "mencoes" && (
            <>
              {mencoes.length === 0 && (
                <Vazio icone={<AtSign size={40} />} titulo="Você já viu tudo!">
                  Todas as menções recebidas ficarão salvas aqui por 7 dias.
                </Vazio>
              )}
              {mencoes.length > 0 && (
                <div className="px-[21px] py-3">
                  {mencoes.map((m) => (
                    <MessagePreview
                      key={m.message.id}
                      message={m.message}
                      className="mb-1 last:mb-0"
                      acima={
                        <div className="mb-1 flex items-center gap-1.5 pr-16 text-xs text-text-muted">
                          <span className="truncate font-medium text-text-subtle">
                            {m.guildName ?? "Mensagens diretas"}
                          </span>
                          <span aria-hidden="true">›</span>
                          <span className="truncate">
                            {rotuloDoCanal({
                              channelName: m.channelName,
                              channelType: m.channelType,
                            })}
                          </span>
                        </div>
                      }
                      acoes={
                        <>
                          <AcaoDoCartao label="Marcar como lida" onClick={() => marcarComoLida(m)}>
                            <Check size={16} />
                          </AcaoDoCartao>
                          <AcaoDoCartao
                            label="Saltar"
                            onClick={() => {
                              fechar();
                              void goToMessage({
                                guildId: m.guildId,
                                channelId: m.message.channelId,
                                messageId: m.message.id,
                              });
                            }}
                          >
                            <CornerUpRight size={16} />
                          </AcaoDoCartao>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && aba === "naoLidas" && (
            <>
              {naoLidas.length === 0 && !soEsteServidor && (
                <Vazio icone={<Inbox size={40} />} titulo="Você está por dentro!">
                  {/* no celular a dica não pode ser um atalho de teclado: a aba
                      é a própria caixa de entrada, e não há Ctrl nem Esc */}
                  {modoTela
                    ? "O que estiver por ler aparece aqui, e o ✓✓ do topo limpa tudo de uma vez."
                    : "Pressione Ctrl+I para abrir a caixa de entrada e Esc para marcar o canal aberto como lido."}
                </Vazio>
              )}
              {(naoLidas.length > 0 || soEsteServidor) && (
                <div className="px-[21px] py-3">
                  <div className="mb-2 flex items-center gap-1">
                    {(
                      [
                        [true, "Este servidor"],
                        [false, "Todos os servidores"],
                      ] as const
                    ).map(([valor, rotulo]) => (
                      <button
                        key={rotulo}
                        type="button"
                        onClick={() => setSoEsteServidor(valor)}
                        aria-pressed={soEsteServidor === valor}
                        className={`rounded-[3px] px-2 py-1 text-xs font-medium transition celular:min-h-[44px] celular:px-3 ${
                          soEsteServidor === valor
                            ? "bg-interactive-background-selected text-text-strong"
                            : "text-text-muted hover:text-text-default"
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>

                  {naoLidas.length === 0 && (
                    <p className="p-4 text-center text-sm text-text-muted">
                      Nada por ler neste servidor.
                    </p>
                  )}
                  {naoLidas.map((g) => (
                    <section key={g.guildId ?? "@me"} className="mb-2 last:mb-0">
                      <h3 className="px-2 py-1 text-xs font-semibold uppercase text-text-muted">
                        {g.guildName}
                      </h3>
                      {g.channels.map((c) => (
                        <button
                          key={c.channelId}
                          type="button"
                          onClick={() => {
                            fechar();
                            void goToChannel({ guildId: g.guildId, channelId: c.channelId });
                          }}
                          // 44 no celular: na aba Notificações esta linha é o
                          // caminho para o canal, e 35px é alvo de mouse
                          className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left hover:bg-interactive-background-hover celular:min-h-[44px]"
                        >
                          {c.channelType === "DM" || c.channelType === "GROUP" ? (
                            <MessageCircle size={20} aria-hidden="true" className="text-channels-default" />
                          ) : (
                            <Hash size={20} aria-hidden="true" className="text-channels-default" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-text-default">
                            {c.channelName ?? "Conversa"}
                          </span>
                          {c.mentionCount > 0 && (
                            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold text-control-critical-primary-text-default">
                              {c.mentionCount}
                            </span>
                          )}
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </HeaderPopover>
  );
}

// ── pedaços ────────────────────────────────────────────────────────────────

/**
 * Rótulo do botão — é o que o leitor de tela anuncia e o que o tooltip mostra.
 * O selo é `aria-hidden`: um número solto ao lado de "Caixa de entrada" não
 * diria do que ele é.
 */
function rotuloDoBotao(estado: ReturnType<typeof badgeDaCaixa>): string {
  if (estado.tipo === "contagem") {
    return `Caixa de entrada (${estado.total} não ${estado.total === 1 ? "lida" : "lidas"})`;
  }
  if (estado.tipo === "ponto") return "Caixa de entrada (novidades)";
  return "Caixa de entrada";
}

/**
 * O selo vermelho no canto do ícone da caixa de entrada.
 *
 * Mesma forma do badge do rail (`GuildRail`), porque é a mesma informação: o
 * miolo tem 16px de altura e no mínimo 16 de largura, o número é 12px bold, e
 * o anel de 3px fica **por fora** (`ring`, não `border`) — com borda o anel
 * comeria o miolo e o "1" sairia cortado embaixo. Quando não há o que contar
 * (só canal de servidor não lido) o miolo vira um ponto de 8px: o Discord não
 * inventa número para o que ele mesmo não conta.
 *
 * O ícone medido no print (`Captura de tela 2026-09-03 203013.png`) tem 17×16
 * de desenho dentro do botão de 24, e a barra tem 32 de altura — só 4px de
 * folga acima do botão. Daí as duas medidas do selo, escolhidas renderizando e
 * olhando: `top-0` (o rail usa `-top-1`, e aqui o anel passaria da borda da
 * janela) e `-right-2`, que tira 8px do miolo para fora e é a mesma proporção
 * de sobreposição do rail (14 de 40). Com o `-right-1` do rail, o selo cobria
 * o ícone quase inteiro num botão de 24 e sobrava só o canto de baixo.
 *
 * `pointer-events-none`: o selo cobre o canto do botão, e o clique tem que
 * continuar caindo no botão, não no número.
 */
function BadgeDaCaixa({
  estado,
  anel,
}: {
  estado: ReturnType<typeof badgeDaCaixa>;
  anel: string;
}) {
  if (estado.tipo === "nada") return null;
  if (estado.tipo === "ponto") {
    return (
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-1 top-0.5 h-2 w-2 rounded-full bg-status-danger ring-[3px] ${anel}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -right-2 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[12px] font-bold leading-none text-control-critical-primary-text-default ring-[3px] ${anel}`}
    >
      {rotuloDoContador(estado.total)}
    </span>
  );
}

/** O botão quadrado de 32px do cabeçalho, que muda com a aba. */
function BotaoDoCabecalho({
  label,
  inerte = false,
  onClick,
  children,
}: {
  label: string;
  /** existe para ocupar o lugar do original, mas ainda não faz nada. */
  inerte?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={inerte ? `${label} (em breve)` : label} side="bottom">
      <button
        type="button"
        onClick={inerte ? undefined : onClick}
        aria-label={label}
        aria-disabled={inerte || undefined}
        /* 44px no celular: na aba Notificações (`modoTela`) estes são os únicos
           botões do topo da tela, e 31px não são alvo de dedo */
        className={`grid h-8 w-8 place-items-center rounded-lg bg-interactive-background-hover transition celular:h-[44px] celular:w-[44px] ${
          inerte
            ? "cursor-default text-text-subtle opacity-50"
            : "text-text-subtle hover:bg-interactive-background-selected hover:text-text-strong"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Corpo vazio de uma aba: o círculo de 80px com o ícone, duas faíscas em
 * volta (a de quatro pontos em ciano acima à direita, a estrela amarela
 * abaixo à esquerda — posições do print, relativas ao círculo), o título de
 * 24px e a "dica" com o rótulo em verde.
 */
function Vazio({
  icone,
  titulo,
  children,
}: {
  icone: ReactNode;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
      <div className="relative h-20 w-20">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-input-background-default text-text-subtle">
          {icone}
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="absolute left-[75px] top-0.5 h-3 w-3 text-text-link"
          fill="currentColor"
        >
          <circle cx="6" cy="1.5" r="1.5" />
          <circle cx="10.5" cy="6" r="1.5" />
          <circle cx="6" cy="10.5" r="1.5" />
          <circle cx="1.5" cy="6" r="1.5" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 14 14"
          className="absolute left-[-10px] top-16 h-3.5 w-3.5 text-status-warning"
          fill="currentColor"
        >
          <path d="M7 0L8.6 5.4L14 7L8.6 8.6L7 14L5.4 8.6L0 7L5.4 5.4Z" />
        </svg>
      </div>
      <h3 className="mt-8 text-2xl font-bold text-text-strong">
        {titulo}
      </h3>
      <p className="mt-2 text-xs text-text-muted">
        <span className="font-bold text-status-positive">FICA A DICA: </span>
        {children}
      </p>
    </div>
  );
}
