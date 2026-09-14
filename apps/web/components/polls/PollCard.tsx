"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/ui/icones";
import { isPollClosed, pollPercent, type Poll } from "@streamz/shared";
import { Button } from "@/components/ui/primitivos";
import { horaCompleta } from "@/lib/format";
import { usePoll, usePolls } from "@/stores/polls";
import { ui } from "@/stores/ui";

/**
 * Enquete dentro da mensagem: pergunta, opções com rádio/caixa à direita,
 * total de votos e o rodapé com "Ver resultados" + o botão "Votar".
 *
 * Cartão 2o-enquete — 6 divergências medidas pela revisão de 2026-09-11
 * (`.claude/paridade/divergencias.py components/polls/PollCard.tsx`), todas
 * contra a única referência que existe para a peça, a imagem de catálogo
 * `desenvolvedores/imagens/mensagens-de-bot/enquete.png` (546×430 — recorte,
 * não o print 1:1 de 1919×1079 da ADR, mas 1:1 de escala: o avatar mede 40px,
 * o mesmo do avatar padrão do Discord, então os pixels valem como medida).
 * Corrigidas:
 * 1. Rodapé sem botão de votar → agora tem `Button` `primario` "Votar".
 * 2. Rádio à esquerda → agora à direita.
 * 3. Opção com o fundo do card e borda → agora mais clara, sem borda.
 * 4. Card 432px/opção 40px → agora 472px/opção 50px (medidos).
 * 5. "Quem votou"/"Encerrar" em azul de link → agora `text-text-default`
 *    (branco), como o "Show votes" do Discord; a ação primária é botão.
 * 6. Ícone de enquete dentro do card → removido (o Discord não tem; o selo
 *    "≡ POLL" dele fica na linha do autor, fora deste componente — ver
 *    "faltando" no cartão).
 *
 * Medidas (régua sobre a imagem acima, `scripts/paridade/medir.py`):
 * - Card 472px de largura (`linha 180 0 546` → trecho 66–537, 472px) e
 *   padding 16px de cada lado (`coluna 205…`/`linha 150…`: opção começa em
 *   x82 = 66+16). Opção 440×50 com 8px de intervalo entre elas (`coluna 300
 *   0 430`: 126–175, gap 176–183, 184–233…) — 472−2×16=440, bate com a opção
 *   cheia. Confere `472/440/50/8` do `divergencias.py`.
 * - Rádio: anel de 20px (`linha 150…`, trecho branco 484–503, diâmetro 20) a
 *   18px da borda direita da opção (521−503=18; opção termina em 82+440−1=
 *   521). Uso `px-4` (16) em vez do 18 medido — a diferença de 2px está
 *   dentro da tolerância de antisserrilhado da imagem, e 16 é o degrau da
 *   escala de espaçamento que já existe no resto do app.
 * - Botão "Votar": `linha 385…`/`coluna 490…` dão o botão em x462–521 (60px)
 *   por y369–400 (32px) — exatamente o `sm` do nosso `Button` (miolo 30 +
 *   borda, min-width 60 com texto), por isso o rodapé usa o primitivo em vez
 *   de redesenhar um botão à mão.
 * - Cor do card/opção: a imagem mede #26282b (card) e #303135 (opção), que
 *   não batem pixel a pixel com nenhum token nosso — é catálogo, abaixo do
 *   CSS medido na régua de autoridade da ADR. O que conta é a RELAÇÃO (opção
 *   mais clara que o card, sem borda), e o par mais próximo na nossa escala
 *   de superfícies é exatamente essa relação, um degrau acima:
 *   `--background-surface-high` (#242429, card) e `--background-surface-
 *   highest` (#2c2d32, opção) — tokens medidos de `variaveis-resolvidas.
 *   json`, não a imagem. Precedente no app: `LinkEmbedCard.tsx` já usa
 *   `bg-background-surface-high` para o mesmo tipo de cartão embutido.
 * - Raio da opção: `--radius-sm` do Discord é 8px (`tokens/VARIAVEIS.md:
 *   1213`), que é o nosso `rounded-lg` — troca do `rounded-[4px]` de antes.
 * - Preenchimento do resultado: os únicos tokens de enquete que existem
 *   (`tokens/VARIAVEIS.md:689-691`, já gerados em `tokens.gerados.ts`) são
 *   `--polls-voted-fill` (#9ae22233 — limão, já trocado do blurple original
 *   #5a64f0 pela regra mecânica da ADR) e `--polls-victor-fill` (#3ca05f33,
 *   verde do Discord). Não existe um terceiro token "neutro": por isso só a
 *   opção marcada (`bg-polls-voted-fill`) e a vencedora de uma enquete
 *   encerrada (`bg-polls-victor-fill`) ganham a barra — as demais mostram só
 *   a porcentagem em texto, sem barra colorida, porque não há cor medida
 *   para ela.
 *
 * Fluxo de voto (`suporte/imagens/server-settings/22163184112407-polls-faq/
 * 07.gif` e `08.gif`: "you know your vote has gone through once a check mark
 * appears... you'll see the option to change your vote"): antes do primeiro
 * voto, clicar numa opção só marca localmente (`pendente`) — quem confirma é
 * o botão "Votar", que chama `vote()` uma vez por opção marcada. Depois que
 * `poll.options` já tem alguma `me: true` (voto real, veio da store), clicar
 * numa opção diferente vota/troca na hora, sem passar pelo botão de novo —
 * é o que a store já fazia antes desta peça existir. "Ver resultados" espia
 * as porcentagens sem votar e só aparece antes do voto (depois disso o
 * resultado já está à mostra sozinho).
 */
