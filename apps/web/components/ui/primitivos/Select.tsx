"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as KeyboardEventDoReact,
  type ReactNode,
} from "react";

import { Check, ChevronDown, X } from "@/components/ui/icones";
import { Popout } from "./Popout";

/**
 * Select do Discord (refresh 2025): módulo `_a16aea` em
 * `css-bruto/376991.56e2ea647b4a55b8.css`.
 *
 * Especificação medida (cartão 0.4-select implementa):
 * - Caixa fechada: `min-height` 40 (`md`) / 32 (`sm`), padding 8 × 12 à
 *   esquerda e 8 à direita, grade `1fr auto` com gap 8, texto `--text-default`
 *   peso 500, placeholder `--text-subtle`, chevron à direita. Fundo/borda: os do
 *   TextInput (`--input-*`) — o CSS do select não os declara; conferir no print.
 * - Lista aberta: fundo `--background-surface-higher`, borda 1px
 *   `--border-subtle`, raio 8, 8 abaixo da caixa (ou acima, com o raio
 *   invertido, se não couber), largura da caixa. Opção: padding 12, 16/20 (≈44
 *   de altura), hover `--interactive-background-hover` +
 *   `--interactive-text-hover`, selecionada `--interactive-background-selected`
 *   + peso 500 + ícone de check à direita em `--brand-500` (limão). Sem
 *   divisória entre opções. Desabilitada: opacidade .5.
 * - Busca (`buscavel`): campo sem borda no topo da lista, 16px; "sem
 *   resultados" com padding 12 sobre `--background-base-lower`.
 * - Múltiplo: valores viram pílulas (`--background-base-low`, raio 4, padding
 *   4×8, 14/20) com "×" de 16; na lista, checkbox de 20 com raio 6 (limão com
 *   visto escuro quando marcado).
 * - Teclado: setas navegam, Enter escolhe, Esc fecha, Tab sai; `role=listbox`.
 * - Usa o `Popout` (`./Popout`) para a lista, para herdar posição e colisão.
 *
 * ## Implementação (o que o CSS/print não fixam, decisão deste cartão)
 *
 * Sem print 1:1 de um select aberto do Discord em `docs/Reference/` (procurado
 * e não encontrado — ver `nao_verificado` da entrega); o corpo abaixo segue só
 * o CSS/tokens do cabeçalho.
 *
 * - **Foco fica na caixa, nunca na opção.** As opções são `role=option`
 *   `tabIndex={-1}` (fora do `FOCALIZAVEL` do `Popout`, então o `Tab` não para
 *   nelas); a seleção "de teclado" é só `aria-activedescendant` na caixa (ou no
 *   campo de busca), como um combobox ARIA 1.2 de verdade — é por isso que dá
 *   para navegar com o popout aberto sem o foco pular de elemento em elemento a
 *   cada seta. Clique em opção usa `onMouseDown`+`preventDefault` (o padrão já
 *   usado no `Autocomplete` do composer) para o mesmo motivo: não roubar foco
 *   da caixa/campo.
 * - **A caixa é `role=combobox` num `<div>`, não um `<button>`.** O múltiplo
 *   põe um `<button>` de remover dentro de cada pílula — não dá para aninhar
 *   `<button>` em `<button>` (inválido em HTML), e um componente só serve os
 *   dois modos.
 * - **Sem `buscavel`: digitar na caixa pula (typeahead)** — acumula o buffer
 *   por 700ms (não medido) e ativa a primeira opção cujo rótulo começa com ele,
 *   abrindo a lista se estiver fechada. **Com `buscavel`: digitar na caixa abre
 *   a lista e começa a busca** (o foco vai para o campo, que a recebe pelo
 *   `focarAoAbrir` do `Popout`) — dois jeitos de "pular" porque, com busca,
 *   pular por prefixo do rótulo é redundante com filtrar.
 * - **Home/End dentro do campo de busca continuam movendo o cursor do texto**,
 *   não a opção ativa — sequestrar as duas teclas ali quebraria a edição do
 *   termo digitado. Fora do campo (a caixa fechada ou sem `buscavel`), as duas
 *   vão para a primeira/última opção.
 * - **`maximo` do `MultiSelect`** só trava escolher opção nova (o clique/Enter
 *   não muda o valor); não desabilita visualmente as opções não marcadas — o
 *   cabeçalho não especifica esse estado, e inventar uma opacidade seria
 *   medida não verificada.
 * - **A lista usa o fundo/raio/sombra do `Popout`, não `--background-surface-
 *   higher` + borda 1px `--border-subtle`** do parágrafo de medida acima. O
 *   `Popout` (proibido de editar neste cartão) já fixa `--background-surface-
 *   high` + `shadow-popout`, medido em três prints 1:1 próprios (ver o
 *   cabeçalho dele) — é uma medida mais recente e mais forte (prints, não só
 *   CSS) que a deste arquivo, e reescrever por cima com `className` não colaria
 *   de verdade: utilitário do Tailwind não tem prioridade por ordem no `class=`,
 *   só por ordem na folha gerada, então uma classe de fundo "por cima" no
 *   `className` do Popout não teria como vencer a dele de forma confiável.
 *   Melhor um só popout com um visual, do que dois concorrendo pela mesma
 *   propriedade.
 * - **`aoFechar`** (rodada de correção): avisa **toda** vez que a lista aberta
 *   fecha — Esc, clique fora, Tab, clique na caixa, escolha no único. É o gancho
 *   do "mandar ao fechar" do select de componente de bot (o Discord só dispara
 *   a interação do múltiplo quando a lista fecha, nunca a cada marcação). No
 *   único ele roda **depois** do `aoMudar` da escolha, na mesma leva.
 * - **`carregando`** (rodada de correção): o spinner no lugar do chevron e a
 *   caixa travada (não abre, não remove pílula, teclado ignorado), sem a
 *   opacidade .5 do desabilitado — é o estado do select de bot enquanto a
 *   interação anterior não voltou. O spinner (16, borda 2, `--border-normal`
 *   com o topo `--text-muted`) é o mesmo anel do app (`MessageList`,
 *   `QuickSwitcher`) no tamanho do chevron; **não medido** no Discord. O
 *   cursor `wait` também é decisão, não medida.
 */
