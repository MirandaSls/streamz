"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as KeyboardEventDoReact,
} from "react";
import type {
  Category,
  Channel,
  EmojiParcial,
  GuildMemberView,
  Message,
  Role,
  SelectDeBot as ComponenteDeSelect,
} from "@streamz/shared";
import { Button, Popout, type OpcaoDeSelect } from "@/components/ui/primitivos";
import { Check, ChevronDown, Search, X } from "@/components/ui/icones";
import Emoji from "@/components/ui/Emoji";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useGuilds } from "@/stores/guilds";
import { useChannels } from "@/stores/channels";
import { useCategories } from "@/stores/categories";
import { usePermissions } from "@/stores/permissions";
import { useEmojis, todosOsEmojis } from "@/stores/emojis";
import { componenteEstaPendente, useInteracoesDeBot } from "@/stores/interacoes-de-bot";
import { canaisFiltrados } from "./select-canais";
import {
  dentroDoLimite,
  filtrarPorTexto,
  limitesDoComponente,
  multiploDoComponente,
  normalizarBusca,
  opcaoDeItemDeCanal,
  opcaoDeUsuario,
  opcoesDeCargo,
  placeholderPadrao,
  resolverEmojiDeOpcao,
  valoresIniciais,
} from "./select-opcoes";
import { LARGURA_MAXIMA_DO_EMBED } from "@/components/chat/bot/embed-layout";

/**
 * Select de mensagem de bot (onda 3, cartão 3d-selects): os cinco tipos do
 * Discord que uma `ActionRow` pode ter como filho único — `type` 3 (texto,
 * com `options` do próprio bot), 5 (usuário), 6 (cargo), 7 (mencionável,
 * usuário + cargo) e 8 (canal). `ActionRow.tsx` (cartão 3c) despacha para
 * aqui pelo `type` do componente; este arquivo não sabe desenhar botão.
 *
 * ## De onde vêm as opções
 *
 * O `type` 3 é o único com `options` no próprio payload. Os outros quatro só
 * trazem `default_values` (cuids — o DTO da API já trocou o snowflake do
 * Discord, contrato da onda 3): quem preenche a lista é o **servidor**, das
 * mesmas stores que a lista de membros, o painel de cargos e a lista de
 * canais já usam (`stores/guilds.ts`, `stores/permissions.ts`,
 * `stores/channels.ts`, `stores/categories.ts`) — nenhuma rota nova, nenhum
 * dado novo. A montagem de cada linha (avatar, escudo do cargo, ícone do
 * canal) mora em `select-opcoes.ts`, compartilhada com o `ModalDeBot`.
 *
 * ## Por que ainda não uso o `Select`/`MultiSelect` primitivo
 *
 * A rodada de correção deu ao primitivo o `aoFechar` e o `carregando` que
 * faltavam (o "mandar ao fechar" e o spinner da interação pendente). Ele cobre
 * múltipla escolha e opções ricas (`prefixo`, `descricao`), mas três coisas
 * deste componente não cabem nele sem mudar o visual de todo `Select` do app:
 *
 * 1. a **folha do celular com título e "Concluir"** fixos junto da busca
 *    (o primitivo não tem cabeçalho na lista);
 * 2. o **checkbox à direita** do rótulo no múltiplo (o primitivo o põe à
 *    esquerda — ver abaixo);
 * 3. a **pílula com o prefixo** (avatar/ícone) na caixa fechada e a opção
 *    **esmaecida quando o máximo foi atingido**.
 *
 * Por isso o corpo continua compondo o `Popout` direto, mas com o **mesmo
 * padrão de teclado do primitivo**: foco sempre na caixa (ou no campo de
 * busca), opções `role=option` com `tabIndex=-1` e a opção "ativa" só por
 * `aria-activedescendant`; ↑/↓ movem, Home/End vão às pontas (fora do campo
 * de busca), Enter/Espaço escolhem (no múltiplo, marcam/desmarcam), Tab sai
 * fechando, Esc fecha (quem ouve é o `Popout`); digitar abre a busca (5/6/7/8)
 * ou pula para a opção pelo começo do rótulo (3).
 *
 * ## Checkbox à direita, só no múltiplo (e não à esquerda, como o `Select`)
 *
 * Medida: `desenvolvedores/imagens/componentes/select-de-cargo.webp` e
 * `select-mencionavel.webp` (doc oficial do Discord) mostram o quadrado
 * marcado **depois** do rótulo. Sem print 1:1 nem CSS bruto deste componente
 * especificamente — só a imagem de catálogo, que é o que resta quando os dois
 * primeiros da regra de autoridade do cartão não existem.
 */
