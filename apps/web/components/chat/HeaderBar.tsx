"use client";

import { useState, type ReactNode } from "react";
import { Search } from "@/components/ui/icones";
import { Tooltip } from "@/components/ui/primitivos";

export { default as HeaderIcon } from "@/components/chat/HeaderIcon";

/**
 * Cabeçalho do canal e da conversa: ícone + nome à esquerda, toolbar à direita
 * com a busca no fim.
 *
 * **Ele atravessa a área de conteúdo inteira** — é a peça que este arquivo
 * entrega, e não só uma barra. No Discord a barra vai do fim da coluna de
 * canais até a borda da janela, **por cima** da coluna de membros, e a coluna
 * de membros começa embaixo dela. Medido no print 1:1 `2026-09-02 180835`
 * (janela de 1919, barra de título de 32px no topo):
 *
 * - em `y=57` a barra é `#1a1a1e` contínuo de `x=375` (fim da coluna de
 *   canais) até `x=1918` (borda da janela), com a busca em `x1662–1905` — ou
 *   seja, sobre a coluna de membros;
 * - a divisória da coluna de membros (`#29292d` em `x=1651`) **não** existe em
 *   `y=57` e aparece a partir de `y=82`, logo abaixo da linha de baixo do
 *   cabeçalho (`#29292d` em `y=81`);
 * - a coluna `x=1912` dá a altura: `y 33–80` de barra (48px) + 1px de linha em
 *   `y=81` = os 49 do `--custom-channel-header-height` do CSS bruto
 *   (`858942…css`, `.container__9293f`).
 *
 * Como o `ChatView` e o `DMView` montam a timeline e a coluna 4 de jeitos
 * diferentes, quem faz a travessia é a própria barra: ela é `absolute` sobre a
 * **região de conteúdo** — o invólucro `relative` que `app/app/page.tsx` põe em
 * volta da conversa e da lista de membros — e deixa no fluxo, no lugar dela, um
 * espaçador de 49px. Assim o `<main>` de quem chama continua sendo uma coluna
 * que começa com 49px de cabeçalho, como antes, e a lista de membros, que é
 * irmã da conversa dentro da região, cabe embaixo da barra com um `pt-[49px]`.
 * **Um chamador novo precisa desse invólucro `relative`**: sem ele a barra se
 * ancora na janela.
 *
 * A toolbar carrega só o que age sobre o canal aberto: ações genéricas do app
 * (ajuda, caixa de entrada) e o que já existe no menu de contexto do canal
 * (configurações do servidor) ficam de fora para não poluir a barra.
 *
 * Quem chama entrega a fileira inteira em `tools`, na ordem do Discord — o
 * alfinete fica no meio dela (threads → sino → alfinete → membros no servidor;
 * telefone → vídeo → alfinete → adicionar → perfil na conversa), então não há
 * um lugar fixo "das fixadas" aqui.
 *
 * Medido no print do Discord (1919px): caixas de ícone com passo de 42px
 * (centros da tinta em 1507,5 / 1547,5 / 1590 / 1629 no `180835`) e a busca de
 * 244×32, raio 8 (`--radius-sm`), texto a 8px da borda.
 */
export default function HeaderBar({
  icon,
  title,
  subtitle,
  tools,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearch,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** botões antes da busca, já na ordem (variam entre canal e DM). */
  tools?: ReactNode;
  searchLabel: string;
  /** vai no placeholder: no Discord é "Buscar <servidor|usuário|grupo>", não um "Buscar" solto. */
  searchPlaceholder?: string;
  /** consulta em vigor — mantém o campo preenchido ao reabrir a busca. */
  searchValue?: string;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(searchValue ?? "");

  return (
    <>
      {/* O lugar da barra no fluxo da coluna: ela mesma está fora dele (ver o
          cabeçalho do arquivo), e sem este bloco a timeline subiria por baixo. */}
      <div aria-hidden="true" className="h-[49px] shrink-0" />

      {/* `bg-background-base-lower`: agora que a barra flutua sobre a região,
          ela precisa do próprio fundo — e é o do Discord, `#1a1a1e`, tanto no
          CSS (`--__header-bar-background` de `.container__9293f`) quanto no
          print (`180835`, x=600 y=57).
          Sem sombra: no print a linha de 1px (`#29292d`, y=81) é seguida por
          `#1a1a1e` puro (x=900, y 82–100), enquanto a nossa `shadow-elevation-low`
          borrava 2px por baixo dela (`canal-texto.png`, x=900: #121216 em y=49 e
          #18181b em y=50). O CSS do Discord também traz `box-shadow:none`. */}
      <header className="absolute inset-x-0 top-0 z-10 flex h-[49px] items-center gap-2 border-b border-border-subtle bg-background-base-lower px-4">
        {/* `text-channel-icon` (#81828a) e não `text-text-muted` (#96979e): é o
            `--channel-icon` do CSS (`.icon__9293f`), e a tinta do "#" no print
            `180835` (y=50, x=401) mede #81828a. Em DM o `icon` é um avatar e a
            classe não pinta nada. */}
        <span className="text-channel-icon" aria-hidden="true">
          {icon}
        </span>
        {/* `min-w-0` é o que faz o `truncate` valer dentro de um flex: sem ele o
            título empurra a toolbar para fora em vez de cortar o próprio texto */}
        <h1 className="min-w-0 truncate font-semibold text-text-strong">{title}</h1>
        {subtitle && (
          <>
            <span aria-hidden="true" className="mx-2 h-6 w-px bg-border-subtle" />
            <span className="truncate text-sm text-text-muted">{subtitle}</span>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-[18px]">
          {tools}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch(query);
            }}
            className="relative"
          >
            {/* continua <input> nativo, não `TextInput`: o primitivo não expõe
                tamanho nem o par de tokens de campo desta caixa — ver cartão m14
                em "faltando". */}
            <Tooltip rotulo="Filtros: from:@usuário in:#canal has:link|image|file before:AAAA-MM-DD after:AAAA-MM-DD mentions:@usuário">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                aria-label={searchLabel}
                placeholder={searchPlaceholder ?? "Buscar"}
                /* fixa, não mais expansível: no Discord a caixa já nasce do
                   tamanho final. A busca que cresce ao focar empurrava os ícones
                   vizinhos e fazia a barra inteira dançar a cada clique.
                   244×32 e raio 8: print `180835`, linha y=57 (bordas em x=1662
                   e x=1905) e coluna x=1750 (bordas em y=41 e y=72).
                   Os tokens são os do campo do Discord — `.searchBar_c322aa` do
                   CSS bruto (`398929…css`) é `background:var(--input-background-default)`
                   com `border:1px solid var(--input-border-default)` e
                   `border-radius:var(--radius-sm)`. `--input-background-default`
                   (preto a 12%) sobre `--background-base-lower` dá exatamente o
                   #17171a do print; a borda mede #303035. Antes usávamos
                   `bg-background-base-lowest`/`border-border-subtle` (#121214 e
                   #212124), que eram o mais próximo antes de a escala do Discord
                   entrar — agora o par certo existe e é este. */
                className="h-[32px] w-[244px] rounded-lg border border-input-border-default bg-input-background-default pl-2 pr-[30px] text-sm text-text-default outline-none placeholder:text-text-muted"
              />
            </Tooltip>
            <Search
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute right-[5px] top-1/2 -translate-y-1/2 text-text-muted"
            />
          </form>
        </div>
      </header>
    </>
  );
}
