"use client";

import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { Button } from "@/components/ui/primitivos";
import Tooltip from "@/components/ui/Tooltip";
import {
  LIMITE_DE_AVATARES,
  alemDosAvatares,
  textoDePresenca,
} from "@/components/voice/vista-do-canal-de-voz";

/**
 * A **vista do canal de voz**: o canal de voz aberto na coluna *sem* que eu
 * esteja na chamada.
 *
 * Medida na print `docs/Reference/Captura de tela 2026-09-04 102429.png`
 * (1919×1079, 1:1 — a coluna de canais mede 294 na print e 294 aqui): o canal
 * "Geral" está selecionado, ninguém entrou, e o palco inteiro é um convite.
 *
 * **Como se chega aqui** (a tabela mora em `stores/voice-entrada.ts` e
 * `stores/voice-saida.ts`):
 *
 * - pelo **balão de conversa** da linha do canal, que abre a conversa dele com
 *   esta vista ao lado;
 * - por um **link** — caixa de entrada, busca rápida, as setas do histórico;
 * - **desligando** com o canal ainda aberto: em vez de fechar a coluna, ela
 *   volta para cá, com o botão de entrar de novo.
 *
 * O que **não** traz para cá é o clique na linha do canal: ali o Discord entra
 * na chamada, e nós também (era o defeito da 0.0.22, em que o clique parava
 * nesta tela). O botão daqui é para quem chegou por um dos três caminhos acima.
 *
 * **Medidas da print** (`getpixel`, tinta a tinta):
 *
 * | o quê | medido |
 * |---|---|
 * | palco | 1057×999 (x 375..1431, y 32..1031) |
 * | nome do canal | tinta 490..511 → altura de caixa alta 22 → **32px**, largura 74 em "Geral" |
 * | "Ninguém está em voz" | tinta 533..545, caixa alta 10 → **14px** |
 * | botão | 798..1008 × 571..610 = **211×40**, raio **8** |
 * | texto do botão | tinta 816..991 × 584..595, caixa alta 11 → **16px**, folga lateral 17,5 |
 * | do nome ao subtítulo | 22 (linha de base → topo da tinta) |
 * | do subtítulo ao botão | 26 |
 *
 * **Um botão só.** Não há "Entrar com vídeo" na print: entre o subtítulo e a
 * base do palco existe exatamente um retângulo branco, centrado na largura do
 * palco (798..1008 tem centro 903, e o palco tem centro 903).
 *
 * **O degradê** é o único lugar em que esta tela se afasta da print de
 * propósito. No Discord ele é um brilho *blurple* — a cor da marca deles —
 * saindo do meio da borda de baixo; medido, é um `radial-gradient` circular com
 * centro em (50%, 100%), pico `rgb(116,131,225)` e queda quase linear até o
 * fundo escuro num raio de ~960px (85% do raio até o canto mais distante deste
 * palco). Aqui o mesmo desenho sai do **nosso** acento (Volt Lime) sobre
 * `bg-background-base-lower`, sem token novo.
 *
 * A força saiu de medida, não de gosto: com o **campo inteiro** do palco
 * medido em luminância relativa média, a print do Discord dá 0,0438 (0,0762 na
 * metade de baixo, que é onde o brilho mora) e o nosso render em 1920×1000 dá
 * 0,0481 (0,0748) a 40%. Casar pelo *pico* daria 60% — e a 60% o palco vira um
 * campo verde-oliva, porque o verde pesa 0,7152 na luminância e o azul 0,0722:
 * a mesma luminância de pico espalha muito mais brilho pelo meio-tom. Quem
 * manda é o campo.
 *
 * **Estados** (cartão 4f):
 * - **vazio** (`estados.length === 0`) e **com gente** são os dois cobertos
 *   acima, os únicos com print.
 * - **carregando**: não existe janela para mostrar — `connect` (`stores/
 *   voice.ts`) grava `channelId`/`status:"connecting"` na MESMA volta síncrona
 *   do clique, antes do primeiro `await`; o `VoicePanel` já troca esta tela
 *   pela grade no próximo render. Quem mostra "Conectando…" é a barra "Voz
 *   conectada" (fora da lista deste cartão).
 * - **erro**: também não é desta tela — só existe depois de `aqui` (dentro da
 *   call), e o banner mora em `VoicePanel.tsx` (bloco `status === "error"`).
 * - **sem permissão** (`podeConectar === false`, `Permission.CONNECT` — a
 *   mesma checagem que `voice.service.ts:assertPodeConectar` faz no servidor,
 *   lida aqui do lado do cliente por `useCan`, como em qualquer outro canto do
 *   app: "a UI esconde o que a API recusaria"). **Não há print** deste estado
 *   em nenhuma referência (nem catálogo, nem CSS bruto têm o Discord com um
 *   canal de voz visível-mas-sem-`Connect`) — em vez de inventar um texto de
 *   tela novo, o botão vira o mesmo botão **desabilitado** (o `Button` já
 *   cobre a forma: opacidade 50%, sem clique) com um `Tooltip` explicando o
 *   motivo, que é o padrão que o resto do app já usa para isso.
 * - **hover / foco / desabilitado** do botão: de graça pelo `Button`
 *   primitivo (`--control-secondary-*-hover`, `:focus-visible` global,
 *   `opacity .5; pointer-events: none` — ver o cabeçalho de `Button.tsx`).
 *   Nada disso é reimplementado aqui.
 */