export default function SelectDeBot({ componente, message }: { componente: ComponenteDeSelect; message: Message }) {
  const pendente = useInteracoesDeBot((s) => componenteEstaPendente(s, message.id, componente.custom_id));
  const falha = useInteracoesDeBot((s) => s.falhas[message.id]);
  const dispensarFalha = useInteracoesDeBot((s) => s.dispensarFalha);
  const escolherNoSelect = useInteracoesDeBot((s) => s.escolherNoSelect);
  const falhouEste = falha?.customId === componente.custom_id;

  const opcoes = useOpcoesDoSelect(componente, message.guildId);
  const { min, max } = limitesDoComponente(componente);
  const multiplo = multiploDoComponente(componente);
  const buscavel = componente.type !== 3;
  const placeholder = componente.placeholder || placeholderPadrao(componente.type);
  const assinaturaInicial = useMemo(() => JSON.stringify(valoresIniciais(componente)), [componente]);

  return (
    // Teto de largura: o do embed e do container v2 (`LARGURA_MAXIMA_DO_EMBED`,
    // 516px de `.gridContainer__623de`). A largura do select de componente em
    // si **não foi medida** — nem o CSS bruto nem os prints 1:1 trazem uma —,
    // mas sem teto ele esticava pela coluna inteira do chat (1170px na bancada,
    // 2026-09-14), muito além do que a documentação do Discord mostra.
    <div className="w-full" style={{ maxWidth: LARGURA_MAXIMA_DO_EMBED }}>
      <CorpoDoSelectDeBot
        opcoes={opcoes}
        placeholder={placeholder}
        buscavel={buscavel}
        multiplo={multiplo}
        desabilitado={!!componente.disabled}
        pendente={pendente}
        min={min}
        max={max}
        assinaturaInicial={assinaturaInicial}
        onEscolher={(valores) =>
          void escolherNoSelect(message, componente.custom_id, componente.type, valores)
        }
      />
      <FalhaDoComponente ativo={falhouEste} falha={falha} onDispensar={() => dispensarFalha(message.id)} />
    </div>
  );
}

/** "Esta interação falhou" desta linha — só quando a última falha da mensagem é deste `custom_id`. */
function FalhaDoComponente({
  ativo,
  falha,
  onDispensar,
}: {
  ativo: boolean;
  falha: { mensagem: string | null } | undefined;
  onDispensar: () => void;
}) {
  if (!ativo || !falha) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2 text-text-sm text-status-danger">
      <span>{falha.mensagem ?? "Esta interação falhou"}</span>
      <button
        type="button"
        onClick={onDispensar}
        aria-label="Dispensar"
        className="rounded outline-none hover:text-status-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ── dados: options do bot (type 3) ou lista viva do servidor (5/6/7/8) ────

/** Emoji de uma opção do select de texto, já resolvido, como `prefixo` de 16px. */
function PrefixoDeEmoji({ emoji }: { emoji: EmojiParcial | undefined }) {
  const guilds = useEmojis((s) => s.guilds);
  const emojis = useMemo(() => todosOsEmojis(guilds), [guilds]);
  const resolvido = resolverEmojiDeOpcao(emoji, emojis);
  if (!resolvido) return null;
  if (resolvido.tipo === "personalizado") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolvido.url} alt={resolvido.alt} className="h-4 w-4 shrink-0 object-contain" />;
  }
  if (resolvido.tipo === "unicode") return <Emoji emoji={resolvido.caractere} tamanho={16} />;
  return <span className="text-text-sm text-text-muted">:{resolvido.texto}:</span>;
}

// referências estáveis para "outro servidor": o seletor não devolve um `[]`
// novo a cada leitura da store
const SEM_MEMBROS: GuildMemberView[] = [];
const SEM_CARGOS: Role[] = [];
const SEM_CANAIS: Channel[] = [];
const SEM_CATEGORIAS: Category[] = [];

/**
 * Monta a lista de opções no formato comum ao corpo do select (o `Select`
 * primitivo usa a mesma forma). Usuário, cargo e canal vêm de
 * `select-opcoes.ts`, os mesmos do campo de select do `ModalDeBot`.
 */
