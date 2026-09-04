"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Coffee,
  Flag,
  Gamepad2,
  Hash,
  Leaf,
  Lightbulb,
  Plane,
  Settings2,
  Smile,
  type Icone,
} from "@/components/ui/icones";
import { formatCustomEmoji, parseCustomEmoji, type CustomEmoji } from "@streamz/shared";
import {
  buscarUnicode,
  categoriasUnicode,
  comTomDePele,
  emojiPorCaractere,
  normalizar,
  TONS_DE_PELE,
  type EmojiItem,
  type TomDePele,
} from "@/components/media/emoji-dados";
import {
  BotaoLateral,
  BuscaPicker,
  CaixaPicker,
  ColunaLateral,
  DivisoriaLateral,
  IconeServidor,
  RodapePicker,
} from "@/components/media/PickerChrome";
import {
  definirTomDePele,
  emojisFrequentes,
  registrarUsoEmoji,
  usePrefsPicker,
} from "@/components/media/preferencias-picker";
import { useAuth } from "@/stores/auth";
import { useEmojisOrdenados } from "@/stores/emojis";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";

/** Ícone de cada categoria unicode na coluna da esquerda. */
const ICONE_CATEGORIA: Record<string, Icone> = {
  smileys_people: Smile,
  animals_nature: Leaf,
  food_drink: Coffee,
  travel_places: Plane,
  activities: Gamepad2,
  objects: Lightbulb,
  symbols: Hash,
  flags: Flag,
};

/** 9 por linha em 424px de painel; célula de 40px, emoji de 32px. */
const COLUNAS = 9;
const CELULA = 40;

type ItemGrade =
  | { tipo: "unicode"; chave: string; item: EmojiItem }
  | { tipo: "custom"; chave: string; emoji: CustomEmoji; servidor: string };

interface SecaoGrade {
  id: string;
  titulo: string;
  /** o que a coluna lateral desenha para pular até esta seção. */
  icone:
    | { tipo: "lucide"; Icone: Icone }
    | { tipo: "servidor"; nome: string; url: string | null };
  itens: ItemGrade[];
}

/**
 * Seletor de emoji: os personalizados dos meus servidores e os unicode na
 * **mesma lista rolável**, com a coluna de categorias à esquerda, cabeçalho
 * grudado no topo e o rodapé de prévia — como no Discord.
 *
 * Não há aba "Do servidor": os emojis do servidor são a primeira categoria da
 * lista, e a busca é uma só, cobrindo personalizado e unicode ao mesmo tempo.
 * Duas buscas separadas obrigavam a saber de antemão em qual metade o emoji
 * estava, que é justamente o que quem procura não sabe.
 *
 * `onPick` recebe o texto a inserir e, quando é personalizado, o emoji inteiro:
 * o composer insere `:nome:` (é o que a pessoa vê e edita) e a reação usa a
 * forma interna `<:nome:id>`, que é o que fica gravado.
 */
