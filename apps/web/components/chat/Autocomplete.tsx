"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Uma linha da lista de sugestões. */
export interface ItemAutocomplete {
  chave: string;
  /** texto que entra no composer no lugar do gatilho (já com `@`, `#`…). */
  valor: string;
  rotulo: string;
  /** segunda linha/coluna: username por trás do apelido, descrição do comando. */
  detalhe?: string;
  /** cor do rótulo — cargo do membro ou cor do próprio cargo. */
  cor?: string;
  /** avatar, imagem do emoji, ícone do canal. */
  icone?: ReactNode;
  /**
   * Linha visível mas inerte — sem permissão (`"Sem permissão para mencionar
   * todos"`) ou indisponível por outro motivo. `true` sem texto usa "(em
   * breve)", como o resto do app trata funcionalidade que ainda não existe.
   *
   * Já tem produtor: `montarSugestoes` (`components/chat/composer/
   * sugestoes.tsx`) filtra `@everyone`/`@here` da lista quando falta
   * `MENTION_EVERYONE` — não marca a linha como desabilitada, simplesmente não
   * a inclui. O campo fica pronto para quando `sugestoesDeOpcao` ou outra
   * fonte precisar mostrar (e não só esconder) um item sem permissão.
   */
  desabilitado?: string | true;
}

/**
 * Como cada gatilho nomeia a seção, já preparado para receber o termo. Caixa
 * normal — o cabeçalho não é mais `uppercase` (ver o bloco de medidas abaixo),
 * mesma caixa que `TITULO_GATILHO` (`composer/sugestoes.tsx`) já usa.
 */
const TITULO: Record<string, string> = {
  ":": "Emojis correspondendo a",
  "@": "Membros correspondendo a",
  "#": "Canais de texto correspondendo a",
  "/": "Comandos correspondendo a",
};