function useOpcoesDoSelect(componente: ComponenteDeSelect, guildId: string | null): OpcaoDeSelect<string>[] {
  const membros = useGuilds((s) => (s.activeGuildId === guildId ? s.members : SEM_MEMBROS));
  const roles = usePermissions((s) => (s.guildId === guildId ? s.roles : SEM_CARGOS));
  const canais = useChannels((s) => (s.guildId === guildId ? s.channels : SEM_CANAIS));
  // categoria entra como "canal 4" só quando o bot pede — ver `select-canais.ts`
  const categorias = useCategories((s) => (s.guildId === guildId ? s.categories : SEM_CATEGORIAS));

  return useMemo(() => {
    if (componente.type === 3) {
      return componente.options.map((o) => ({
        valor: o.value,
        rotulo: o.label,
        descricao: o.description,
        prefixo: o.emoji ? <PrefixoDeEmoji emoji={o.emoji} /> : undefined,
      }));
    }
    if (componente.type === 5) {
      return membros.map((m) => opcaoDeUsuario(m.user));
    }
    if (componente.type === 6) {
      return opcoesDeCargo(roles);
    }
    if (componente.type === 8) {
      return canaisFiltrados(canais, componente.channel_types, "", categorias).map(opcaoDeItemDeCanal);
    }
    // type 7 · mencionável: usuários primeiro, depois cargos — a ordem do
    // `select-mencionavel.webp` da doc oficial (Ant/Helper/Colin de usuário,
    // Bot/Developer de cargo, nessa ordem).
    return [...membros.map((m) => opcaoDeUsuario(m.user)), ...opcoesDeCargo(roles)];
  }, [componente, membros, roles, canais, categorias]);
}

// ── corpo do select (compõe Popout: ver "Por que ainda não uso..." no cabeçalho) ─

function idDaOpcao(idBase: string, valor: string): string {
  return `${idBase}-opcao-${encodeURIComponent(valor)}`;
}

/** Primeira (direcao 1) ou última (-1) opção que aceita ser ativada. */
function extremoAtivavel(lista: OpcaoDeSelect<string>[], inativa: (o: OpcaoDeSelect<string>) => boolean, direcao: 1 | -1) {
  if (direcao === 1) return lista.findIndex((o) => !inativa(o));
  for (let i = lista.length - 1; i >= 0; i--) if (!inativa(lista[i])) return i;
  return -1;
}

/** Próxima opção ativável na `direcao`, sem dar a volta (para no limite) — o mesmo do primitivo. */
function proximaAtivavel(
  lista: OpcaoDeSelect<string>[],
  inativa: (o: OpcaoDeSelect<string>) => boolean,
  de: number,
  direcao: 1 | -1,
) {
  for (let i = de + direcao; i >= 0 && i < lista.length; i += direcao) {
    if (!inativa(lista[i])) return i;
  }
  return de;
}