export default function EmojiPicker({
  onPick,
  onClose,
  className = "",
  embutido = false,
  guildId,
  placeholder = "Encontre o emoji perfeito",
}: {
  onPick: (texto: string, custom?: CustomEmoji) => void;
  onClose: () => void;
  className?: string;
  /**
   * O Discord troca o texto da busca conforme o que se está escolhendo — no
   * seletor de reação ele diz "Encontre a reação perfeita". Não é enfeite: é a
   * única coisa na tela que diz se aquele clique vai reagir ou escrever.
   */
  placeholder?: string;
  /** dentro do `PickerPanel` a caixa e o fechar são do painel, não daqui. */
  embutido?: boolean;
  /** servidor a priorizar; sem isso vale o servidor aberto. */
  guildId?: string | null;
}) {
  const guildIdAtivoStore = useGuilds((s) => s.activeGuildId);
  const guildIdAtivo = guildId !== undefined ? guildId : guildIdAtivoStore;
  const secoesServidor = useEmojisOrdenados(guildIdAtivo);
  const me = useAuth((s) => s.user);
  const podeGerenciar = useCanModerate(me?.id);
  const prefs = usePrefsPicker();

  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<ItemGrade | null>(null);
  const [ativa, setAtiva] = useState<string>("");
  const [tomAberto, setTomAberto] = useState(false);
  const tom = prefs.tomDePele as TomDePele;

  const rolagem = useRef<HTMLDivElement>(null);
  const alvos = useRef(new Map<string, HTMLElement>());

  const buscando = busca.trim().length > 0;

  /** Todos os personalizados em lista plana — usados na busca e nos frequentes. */
  const customPlanos = useMemo(
    () =>
      secoesServidor.flatMap((s) =>
        s.emojis.map((emoji) => ({ emoji, servidor: s.guildName })),
      ),
    [secoesServidor],
  );

  const secoes = useMemo<SecaoGrade[]>(() => {
    if (buscando) {
      const q = normalizar(busca.trim());
      const custom = customPlanos
        .filter(({ emoji }) => normalizar(emoji.name).includes(q))
        .map(({ emoji, servidor }) => ({
          tipo: "custom" as const,
          chave: emoji.id,
          emoji,
          servidor,
        }));
      const unicode = buscarUnicode(busca).map((item) => ({
        tipo: "unicode" as const,
        chave: item.u,
        item,
      }));
      return [
        {
          id: "busca",
          titulo: "Resultados",
          icone: { tipo: "lucide", Icone: Smile },
          itens: [...custom, ...unicode],
        },
      ];
    }

    const lista: SecaoGrade[] = [];

    // "usados com frequência" primeiro, como no Discord; só aparece com histórico
    const frequentes = emojisFrequentes(prefs)
      .map((token): ItemGrade | null => {
        const ref = parseCustomEmoji(token);
        if (ref) {
          const achado = customPlanos.find(({ emoji }) => emoji.id === ref.id);
          return achado
            ? {
                tipo: "custom",
                chave: `freq-${achado.emoji.id}`,
                emoji: achado.emoji,
                servidor: achado.servidor,
              }
            : null;
        }
        const item = emojiPorCaractere(token);
        return item ? { tipo: "unicode", chave: `freq-${item.u}`, item } : null;
      })
      .filter((x): x is ItemGrade => x !== null);

    if (frequentes.length > 0) {
      lista.push({
        id: "frequentes",
        titulo: "Usados com frequência",
        icone: { tipo: "lucide", Icone: Clock },
        itens: frequentes,
      });
    }

    for (const secao of secoesServidor) {
      if (secao.emojis.length === 0) continue;
      lista.push({
        id: `guild:${secao.guildId}`,
        titulo: secao.guildName,
        icone: { tipo: "servidor", nome: secao.guildName, url: secao.guildIconUrl },
        itens: secao.emojis.map((emoji) => ({
          tipo: "custom" as const,
          chave: emoji.id,
          emoji,
          servidor: secao.guildName,
        })),
      });
    }

    for (const categoria of categoriasUnicode()) {
      lista.push({
        id: `cat:${categoria.id}`,
        titulo: categoria.titulo,
        icone: { tipo: "lucide", Icone: ICONE_CATEGORIA[categoria.id] ?? Smile },
        itens: categoria.itens.map((item) => ({
          tipo: "unicode" as const,
          chave: item.u,
          item,
        })),
      });
    }

    return lista;
  }, [buscando, busca, customPlanos, secoesServidor, prefs]);

  // a coluna lateral acompanha a rolagem: a seção ativa é a que está no topo
  const aoRolar = useCallback(() => {
    const caixa = rolagem.current;
    if (!caixa) return;
    let atual = "";
    for (const [id, el] of alvos.current) {
      if (el.offsetTop - caixa.scrollTop <= 8) atual = id;
    }
    setAtiva(atual);
  }, []);

  const registrarSecao = useCallback((id: string, el: HTMLElement | null) => {
    if (el) alvos.current.set(id, el);
    else alvos.current.delete(id);
  }, []);

  // entrar ou sair da busca troca a lista inteira: volta ao topo
  useEffect(() => {
    rolagem.current?.scrollTo({ top: 0 });
    setAtiva("");
  }, [buscando]);

  function irPara(id: string) {
    const el = alvos.current.get(id);
    const caixa = rolagem.current;
    if (!el || !caixa) return;
    caixa.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    setAtiva(id);
  }

  function escolher(alvo: ItemGrade) {
    if (alvo.tipo === "custom") {
      registrarUsoEmoji(formatCustomEmoji(alvo.emoji.name, alvo.emoji.id));
      onPick(formatCustomEmoji(alvo.emoji.name, alvo.emoji.id), alvo.emoji);
      return;
    }
    // grava o caractere neutro: o tom escolhido é preferência de exibição e
    // muda depois — gravar já com tom espalharia o mesmo emoji em vários itens
    registrarUsoEmoji(alvo.item.char);
    onPick(comTomDePele(alvo.item, tom));
  }

  const corpo = (
    <div className="flex h-full min-h-0 flex-col">
      <BuscaPicker valor={busca} onChange={setBusca} placeholder={placeholder} rotulo={placeholder} />

      <div className="flex min-h-0 flex-1">
        <ColunaLateral rotulo="Categorias de emoji">
          {secoes.map((secao, i) => (
            <div key={secao.id} className="contents">
              {/* a divisória separa servidores das categorias unicode */}
              {i > 0 &&
                secao.id.startsWith("cat:") &&
                !secoes[i - 1].id.startsWith("cat:") && <DivisoriaLateral />}
              <BotaoLateral
                rotulo={secao.titulo}
                ativo={(ativa || secoes[0]?.id) === secao.id}
                onClick={() => irPara(secao.id)}
              >
                {secao.icone.tipo === "lucide" ? (
                  <secao.icone.Icone size={18} />
                ) : (
                  <IconeServidor nome={secao.icone.nome} iconUrl={secao.icone.url} />
                )}
              </BotaoLateral>
            </div>
          ))}
        </ColunaLateral>

        <div
          ref={rolagem}
          onScroll={aoRolar}
          // `relative` não é estética: é o que faz o `offsetTop` das seções ser
          // medido a partir daqui, e não de um ancestral posicionado qualquer —
          // sem isso o "pular para a categoria" erra o alvo
          className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          {secoes.every((s) => s.itens.length === 0) ? (
            <p className="px-2 py-10 text-center text-sm text-txt-muted">
              {buscando ? "Nenhum emoji com esse nome." : "Nenhum emoji por aqui."}
            </p>
          ) : (
            secoes.map((secao) => (
              <SecaoEmoji
                key={secao.id}
                secao={secao}
                tom={tom}
                raiz={rolagem}
                onRegistrar={registrarSecao}
                onEscolher={escolher}
                onFocar={setFoco}
              />
            ))
          )}
        </div>
      </div>

      <RodapePicker>
        <Previa item={foco} tom={tom} />
        <SeletorDeTom
          tom={tom}
          aberto={tomAberto}
          onAbrir={setTomAberto}
          onEscolher={(novo) => {
            definirTomDePele(novo);
            setTomAberto(false);
          }}
        />
        {podeGerenciar && guildIdAtivo && (
          <button
            type="button"
            title="Gerenciar emojis do servidor"
            aria-label="Gerenciar emojis do servidor"
            onClick={() => {
              onClose();
              ui.openModal({ kind: "guildEmojis", guildId: guildIdAtivo });
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-txt-muted transition hover:bg-hov hover:text-txt-normal"
          >
            <Settings2 size={16} aria-hidden="true" />
          </button>
        )}
      </RodapePicker>
    </div>
  );

  if (embutido) return corpo;
  return (
    <CaixaPicker rotulo="Escolher emoji" onClose={onClose} className={className}>
      {corpo}
    </CaixaPicker>
  );
}

/**
 * Uma seção da lista. Só monta os botões depois que ela chega perto da tela —
 * são ~1.900 emojis no total e montar todos de uma vez trava a abertura do
 * painel. Antes disso ocupa a altura estimada, para a rolagem e o "pular para a
 * categoria" caírem no lugar certo mesmo com o conteúdo ainda ausente.
 */
function SecaoEmoji({
  secao,
  tom,
  raiz,
  onRegistrar,
  onEscolher,
  onFocar,
}: {
  secao: SecaoGrade;
  tom: TomDePele;
  raiz: React.RefObject<HTMLDivElement | null>;
  onRegistrar: (id: string, el: HTMLElement | null) => void;
  onEscolher: (item: ItemGrade) => void;
  onFocar: (item: ItemGrade | null) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    onRegistrar(secao.id, ref.current);
    return () => onRegistrar(secao.id, null);
  }, [onRegistrar, secao.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el || visivel) return;
    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) setVisivel(true);
      },
      { root: raiz.current, rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [raiz, visivel]);

  const linhas = Math.ceil(secao.itens.length / COLUNAS);

  return (
    <section ref={ref} className="mb-1">
      <h3 className="sticky top-0 z-10 flex items-center gap-1.5 bg-panel px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-txt-muted">
        {secao.icone.tipo === "servidor" ? (
          <IconeServidor nome={secao.icone.nome} iconUrl={secao.icone.url} />
        ) : (
          <secao.icone.Icone size={14} aria-hidden="true" />
        )}
        <span className="truncate">{secao.titulo}</span>
      </h3>
      {visivel ? (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${COLUNAS}, ${CELULA}px)` }}>
          {secao.itens.map((alvo) => (
            <BotaoEmoji
              key={alvo.chave}
              alvo={alvo}
              tom={tom}
              onEscolher={onEscolher}
              onFocar={onFocar}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" style={{ height: linhas * CELULA }} />
      )}
    </section>
  );
}

function BotaoEmoji({
  alvo,
  tom,
  onEscolher,
  onFocar,
}: {
  alvo: ItemGrade;
  tom: TomDePele;
  onEscolher: (item: ItemGrade) => void;
  onFocar: (item: ItemGrade | null) => void;
}) {
  const rotulo = alvo.tipo === "custom" ? `:${alvo.emoji.name}:` : `:${alvo.item.nome}:`;
  return (
    <button
      type="button"
      aria-label={rotulo}
      onClick={() => onEscolher(alvo)}
      onPointerEnter={() => onFocar(alvo)}
      onFocus={() => onFocar(alvo)}
      className="grid h-10 w-10 place-items-center rounded transition hover:bg-hov"
    >
      {alvo.tipo === "custom" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alvo.emoji.url}
          alt={rotulo}
          loading="lazy"
          className="h-8 w-8 object-contain"
        />
      ) : (
        <span className="text-[28px] leading-none">{comTomDePele(alvo.item, tom)}</span>
      )}
    </button>
  );
}

/**
 * Prévia do rodapé: o emoji grande e, ao lado, os nomes por que ele atende.
 *
 * Numa linha só e todos escritos `:assim:`, como no print — antes o nome ia em
 * cima e os apelidos embaixo, sem os dois-pontos, o que os fazia parecer
 * descrição em vez de texto que se pode digitar. É justamente isso que a lista
 * serve para dizer: qualquer um daqueles funciona no composer.
 */
function Previa({ item, tom }: { item: ItemGrade | null; tom: TomDePele }) {
  if (!item) {
    return <span className="flex-1 text-sm text-txt-muted">Escolha um emoji</span>;
  }
  const nome = item.tipo === "custom" ? item.emoji.name : item.item.nome;
  // emoji de servidor não tem apelido: ali o que informa é de qual servidor ele é
  const detalhe =
    item.tipo === "custom"
      ? item.servidor
      : item.item.aliases
          .filter((a) => a !== nome)
          .slice(0, 3)
          .map((a) => `:${a}:`)
          .join(" ");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {item.tipo === "custom" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.emoji.url} alt="" className="h-7 w-7 shrink-0 object-contain" />
      ) : (
        <span aria-hidden="true" className="shrink-0 text-2xl leading-none">
          {comTomDePele(item.item, tom)}
        </span>
      )}
      <span className="flex min-w-0 items-baseline gap-1.5 truncate">
        <span className="shrink-0 text-sm font-semibold text-txt-primary">{`:${nome}:`}</span>
        {detalhe && <span className="truncate text-sm text-txt-muted">{detalhe}</span>}
      </span>
    </span>
  );
}

/** Tom de pele — no rodapé, à direita da prévia, como no Discord. */
function SeletorDeTom({
  tom,
  aberto,
  onAbrir,
  onEscolher,
}: {
  tom: TomDePele;
  aberto: boolean;
  onAbrir: (v: boolean) => void;
  onEscolher: (tom: TomDePele) => void;
}) {
  const atual = TONS_DE_PELE.find((t) => t.id === tom) ?? TONS_DE_PELE[0];
  return (
    <div
      className="relative shrink-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onAbrir(false);
      }}
    >
      <button
        type="button"
        aria-label={`Tom de pele: ${atual.rotulo}`}
        aria-expanded={aberto}
        onClick={() => onAbrir(!aberto)}
        className="grid h-7 w-7 place-items-center rounded transition hover:bg-hov"
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: atual.amostra }}
          className="h-4 w-4 rounded-full"
        />
      </button>
      {aberto && (
        <div
          role="listbox"
          aria-label="Tom de pele"
          className="anim-menu absolute bottom-full right-0 mb-1 flex gap-1 rounded bg-void p-1 shadow-high"
        >
          {TONS_DE_PELE.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === tom}
              aria-label={t.rotulo}
              onClick={() => onEscolher(t.id)}
              className={`grid h-7 w-7 place-items-center rounded transition hover:bg-hov ${
                t.id === tom ? "bg-hov" : ""
              }`}
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: t.amostra }}
                className="h-4 w-4 rounded-full"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
