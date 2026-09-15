"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Hash, Lock, Megaphone, Server, Users, Volume2 } from "@/components/ui/icones";
import {
  isGroupChannel,
  isUnread,
  type Category,
  type Channel,
  type PublicUser,
  type UserStatus,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { useEhMobile } from "@/hooks/useEhMobile";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { rank, type QuickItem, type QuickKind } from "@/lib/quick-switcher";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { goToChannel } from "@/stores/messages-navigate";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, useUI } from "@/stores/ui";

/**
 * Busca rápida (Ctrl+K), no formato do Discord: **sem título**, ancorada no
 * terço superior, o campo é a primeira coisa da caixa.
 *
 * A lista de candidatos vai além do que o app já tem em memória: os canais de
 * **todos** os servidores são buscados na primeira abertura e guardados em
 * cache — sem isso, procurar um canal de servidor fechado obrigava a um desvio
 * de dois passos. Amigos sem conversa aberta também entram: escolher um deles
 * abre a conversa.
 */

const RECENTES_KEY = "quickSwitcher.recentes";
const MAX_RECENTES = 5;
/** Prefixo dos itens que ainda não têm conversa aberta (`user:<id>`). */
const PREFIXO_USUARIO = "user:";

/**
 * Canais por servidor, buscados uma vez por sessão da aba. O quick switcher é
 * reaberto o tempo todo; refazer N requisições a cada Ctrl+K seria pior que o
 * problema que isso resolve.
 */
const cacheDeCanais = new Map<string, Channel[]>();
/**
 * Categorias dos outros servidores, na mesma busca dos canais: o nome da
 * categoria vai colado ao nome do canal (`.note__71961`), e a rota de servidor
 * não traz categoria. Falhar aqui só apaga a nota, não vira aviso de erro.
 */
const cacheDeCategorias = new Map<string, Category[]>();

/**
 * Caracteres que, no começo da busca, filtram por tipo: `#` `@` `*` são do
 * matcher (`lib/quick-switcher.ts`), `!` é o filtro de voz deste modal.
 */
const PREFIXOS_DE_BUSCA = "#@*!";

function lerRecentes(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(RECENTES_KEY) : null;
    const lista: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista.filter((i): i is string => typeof i === "string") : [];
  } catch {
    return [];
  }
}

function registrarRecente(id: string) {
  try {
    const proximos = [id, ...lerRecentes().filter((i) => i !== id)].slice(0, MAX_RECENTES);
    localStorage.setItem(RECENTES_KEY, JSON.stringify(proximos));
  } catch {
    // sem storage os recentes simplesmente não persistem
  }
}

/**
 * Abre a busca rápida — o mesmo modal do Ctrl+K, de qualquer lugar.
 *
 * Existe para o **celular**, onde o gatilho de teclado não existe
 * (`docs/LEIAUTE-MOBILE-COBERTURA.md` §6: "não há como abri-lo no celular").
 * No Discord do celular a busca global mora na pílula "Search" do topo da lista
 * de canais (`docs/Reference/mobile/discord-mobile-servidor-2024.png`), que no
 * nosso app é a pílula "Buscar" de `layout/sidebar/CabecalhoDoServidor.tsx` —
 * hoje inerte, e em arquivo de outro cartão: quem a ligar chama isto.
 */
export function abrirTrocadorRapido() {
  ui.openModal({ kind: "quickSwitcher" });
}

/** O que cada resultado precisa para se desenhar (ícone, avatar, caminho). */
interface Detalhe {
  kind: QuickKind;
  /** canal: tipo/estado que decide o ícone. */
  variante?: "VOICE" | "readOnly" | "private" | "GROUP" | "";
  /** conversa 1-a-1 ou amigo: o avatar e a bolinha de status. */
  user?: PublicUser;
  /** grupo de conversa: mosaico dos participantes. */
  grupo?: { iconUrl: string | null; members: PublicUser[] };
  /** servidor: ícone próprio. */
  guild?: { name: string; iconUrl: string | null };
  /** servidor a que o canal pertence (a navegação troca de servidor por ele). */
  guildId?: string | null;
  /** canal: nome da categoria, em versalete colado ao nome (`.note__71961`). */
  nota?: string;
  /** conversa 1-a-1 ou amigo: o nome de usuário depois do nome (`.username__71961`). */
  usuario?: string;
  /** há mensagem depois do que eu li: o nome vai em `text-strong` (`.contentUnread__71961`). */
  naoLido?: boolean;
}

