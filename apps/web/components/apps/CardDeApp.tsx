"use client";

import type { AppDoDiretorio } from "@streamz/shared";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import { Server } from "@/components/ui/icones";

/**
 * Um aplicativo na grade de "Descobrir aplicativos".
 *
 * ── j-bots · F4, lote B ──
 *
 * ## As medidas, e de onde saem
 *
 * Medidas com Pillow em `docs/Reference/apps/diretorio-grade.png` (2,000
 * px/CSS, aferida por quatro valores redondos simultâneos — ver `MEDIDAS.md`
 * §1 e §2). Conferi de novo aqui, varrendo a linha `y=1345` da captura: os
 * quatro cards começam em x = 22, 542, 1062, 1582 e medem **488 px** cada, com
 * 32 de intervalo — 244 e 16 px CSS. O ícone, varrido na coluna do primeiro
 * card, vai de `y=1348` a `y=1443`: **96 px**, ou 48 CSS, a 32 (16 CSS) da
 * borda. O nome começa 32 px (16 CSS) **depois** do ícone.
 *
 * | peça | px CSS |
 * |---|---|
 * | card | 244 × **164** (mínimo aqui: 204, ver §3 abaixo) |
 * | intervalo da grade | 16 |
 * | raio | ≈8 |
 * | ícone | **48**, à esquerda, com o nome ao lado |
 * | padding interno | 16 |
 * | folga ícone → nome, e entre os blocos do card | 16 |
 *
 * ## A forma, que veio do CSS do cliente atual
 *
 * A captura dá as medidas; a **forma** (borda, hover, empilhamento interno)
 * veio do cartão de app do cliente de 2026-09-11, que é a régua da ADR-0009 —
 * `.appContainer__5a4b6` e vizinhos em `sob-demanda/0e2df4ee2650d74f.css`:
 *
 * ```css
 * .contentContainer__5a4b6{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
 * .appContainer__5a4b6{background-color:var(--background-base-lower);border:1px solid var(--border-subtle);
 *   border-radius:8px;cursor:pointer;display:flex;flex:1;flex-direction:column;gap:16px;min-width:0;padding:16px}
 * .appContainer__5a4b6:focus,.appContainer__5a4b6:hover{background-color:var(--background-base-lowest)}
 * .full-motion .appContainer__5a4b6:focus,.full-motion .appContainer__5a4b6:hover{
 *   box-shadow:var(--shadow-border),var(--shadow-high);transform:translateY(-1px)}
 * .appHeader__5a4b6{align-items:center;display:flex;flex-direction:row;gap:16px}
 * .titleContainer__5a4b6{display:flex;flex-direction:column;gap:4px;min-width:0}
 * ```
 *
 * Três coisas que isso trouxe e que o card não tinha:
 *
 * 1. **Borda de 1px `--border-subtle`.** Não é enfeite: no tema **Onyx**
 *    `--background-base-lower` e `--background-base-lowest` são os dois
 *    `#000000`, e sem borda o card sumia dentro da página. É também o que o
 *    Discord faz.
 * 2. **Hover com sombra e 1px de subida** (`shadow-popout` é exatamente o par
 *    `--shadow-border, --shadow-high` do CSS acima, já nomeado no
 *    `tailwind.config.ts`), e o mesmo tratamento no `focus-within` — lá é
 *    `:focus`, aqui o foco cai no botão-capa **dentro** do `<article>`.
 *    Quem desligou movimento não vê a subida: `html.reduzir-movimento` zera
 *    qualquer transição (`globals.css`), que é o `.full-motion` deles pelo
 *    avesso.
 * 3. **O card preenche a coluna da grade** (`flex:1` lá; aqui, simplesmente
 *    nenhuma largura). Antes ele era `w-[244px]` **dentro** de uma trilha
 *    `minmax(244px,1fr)`: a trilha esticava e o card não, e sobrava um vão
 *    irregular à direita de cada um. 244 continua sendo o **mínimo**, que é
 *    onde a medida da captura vive — agora na grade (`DiretorioDeApps`), que
 *    é quem manda na largura.
 *
 * ## Três divergências do §11, todas a favor da medida
 *
 * 1. **"ícone 80"** → é **48**. O card do Discord tem 164 de altura e o ícone
 *    fica na horizontal, ao lado do nome; 80 empilhado come metade da altura
 *    útil e não sobra linha nenhuma para a descrição que o mesmo parágrafo
 *    pede.
 * 2. **"descrição de uma linha"** → são **duas**, que é o que a captura mostra
 *    (`Connect your DeviantArt account / with Discord. Share your profile…`) e
 *    o que o retângulo comporta com o ícone na horizontal.
 * 3. **A altura sai de 164 para 204.** No Discord o card **não tem botão** — o
 *    "Add to Server" mora só na página do app. O §11 pede o botão no card, e
 *    ele custa 32 de altura mais 16 de folga. Largura mínima, ícone, intervalo,
 *    raio e padding continuam sendo os números medidos; o que muda é só a
 *    altura, e só porque há uma peça a mais dentro. É `min-h-` e não `h-`: numa
 *    linha da grade os cards já esticam juntos (`align-items: stretch`), e uma
 *    altura travada só serviria para cortar conteúdo se a fonte crescer nas
 *    configurações.
 *
 * ## O que é nosso e não do Discord
 *
 * - **A linha "em N servidores" com o glifo de servidor.** No card do Discord
 *   ela vem com uma bússola (o glifo de "descobrir"), que o acervo de
 *   `icones.tsx` não tem; o desenho mais próximo do que a frase diz é o
 *   `Server`. Fica sob o nome, que é onde a captura a põe nos cards pequenos.
 *   O disco da bússola mede ≈12 CSS ali (23 px na captura @2x); 14 é o menor
 *   tamanho em que o `Server` ainda se lê, e é por isso que ele foge dos
 *   16/20/24 do vocabulário de ícones.
 * - **O selo `OFICIAL`.** `AppDoDiretorio.oficial` quer dizer "quem hospeda
 *   esta instância também escreveu este bot" — o lugar do `PARTNER` que o
 *   Discord põe ao lado do nome (`diretorio-home-topo.png`). A forma é a da
 *   pílula `BOT` (`components/ui/TagDeBot.tsx`, medida em `.botTag__82f07`):
 *   15 de altura, raio 4, 12,8px semibold, fundo de marca com texto **escuro**
 *   — branco sobre o Volt Lime dá 1,57:1 (ADR-0009, regra 2 do accent). Não é
 *   `TagDeBot` reaproveitado porque aquele componente escreve "BOT" e é o
 *   contrato de seis outras superfícies.
 *
 * ## Por que o card não é um `<button>` com um botão dentro
 *
 * São dois irmãos. O card inteiro abre a página do app, e "Adicionar" é um
 * botão à parte — aninhar `<button>` em `<button>` é HTML inválido e cada
 * motor desfaz a árvore de um jeito. O `<article>` guarda os dois, o primeiro
 * `<button>` cobre a área com `absolute inset-0`, e o de adicionar fica acima
 * dele no empilhamento.
 *
 * O anel de foco da capa é o **global** do `globals.css` (2px em
 * `--border-focus`, azul). Antes havia um `outline-brand-500` escrito aqui:
 * anel de teclado no Discord não é cor de marca, e a ADR-0009 (regra 2 do
 * accent) mantém o azul de lá.
 *
 * **Todo filho é `shrink-0`.** Sem isso o flex encolhe o texto para caber e o
 * nome sobe por cima da descrição — foi o que a primeira captura mostrou, e é o
 * tipo de coisa que nenhum typecheck pega (§3.3 do processo).
 */

