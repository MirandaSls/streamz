"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as KeyboardEventDoReact,
} from "react";
import type { Channel, EmojiParcial, Message, PublicUser, Role, SelectDeBot as ComponenteDeSelect } from "@streamz/shared";
import { Button, Popout, type OpcaoDeSelect } from "@/components/ui/primitivos";
import { Check, ChevronDown, Hash, Lock, Megaphone, Search, Shield, Volume2, X } from "@/components/ui/icones";
import Emoji from "@/components/ui/Emoji";
import Avatar from "@/components/ui/Avatar";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useGuilds } from "@/stores/guilds";
import { useChannels } from "@/stores/channels";
import { usePermissions } from "@/stores/permissions";
import { useEmojis, todosOsEmojis } from "@/stores/emojis";
import { useLiveUser } from "@/stores/presence";
import { componenteEstaPendente, useInteracoesDeBot } from "@/stores/interacoes-de-bot";
import { canaisFiltrados } from "./select-canais";
import {
  dentroDoLimite,
  filtrarPorTexto,
  limitesDoComponente,
  multiploDoComponente,
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
 * `stores/channels.ts`) — nenhuma rota nova, nenhum dado novo.
 *
 * ## Por que não uso o `Select`/`MultiSelect` primitivo
 *
 * Tentei; faltam duas coisas que este componente precisa e a API deles não
 * tem (ver "faltando" na entrega do cartão):
 *
 * 1. **"Mandar ao fechar"**: o Discord só dispara a interação quando a lista
 *    **fecha** (Esc, clique fora, ou o "Concluir" da folha do celular), nunca
 *    a cada marcação — mas nem `Select` nem `MultiSelect` avisam de
 *    fechamento (não têm `aoFechar`; o próprio cabeçalho de
 *    `primitivos/Select.tsx` já documenta a lacuna). No não-múltiplo escolher
 *    fecha e manda ao mesmo tempo, mas ainda seria a `Select`; o múltiplo não
 *    tem contorno.
 * 2. **"Carregando" com spinner**: enquanto a interação está pendente, o
 *    Discord troca o chevron por um spinner e trava o clique — mas o
 *    primitivo só desenha chevron, sem esse terceiro estado.
 *
 * Por isso este arquivo compõe `Popout` direto para os dois modos — a saída
 * que o próprio cartão previa ("se não comportar multi-seleção, componha com
 * Popout").
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
        desabilitado={!!componente.disabled || pendente}
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

function iconeDeCanal(type: Channel["type"], className: string) {
  if (type === "VOICE") return <Volume2 size={16} aria-hidden="true" className={className} />;
  if (type === "ANNOUNCEMENT") return <Megaphone size={16} aria-hidden="true" className={className} />;
  return <Hash size={16} aria-hidden="true" className={className} />;
}

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

/** Monta a lista de opções no formato comum ao corpo do select (o `Select` primitivo usa a mesma forma). */
function useOpcoesDoSelect(componente: ComponenteDeSelect, guildId: string | null): OpcaoDeSelect<string>[] {
  const membros = useGuilds((s) => (s.activeGuildId === guildId ? s.members : []));
  const roles = usePermissions((s) => (s.guildId === guildId ? s.roles : []));
  const canais = useChannels((s) => (s.guildId === guildId ? s.channels : []));

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
      const canaisDoTipo = canaisFiltrados(canais, componente.channel_types, "");
      return canaisDoTipo.map((c) => ({
        valor: c.id,
        rotulo: c.name ?? "",
        prefixo: (
          <span className="flex shrink-0 items-center gap-0.5">
            {iconeDeCanal(c.type, "text-icon-muted")}
            {c.private ? <Lock size={12} aria-hidden="true" className="text-icon-muted" /> : null}
          </span>
        ),
      }));
    }
    // type 7 · mencionável: usuários primeiro, depois cargos — a ordem do
    // `select-mencionavel.webp` da doc oficial (Ant/Helper/Colin de usuário,
    // Bot/Developer de cargo, nessa ordem).
    return [...membros.map((m) => opcaoDeUsuario(m.user)), ...opcoesDeCargo(roles)];
  }, [componente, membros, roles, canais]);
}

function opcaoDeUsuario(user: PublicUser): OpcaoDeSelect<string> {
  return {
    valor: user.id,
    rotulo: user.displayName ?? user.username,
    prefixo: <PrefixoDeUsuario user={user} />,
  };
}

/**
 * Avatar + bolinha de presença + pílula "BOT" de uma linha de usuário/
 * mencionável. Medido em `select-de-usuario.webp` (doc oficial): a bolinha de
 * status aparece mesmo dentro do select, junto do avatar — não é exclusiva da
 * lista de membros.
 */