function CorpoDoSelectDeBot({
  opcoes,
  placeholder,
  buscavel,
  multiplo,
  desabilitado,
  pendente,
  min,
  max,
  assinaturaInicial,
  onEscolher,
}: {
  opcoes: OpcaoDeSelect<string>[];
  placeholder: string;
  buscavel: boolean;
  multiplo: boolean;
  /** `disabled` do bot: esmaece (opacidade .5) e trava. */
  desabilitado: boolean;
  /**
   * A interação anterior ainda não voltou: trava igual, mas **sem esmaecer**,
   * com o spinner no lugar do chevron — o mesmo contrato do `carregando` do
   * `Select` primitivo (ver o cabeçalho dele).
   */
  pendente: boolean;
  min: number;
  max: number;
  assinaturaInicial: string;
  onEscolher: (valores: string[]) => void;
}) {
  const ehMobile = useEhMobile();
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const gatilhoRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [valor, setValor] = useState<string[]>(() => JSON.parse(assinaturaInicial) as string[]);
  const [ativoValor, setAtivoValor] = useState<string | null>(null);
  const [larguraDaLista, setLarguraDaLista] = useState<number>();
  // nem o `disabled` do bot nem a interação pendente deixam abrir/marcar
  const bloqueado = desabilitado || pendente;

  // a lista fica com a largura do gatilho — mesma conta do `Select` primitivo
  // (`CorpoDoSelect`), refeita se ele mudar de tamanho enquanto está aberta
  // (rotação de celular).
  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => setLarguraDaLista(gatilhoRef.current?.offsetWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(medir);
    if (gatilhoRef.current) obs.observe(gatilhoRef.current);
    return () => obs.disconnect();
  }, [aberto]);

  // a mensagem trocou de defaults (edição do bot) enquanto a lista está
  // fechada: resincroniza. Aberta, deixamos quieto — não sequestrar debaixo
  // do dedo de quem está marcando.
  useEffect(() => {
    if (!aberto) setValor(JSON.parse(assinaturaInicial) as string[]);
  }, [assinaturaInicial, aberto]);

  const opcoesEscolhidas = useMemo(() => opcoes.filter((o) => valor.includes(o.valor)), [opcoes, valor]);
  const opcoesFiltradas = useMemo(
    () => (busca ? filtrarPorTexto(opcoes, busca, (o) => o.rotulo) : opcoes),
    [opcoes, busca],
  );
  const cheio = multiplo && valor.length >= max;

  /** Opção que o teclado pula: desabilitada pelo bot, ou nova com o máximo já atingido. */
  const inativa = (o: OpcaoDeSelect<string>) => !!o.desabilitada || (cheio && !valor.includes(o.valor));
  const indiceAtivo = ativoValor === null ? -1 : opcoesFiltradas.findIndex((o) => o.valor === ativoValor);
  const idAtivo = indiceAtivo !== -1 ? idDaOpcao(idBase, opcoesFiltradas[indiceAtivo].valor) : undefined;

  // a busca (ou a lista) mudou e a opção ativa saiu do resultado: pousa na
  // primeira ativável em vez de deixar `aria-activedescendant` apontando para
  // nada — o mesmo efeito do `useComboBox` do primitivo
  useEffect(() => {
    if (!aberto || indiceAtivo !== -1) return;
    const i = extremoAtivavel(opcoesFiltradas, inativa, 1);
    setAtivoValor(i === -1 ? null : opcoesFiltradas[i].valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indiceAtivo/inativa derivam de opcoesFiltradas/valor
  }, [opcoesFiltradas, aberto]);

  function abrirCom(ativo: string | null) {
    // sem `opcoes.length === 0` (o primitivo tem): a lista de membros/canais
    // pode não ter carregado, e abrir no "Sem resultados" diz isso melhor que
    // uma caixa que não responde
    if (bloqueado) return;
    setBusca("");
    setAtivoValor(ativo);
    setAberto(true);
  }

  /** Abre pousando na opção já escolhida (ou na primeira ativável). */
  function abrir() {
    const iSel = opcoes.findIndex((o) => valor.includes(o.valor) && !o.desabilitada);
    const i = iSel !== -1 ? iSel : extremoAtivavel(opcoes, inativa, 1);
    abrirCom(i === -1 ? null : opcoes[i].valor);
  }

  function fechar() {
    setAberto(false);
    setBusca("");
  }

  /**
   * Único: escolher fecha e manda na hora — o mesmo clique é a escolha e o
   * fechamento. Manda sempre, mesmo que `v` seja o valor que já estava
   * marcado: um clique explícito na opção é uma escolha nova para o Discord,
   * não uma confirmação do que já havia (diferente do múltiplo, abaixo).
   */
  function escolherUnico(v: string) {
    setValor([v]);
    fechar();
    onEscolher([v]);
  }

  /** Múltiplo: cada clique só marca/desmarca; quem manda é `fecharEConfirmar`. */
  function alternar(v: string) {
    const marcado = valor.includes(v);
    if (!marcado && cheio) return;
    setValor((atual) => (marcado ? atual.filter((x) => x !== v) : [...atual, v]));
  }

  /**
   * Fechar por Esc, clique fora, Tab ou o "Concluir" da folha — o "ao fechar"
   * do Discord. Só manda se a seleção final for diferente da que estava quando
   * a lista abriu: abrir e fechar sem tocar em nada (ou marcar e desmarcar de
   * volta) não gasta a interação do bot por nada.
   */
  function fecharEConfirmar() {
    fechar();
    if (JSON.stringify(valor) !== assinaturaInicial) onEscolher(valor);
  }

  /** O fechar certo para o modo: o múltiplo confirma, o único só fecha. */
  function fecharDoModo() {
    if (multiplo) fecharEConfirmar();
    else fechar();
  }

  function escolher(o: OpcaoDeSelect<string>) {
    if (inativa(o)) return;
    if (multiplo) alternar(o.valor);
    else escolherUnico(o.valor);
  }

  function alternarAbertura() {
    if (bloqueado) return;
    if (!aberto) abrir();
    else fecharDoModo();
  }

  function mover(direcao: 1 | -1) {
    if (!aberto) {
      abrir();
      return;
    }
    const i =
      indiceAtivo === -1
        ? extremoAtivavel(opcoesFiltradas, inativa, 1)
        : proximaAtivavel(opcoesFiltradas, inativa, indiceAtivo, direcao);
    if (i !== -1) setAtivoValor(opcoesFiltradas[i].valor);
  }

  function irPara(direcao: 1 | -1) {
    if (!aberto) {
      abrir();
      return;
    }
    const i = extremoAtivavel(opcoesFiltradas, inativa, direcao);
    if (i !== -1) setAtivoValor(opcoesFiltradas[i].valor);
  }

  function confirmarAtivo() {
    if (indiceAtivo === -1) return;
    escolher(opcoesFiltradas[indiceAtivo]);
  }

  // digitar-para-pular — copiado do primitivo: com busca, abre e começa o
  // filtro; sem busca (type 3), acumula 700ms (não medido) e ativa a primeira
  // opção cujo rótulo começa com o que foi digitado
  const bufferRef = useRef("");
  const timeoutRef = useRef<number>();
  function digitarParaPular(e: KeyboardEventDoReact<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    if (buscavel) {
      if (!aberto) abrir();
      setBusca((atual) => atual + e.key);
      return;
    }
    window.clearTimeout(timeoutRef.current);
    bufferRef.current += e.key.toLocaleLowerCase("pt-BR");
    const alvo = bufferRef.current;
    const i = opcoes.findIndex((o) => !inativa(o) && normalizarBusca(o.rotulo).startsWith(alvo));
    if (i !== -1) {
      if (aberto) setAtivoValor(opcoes[i].valor);
      else abrirCom(opcoes[i].valor);
    }
    timeoutRef.current = window.setTimeout(() => {
      bufferRef.current = "";
    }, 700);
  }

  // Esc não precisa de handler aqui: o próprio `Popout` já ouve a tecla no
  // `window` (em captura) e chama `aoFechar`.
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
        irPara(1);
        break;
      case "End":
        e.preventDefault();
        irPara(-1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!aberto) abrir();
        else confirmarAtivo();
        break;
      case "Tab":
        // sem `preventDefault`: o foco segue, a lista fecha atrás dele
        if (aberto) fecharDoModo();
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
      // Home/End ficam para o cursor do texto — não roubar a edição do termo
    }
  }

  const valorUnicoEscolhido = !multiplo ? opcoesEscolhidas[0] : undefined;

  return (
    <>
      {/*
        `div role="combobox"`, não `<button>`: o botão "×" de cada pílula do
        múltiplo, uns parágrafos abaixo, precisa estar DENTRO do gatilho, e
        HTML não aceita `<button>` dentro de `<button>` — a mesma armadilha
        que o cabeçalho do `Select` primitivo já documenta e evita do mesmo
        jeito.
      */}
      <div
        ref={gatilhoRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-activedescendant={aberto ? idAtivo : undefined}
        aria-label={placeholder}
        aria-disabled={desabilitado || undefined}
        aria-busy={pendente || undefined}
        tabIndex={desabilitado ? -1 : 0}
        onKeyDown={aoTeclarNoGatilho}
        onClick={alternarAbertura}
        className={`grid min-h-[40px] w-full grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-input-border-default bg-input-background-default py-2 pl-3 pr-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2 ${
          desabilitado ? "cursor-not-allowed opacity-50" : pendente ? "cursor-wait" : "cursor-pointer"
        }`}
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
                  {o.prefixo}
                  {o.rotulo}
                  <button
                    type="button"
                    aria-label={`Remover ${o.rotulo}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (bloqueado) return;
                      alternar(o.valor);
                    }}
                    className="text-interactive-text-default transition-colors hover:text-interactive-text-hover"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </span>
          )
        ) : valorUnicoEscolhido ? (
          <span className="flex min-w-0 items-center gap-2">
            {valorUnicoEscolhido.prefixo}
            <span className="truncate text-text-md font-medium text-text-default">{valorUnicoEscolhido.rotulo}</span>
          </span>
        ) : (
          <span className="truncate text-text-md text-text-subtle">{placeholder}</span>
        )}
        {pendente ? (
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
        aoFechar={fecharDoModo}
        ancora={gatilhoRef}
        largura={larguraDaLista}
        rotulo={placeholder}
        papel="listbox"
        focarAoAbrir={buscavel}
        className="max-h-[320px] overflow-y-auto"
      >
        {/*
          Um `sticky top-0` só, com as duas faixas dentro: dois elementos
          `sticky top-0` irmãos se sobreporiam ao rolar (os dois tentam colar
          no mesmo topo) — por isso o título/"Concluir" do celular e o campo
          de busca moram no mesmo contêiner fixo, não em dois separados.
        */}
        {(ehMobile && multiplo) || buscavel ? (
          <div className="sticky top-0 z-10 bg-background-surface-high">
            {ehMobile && multiplo ? (
              <div className="flex items-center justify-between px-3 py-3">
                <span className="text-text-sm font-semibold text-text-default">{placeholder}</span>
                {/* Confirmação explícita no celular — medida em
                    `antigo-select-no-mobile.png` (doc oficial): a folha do
                    Discord tem título + link "Select" no cabeçalho. No
                    desktop fechar (Esc/clique fora) já confirma; a folha não
                    tem esse gesto tão à mão, daí o botão aqui. Só no
                    múltiplo: no único, escolher já fecha e manda — não há
                    nada para "concluir". */}
                <Button variante="link" tamanho="sm" onClick={fecharEConfirmar}>
                  Concluir
                </Button>
              </div>
            ) : null}
            {buscavel ? (
              <div className="flex items-center gap-2 px-3 py-3">
                <Search size={16} aria-hidden="true" className="shrink-0 text-icon-muted" />
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
          </div>
        ) : null}
        <ul id={idLista} role="listbox" aria-label={placeholder} aria-multiselectable={multiplo || undefined}>
          {opcoesFiltradas.length === 0 ? (
            <li className="bg-background-base-lower p-3 text-center text-text-sm text-text-muted">Sem resultados</li>
          ) : (
            opcoesFiltradas.map((o) => {
              const selecionada = valor.includes(o.valor);
              const bloqueada = inativa(o);
              // no celular não há ponteiro "passando por cima": o `mouseenter`
              // sintético do toque deixaria a última linha tocada acesa como
              // ativa — lá o retorno do toque é o `active:`
              const ativa = !ehMobile && indiceAtivo !== -1 && opcoesFiltradas[indiceAtivo].valor === o.valor;
              return (
                <li
                  key={o.valor}
                  id={idDaOpcao(idBase, o.valor)}
                  role="option"
                  aria-selected={selecionada}
                  aria-disabled={bloqueada || undefined}
                  tabIndex={-1}
                  onMouseEnter={() => {
                    if (!ehMobile && !bloqueada) setAtivoValor(o.valor);
                  }}
                  // `mousedown` só segura o foco na caixa/busca; quem escolhe é
                  // o `click` — escolher no `mousedown` (como o primitivo) fecha
                  // a folha do celular antes do `click` sintético do toque, que
                  // cairia no que estiver atrás dela
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(o)}
                  className={`flex items-center gap-3 p-3 ${
                    bloqueada
                      ? "cursor-not-allowed opacity-50"
                      : `cursor-pointer ${
                          selecionada
                            ? "bg-interactive-background-selected"
                            : ativa
                              ? "bg-interactive-background-hover"
                              : "active:bg-interactive-background-hover"
                        }`
                  }`}
                >
                  {o.prefixo}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-md text-text-default">{o.rotulo}</span>
                    {o.descricao ? (
                      <span className="block truncate text-text-sm text-text-muted">{o.descricao}</span>
                    ) : null}
                  </span>
                  {o.sufixo}
                  {multiplo ? (
                    // checkbox à direita: ver "Checkbox à direita" no cabeçalho do arquivo
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                        selecionada
                          ? "border-checkbox-border-selected-default bg-checkbox-background-selected-default"
                          : "border-checkbox-border-default bg-checkbox-background-default"
                      }`}
                    >
                      {selecionada ? <Check size={14} className="text-checkbox-icon-active" /> : null}
                    </span>
                  ) : selecionada ? (
                    <Check size={16} aria-hidden="true" className="shrink-0 text-brand-500" />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </Popout>
      {/* Aviso antecipado de faixa min/max — o Discord recusa no servidor
          (400) se a contagem final não bater; isto não bloqueia o fechar,
          só avisa enquanto a lista está aberta. Só no múltiplo: no único, o
          próprio Discord não deixa ficar "sem nada" depois de escolher. */}
      {multiplo && aberto && !dentroDoLimite(valor.length, min, max) ? (
        <p className="mt-1 text-text-sm text-text-muted">
          {min === max ? `Selecione ${min}` : `Selecione de ${min} a ${max}`}
        </p>
      ) : null}
    </>
  );
}