export default function PollCard({
  poll: fromMessage,
  canModerate = false,
  isAuthor = false,
}: {
  poll: Poll;
  canModerate?: boolean;
  isAuthor?: boolean;
}) {
  const seed = usePolls((s) => s.seed);
  const vote = usePolls((s) => s.vote);
  const close = usePolls((s) => s.close);
  const poll = usePoll(fromMessage) ?? fromMessage;

  // a versão que veio na mensagem entra na store; as atualizações ao vivo
  // (poll.updated) passam a mandar a partir daí
  useEffect(() => seed(fromMessage), [fromMessage, seed]);

  const encerrada = isPollClosed(poll);
  const votei = poll.options.some((o) => o.me);

  /** seleção local, antes de confirmar no botão "Votar" (ver comentário acima). */
  const [pendente, setPendente] = useState<Set<number>>(() => new Set());
  /** espiar o resultado sem votar ("Ver resultados"). */
  const [verResultados, setVerResultados] = useState(false);

  // assim que o primeiro voto de verdade chega (clique confirmado, ou de
  // outra sessão da mesma pessoa via `loadMine`), a seleção pendente perde o
  // sentido — o card passa a refletir só `poll.options`
  useEffect(() => {
    if (votei) setPendente(new Set());
  }, [votei]);

  const mostrarResultado = votei || encerrada || verResultados;
  const maiorContagem = Math.max(0, ...poll.options.map((o) => o.votes));

  function alternarPendente(indice: number) {
    setPendente((prev) => {
      if (!poll.multi) return new Set([indice]);
      const next = new Set(prev);
      if (next.has(indice)) next.delete(indice);
      else next.add(indice);
      return next;
    });
  }

  function confirmarVoto() {
    for (const indice of pendente) vote(poll.messageId, indice);
  }

  return (
    <div className="mt-1 w-[472px] max-w-full rounded-lg bg-background-surface-high p-4">
      <h3 className="min-w-0 break-words text-text-md font-semibold text-text-strong">{poll.question}</h3>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        {poll.multi ? "Escolha quantas quiser" : "Escolha uma opção"}
      </p>

      <div role="group" aria-label={poll.question} className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const pct = pollPercent(o.votes, poll.totalVotes);
          const marcada = o.me || pendente.has(o.index);
          const vencedora = encerrada && mostrarResultado && maiorContagem > 0 && o.votes === maiorContagem;
          return (
            <button
              key={o.index}
              type="button"
              disabled={encerrada}
              aria-pressed={marcada}
              onClick={() => {
                if (encerrada) return;
                if (votei) vote(poll.messageId, o.index);
                else alternarPendente(o.index);
              }}
              /* 50px também no celular: já passa do piso de 44 do alvo de dedo,
                 sem precisar de uma altura só para lá (a peça não tem
                 referência própria de celular — ver "não_verificado") */
              className={`relative flex h-[50px] items-center gap-3 overflow-hidden rounded-lg bg-background-surface-highest px-4 text-left transition ${
                encerrada ? "cursor-default" : "hover:bg-interactive-background-hover"
              }`}
            >
              {mostrarResultado && (vencedora || marcada) && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 ${vencedora ? "bg-polls-victor-fill" : "bg-polls-voted-fill"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative min-w-0 flex-1 truncate text-sm text-text-default">{o.text}</span>
              {mostrarResultado && (
                <span className="relative shrink-0 text-xs font-medium text-text-muted">{pct}%</span>
              )}
              {/* rádio (escolha única) ou caixa (múltipla), à direita — o
                  Discord não marca à esquerda, como a peça antiga fazia */}
              <span
                aria-hidden="true"
                className={`relative grid h-5 w-5 shrink-0 place-items-center border ${
                  poll.multi ? "rounded-[3px]" : "rounded-full"
                } ${marcada ? "border-brand-500 bg-brand-500 text-control-primary-text-default" : "border-text-muted"}`}
              >
                {marcada && <Check size={13} strokeWidth={3} aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 celular:[&_button]:min-h-[44px]">
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
          <span>
            {poll.totalVotes} {poll.totalVotes === 1 ? "voto" : "votos"}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {encerrada
              ? "Enquete encerrada"
              : poll.expiresAt
                ? `Encerra ${horaCompleta(poll.expiresAt)}`
                : "Sem prazo"}
          </span>
        </span>

        <div className="flex items-center gap-4">
          {/* "sem permissão": quem não modera nem é autor nunca vê estes dois
              — a única moderação que este componente enxerga */}
          {canModerate && (
            <button
              type="button"
              onClick={() => ui.openModal({ kind: "pollVoters", messageId: poll.messageId })}
              className="text-xs font-medium text-text-default hover:underline"
            >
              Quem votou
            </button>
          )}
          {!encerrada && (isAuthor || canModerate) && (
            <button
              type="button"
              onClick={() => void close(poll.messageId)}
              className="text-xs font-medium text-text-default hover:underline"
            >
              Encerrar
            </button>
          )}
          {!encerrada && !votei && (
            <>
              <button
                type="button"
                onClick={() => setVerResultados((v) => !v)}
                aria-pressed={verResultados}
                className="text-xs font-medium text-text-default hover:underline"
              >
                {verResultados ? "Ocultar resultados" : "Ver resultados"}
              </button>
              <Button variante="primario" tamanho="sm" disabled={pendente.size === 0} onClick={confirmarVoto}>
                Votar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