/**
 * A caixa do card, compartilhada com o esqueleto de carregamento: se as duas
 * não tiverem a mesma superfície, borda e raio, a grade "muda de material" no
 * instante em que os dados chegam.
 *
 * `rounded-[8px]` literal, e não `rounded-lg`: 8 é medida da captura, e a
 * escala de fonte das configurações mexeria num raio em `rem`.
 */
const CAIXA_DO_CARD =
  "rounded-[8px] border border-border-subtle bg-background-base-lowest";

/** Altura mínima medida (164 do Discord + os 32+16 do nosso botão). */
const ALTURA_MINIMA = "min-h-[204px]";

export default function CardDeApp({
  app,
  aoAbrir,
  aoAdicionar,
}: {
  app: AppDoDiretorio;
  aoAbrir: () => void;
  aoAdicionar: () => void;
}) {
  return (
    <article
      /* `p-[16px]`/`gap-4` = os 16 medidos por dentro e entre os blocos. A
         largura vem da trilha da grade (ver §3 do cabeçalho). */
      className={`${CAIXA_DO_CARD} ${ALTURA_MINIMA} relative flex flex-col gap-4 p-[16px] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-interactive-background-hover hover:shadow-popout focus-within:-translate-y-px focus-within:bg-interactive-background-hover focus-within:shadow-popout`}
    >
      {/*
        Cobre o card inteiro e abre a página do app — não é `<Button>`/
        `<BotaoDeIcone>`: é a peça "cartão clicável" (regra 3 da migração),
        irmã do botão "Adicionar" abaixo, não um botão de ação com texto.
        O `rounded-[8px]` está aqui para o anel de foco global seguir o canto
        do card em vez de desenhar um retângulo reto por cima dele.
      */}
      <button
        type="button"
        onClick={aoAbrir}
        aria-label={`Ver ${app.name}`}
        className="absolute inset-0 rounded-[8px]"
      />

      {/* o cabeçalho do card: ícone à esquerda, nome e "em N servidores" ao
          lado — é o leiaute da captura (`.appHeader__5a4b6`), e é o que faz 48
          de ícone caberem sem comer a descrição */}
      <div className="pointer-events-none flex shrink-0 items-center gap-4">
        <IconeDoApp app={app} lado={48} />
        {/* `gap-1` = os 4 de `.titleContainer__5a4b6` */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 truncate text-text-md font-semibold text-text-strong">
              {app.name}
            </h3>
            {app.oficial && <SeloDeOficial />}
          </div>
          <p className="flex min-w-0 items-center gap-1.5 text-text-xs text-text-muted">
            <Server size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{textoDeServidores(app.servidores)}</span>
          </p>
        </div>
      </div>

      {/* duas linhas, como na captura. `line-clamp-2` e não `truncate`: uma
          descrição sem espaço nenhum também tem de cortar */}
      <p className="pointer-events-none line-clamp-2 shrink-0 text-text-sm text-text-muted">
        {app.description ?? "Sem descrição."}
      </p>

      {/*
        Continua `<button>`, não `<Button>`: `data-adicionar-app` é seletor do
        e2e (`scripts/e2e-f4-integracao.mjs`) e `ButtonProps` (que estende
        `ButtonHTMLAttributes`, sem índice `data-*` nesta versão de
        `@types/react`) não aceita a prop — passar quebraria o typecheck. Por
        isso as classes **copiam** o `primario` tamanho `sm` do primitivo
        (32 de altura, `px-[11px]`, `text-text-sm`): antes era `bg-brand-500`
        com `hover:brightness-110`, que clareava o limão em vez de escurecer
        como o hover do Discord (`--control-primary-background-hover`).
        `mt-auto` gruda no fundo do card, que é o que mantém os botões de uma
        linha da grade alinhados entre si.
      */}
      <button
        type="button"
        onClick={aoAdicionar}
        data-adicionar-app={app.id}
        className="relative mt-auto inline-flex h-[32px] shrink-0 items-center justify-center self-start rounded-lg border border-control-primary-border-default bg-control-primary-background-default px-[11px] text-text-sm font-medium text-control-primary-text-default transition-colors duration-150 ease-out hover:border-control-primary-border-hover hover:bg-control-primary-background-hover hover:text-control-primary-text-hover active:border-control-primary-border-active active:bg-control-primary-background-active active:text-control-primary-text-active"
      >
        Adicionar ao servidor
      </button>
    </article>
  );
}

/**
 * O esqueleto de um card, enquanto a primeira página não chegou.
 *
 * Mora aqui, e não na grade, porque só quem desenha o card sabe onde ficam o
 * ícone, o nome e as duas linhas de descrição — um esqueleto com outra
 * silhueta é pior que nenhum, porque o conteúdo "pula" ao chegar.
 *
 * `animate-pulse` no invólucro, e não em cada barra: o cartão inteiro pulsa
 * junto (com a borda), que é o que se vê no esqueleto do perfil
 * (`DMProfilePanel`). `aria-hidden` porque quem anuncia o carregamento é o
 * `role="status"` da grade — seis cartões falsos lidos em voz alta seriam seis
 * mentiras.
 */
export function CardDeAppEsqueleto() {
  return (
    <div
      aria-hidden="true"
      className={`${CAIXA_DO_CARD} ${ALTURA_MINIMA} flex animate-pulse flex-col gap-4 p-[16px]`}
    >
      <div className="flex items-center gap-4">
        <span className="h-[48px] w-[48px] shrink-0 rounded-full bg-background-surface-high" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="h-[14px] w-2/3 rounded bg-background-surface-high" />
          <span className="h-[10px] w-1/3 rounded bg-background-surface-high" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="h-[10px] w-full rounded bg-background-surface-high" />
        <span className="h-[10px] w-4/5 rounded bg-background-surface-high" />
      </div>
      <span className="mt-auto h-[32px] w-[152px] rounded-lg bg-background-surface-high" />
    </div>
  );
}

/**
 * O selo de aplicativo **oficial desta instância**.
 *
 * Forma da pílula `BOT` (ver o cabeçalho do arquivo); `role="img"` com rótulo
 * porque em caixa-alta o leitor de tela soletra "O-F-I-C-I-A-L", e porque o
 * que a palavra quer dizer aqui não é óbvio sem a frase inteira.
 */
function SeloDeOficial() {
  return (
    <span
      role="img"
      aria-label="Aplicativo oficial desta instância"
      className="inline-grid h-[15px] shrink-0 select-none place-items-center rounded bg-background-brand px-[4.4px] text-[12.8px] font-semibold uppercase leading-[15px] text-control-primary-text-default"
    >
      Oficial
    </span>
  );
}

/**
 * O ícone do aplicativo: a imagem quando existe, as iniciais quando não.
 *
 * Não usa `Avatar`: ele traz o próprio tamanho de uma tabela fechada (`sm`,
 * `md`, …) e aqui o número é uma medida — 48 no card, 120 na página do app. A
 * cor de fundo é a mesma função do `Avatar` (`corDoAvatar`, derivada do id), o
 * que faz um app sem ícone ter a mesma cara nas duas telas e na lista de
 * membros.
 *
 * `iconUrl` é `null` até o **lote A** publicar o upload e o proxy do ícone; a
 * API já deriva a URL quando a chave existir, e nada aqui muda nesse dia.
 */
export function IconeDoApp({ app, lado }: { app: AppDoDiretorio; lado: number }) {
  const estilo = { width: lado, height: lado };
  if (app.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.iconUrl}
        alt=""
        style={estilo}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...estilo, backgroundColor: corDoAvatar(app.id), fontSize: Math.round(lado / 2.5) }}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-text-overlay-light"
    >
      {app.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** "em N servidores" — o número inteiro, não "os meus". */
export function textoDeServidores(n: number): string {
  if (n === 0) return "Ainda não está em nenhum servidor";
  return n === 1 ? "Em 1 servidor" : `Em ${n} servidores`;
}