/**
 * Lista de sugestões do composer (`:` `@` `#`) — o `/` tem seletor próprio
 * (`SeletorDeComandos`, agrupado por app).
 *
 * Só desenha: quem detecta o gatilho, monta os itens e trata as teclas é o
 * composer — o campo de texto precisa continuar sendo o dono do foco, senão
 * digitar e escolher com o teclado brigariam. Por isso o item selecionado chega
 * por prop e a navegação por seta acontece lá. Por isso também **não há estado
 * de foco de verdade aqui**: o "foco" da lista é o `selecionado` (mesmo
 * tratamento do Discord — `aria-selected`, não `:focus`).
 *
 * Medidas, todas de `docs/referencias-discord/tokens/css-bruto/862735.
 * 30278509527ce174.css`, módulo `__13533` (o mesmo que `SeletorDeComandos.tsx`
 * já usa para as próprias linhas — aqui só faltava aplicar no @ # :):
 * - superfície: `.autocomplete__13533{background-color:var(--background-
 *   surface-high)}` — era `bg-background-base-lowest`, mais escuro que o
 *   Popout (confirmado também no pixel do popup do seletor de emoji 1:1,
 *   `docs/Reference/Captura de tela 2026-08-31 120846.png` linha 650:
 *   `#242429`, igual ao token);
 * - caixa flutuante com folga de 8px, não encostada: `.autocomplete__6b0e0.
 *   autocompleteAttached__6b0e0{bottom:calc(100% + 8px)}` (`css-bruto/116815.
 *   875a0330d71c7d69.css`) e raio nos 4 cantos (`border-radius:5px`), não só
 *   em cima — o comentário anterior ("encosta, raio só em cima") não tinha
 *   essa referência; `left-2.5`/`right-[18px]` repete o que `SeletorDeComandos.
 *   tsx` já mediu para o mesmo espaço (o popup dele ocupa o mesmo lugar);
 * - linha: `.autocompleteRow__13533{font-size:14px;font-weight:500;
 *   line-height:16px;padding:0 8px}` por fora, `.base__13533{border-radius:
 *   3px;padding:8px}` por dentro (a "pílula" de hover/seleção, recuada dos
 *   8px de fora — por isso a linha vira `<li className="px-2">` com o botão
 *   `rounded-[3px] p-2` dentro, não um padding só); ícone
 *   `.autocompleteRowIcon__13533{margin-inline-end:8px}` (`mr-2`); coluna da
 *   direita `.autocompleteRowContentSecondary__13533{margin-inline-start:
 *   var(--space-16);min-width:10ch;text-align:end}` — **sem** `font-size`
 *   próprio, herda os 14px da linha (era `text-xs`, ficava menor que o
 *   rótulo à toa);
 * - seleção/hover: `.clickable__13533[aria-selected=true]>.base__13533{
 *   background-color:var(--interactive-background-hover)}` — era
 *   `bg-interactive-background-selected` (a cor errada: 0,2 de alfa contra os
 *   0,1216 do hover, que é o token que o Discord usa aqui);
 * - ícone/avatar da linha: a revisão visual mediu ≈32px no catálogo (ícone do
 *   app de referência a 64px ÷ escala 2,0 aferida — `desenvolvedores/imagens/
 *   comandos/autocomplete-comando-simples.png`); o slot deste componente virou
 *   `h-8 w-8` (32) para bater, igual ao que `SeletorDeComandos.tsx` já usa
 *   (`Avatar size="md"`). O avatar em si também já é `md` (32) —
 *   `components/chat/composer/sugestoes.tsx:204` — não há mais o descompasso
 *   com o slot de 24 que uma versão anterior deste comentário apontava;
 * - cabeçalho: a variante `mana-type-consolidation` do CSS bruto (`862735.
 *   30278509527ce174.css`) troca `.contentTitle__13533` de `text-transform:
 *   uppercase` para `{font-size:14px;font-weight:var(--font-weight-medium);
 *   text-transform:none}` — a mesma que `SearchPanel.tsx` já usa nos títulos
 *   de seção dele. Por isso o `<p>` daqui é `text-text-sm font-medium
 *   normal-case`, sem `.toUpperCase()` em cima do rótulo nem do termo
 *   digitado (o Discord preserva o que a pessoa escreveu). O `<strong>` com o
 *   termo fica `text-text-subtle` — no tema Dark resolve para a mesma cor que
 *   `--interactive-text-default` (`tokens/VARIAVEIS.md` linhas 53 e 68: mesma
 *   coluna), então a diferença visível entre rótulo e termo é só o peso
 *   (negrito do próprio `<strong>` contra o `font-medium` do resto da linha),
 *   não a cor — a leitura de pixel da revisão (rótulo cinza, termo branco) não
 *   bate com os tokens iguais, ver "nao_verificado";
 * - vazio: `.noAutocompleteResults__3b122{height:200px}` (`css-bruto/
 *   sob-demanda/0d62866b693a2d53.css`) prova que o Discord **não** fecha o
 *   popup com zero resultado — mostra algo. Sem a ilustração dele (não há
 *   referência do desenho), a linha vazia daqui é só texto, numa caixa do
 *   tamanho de uma linha normal, não os 200px medidos (não localizados: ver
 *   "nao_verificado"). Vazio e carregando **são** estados atingíveis: quem usa
 *   este componente decide se chama com `itens` vazio ou com `carregando`,
 *   sem checagem aqui que os torne inertes (uma versão anterior deste
 *   comentário dizia o contrário para o vazio). O spinner do "Carregando…"
 *   segue como texto simples — nenhuma referência de desenho do Discord para
 *   ele foi localizada, então nada foi desenhado além do texto.
 *
 * A faixa de dicas de teclado ("↑↓ navegar · enter escolher · esc sair") saiu:
 * o Discord não tem — a única referência de tecla que ele mostra é o chip
 * "TAB" dentro da própria linha selecionada (`suporte/imagens/discord-basics/
 * 35692242798743-mention-suggestions-faq/01.png`), não uma legenda fixa embaixo
 * da lista.
 */