export interface OpcaoDeSelect<T extends string = string> {
  valor: T;
  rotulo: string;
  desabilitada?: boolean;
  /** Ícone/avatar à esquerda do rótulo. */
  prefixo?: ReactNode;
  /** Linha secundária sob o rótulo. */
  descricao?: string;
  /**
   * Selo à direita do rótulo, antes do check — a pílula de bot do
   * `select-de-usuario.webp` (doc oficial do Discord: o "APP" de Helper fica
   * encostado na borda direita da linha, não junto do avatar).
   */
  sufixo?: ReactNode;
}

interface SelectBaseProps<T extends string> {
  opcoes: OpcaoDeSelect<T>[];
  placeholder?: string;
  desabilitado?: boolean;
  /** `md` 40 (padrão), `sm` 32. */
  tamanho?: "sm" | "md";
  /** Campo de busca no topo da lista. */
  buscavel?: boolean;
  id?: string;
  /** Nome acessível quando não há `<label htmlFor>`. */
  rotulo?: string;
  className?: string;
  /** A lista aberta fechou, por qualquer caminho (ver "`aoFechar`" no cabeçalho). */
  aoFechar?: () => void;
  /** Spinner no lugar do chevron e caixa travada, sem esmaecer (ver "`carregando`" no cabeçalho). */
  carregando?: boolean;
}

export interface SelectProps<T extends string = string> extends SelectBaseProps<T> {
  valor: T | null;
  aoMudar: (valor: T) => void;
}

export interface MultiSelectProps<T extends string = string> extends SelectBaseProps<T> {
  valor: T[];
  aoMudar: (valor: T[]) => void;
  maximo?: number;
}

/* ------------------------------------------------------------------ */
/* utilidades de lista                                                 */
/* ------------------------------------------------------------------ */

function normalizar(s: string): string {
  return s.trim().toLocaleLowerCase("pt-BR");
}

function filtrarOpcoes<T extends string>(opcoes: OpcaoDeSelect<T>[], busca: string): OpcaoDeSelect<T>[] {
  if (!busca) return opcoes;
  const alvo = normalizar(busca);
  return opcoes.filter((o) => normalizar(o.rotulo).includes(alvo));
}

