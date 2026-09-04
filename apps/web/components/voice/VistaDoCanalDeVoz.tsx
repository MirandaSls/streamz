"use client";

import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
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
 * `bg-chat`, sem token novo.
 *
 * A força saiu de medida, não de gosto: com o **campo inteiro** do palco
 * medido em luminância relativa média, a print do Discord dá 0,0438 (0,0762 na
 * metade de baixo, que é onde o brilho mora) e o nosso render em 1920×1000 dá
 * 0,0481 (0,0748) a 40%. Casar pelo *pico* daria 60% — e a 60% o palco vira um
 * campo verde-oliva, porque o verde pesa 0,7152 na luminância e o azul 0,0722:
 * a mesma luminância de pico espalha muito mais brilho pelo meio-tom. Quem
 * manda é o campo.
 */
export default function VistaDoCanalDeVoz({
  nome,
  estados,
  onEntrar,
}: {
  nome: string;
  estados: VoiceStateEvent[];
  onEntrar: () => void;
}) {
  const visiveis = estados.slice(0, LIMITE_DE_AVATARES);
  const restante = alemDosAvatares(estados.length);

  return (
    <div className="relative h-full w-full overflow-hidden bg-chat">
      {/* O brilho é uma camada própria, e não o fundo do bloco de texto: assim
          ele cobre o palco inteiro (a print o mostra subindo por trás do
          cabeçalho) sem que a centralização do conteúdo mexa nele. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,var(--tw-gradient-stops))] from-accent/40 from-0% to-transparent to-[85%]"
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
                  <Avatar user={estado.user} size="xl" surface="border-chat" />
                  <span className="max-w-full truncate text-xs text-txt-normal">
                    {displayNameOf(estado.user)}
                  </span>
                </li>
              ))}
              {restante > 0 && (
                // o "+N" ocupa o lugar de um avatar, sem nome embaixo: por isso
                // a fileira alinha pelo TOPO, e não pelo meio
                <li className="grid h-20 w-20 place-items-center rounded-full bg-chat/60 text-xl font-semibold text-txt-primary">
                  +{restante}
                </li>
              )}
            </ul>
          )}

          {/* mesmo tratamento do "Bem-vindo(a) a Geral!" do painel ao lado
              (`MessageList`): nome de canal é conteúdo, e na print os dois
              "Geral" da tela são a mesma letra */}
          <h2 className="max-w-2xl truncate font-display text-[32px] font-extrabold leading-10 tracking-wordmark text-txt-primary">
            {nome}
          </h2>
          <p className="mt-2 text-sm leading-5 text-txt-normal">
            {textoDePresenca(estados.length)}
          </p>

          <button
            type="button"
            onClick={onEntrar}
            className="mt-6 h-10 rounded-lg bg-paper px-[18px] text-base font-medium text-rail transition hover:brightness-90"
          >
            Entrar na chamada de voz
          </button>
        </div>
      </div>
    </div>
  );
}