export default function Autocomplete({
  titulo,
  termo,
  gatilho,
  itens,
  selecionado,
  onEscolher,
  onPassarMouse,
  carregando,
  erro,
  mensagemVazia,
}: {
  /** rótulo genérico da seção, usado quando o gatilho não tem título próprio. */
  titulo: string;
  /** o que já foi digitado depois do gatilho — entra no título da seção. */
  termo?: string;
  gatilho?: string;
  itens: ItemAutocomplete[];
  selecionado: number;
  onEscolher: (item: ItemAutocomplete) => void;
  onPassarMouse: (indice: number) => void;
  /**
   * A lista de hoje (`:` `@` `#`) nunca carrega de forma assíncrona — membro,
   * canal e emoji já estão nas stores quando a pessoa digita — então nenhum
   * chamador passa isto ainda. Existe para quando uma fonte deixar de ser
   * síncrona (busca de emoji no servidor, por exemplo) sem redesenhar o
   * popout de novo.
   */
  carregando?: boolean;
  /** mesma ressalva do `carregando`: sem fonte que falhe hoje, sem chamador. */
  erro?: string;
  /** troca a mensagem padrão de "sem resultado" (ex.: motivo específico do gatilho). */
  mensagemVazia?: string;
}) {
  const listaRef = useRef<HTMLUListElement>(null);

  // mantém o selecionado visível quando a navegação é por teclado
  useEffect(() => {
    const el = listaRef.current?.children[selecionado] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  const base = (gatilho && TITULO[gatilho]) ?? titulo;

  return (
    <div className="absolute bottom-[calc(100%+8px)] left-2.5 right-[18px] z-[60] overflow-hidden rounded-[5px] bg-background-surface-high shadow-popout celular:left-3 celular:right-3">
      <p className="flex items-baseline gap-1 px-4 py-1 text-text-sm font-medium normal-case text-interactive-text-default">
        <span className="truncate">{base}</span>
        {/* preserva o que foi digitado como foi digitado — a cor muda
            (text-subtle), o peso vem de graça do <strong> (ver cabeçalho) */}
        {gatilho && <strong className="min-w-0 truncate text-text-subtle">{gatilho}{termo ?? ""}</strong>}
      </p>

      {/* carregando/vazio/falhou são estados de status, não conteúdo — o
          leitor de tela precisa anunciá-los mesmo sem o foco estar aqui */}
      {erro ? (
        <p role="status" aria-live="polite" className="px-4 py-3 text-text-sm text-text-feedback-critical">
          {erro}
        </p>
      ) : carregando ? (
        <p role="status" aria-live="polite" aria-busy="true" className="px-4 py-3 text-text-sm text-text-muted">
          Carregando…
        </p>
      ) : itens.length === 0 ? (
        <p role="status" aria-live="polite" className="px-4 py-3 text-text-sm text-text-muted">
          {mensagemVazia ?? "Nenhum resultado encontrado."}
        </p>
      ) : (
        <ul ref={listaRef} role="listbox" aria-label={gatilho ? `${base} ${gatilho}${termo ?? ""}` : base} className="max-h-[360px] overflow-y-auto pb-2">
          {itens.map((item, i) => {
            const podeEscolher = !item.desabilitado;
            return (
              <li key={item.chave} className="px-2">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === selecionado}
                  aria-disabled={podeEscolher ? undefined : true}
                  disabled={!podeEscolher}
                  // passar o mouse já move a seleção: um `hover:` por cima disso
                  // acendia duas linhas ao mesmo tempo
                  onMouseEnter={() => podeEscolher && onPassarMouse(i)}
                  // mousedown em vez de click: o clique tiraria o foco do textarea
                  // antes de a escolha ser aplicada, e o popup fecharia no meio
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (podeEscolher) onEscolher(item);
                  }}
                  className={`flex w-full items-center rounded-[3px] p-2 text-left disabled:cursor-not-allowed ${
                    i === selecionado && podeEscolher ? "bg-interactive-background-hover" : ""
                  }`}
                >
                  {item.icone && (
                    <span className={`mr-2 grid h-8 w-8 shrink-0 place-items-center ${podeEscolher ? "" : "opacity-40"}`}>
                      {item.icone}
                    </span>
                  )}
                  <span
                    style={item.cor && podeEscolher ? { color: item.cor } : undefined}
                    className={`min-w-[10ch] flex-1 shrink truncate text-text-sm font-medium ${
                      podeEscolher ? "text-text-default" : "text-text-muted"
                    }`}
                  >
                    {item.rotulo}
                  </span>
                  {(item.detalhe || (item.desabilitado && item.desabilitado !== true)) && (
                    <span className="ml-4 min-w-[10ch] shrink-0 truncate text-end text-text-sm text-text-muted">
                      {podeEscolher ? item.detalhe : item.desabilitado === true ? "(em breve)" : item.desabilitado}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