function primeiroHabilitado<T extends string>(lista: OpcaoDeSelect<T>[]): number {
  return lista.findIndex((o) => !o.desabilitada);
}

function ultimoHabilitado<T extends string>(lista: OpcaoDeSelect<T>[]): number {
  for (let i = lista.length - 1; i >= 0; i--) if (!lista[i].desabilitada) return i;
  return -1;
}

/** Próxima opção habilitada na `direcao`, sem dar a volta (para no limite). */
function proximoHabilitado<T extends string>(lista: OpcaoDeSelect<T>[], de: number, direcao: 1 | -1): number {
  let i = de;
  for (let passos = 0; passos < lista.length; passos++) {
    i += direcao;
    if (i < 0 || i >= lista.length) return de;
    if (!lista[i].desabilitada) return i;
  }
  return de;
}

function idDaOpcao<T extends string>(idBase: string, valor: T): string {
  return `${idBase}-opcao-${encodeURIComponent(valor)}`;
}

/* ------------------------------------------------------------------ */
/* estado do combobox (aberto, busca, opção "ativa" por teclado)       */
/* ------------------------------------------------------------------ */

function useComboBox<T extends string>(
  opcoes: OpcaoDeSelect<T>[],
  /** `desabilitado || carregando`: nenhum dos dois abre a lista. */
  bloqueado: boolean,
  ehSelecionado: (valor: T) => boolean,
  aoFechar: (() => void) | undefined,
) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativoValor, setAtivoValor] = useState<T | null>(null);

  const opcoesFiltro = useMemo(() => filtrarOpcoes(opcoes, busca), [opcoes, busca]);
  const indiceAtivo = ativoValor === null ? -1 : opcoesFiltro.findIndex((o) => o.valor === ativoValor);

  // a busca (ou a lista) mudou e a opção ativa saiu do resultado: pousa na
  // primeira habilitada em vez de ficar com `aria-activedescendant` apontando
  // para nada
  useEffect(() => {
    if (!aberto || indiceAtivo !== -1) return;
    const i = primeiroHabilitado(opcoesFiltro);
    setAtivoValor(i === -1 ? null : opcoesFiltro[i].valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indiceAtivo é derivado de opcoesFiltro/ativoValor
  }, [opcoesFiltro, aberto]);

  function abrirCom(valor: T | null) {
    if (bloqueado || opcoes.length === 0) return;
    setBusca("");
    setAtivoValor(valor);
    setAberto(true);
  }

  /** Abre pousando na opção já escolhida (ou na primeira habilitada). */
  function abrir() {
    const iSel = opcoes.findIndex((o) => ehSelecionado(o.valor) && !o.desabilitada);
    const i = iSel !== -1 ? iSel : primeiroHabilitado(opcoes);
    abrirCom(i === -1 ? null : opcoes[i].valor);
  }

  function fechar() {
    // só avisa quem abriu: fechar o que já está fechado não é um "fechou"
    if (!aberto) return;
    setAberto(false);
    aoFechar?.();
  }

  function mover(direcao: 1 | -1) {
    if (!aberto) {
      abrir();
      return;
    }
    if (indiceAtivo === -1) {
      const i = primeiroHabilitado(opcoesFiltro);
      if (i !== -1) setAtivoValor(opcoesFiltro[i].valor);
      return;
    }
    const i = proximoHabilitado(opcoesFiltro, indiceAtivo, direcao);
    setAtivoValor(opcoesFiltro[i].valor);
  }

  function irPara(extremo: "inicio" | "fim") {
    if (!aberto) {
      abrir();
      return;
    }
    const i = extremo === "inicio" ? primeiroHabilitado(opcoesFiltro) : ultimoHabilitado(opcoesFiltro);
    if (i !== -1) setAtivoValor(opcoesFiltro[i].valor);
  }

  return {
    aberto,
    busca,
    setBusca,
    opcoesFiltro,
    indiceAtivo,
    definirAtivo: setAtivoValor,
    abrir,
    abrirCom,
    fechar,
    mover,
    irPara,
  };
}

/* ------------------------------------------------------------------ */
/* corpo compartilhado (caixa + Popout da lista)                       */
/* ------------------------------------------------------------------ */