export default function QuickSwitcher() {
  const t = useT();
  const closeModal = useUI((s) => s.closeModal);
  const canaisDoAtivo = useChannels((s) => s.channels);
  const categoriasCarregadas = useCategories((s) => s.categories);
  const guildDasCategorias = useCategories((s) => s.guildId);
  const dms = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);
  const amigos = useFriends((s) => s.friends);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const statuses = usePresence((s) => s.statuses);
  const ehMobile = useEhMobile();

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  /** enquanto se navega pelo teclado, passar o mouse não muda a seleção. */
  const [tecladoNoComando, setTecladoNoComando] = useState(false);
  const [canaisPorServidor, setCanaisPorServidor] = useState<Map<string, Channel[]>>(
    () => new Map(cacheDeCanais),
  );
  const [categoriasPorServidor, setCategoriasPorServidor] = useState<Map<string, Category[]>>(
    () => new Map(cacheDeCategorias),
  );
  /** estado "carregando": a busca dos canais dos outros servidores está em voo. */
  const [carregando, setCarregando] = useState(false);
  /** estado "erro": pelo menos um servidor não respondeu — os resultados que já
   *  temos continuam de pé, só avisamos que a lista pode estar incompleta. */
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const listaRef = useRef<HTMLUListElement>(null);
  const recentes = useMemo(lerRecentes, []);

  // os canais dos outros servidores só existem depois desta busca
  useEffect(() => {
    let vivo = true;
    const faltando = guilds.filter((g) => !cacheDeCanais.has(g.id) && g.id !== activeGuildId);
    if (faltando.length === 0) return;
    setCarregando(true);
    setErroAoCarregar(false);
    void Promise.all(
      faltando.map((g) =>
        Promise.all([
          api.getGuild(g.id).then((cheio) => {
            cacheDeCanais.set(g.id, cheio.channels ?? []);
            return true;
          }),
          api
            .listCategories(g.id)
            .then((lista) => cacheDeCategorias.set(g.id, lista))
            .catch(() => undefined),
        ])
          .then(() => true)
          .catch(() => false),
      ),
    ).then((sucessos) => {
      if (!vivo) return;
      setCanaisPorServidor(new Map(cacheDeCanais));
      setCategoriasPorServidor(new Map(cacheDeCategorias));
      setCarregando(false);
      setErroAoCarregar(sucessos.some((ok) => !ok));
    });
    return () => {
      vivo = false;
    };
  }, [guilds, activeGuildId]);

  const { itens, detalhes } = useMemo(() => {
    const detalhes = new Map<string, Detalhe>();
    const itens: QuickItem[] = [];
    const nomeDoServidor = new Map(guilds.map((g) => [g.id, g.name]));
    const nomeDaCategoria = new Map<string, string>();
    for (const lista of categoriasPorServidor.values()) {
      for (const c of lista) nomeDaCategoria.set(c.id, c.name);
    }
    // as do servidor ativo vêm do store (ficam em dia com renomear/criar)
    if (activeGuildId && guildDasCategorias === activeGuildId) {
      for (const c of categoriasCarregadas) nomeDaCategoria.set(c.id, c.name);
    }

    const todosOsCanais: { canal: Channel; guildId: string }[] = [];
    for (const c of canaisDoAtivo) {
      if (activeGuildId) todosOsCanais.push({ canal: c, guildId: activeGuildId });
    }
    for (const [guildId, lista] of canaisPorServidor) {
      if (guildId === activeGuildId) continue;
      for (const c of lista) todosOsCanais.push({ canal: c, guildId });
    }

    for (const { canal, guildId } of todosOsCanais) {
      detalhes.set(canal.id, {
        kind: "channel",
        variante:
          canal.type === "VOICE"
            ? "VOICE"
            : canal.readOnly
              ? "readOnly"
              : canal.private
                ? "private"
                : "",
        guildId,
        nota: canal.categoryId ? nomeDaCategoria.get(canal.categoryId) : undefined,
        naoLido: isUnread(canal),
      });
      // à direita só o servidor, como no print (`03-troca-rapida.png`: "Plant
      // Pals"); o antigo "Servidor › #canal" repetia o nome e punha `#` até
      // em canal de voz
      itens.push({
        id: canal.id,
        kind: "channel",
        label: canal.name ?? "canal",
        hint: nomeDoServidor.get(guildId),
      });
    }

    const comConversa = new Set<string>();
    for (const d of dms) {
      const grupo = isGroupChannel(d);
      const outro = grupo ? undefined : d.others[0];
      if (outro) comConversa.add(outro.id);
      detalhes.set(d.id, {
        kind: "dm",
        variante: grupo ? "GROUP" : "",
        user: outro,
        grupo: grupo ? { iconUrl: d.iconUrl, members: d.others } : undefined,
        // sem apelido o título já é o usuário: não repete o mesmo nome
        usuario: outro && dmTitle(d) !== outro.username ? outro.username : undefined,
        naoLido: isUnread(d),
      });
      itens.push({ id: d.id, kind: "dm", label: dmTitle(d) });
    }

    // amigos que ainda não têm conversa: escolher um deles abre a conversa
    for (const a of amigos) {
      if (comConversa.has(a.id)) continue;
      const id = `${PREFIXO_USUARIO}${a.id}`;
      detalhes.set(id, {
        kind: "dm",
        user: a,
        usuario: a.displayName?.trim() ? a.username : undefined,
      });
      itens.push({ id, kind: "dm", label: a.displayName?.trim() || a.username });
    }

    for (const g of guilds) {
      detalhes.set(g.id, { kind: "guild", guild: { name: g.name, iconUrl: g.iconUrl } });
      itens.push({ id: g.id, kind: "guild", label: g.name });
    }

    return { itens, detalhes };
  }, [
    canaisDoAtivo,
    canaisPorServidor,
    categoriasPorServidor,
    categoriasCarregadas,
    guildDasCategorias,
    dms,
    amigos,
    guilds,
    activeGuildId,
  ]);

  /** `!` filtra canais de voz; os outros prefixos são do próprio matcher. */
  const soVoz = query.trimStart().startsWith("!");
  const consulta = soVoz ? query.trimStart().slice(1) : query;
  const candidatos = useMemo(
    () => (soVoz ? itens.filter((i) => detalhes.get(i.id)?.variante === "VOICE") : itens),
    [itens, detalhes, soVoz],
  );

  const resultados = useMemo(
    () => rank(candidatos, consulta, { recentes, limit: 50 }),
    [candidatos, consulta, recentes],
  );

  // busca nova recomeça a seleção do topo
  useEffect(() => setCursor(0), [query]);

  // mantém o item selecionado à vista quando se navega com as setas
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function escolher(item: QuickItem | undefined) {
    if (!item) return;
    const detalhe = detalhes.get(item.id);
    registrarRecente(item.id);
    closeModal();
    if (item.kind === "guild") {
      const guild = guilds.find((g) => g.id === item.id);
      if (guild) useGuilds.getState().select(guild);
      return;
    }
    if (item.kind === "dm") {
      if (item.id.startsWith(PREFIXO_USUARIO)) {
        ui.setView("dm");
        void useDMs.getState().openWith(item.id.slice(PREFIXO_USUARIO.length));
        return;
      }
      const dm = dms.find((d) => d.id === item.id);
      if (dm) {
        ui.setView("dm");
        useDMs.getState().select(dm);
      }
      return;
    }
    // canal de qualquer servidor: quem sabe trocar de servidor é o navegador
    void goToChannel({ guildId: detalhe?.guildId ?? null, channelId: item.id });
  }

  function navegar(delta: number) {
    if (resultados.length === 0) return;
    setTecladoNoComando(true);
    setCursor((c) => (c + delta + resultados.length) % resultados.length);
  }

  const vazia = !query.trim();

  /*
   * Pílula no caractere de prefixo (`.autocompleteQuerySymbol_ac6cb0` em
   * `css-bruto/599266.ab3918065004d411.css`: `background-color:var(--background-
   * base-lowest);border-radius:4px;font-family:var(--font-code);padding:2px`).
   * Um `<input>` não pinta um caractere só, então o campo vira três camadas
   * alinhadas pixel a pixel (mesma fonte, tamanho, borda e recuo):
   *   1. embaixo, o fundo do campo e a pílula (`EspelhoDoCampo camada="pilula"`);
   *   2. no meio, o próprio `<input>`, com fundo e texto transparentes: cursor,
   *      seleção e rolagem continuam sendo do navegador;
   *   3. em cima, o texto visível (`camada="texto"`), sem fundo nenhum.
   * A pílula fica ATRÁS do input para não cobrir o cursor, que na hora de
   * digitar mora exatamente colado ao prefixo. O caractere ocupa a largura dele
   * na fonte do campo (é por ela que o navegador põe o cursor) e o glifo mono é
   * centrado por cima; os 2px de padding saem para fora dessa largura em vez de
   * empurrar o texto (no Discord empurram, mas lá o texto não divide espaço com
   * um input). A rolagem horizontal do input é copiada para as duas camadas.
   * Sem print 1:1 do campo com prefixo digitado para conferir: a pílula segue só
   * o CSS; o print do blog mostra a mesma classe no PROTIP, não no campo.
   */
  const inicioDaBusca = query.length - query.trimStart().length;
  const caractereInicial = query.charAt(inicioDaBusca);
  const prefixo =
    caractereInicial && PREFIXOS_DE_BUSCA.includes(caractereInicial) ? caractereInicial : null;
  const campoRef = useRef<HTMLInputElement>(null);
  const [rolagem, setRolagem] = useState(0);
  function copiarRolagem() {
    const campo = campoRef.current;
    if (!campo) return;
    setRolagem(campo.scrollLeft);
    // o navegador rola até o cursor depois de desenhar o caractere novo
    requestAnimationFrame(() => {
      if (campoRef.current) setRolagem(campoRef.current.scrollLeft);
    });
  }
  // texto novo pode rolar o campo sem evento de rolagem (colar, apagar tudo)
  useLayoutEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    setRolagem(campo.scrollLeft);
    const quadro = requestAnimationFrame(() => setRolagem(campo.scrollLeft));
    return () => cancelAnimationFrame(quadro);
  }, [query]);

  return (
    <Dialog
      title={t("quick.titulo")}
      hideHeader
      /*
        **No celular, tela cheia** (barra de 56 com a seta de voltar, áreas
        seguras e o voltar do sistema, tudo da moldura `Modal`). Antes era o
        cartão de 570 encolhido para a largura da tela, com o × no canto por
        cima do campo e a lista presa num teto de 262px — metade de um telefone
        deitado. É a forma das buscas do Discord no celular: a busca ocupa a tela
        toda, com o campo no topo e o teclado aberto embaixo
        (`suporte/.../how-to-use-search-on-discord/03.gif`, quadro 20). Os
        tamanhos da caixa de lá não têm escala (GIF) e não foram copiados.

        Na tela cheia o `hideHeader` não vale (sem barra não haveria saída) e o
        × do cartão não é desenhado — a seta faz o papel dele.
      */
      telaCheiaNoCelular
      showClose={false}
      align="top"
      onClose={closeModal}
      className="w-[570px]"
      bodyClassName="!p-0"
    >
      {/* Campo: 70px de altura, texto 22px, fundo `input-background-default`
       *  (mais escuro que a caixa `background-surface-high` do modal, não o
       *  mesmo tom) e borda de 1px — `.input_ac6cb0` em `css-bruto/599266.
       *  ab3918065004d411.css`: `height:70px;line-height:70px;font-size:22px;
       *  padding:0 12px;border:1px solid var(--input-border-default);
       *  border-radius:var(--radius-sm)`. O recuo do campo em relação à borda
       *  do modal (12px em cima, 20px nas laterais) é o `padding:12px 20px 0`
       *  do `.quickswitcher_ac6cb0` que envolve o campo. Em foco a borda vira
       *  limão (`--input-border-active`): é o único lugar da peça em que a
       *  marca aparece, pela regra 2 da ADR-0009 ("o campo em foco é marca").
       *  22px não tem classe nomeada na escala (`text-lg` é 20, `heading-xl`
       *  é 24) — arbitrário porque o número vem de medida, não de escolha. */}
      {/* No celular o campo fica **preso no topo** da área que rola: a lista
          passa por baixo dele, e o que se digita continua à vista. */}
      <div className={ehMobile ? "sticky top-0 z-10 bg-background-surface-high px-4 pb-2 pt-4" : "px-5 pt-3"}>
        {/* o fundo do campo mora aqui (camada 1), porque o input é transparente */}
        <div className="relative rounded-lg bg-input-background-default">
          {prefixo && (
            <EspelhoDoCampo
              camada="pilula"
              antes={query.slice(0, inicioDaBusca)}
              prefixo={prefixo}
              depois=""
              rolagem={rolagem}
              ehMobile={ehMobile}
            />
          )}
          <input
            ref={campoRef}
            autoFocus
            onScroll={copiarRolagem}
            onSelect={copiarRolagem}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                navegar(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                navegar(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                escolher(resultados[cursor]);
              }
            }}
            aria-label={t("quick.placeholder")}
            aria-controls="quick-switcher-resultados"
            placeholder={t("quick.placeholder")}
            // só no celular: o teclado virtual corrigiria e capitalizaria nomes de
            // canal; no desktop o campo continua exatamente como era
            enterKeyHint={ehMobile ? "go" : undefined}
            autoComplete={ehMobile ? "off" : undefined}
            autoCapitalize={ehMobile ? "none" : undefined}
            spellCheck={ehMobile ? false : undefined}
            /* No celular, 48 de altura e 16px: os 70/22 do `.input_ac6cb0` são a
               caixa do desktop. 48 é a altura dos campos do app de celular
               (`TextInput` `md` com `celular:h-[48px]`, o campo do login), e 16 é
               o mínimo que impede o zoom automático do iOS ao focar. A caixa do
               Discord no celular não está medida no acervo. Tokens iguais. */
            className={`relative z-[1] block w-full rounded-lg border border-input-border-default bg-transparent px-3 outline-none placeholder:text-input-placeholder-text-default focus:border-input-border-active ${
              ehMobile ? "h-[48px] text-text-md" : "h-[70px] text-[22px] leading-[70px]"
            } ${
              // com prefixo o texto visível é o da camada de cima; o cursor
              // precisa de cor própria, senão herdaria o transparente
              prefixo
                ? "text-transparent caret-text-default selection:text-transparent"
                : "text-text-default"
            }`}
          />
          {prefixo && (
            <EspelhoDoCampo
              camada="texto"
              antes={query.slice(0, inicioDaBusca)}
              prefixo={prefixo}
              depois={query.slice(inicioDaBusca + 1)}
              rolagem={rolagem}
              ehMobile={ehMobile}
            />
          )}
        </div>
      </div>

      {/* `margin-top:16px` do `.scroller_ac6cb0` antes da lista de resultados. */}
      <div className={ehMobile ? "mt-2" : "mt-4"}>
        {/* `.header__71961` (`css-bruto/343264.b7207c1102406500.css`):
         *  `color:var(--interactive-text-default);font-size:12px;font-weight:
         *  semibold;letter-spacing:.025em;line-height:30px;margin-top:4px;
         *  text-transform:uppercase`. Com os 16px do scroller, a 1ª linha começa
         *  16+4+30 = 50px abaixo do campo. O texto en do print é "PREVIOUS
         *  CHANNELS"; a chave `quick.recentes` mora em `lib/i18n.ts`. */}
        {vazia && resultados.length > 0 && (
          <p className="mt-1 px-5 text-text-xs font-semibold uppercase leading-[30px] tracking-[.025em] text-interactive-text-default">
            {t("quick.recentes")}
          </p>
        )}

        {/* estado "carregando": os canais dos servidores que não são o ativo
         *  só chegam depois de uma busca — sem aviso, sumiam da lista sem
         *  explicação até a resposta voltar. Mesmo spinner de `MessageList.
         *  tsx` (`border-border-normal border-t-text-muted`), pela consistência. */}
        {carregando && (
          <p
            role="status"
            aria-label="Carregando outros servidores"
            className="flex items-center gap-2 px-5 pb-2 text-text-xs text-text-muted"
          >
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-border-normal border-t-text-muted" />
            Carregando outros servidores…
          </p>
        )}

        {/* estado "erro": a busca dos outros servidores falhou parcialmente —
         *  os resultados que já temos continuam de pé, só avisamos que a
         *  lista pode estar incompleta (o erro por servidor já era engolido
         *  antes; agora só vira aviso, não trava a busca). */}
        {!carregando && erroAoCarregar && (
          <p className="flex items-center gap-2 px-5 pb-2 text-text-xs text-text-feedback-critical">
            <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
            Alguns servidores não responderam — a lista pode estar incompleta.
          </p>
        )}

        {/* `.resultsArea_ac6cb0{height:262px}` mede a caixa cheia (com a
         *  ilustração do estado vazio, que não temos — ver "faltando"); aqui
         *  vira teto (`max-h`), não altura fixa, para não sobrar caixa cinza
         *  vazia atrás de uma linha de texto só.
         *
         *  Alinhamento lateral: no print (`03-troca-rapida.png`) a linha
         *  selecionada tem as mesmas bordas do campo (x371–1230). O Discord
         *  consegue isso com `.scroller_ac6cb0{margin-inline-end:-17px}`, que
         *  conta com uma barra de 17px. A nossa barra fina tem outra largura
         *  (≈10px na captura, 0 onde a barra flutua), então a lista começa no
         *  recuo do campo (`pl-5`), sem recuo à direita, e a linha tem no máximo
         *  a largura do campo: 570 − 2 de borda − 2×20 de recuo = 528. Sobra à
         *  direita espaço para a barra, qualquer que seja a largura dela. */}
        <ul
          id="quick-switcher-resultados"
          ref={listaRef}
          role="listbox"
          aria-label={t("quick.titulo")}
          onMouseMove={() => setTecladoNoComando(false)}
          /* no celular sem teto: a lista rola com a tela cheia inteira */
          className={ehMobile ? "px-2 pb-3" : "max-h-[262px] overflow-y-auto pb-3 pl-5"}
        >
          {resultados.length === 0 && (
            <li className="px-3 py-10 text-center">
              {/* `.emptyStateNote_ac6cb0{color:var(--text-muted);font-size:16px;
               *  line-height:20px}` = exatamente `text-text-md`. */}
              <p className="text-text-md font-medium text-text-default">{t("quick.vazio")}</p>
            </li>
          )}
          {resultados.map((item, indice) => {
            // no dedo não há seta nem Enter para "a linha escolhida" apontar: a
            // primeira linha acesa ali pareceria já tocada
            const selecionado = !ehMobile && indice === cursor;
            const detalhe = detalhes.get(item.id);
            return (
              <li key={`${item.kind}-${item.id}`} role="option" aria-selected={selecionado}>
                <button
                  type="button"
                  data-indice={indice}
                  // mover o mouse não rouba a seleção de quem está no teclado
                  // o `mouseenter` sintético do toque moveria o cursor à toa
                  onMouseEnter={() => !ehMobile && !tecladoNoComando && setCursor(indice)}
                  onClick={() => escolher(item)}
                  /* Desktop: `.result__71961{height:34px;border-radius:3px;
                     font-size:16px;font-weight:medium}` e `.content__71961{
                     line-height:34px;padding:0 10px}` (`css-bruto/343264`); no
                     print a linha selecionada tem ≈34px (55px de imagem a 1,627).
                     Selecionada: `.result__71961[aria-selected=true]{background:
                     var(--interactive-background-selected)}`, o cinza neutro da
                     própria peça, nunca o limão. Nome: `.contentDefault__71961`
                     = `interactive-text-default`, e `text-strong` só com não
                     lidas (`.contentUnread__71961`); a seleção não clareia o
                     texto (no print "Big Wumpus" selecionado tem a mesma cor de
                     "general"). O corpo já é 16px, então não há classe de tamanho.
                     No celular, 48: o passo da lista de conversas do Discord no
                     celular (`MEDIDAS.md` §9, 47,7pt), a lista de nomes com
                     avatar mais parecida que o acervo mede — acima do piso de
                     44. O toque acende com `active:`, não com o cursor. */
                  className={`flex w-full items-center text-left font-medium ${
                    detalhe?.naoLido ? "text-text-strong" : "text-interactive-text-default"
                  } ${
                    ehMobile
                      ? "h-[48px] gap-2 rounded px-2 active:bg-interactive-background-hover"
                      : "h-[34px] max-w-[528px] rounded-[3px] px-[10px] leading-[34px]"
                  } ${selecionado ? "bg-interactive-background-selected" : ""}`}
                >
                  {/* `.iconContainer__71961{width:20px;margin-inline-end:5px}`;
                   *  no celular o ícone segue no `gap-2` de antes */}
                  <span
                    className={
                      ehMobile ? "contents" : "mr-[5px] flex w-5 shrink-0 items-center justify-center"
                    }
                  >
                    <ItemIcon detalhe={detalhe} statuses={statuses} selecionado={selecionado} />
                  </span>
                  {/* `.name__71961{display:flex;align-items:baseline}`: o nome, e
                   *  colado a ele a categoria (`.note__71961{font-size:10px;
                   *  font-weight:semibold;line-height:14px;text-transform:
                   *  uppercase;color:var(--text-muted)}`, "PLANT HALL" no print)
                   *  ou o nome de usuário (`.username__71961{font-weight:normal;
                   *  opacity:.6}`). O print escreve o usuário sem "@"
                   *  ("adorable_kiwi_05818"), e o print manda mais que o texto
                   *  antigo. */}
                  <span className="flex min-w-0 flex-1 items-baseline overflow-hidden">
                    <span className="min-w-0 truncate">{item.label}</span>
                    {detalhe?.nota && (
                      <span className="ml-1 min-w-0 truncate text-[10px] font-semibold uppercase leading-[14px] text-text-muted">
                        {detalhe.nota}
                      </span>
                    )}
                    {detalhe?.usuario && (
                      <span className="ml-1 min-w-0 truncate font-normal opacity-60">
                        {detalhe.usuario}
                      </span>
                    )}
                  </span>
                  {/* `.misc__71961{color:var(--interactive-text-default);
                   *  margin-inline-start:4px;max-width:140px}` dentro de
                   *  `.miscContainer_ac6cb0{opacity:.6}`: o servidor do canal */}
                  {item.hint && (
                    <span className="ml-1 max-w-[140px] shrink-0 truncate text-text-md text-interactive-text-default opacity-60">
                      {item.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Rodapé: uma linha só, como `.protip_ac6cb0` mede — as dicas de
       *  prefixo (`@ # ! *`) moram aqui, não numa faixa própria (ver
       *  divergência "faixa de dicas de prefixo"). "PROTIP" é verde
       *  (`--text-feedback-positive`, medido no catálogo — ver "medidas").
       *  Cada símbolo numa caixinha, a mesma `.autocompleteQuerySymbol_ac6cb0`
       *  do campo (no print, "@" em fundo mais escuro que a caixa). O "Learn
       *  more" do print não entra: não temos página de ajuda para onde levar. */}
      <p className="border-t border-border-subtle px-5 py-2.5 text-text-xs text-text-muted">
        <span className="font-semibold uppercase text-text-feedback-positive">Protip:</span>{" "}
        comece a busca com <kbd className={CLASSE_DO_SIMBOLO}>@</kbd>{" "}
        <kbd className={CLASSE_DO_SIMBOLO}>#</kbd> <kbd className={CLASSE_DO_SIMBOLO}>!</kbd>{" "}
        <kbd className={CLASSE_DO_SIMBOLO}>*</kbd> para restringir os resultados.
      </p>
    </Dialog>
  );
}

/** `.autocompleteQuerySymbol_ac6cb0`: fundo `background-base-lowest`, raio 4, mono, padding 2. */
const CLASSE_DO_SIMBOLO = "rounded bg-background-base-lowest p-0.5 font-mono";

/**
 * Uma camada do campo com prefixo (ver o comentário de `prefixo` no modal).
 * Repete a caixa do `<input>` — borda de 1px transparente, `px-3`, mesma fonte
 * e altura — e corta o texto na caixa de conteúdo, onde o input corta o dele.
 */
function EspelhoDoCampo({
  camada,
  antes,
  prefixo,
  depois,
  rolagem,
  ehMobile,
}: {
  camada: "pilula" | "texto";
  antes: string;
  prefixo: string;
  depois: string;
  rolagem: number;
  ehMobile: boolean;
}) {
  const pilula = camada === "pilula";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 flex items-center border border-transparent px-3 ${
        ehMobile ? "text-text-md" : "text-[22px] leading-[70px]"
      } ${pilula ? "" : "z-[2] text-text-default"}`}
    >
      {/* o corte da camada da pílula abre 2px para cada lado, para o padding da
       *  pílula não sumir quando o prefixo é o primeiro caractere */}
      <div
        className={`flex min-w-0 flex-1 items-center self-stretch overflow-hidden ${
          pilula ? "-mx-[2px] px-[2px]" : ""
        }`}
      >
        <span
          className="shrink-0 whitespace-pre"
          style={{ transform: `translateX(${-rolagem}px)` }}
        >
          <span className={pilula ? "text-transparent" : ""}>{antes}</span>
          <span className="relative">
            {/* a largura é a do caractere na fonte do campo, a do cursor */}
            <span className="text-transparent">{prefixo}</span>
            {pilula ? (
              <span className="absolute -inset-[2px] rounded bg-background-base-lowest" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center font-mono">
                {prefixo}
              </span>
            )}
          </span>
          {depois}
        </span>
      </div>
    </div>
  );
}

/** Ícone do resultado: avatar nas conversas, ícone do servidor nos servidores. */
function ItemIcon({
  detalhe,
  statuses,
  selecionado,
}: {
  detalhe: Detalhe | undefined;
  statuses: Record<string, UserStatus>;
  selecionado: boolean;
}) {
  // a linha não tem mais fundo colorido (ver divergência da linha
  // selecionada): o ícone só clareia um pouco, como `interactive-icon-hover`
  // em qualquer outra lista da casa, em vez de virar `accent-ink`.
  const cls = `shrink-0 ${selecionado ? "text-interactive-icon-hover" : "text-interactive-icon-default"}`;
  if (!detalhe) return <Hash size={20} className={cls} aria-hidden="true" />;

  if (detalhe.kind === "guild") {
    const { name, iconUrl } = detalhe.guild ?? { name: "", iconUrl: null };
    return iconUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
    ) : name ? (
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-input-background-default text-[10px] font-semibold text-text-default"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    ) : (
      <Server size={20} className={cls} aria-hidden="true" />
    );
  }

  if (detalhe.kind === "dm") {
    if (detalhe.grupo) {
      return (
        <GroupAvatar
          iconUrl={detalhe.grupo.iconUrl}
          members={detalhe.grupo.members}
          size="sm"
          className="shrink-0"
        />
      );
    }
    if (detalhe.user) {
      return (
        <Avatar
          user={detalhe.user}
          size="sm"
          status={resolveStatus(statuses, detalhe.user)}
          surface="border-background-base-lower"
        />
      );
    }
    return <Users size={20} className={cls} aria-hidden="true" />;
  }

  if (detalhe.variante === "VOICE") return <Volume2 size={20} className={cls} aria-hidden="true" />;
  if (detalhe.variante === "readOnly")
    return <Megaphone size={20} className={cls} aria-hidden="true" />;
  if (detalhe.variante === "private") return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}