function PrefixoDeUsuario({ user }: { user: PublicUser }) {
  const vivo = useLiveUser(user);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {/* `border-background-surface-higher`: o mais próximo que `Avatar.tsx`
          tem em `FUNDO_DO_SELO` (proibido editar nesta onda) — a lista deste
          select vive sobre `--background-surface-high` (a do `Popout`
          `superficie="alta"`), sem entrada própria; ver "faltando". */}
      <Avatar user={vivo} size="xs" status={vivo.status} surface="border-background-surface-higher" />
      {vivo.bot ? (
        <span className="rounded bg-brand-500 px-1 text-[10px] font-bold uppercase leading-4 text-accent-ink">
          BOT
        </span>
      ) : null}
    </span>
  );
}

function opcoesDeCargo(roles: readonly Role[]): OpcaoDeSelect<string>[] {
  return roles
    .filter((r) => !r.isDefault) // @everyone não é atribuível — mesma regra de c-cargos
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      valor: r.id,
      rotulo: r.name,
      prefixo: (
        <Shield
          size={16}
          aria-hidden="true"
          className={r.color ? "" : "text-icon-muted"}
          // cor arbitrária do servidor (cargo), não token — mesma regra do
          // `color` do embed: dado, não estilo de classe
          style={r.color ? { color: r.color } : undefined}
        />
      ),
    }));
}

// ── corpo do select (compõe Popout: ver "Por que não uso..." no cabeçalho) ─

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
  /** já inclui `pendente`: enquanto a interação anterior não voltou, ninguém abre outra. */
  desabilitado: boolean;
  pendente: boolean;
  min: number;
  max: number;
  assinaturaInicial: string;
  onEscolher: (valores: string[]) => void;
}) {
  const ehMobile = useEhMobile();
  const gatilhoRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [valor, setValor] = useState<string[]>(() => JSON.parse(assinaturaInicial) as string[]);
  const [larguraDaLista, setLarguraDaLista] = useState<number>();

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
   * Fechar por Esc, clique fora ou o "Concluir" da folha — o "ao fechar" do
   * Discord. Só manda se a seleção final for diferente da que estava quando
   * a lista abriu: abrir e fechar sem tocar em nada (ou marcar e desmarcar de
   * volta) não gasta a interação do bot por nada.
   */
  function fecharEConfirmar() {
    fechar();
    if (JSON.stringify(valor) !== assinaturaInicial) onEscolher(valor);
  }

  function alternarAbertura() {
    if (desabilitado) return;
    if (!aberto) {
      setAberto(true);
    } else if (multiplo) {
      fecharEConfirmar();
    } else {
      fechar();
    }
  }

  // Esc não precisa de handler aqui: o próprio `Popout` já ouve a tecla no
  // `window` (em captura) e chama `aoFechar`.
  function aoTeclarNoGatilho(e: KeyboardEventDoReact<HTMLDivElement>) {
    if (desabilitado) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alternarAbertura();
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
        aria-label={placeholder}
        aria-disabled={desabilitado || undefined}
        tabIndex={desabilitado ? -1 : 0}
        onKeyDown={aoTeclarNoGatilho}
        onClick={alternarAbertura}
        className={`grid min-h-[40px] w-full grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-input-border-default bg-input-background-default py-2 pl-3 pr-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2 ${
          desabilitado ? "cursor-not-allowed opacity-50" : "cursor-pointer"
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
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-normal border-t-text-muted"
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
        aoFechar={multiplo ? fecharEConfirmar : fechar}
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
                  placeholder="Buscar…"
                  aria-label="Buscar"
                  className="w-full bg-transparent text-text-md text-text-default outline-none placeholder:text-input-placeholder-text-default"
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <ul role="listbox" aria-label={placeholder} aria-multiselectable={multiplo || undefined}>
          {opcoesFiltradas.length === 0 ? (
            <li className="bg-background-base-lower p-3 text-center text-text-sm text-text-muted">Sem resultados</li>
          ) : (
            opcoesFiltradas.map((o) => {
              const selecionada = valor.includes(o.valor);
              const bloqueada = multiplo && !selecionada && cheio;
              return (
                <li key={o.valor} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selecionada}
                    aria-disabled={bloqueada || undefined}
                    disabled={bloqueada}
                    onClick={() => (multiplo ? alternar(o.valor) : escolherUnico(o.valor))}
                    className={`flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2 ${
                      bloqueada
                        ? "cursor-not-allowed opacity-50"
                        : `cursor-pointer hover:bg-interactive-background-hover ${
                            selecionada ? "bg-interactive-background-selected" : ""
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
                  </button>
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