interface CorpoDoSelectProps<T extends string> {
  opcoes: OpcaoDeSelect<T>[];
  opcoesEscolhidas: OpcaoDeSelect<T>[];
  placeholder?: string;
  desabilitado?: boolean;
  tamanho: "sm" | "md";
  buscavel: boolean;
  id?: string;
  rotulo?: string;
  className: string;
  multiplo: boolean;
  ehSelecionado: (valor: T) => boolean;
  aoEscolher: (opcao: OpcaoDeSelect<T>) => void;
  /** Só no múltiplo: remover pela pílula. */
  aoRemover?: (valor: T) => void;
  aoFechar?: () => void;
  carregando: boolean;
}

function CorpoDoSelect<T extends string>({
  opcoes,
  opcoesEscolhidas,
  placeholder,
  desabilitado,
  tamanho,
  buscavel,
  id,
  rotulo,
  className,
  multiplo,
  ehSelecionado,
  aoEscolher,
  aoRemover,
  aoFechar,
  carregando,
}: CorpoDoSelectProps<T>) {
  const idGerado = useId();
  const idBase = id ?? idGerado;
  const idLista = `${idBase}-lista`;

  const bloqueado = !!desabilitado || carregando;
  const combo = useComboBox(opcoes, bloqueado, ehSelecionado, aoFechar);
  const { aberto, busca, setBusca, opcoesFiltro, indiceAtivo, definirAtivo, abrir, abrirCom, fechar, mover, irPara } =
    combo;

  const gatilhoRef = useRef<HTMLDivElement>(null);
  const [larguraDaLista, setLarguraDaLista] = useState<number>();

  // a lista fica com a largura da caixa (medida ao abrir e nas mudanças de
  // tamanho dela — a rotação de celular, por exemplo)
  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => setLarguraDaLista(gatilhoRef.current?.offsetWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(medir);
    if (gatilhoRef.current) obs.observe(gatilhoRef.current);
    return () => obs.disconnect();
  }, [aberto]);

  function escolher(o: OpcaoDeSelect<T>) {
    if (o.desabilitada) return;
    aoEscolher(o);
    // único fecha ao escolher; múltiplo continua aberto para marcar mais de um
    if (!multiplo) fechar();
  }

  function confirmarAtivo() {
    if (indiceAtivo === -1) return;
    escolher(opcoesFiltro[indiceAtivo]);
  }

  // digitar-para-pular: buffer curto de teclas, some depois de uma pausa
  const bufferRef = useRef("");
  const timeoutRef = useRef<number>();
  function digitarParaPular(e: KeyboardEventDoReact<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    if (buscavel) {
      // com busca, "pular" é abrir e começar a digitar o filtro — o
      // `setBusca("")` de dentro de `abrir()`/`abrirCom` roda antes deste
      // `setBusca`, na mesma leva de estado, então o valor final é só a tecla
      if (!aberto) abrir();
      setBusca((atual) => atual + e.key);
      return;
    }
    window.clearTimeout(timeoutRef.current);
    bufferRef.current += e.key.toLocaleLowerCase("pt-BR");
    const alvo = bufferRef.current;
    const i = opcoes.findIndex((o) => !o.desabilitada && normalizar(o.rotulo).startsWith(alvo));
    if (i !== -1) {
      if (aberto) definirAtivo(opcoes[i].valor);
      else abrirCom(opcoes[i].valor);
    }
    timeoutRef.current = window.setTimeout(() => {
      bufferRef.current = "";
    }, 700);
  }

  function aoTeclarNoGatilho(e: KeyboardEventDoReact<HTMLDivElement>) {
    if (bloqueado) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        mover(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        mover(-1);
        break;
      case "Home":
        e.preventDefault();
        irPara("inicio");
        break;
      case "End":
        e.preventDefault();
        irPara("fim");
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!aberto) abrir();
        else confirmarAtivo();
        break;
      case "Tab":
        // não faz `preventDefault`: o foco segue seu caminho normal, a lista
        // só fecha atrás dele — é o "Tab sai" do cabeçalho
        if (aberto) fechar();
        break;
      default:
        digitarParaPular(e);
    }
  }

  function aoTeclarNaBusca(e: KeyboardEventDoReact<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        mover(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        mover(-1);
        break;
      case "Enter":
        e.preventDefault();
        confirmarAtivo();
        break;
      // Home/End ficam para o cursor do texto do campo — não roubar a edição
      // do termo de busca.
    }
  }

  const idAtivo = indiceAtivo !== -1 ? idDaOpcao(idBase, opcoesFiltro[indiceAtivo].valor) : undefined;
  const alturaFechada = multiplo
    ? tamanho === "sm"
      ? "min-h-[32px]"
      : "min-h-[40px]"
    : tamanho === "sm"
      ? "h-[32px]"
      : "h-[40px]";

  return (
    <>
      <div
        ref={gatilhoRef}
        id={idBase}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-activedescendant={aberto ? idAtivo : undefined}
        aria-label={rotulo}
        aria-disabled={desabilitado || undefined}
        aria-busy={carregando || undefined}
        tabIndex={desabilitado ? -1 : 0}
        onClick={() => {
          if (bloqueado) return;
          if (aberto) fechar();
          else abrir();
        }}
        onKeyDown={aoTeclarNoGatilho}
        className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-input-border-default bg-input-background-default py-2 pl-3 pr-2 ${alturaFechada} ${
          // sem `pointer-events-none`: o div não tem `disabled` nativo (não é
          // input), então o clique/tecla é barrado pelos handlers (`if
          // (desabilitado) return`) — `pointer-events-none` tiraria o
          // elemento do hit-test e o `cursor-not-allowed` deixaria de aparecer
          desabilitado ? "cursor-not-allowed opacity-50" : carregando ? "cursor-wait" : "cursor-pointer"
        } ${className}`}
      >
        {multiplo ? (
          opcoesEscolhidas.length === 0 ? (
            <span className="truncate text-text-md text-text-subtle">{placeholder}</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1 py-0.5">
              {opcoesEscolhidas.map((o) => (
                <span
                  key={o.valor}
                  className="flex items-center gap-1 rounded bg-background-base-low px-2 py-1 text-[14px] leading-5 text-text-default"
                >
                  {o.rotulo}
                  <button
                    type="button"
                    aria-label={`Remover ${o.rotulo}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (bloqueado) return;
                      aoRemover?.(o.valor);
                    }}
                    className="text-interactive-text-default transition-colors hover:text-interactive-text-hover"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </span>
          )
        ) : opcoesEscolhidas[0] ? (
          <span className="truncate text-text-md font-medium text-text-default">{opcoesEscolhidas[0].rotulo}</span>
        ) : (
          <span className="truncate text-text-md text-text-subtle">{placeholder}</span>
        )}
        {carregando ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-normal border-t-text-muted motion-reduce:animate-none"
          />
        ) : (
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-icon-muted transition-transform duration-150 ${aberto ? "rotate-180" : ""}`}
          />
        )}
      </div>

      <Popout
        aberto={aberto}
        aoFechar={fechar}
        ancora={gatilhoRef}
        largura={larguraDaLista}
        rotulo={rotulo ?? placeholder ?? "Selecionar"}
        papel="listbox"
        focarAoAbrir={buscavel}
        className="max-h-[320px] overflow-y-auto"
      >
        {buscavel ? (
          // fundo igual ao do `Popout` (`--background-surface-high`, não o
          // `-higher` do parágrafo de medida do cabeçalho — ver a nota de
          // implementação) para o campo, fixo (`sticky`) sobre a rolagem, não
          // deixar ver o degradê da lista por baixo
          <div className="sticky top-0 z-10 bg-background-surface-high px-3 py-3">
            <input
              data-autofocus
              type="text"
              inputMode="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={aoTeclarNaBusca}
              placeholder="Buscar…"
              aria-label="Buscar"
              aria-controls={idLista}
              aria-activedescendant={idAtivo}
              className="w-full bg-transparent text-text-md text-text-default outline-none placeholder:text-input-placeholder-text-default"
            />
          </div>
        ) : null}
        <ul id={idLista} role="listbox" aria-label={rotulo ?? placeholder} aria-multiselectable={multiplo || undefined}>
          {opcoesFiltro.length === 0 ? (
            <li className="bg-background-base-lower p-3 text-center text-text-sm text-text-muted">Sem resultados</li>
          ) : (
            opcoesFiltro.map((o) => {
              const selecionada = ehSelecionado(o.valor);
              const ativa = indiceAtivo !== -1 && opcoesFiltro[indiceAtivo].valor === o.valor;
              return (
                <li
                  key={o.valor}
                  id={idDaOpcao(idBase, o.valor)}
                  role="option"
                  aria-selected={selecionada}
                  aria-disabled={o.desabilitada || undefined}
                  tabIndex={-1}
                  onMouseEnter={() => !o.desabilitada && definirAtivo(o.valor)}
                  onMouseDown={(e) => {
                    // não rouba o foco da caixa/campo de busca — quem escolhe é
                    // este handler, não um `click` num elemento focável
                    e.preventDefault();
                    escolher(o);
                  }}
                  className={`flex items-center gap-3 p-3 ${
                    o.desabilitada
                      ? "cursor-not-allowed opacity-50"
                      : `cursor-pointer ${
                          selecionada
                            ? "bg-interactive-background-selected"
                            : ativa
                              ? "bg-interactive-background-hover text-interactive-text-hover"
                              : ""
                        }`
                  }`}
                >
                  {multiplo ? (
                    <span
                      aria-hidden
                      className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                        selecionada
                          ? "border-checkbox-border-selected-default bg-checkbox-background-selected-default"
                          : "border-checkbox-border-default bg-checkbox-background-default"
                      }`}
                    >
                      {selecionada ? <Check size={14} className="text-checkbox-icon-active" /> : null}
                    </span>
                  ) : null}
                  {o.prefixo}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-text-md ${selecionada ? "font-medium" : ""} text-text-default`}>
                      {o.rotulo}
                    </span>
                    {o.descricao ? (
                      <span className="block truncate text-text-sm text-text-muted">{o.descricao}</span>
                    ) : null}
                  </span>
                  {o.sufixo}
                  {!multiplo && selecionada ? (
                    <Check size={16} aria-hidden="true" className="shrink-0 text-brand-500" />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </Popout>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Select / MultiSelect                                                */
/* ------------------------------------------------------------------ */

export function Select<T extends string = string>({
  opcoes,
  valor,
  aoMudar,
  placeholder,
  desabilitado,
  tamanho = "md",
  buscavel = false,
  id,
  rotulo,
  className = "",
  aoFechar,
  carregando = false,
}: SelectProps<T>) {
  const opcoesEscolhidas = useMemo(() => opcoes.filter((o) => o.valor === valor), [opcoes, valor]);

  return (
    <CorpoDoSelect
      opcoes={opcoes}
      opcoesEscolhidas={opcoesEscolhidas}
      placeholder={placeholder}
      desabilitado={desabilitado}
      tamanho={tamanho}
      buscavel={buscavel}
      id={id}
      rotulo={rotulo}
      className={className}
      multiplo={false}
      ehSelecionado={(v) => v === valor}
      aoEscolher={(o) => aoMudar(o.valor)}
      aoFechar={aoFechar}
      carregando={carregando}
    />
  );
}

export function MultiSelect<T extends string = string>({
  opcoes,
  valor,
  aoMudar,
  placeholder,
  desabilitado,
  tamanho = "md",
  buscavel = false,
  id,
  rotulo,
  className = "",
  maximo,
  aoFechar,
  carregando = false,
}: MultiSelectProps<T>) {
  const opcoesEscolhidas = useMemo(() => opcoes.filter((o) => valor.includes(o.valor)), [opcoes, valor]);
  const cheio = maximo !== undefined && valor.length >= maximo;

  return (
    <CorpoDoSelect
      opcoes={opcoes}
      opcoesEscolhidas={opcoesEscolhidas}
      placeholder={placeholder}
      desabilitado={desabilitado}
      tamanho={tamanho}
      buscavel={buscavel}
      id={id}
      rotulo={rotulo}
      className={className}
      multiplo
      ehSelecionado={(v) => valor.includes(v)}
      aoEscolher={(o) => {
        const marcado = valor.includes(o.valor);
        if (!marcado && cheio) return;
        aoMudar(marcado ? valor.filter((v) => v !== o.valor) : [...valor, o.valor]);
      }}
      aoRemover={(v) => aoMudar(valor.filter((x) => x !== v))}
      aoFechar={aoFechar}
      carregando={carregando}
    />
  );
}