export default function VistaDoCanalDeVoz({
  nome,
  estados,
  podeConectar = true,
  onEntrar,
}: {
  nome: string;
  estados: VoiceStateEvent[];
  /** `Permission.CONNECT` no canal — default `true` p/ quem ainda não passa a prop (DM/grupo). */
  podeConectar?: boolean;
  onEntrar: () => void;
}) {
  const visiveis = estados.slice(0, LIMITE_DE_AVATARES);
  const restante = alemDosAvatares(estados.length);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background-base-lower">
      {/* O brilho é uma camada própria, e não o fundo do bloco de texto: assim
          ele cobre o palco inteiro (a print o mostra subindo por trás do
          cabeçalho) sem que a centralização do conteúdo mexa nele. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,var(--tw-gradient-stops))] from-brand-500/40 from-0% to-transparent to-[85%]"
      />

      <div className="relative grid h-full place-items-center px-8 py-6">
        <div className="flex flex-col items-center text-center">
          {visiveis.length > 0 && (
            // Quem já está na sala aparece antes do nome: é a informação que
            // decide se você entra agora ou depois. **Não medido** — a print do
            // usuário é de um canal vazio.
            <ul className="mb-7 flex max-w-3xl flex-wrap items-start justify-center gap-x-4 gap-y-3">
              {visiveis.map((estado) => (
                <li key={estado.user.id} className="flex w-24 flex-col items-center gap-1.5">
                  <Avatar user={estado.user} size="xl" surface="border-background-base-lower" />
                  <span className="max-w-full truncate text-xs text-text-default">
                    {displayNameOf(estado.user)}
                  </span>
                </li>
              ))}
              {restante > 0 && (
                // o "+N" ocupa o lugar de um avatar, sem nome embaixo: por isso
                // a fileira alinha pelo TOPO, e não pelo meio
                <li className="grid h-20 w-20 place-items-center rounded-full bg-background-base-lower/60 text-xl font-semibold text-text-strong">
                  +{restante}
                </li>
              )}
            </ul>
          )}

          {/* mesmo tratamento do "Bem-vindo(a) a Geral!" do painel ao lado
              (`MessageList`): nome de canal é conteúdo, e na print os dois
              "Geral" da tela são a mesma letra */}
          <h2 className="max-w-2xl truncate font-headline text-[32px] font-extrabold leading-10 text-text-strong">
            {nome}
          </h2>
          <p className="mt-2 text-sm leading-5 text-text-default">
            {textoDePresenca(estados.length)}
          </p>

          {/* Sem variante branca no primitivo: o botão do Discord aqui foge de
              propósito da cor de marca (branco, não blurple/limão), mas o
              conjunto de `Button` só tem primario/secundario/crítico/positivo/
              link — `secundario` é o mais próximo (neutro, não citado como
              marca). Ver "faltando" no cartão m57. */}
          {podeConectar ? (
            <Button variante="secundario" tamanho="md" onClick={onEntrar} className="mt-6">
              Entrar na chamada de voz
            </Button>
          ) : (
            // sem `Permission.CONNECT`: mesma forma, desabilitado, com o motivo
            // no tooltip — ver "Estados" no cabeçalho do arquivo
            <Tooltip label="Você não tem permissão para entrar neste canal de voz" side="top">
              <Button variante="secundario" tamanho="md" disabled className="mt-6">
                Entrar na chamada de voz
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
