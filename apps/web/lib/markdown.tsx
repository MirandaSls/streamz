"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { displayNameOf, type ChannelType, type PublicUser } from "@streamz/shared";
import Emoji, { CLASSE_EMOJI_INLINE, CLASSE_EMOJI_JUMBO } from "@/components/ui/Emoji";
import {
  AtSign,
  Check,
  Copy,
  Hash,
  Lock,
  Megaphone,
  MessagesSquare,
  Users,
  Volume2,
} from "@/components/ui/icones";
import { BotaoDeIcone, Tooltip } from "@/components/ui/primitivos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { goToChannel } from "@/stores/messages-navigate";
import { useThreads } from "@/stores/messages-threads";
import { useResumosDeCanal } from "@/stores/resumos-de-canal";
import { anchorOf, useUI } from "@/stores/ui";
import {
  destacarCodigo,
  formatarCarimbo,
  intervaloDoRelativo,
  parseBlocks,
  soEmojis,
  type Block,
  type EstiloDeCarimbo,
  type Inline,
  type TipoDeTrecho,
} from "./markdown-core";
import { API_URL } from "./config";
import { separarEmojis, temEmoji } from "./twemoji";

export {
  destacarCodigo,
  formatarCarimbo,
  parseBlocks,
  parseInline,
  plainText,
  soEmojis,
} from "./markdown-core";
export type { Block, Inline } from "./markdown-core";

/*
 * Medidas deste arquivo, todas de `docs/referencias-discord/tokens/css-bruto/`
 * (Discord de 2026-09-11) salvo onde dito:
 *
 * - `606633.18ac0cf82e24c71d.css` — `.markup__75297` e filhos: corpo 1rem com
 *   linha `--chat-markup-line-height` (1.375rem), `white-space:break-spaces`;
 *   link, `code.inline`, `pre`, títulos, `small` (subtexto), listas, citação
 *   (`.blockquoteContainer/.blockquoteDivider`) e `.timestamp__75297`.
 * - `189423.af2f7f677928e0a3.css` — `.hljs-*`: a cor de cada tipo de trecho.
 * - `334324.ba65a76e9632d279.css` — `.wrapper_f61d60` (pílula de menção),
 *   `.interactive:hover` e `.icon_b75563` (ícone da pílula de canal).
 * - `880150.8851b0be092dc53b.css` — `.spoilerMarkdownContent__299eb` e as
 *   variáveis `--__spoiler-*` (fundo oculto, hover e revelado).
 */

// ── render ───────────────────────────────────────────────────

export interface RenderOptions {
  /**
   * username de quem está lendo. A pílula da própria menção não muda de cor
   * por causa disso (no Discord ela é sempre a cor de marca, ver a pílula
   * abaixo) — quem destaca "mencionou você" é a LINHA da mensagem
   * (`--message-mentioned-background-default`, em MessageRow), não este componente.
   */
  meUsername?: string;
  /** nomes de exibição por username, para mostrar @Nome em vez de @user. */
  displayNames?: Record<string, string>;
  /** cargos do servidor aberto, para desenhar `<@&id>` com nome e cor. */
  roles?: { id: string; name: string; color: string | null }[];
  /** cargos de quem está lendo — reservado para o mesmo uso futuro que `meUsername`. */
  myRoleIds?: readonly string[];
  /** mensagem só de emoji: renderiza grande, como no Discord. */
  jumbo?: boolean;
}

/**
 * Imagem de um emoji personalizado. A URL vem do id — a rota é pública e o
 * conteúdo de um id nunca muda —, então não precisamos consultar a store para
 * desenhar: um emoji de servidor que eu deixei não vira quadrado quebrado.
 * O `alt` guarda `:nome:`, que é o que a mensagem tinha antes do token.
 *
 * A caixa é a mesma do emoji Unicode (`CLASSE_EMOJI_*` de `components/ui/Emoji`):
 * no Discord os dois são o mesmo `img.emoji`, e um personalizado ao lado de um
 * 😀 na mesma linha tem de ter a mesma altura e a mesma base.
 */
function EmojiPersonalizado({ name, id, jumbo }: { name: string; id: string; jumbo?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API_URL}/api/emojis/${id}/image`}
      alt={`:${name}:`}
      title={`:${name}:`}
      draggable={false}
      loading="lazy"
      className={jumbo ? CLASSE_EMOJI_JUMBO : CLASSE_EMOJI_INLINE}
    />
  );
}

/**
 * Texto corrido com os emoji Unicode trocados pelo Twemoji. Sem emoji, devolve
 * a string como está — é o caso comum, e não vale criar um fragmento por linha.
 */
function textoComEmoji(texto: string, jumbo: boolean | undefined, chave: number): ReactNode {
  if (!temEmoji(texto)) return texto;
  return (
    <Fragment key={chave}>
      {separarEmojis(texto).map((parte, j) =>
        parte.tipo === "texto" ? (
          parte.valor
        ) : (
          <Emoji key={j} emoji={parte.valor} tamanho={jumbo ? "jumbo" : "inline"} />
        ),
      )}
    </Fragment>
  );
}

/** Enter e Espaço acionam o que é `role="button"` sem ser `<button>`. */
function porTeclado(acao: (el: HTMLElement) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    acao(e.currentTarget);
  };
}

/**
 * Spoiler: `.spoilerMarkdownContent__299eb`. Oculto pinta
 * `--spoiler-hidden-background`, no hover `--spoiler-hidden-background-hover`;
 * revelado vira `--background-mod-subtle` (não `--spoiler-revealed-background`:
 * a variável `--__spoiler-background-color--revealed` aponta para o mod-subtle).
 * Raio `--radius-xs` (4px), `box-decoration-break:clone` para o fundo
 * acompanhar a quebra de linha, transição do fundo em 0,2 s.
 *
 * O conteúdo oculto some por `opacity:0` com transição de 0,1 s
 * (`.obscuredTextContentInner__299eb span`), e não por cor transparente: com o
 * emoji virando `<img>`, cor não esconderia a imagem. Continua ocupando o
 * lugar, então o spoiler não muda de largura ao abrir. `pointer-events:none`
 * enquanto oculto impede clicar num link que ninguém viu.
 */
function Spoiler({ children }: { children: ReactNode }) {
  const [revelado, setRevelado] = useState(false);
  const revelar = () => setRevelado(true);
  return (
    <span
      role={revelado ? undefined : "button"}
      tabIndex={revelado ? undefined : 0}
      aria-label={revelado ? undefined : "Spoiler — clique para revelar"}
      onClick={
        revelado
          ? undefined
          : (e) => {
              // o clique que revela não deve abrir nada da linha da mensagem
              e.stopPropagation();
              revelar();
            }
      }
      onKeyDown={revelado ? undefined : porTeclado(revelar)}
      className={`rounded [box-decoration-break:clone] transition-colors duration-200 ${
        revelado
          ? "bg-background-mod-subtle"
          : "cursor-pointer bg-spoiler-hidden-background hover:bg-spoiler-hidden-background-hover"
      }`}
    >
      <span
        aria-hidden={revelado ? undefined : true}
        className={`transition-opacity duration-100 ${revelado ? "" : "pointer-events-none opacity-0"}`}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * Pílula de menção: `.wrapper_f61d60` — fundo `--mention-background`, texto
 * `--mention-foreground`, raio 3px, `padding:0 2px`, peso 500,
 * `unicode-bidi:plaintext` (nome em árabe/hebraico não embaralha o `@`).
 */
const PILULA =
  "rounded-[3px] bg-mention-background px-0.5 font-medium text-mention-foreground [unicode-bidi:plaintext]";
/**
 * `.interactive`: transição de 50 ms e hover `--brand-500`. O Discord pinta o
 * texto de branco no hover; sobre o limão é o texto escuro (ADR-0009 §1).
 */
const PILULA_INTERATIVA =
  "cursor-pointer transition-colors duration-[50ms] ease-out hover:bg-brand-500 hover:text-control-primary-text-default focus-visible:bg-brand-500 focus-visible:text-control-primary-text-default focus-visible:outline-none";

/**
 * Quem é o usuário de uma menção, pelo id (`<@id>`) ou pelo username
 * (`@nome`). Procura em mim, nos membros do servidor aberto e nos
 * participantes das conversas — é o que as stores têm carregado. Não busca na
 * API: uma menção a alguém de fora continua legível pelo texto.
 */
function useUsuarioDaMencao(id: string | undefined, username: string | undefined): PublicUser | undefined {
  const alvo = username?.toLowerCase();
  const casa = (u: PublicUser) => (id ? u.id === id : u.username.toLowerCase() === alvo);
  const eu = useAuth((s) => (s.user && casa(s.user) ? s.user : undefined));
  const membro = useGuilds((s) => s.members.find((m) => casa(m.user))?.user);
  const participante = useDMs((s) => {
    for (const dm of s.channels) {
      const u = dm.others.find(casa);
      if (u) return u;
    }
    return undefined;
  });
  return eu ?? membro ?? participante;
}

function MencaoDeUsuario({
  userId,
  username,
  nomeConhecido,
}: {
  userId?: string;
  username?: string;
  nomeConhecido?: string;
}) {
  const user = useUsuarioDaMencao(userId, username);
  // @everyone e @here são pílula, mas não são ninguém para abrir perfil
  const todos = username !== undefined && /^(everyone|here)$/i.test(username);
  const nome = todos
    ? username
    : (nomeConhecido ?? (user ? displayNameOf(user) : (username ?? "usuário-desconhecido")));

  if (todos || !user) return <span className={PILULA}>@{nome}</span>;

  const abrir = (el: HTMLElement) => useUI.getState().openProfile(user, anchorOf(el));
  return (
    <span
      role="button"
      tabIndex={0}
      className={`${PILULA} ${PILULA_INTERATIVA}`}
      onClick={(e) => {
        e.stopPropagation();
        abrir(e.currentTarget);
      }}
      onKeyDown={porTeclado(abrir)}
    >
      @{nome}
    </span>
  );
}

/** Ícone da pílula de canal pelo tipo. */
function iconeDoTipo(tipo: ChannelType) {
  switch (tipo) {
    case "ANNOUNCEMENT":
      return Megaphone;
    case "VOICE":
      return Volume2;
    // conversa não tem ícone de menção no CSS do Discord (não medido): o `@`
    // da conversa direta e o de pessoas do grupo são os da lista de conversas
    case "DM":
      return AtSign;
    case "GROUP":
      return Users;
    default:
      return Hash;
  }
}

/** `.icon_b75563`: 1em, `margin-bottom:.2rem`, `margin-inline-end:4px`, `vertical-align:middle`. */
const CLASSE_DO_ICONE_DE_CANAL = "mb-[0.2rem] mr-1 inline-block h-[1em] w-[1em] align-middle";

/**
 * A pílula de canal em si. `aoAbrir` ausente = só informativa (sem hover, sem
 * foco): canal de voz, "sem acesso" e o instante em que o nome ainda não chegou.
 */
function PilulaDeCanal({
  Icone,
  nome,
  aoAbrir,
  carregando,
}: {
  Icone: typeof Hash;
  nome: string;
  aoAbrir?: () => void;
  carregando?: boolean;
}) {
  const clicavel = aoAbrir !== undefined;
  return (
    <span
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      aria-busy={carregando || undefined}
      className={`${PILULA} ${clicavel ? PILULA_INTERATIVA : ""}`}
      onClick={
        aoAbrir
          ? (e) => {
              e.stopPropagation();
              aoAbrir();
            }
          : undefined
      }
      onKeyDown={aoAbrir ? porTeclado(aoAbrir) : undefined}
    >
      <Icone aria-hidden size="1em" className={CLASSE_DO_ICONE_DE_CANAL} />
      {nome}
    </span>
  );
}

/**
 * `<#id>`: a mesma pílula, com o ícone do tipo do canal na frente. Clicar abre
 * o canal — menos o de voz: `select` entraria na chamada, e um clique numa
 * menção não pode conectar o microfone de ninguém.
 *
 * Onde o canal é procurado, nesta ordem (o que já está na memória primeiro;
 * a API só para o que não está em lugar nenhum):
 *
 * 1. `useChannels` — canais do servidor aberto;
 * 2. `useThreads` — threads carregadas do canal aberto (o id da thread é o da
 *    mensagem raiz; clicar abre a thread no painel lateral);
 * 3. `useDMs` — conversas da lista;
 * 4. `useResumosDeCanal` — `GET /channels/:id/resumo`, com cache por id. É o
 *    caso do canal de outro servidor. 403/404 viram a pílula "Sem acesso", com
 *    cadeado, como o "No Access" do Discord (texto e ícone não estão no CSS
 *    medido: não medido, só o comportamento).
 */
function MencaoDeCanal({ channelId }: { channelId: string }) {
  const canal = useChannels((s) => s.channels.find((c) => c.id === channelId));
  const thread = useThreads((s) => (canal ? undefined : s.items.find((t) => t.id === channelId)));
  const conversa = useDMs((s) =>
    canal || thread ? undefined : s.channels.find((d) => d.id === channelId),
  );
  const conhecido = canal !== undefined || thread !== undefined || conversa !== undefined;
  const remoto = useResumosDeCanal((s) => (conhecido ? undefined : s.porId[channelId]));

  useEffect(() => {
    if (!conhecido) useResumosDeCanal.getState().garantir(channelId);
  }, [conhecido, channelId]);

  if (canal) {
    const aoAbrir = canal.type === "VOICE" ? undefined : () => useChannels.getState().select(canal);
    return <PilulaDeCanal Icone={iconeDoTipo(canal.type)} nome={canal.name ?? ""} aoAbrir={aoAbrir} />;
  }

  if (thread) {
    const abrirThread = () =>
      void useMessages.getState().openThread(thread.channelId, { id: thread.id });
    return <PilulaDeCanal Icone={MessagesSquare} nome={thread.name} aoAbrir={abrirThread} />;
  }

  if (conversa) {
    const abrirConversa = () => void goToChannel({ guildId: null, channelId: conversa.id });
    return (
      <PilulaDeCanal Icone={iconeDoTipo(conversa.type)} nome={dmTitle(conversa)} aoAbrir={abrirConversa} />
    );
  }

  if (remoto?.estado === "ok") {
    const { resumo } = remoto;
    const aoAbrir =
      resumo.type === "VOICE"
        ? undefined
        : () => void goToChannel({ guildId: resumo.guildId, channelId: resumo.id });
    return <PilulaDeCanal Icone={iconeDoTipo(resumo.type)} nome={resumo.name} aoAbrir={aoAbrir} />;
  }

  if (remoto?.estado === "sem-acesso") {
    return <PilulaDeCanal Icone={Lock} nome="Sem acesso" />;
  }

  // pedido em curso (ou ainda por disparar, no primeiro render): o `#` sem
  // nome ocupa o lugar e não pisca "desconhecido" antes da resposta
  return <PilulaDeCanal Icone={Hash} nome="…" carregando />;
}

/**
 * `<t:unix:estilo>`: `.timestamp__75297` — fundo `--background-mod-normal`,
 * raio 3px, `padding:0 2px`. A dica mostra a data completa (estilo F), como
 * no Discord. O relativo (R) se atualiza sozinho: "há 5 segundos" não pode
 * ficar parado.
 */
function Carimbo({ unix, estilo }: { unix: number; estilo: EstiloDeCarimbo }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (estilo !== "R") return;
    const t = window.setTimeout(() => setAgora(Date.now()), intervaloDoRelativo(unix, agora));
    return () => window.clearTimeout(t);
  }, [estilo, unix, agora]);

  return (
    <Tooltip rotulo={formatarCarimbo(unix, "F", agora)}>
      <time
        dateTime={new Date(unix * 1000).toISOString()}
        className="rounded-[3px] bg-background-mod-normal px-0.5"
      >
        {formatarCarimbo(unix, estilo, agora)}
      </time>
    </Tooltip>
  );
}

/** Classe de cada trecho destacado — o `.hljs-<tipo>` do Discord, token a token. */
export const CLASSE_DO_TRECHO: Record<TipoDeTrecho, string> = {
  keyword: "text-text-code-keyword",
  // `.hljs-built_in{color:var(--text-code-type)}` — o Discord não usa
  // `--text-code-builtin` aqui (esse é o `.hljs-symbol`)
  built_in: "text-text-code-type",
  type: "text-text-code-type",
  title: "text-text-code-title",
  literal: "text-text-code-variable",
  variable: "text-text-code-variable",
  attr: "text-text-code-attribute",
  meta: "text-text-code-decorator",
  property: "text-text-code-property",
  number: "text-text-code-number",
  string: "text-text-code-string",
  comment: "text-text-code-comment",
  name: "text-text-code-tag",
  addition: "bg-background-code-addition text-text-code-addition",
  deletion: "bg-background-code-deletion text-text-code-deletion",
};

/**
 * Bloco de código. Estrutura do Discord: `pre > .codeContainer > code.hljs` +
 * `.codeActions` (copiar), que só aparece no hover.
 *
 * - `pre`: raio 4px, `--font-code`, `margin-top:6px`, `max-width:90%` (100%
 *   dentro de citação, `.markup blockquote pre`).
 * - `.codeContainer`: `max-width:50vw`, `position:relative`.
 * - `code`: `.markup code` vence o `.hljs` na especificidade — fundo
 *   `--background-code`, borda 1px `--border-normal`, 0.875rem com linha
 *   1.125rem, `white-space:pre-wrap`; do `.hljs` ficam `padding:.5em`, raio
 *   4px, `overflow-x:auto` e a cor `--text-code`.
 * - `.codeActions`: `top:8px`, `inset-inline-end:4px`, `display:none` fora do
 *   hover. O botão em si não está nesse CSS: caixa e fundo "não medido" — usa
 *   o `BotaoDeIcone` de 24px com fundo.
 *
 * Exportado para o código fora do chat ler igual ao do chat (a documentação
 * de `settings/aplicativos/ComoApontarSeuBot`). Ali entra `documento`, que tira
 * o que só faz sentido na linha de mensagem: os tetos de 90% e 50vw (a coluna
 * de configurações já limita a largura) e a quebra de linha — trecho para
 * copiar e comparar linha a linha rola dentro de si —, e desliga as ligaduras,
 * senão `===` vira `≡` na tela e quem digita à mão copia o glifo errado.
 */
export interface BlocoDeCodigoProps {
  /** linguagem do cercado (```ts); sem gramática conhecida, sai sem destaque. */
  lang: string | null;
  /** o código, sem as cercas. É também o que o botão copia. */
  v: string;
  /** dentro de citação o `pre` vai a 100% (`.markup blockquote pre`). */
  naCitacao?: boolean;
  /** fora do chat: sem teto de largura, sem quebra de linha, sem ligaduras. */
  documento?: boolean;
}

export function BlocoDeCodigo({ lang, v, naCitacao = false, documento = false }: BlocoDeCodigoProps) {
  const trechos = useMemo(() => destacarCodigo(v, lang), [v, lang]);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(t);
  }, [copiado]);

  const copiar = () => {
    const falhou = () => useUI.getState().toast("Não foi possível copiar o código", "error");
    const escrita = navigator.clipboard?.writeText(v);
    if (!escrita) return falhou();
    escrita.then(() => setCopiado(true), falhou);
  };

  return (
    <pre
      className={`rounded font-mono text-[0.75rem] leading-4 ${
        documento
          ? "max-w-full [font-variant-ligatures:none] [white-space:pre]"
          : `mt-1.5 [white-space:pre-wrap] ${naCitacao ? "max-w-full" : "max-w-[90%]"}`
      }`}
    >
      <span
        className={`group/codigo relative block ${documento ? "max-w-full" : "max-w-[50vw] celular:max-w-full"}`}
      >
        <code
          className={`block overflow-x-auto rounded border border-border-normal bg-background-code p-[0.5em] text-[0.875rem] leading-[1.125rem] text-text-code [text-size-adjust:none] ${
            documento ? "[white-space:pre]" : "[white-space:pre-wrap]"
          }`}
        >
          {trechos
            ? trechos.map((t, k) =>
                t.tipo ? (
                  <span key={k} className={CLASSE_DO_TRECHO[t.tipo]}>
                    {t.v}
                  </span>
                ) : (
                  <Fragment key={k}>{t.v}</Fragment>
                ),
              )
            : v}
        </code>
        <span className="absolute right-1 top-2 hidden font-sans group-focus-within/codigo:block group-hover/codigo:block">
          <BotaoDeIcone
            rotulo={copiado ? "Copiado!" : "Copiar código"}
            icone={copiado ? <Check size={16} /> : <Copy size={16} />}
            tamanho="sm"
            fundo="sempre"
            onClick={copiar}
          />
        </span>
      </span>
    </pre>
  );
}

export function renderInline(nodes: Inline[], opts: RenderOptions = {}): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        // só aqui: `code` e `link` continuam texto puro — o Discord não troca
        // emoji dentro de código, e a URL tem de sair como foi escrita
        return textoComEmoji(n.v, opts.jumbo, i);
      case "bold":
        return <strong key={i} className="font-bold">{renderInline(n.c, opts)}</strong>;
      case "italic":
        return <em key={i} className="italic">{renderInline(n.c, opts)}</em>;
      case "underline":
        return <u key={i}>{renderInline(n.c, opts)}</u>;
      case "strike":
        return <s key={i}>{renderInline(n.c, opts)}</s>;
      case "code":
        // `code.inline`: raio 4px, fonte 85%, `padding:0 .2em`, com o fundo, a
        // borda e a linha de 1.125rem do `.markup code`. A margem vertical de
        // -.2em do Discord não entra: em elemento inline ela não mexe na linha.
        return (
          <code
            key={i}
            className="rounded border border-border-normal bg-background-code px-[0.2em] font-mono text-[0.85em] leading-[1.125rem] [white-space:pre-wrap]"
          >
            {n.v}
          </code>
        );
      case "spoiler":
        return <Spoiler key={i}>{renderInline(n.c, opts)}</Spoiler>;
      case "link":
      case "maskedLink":
        // `.markup a`: `--text-link`, sublinhado só no hover, `word-break:break-word`
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-text-link [word-break:break-word] hover:underline"
          >
            {n.t === "link" ? n.href : renderInline(n.c, opts)}
          </a>
        );
      case "emoji":
        return <EmojiPersonalizado key={i} name={n.name} id={n.id} jumbo={opts.jumbo} />;
      case "roleMention": {
        // cargo apagado (ou de outro servidor) vira "@cargo": o texto guarda o
        // id, então não há nome a mostrar — e sumir com a marcação seria pior
        const role = opts.roles?.find((r) => r.id === n.roleId);
        return (
          <span
            key={i}
            style={role?.color ? { color: role.color } : undefined}
            // pílula de menção é sempre a cor de marca (--mention-background +
            // --mention-foreground), mencionar o próprio cargo não muda isso —
            // css-bruto/334324.ba65a76e9632d279.css .wrapper_f61d60 não tem
            // variante "próprio"; quem destaca é a linha da mensagem, em outro
            // componente. O fundo tingido pela cor do cargo que o Discord
            // aplica em estilo inline não está no CSS: não medido, não copiado.
            className={PILULA}
          >
            @{role?.name ?? "cargo"}
          </span>
        );
      }
      case "mention":
        return (
          <MencaoDeUsuario
            key={i}
            username={n.username}
            nomeConhecido={opts.displayNames?.[n.username.toLowerCase()]}
          />
        );
      case "userMention":
        return <MencaoDeUsuario key={i} userId={n.userId} />;
      case "channelMention":
        return <MencaoDeCanal key={i} channelId={n.channelId} />;
      case "timestamp":
        return <Carimbo key={i} unix={n.unix} estilo={n.estilo} />;
    }
  });
}

/**
 * Títulos: `.markup h1..h3` — peso bold, `--text-strong`, linha 1.375em;
 * 1.5rem / 1.25rem / 1rem com margem 16px em cima e 8px embaixo. Como
 * primeiro filho a margem de cima cai para 8px (h1, h2) e 4px (h3).
 */
const CLASSE_DO_TITULO = {
  1: "mb-2 mt-4 text-[1.5rem] font-bold leading-[1.375em] text-text-strong first:mt-2",
  2: "mb-2 mt-4 text-[1.25rem] font-bold leading-[1.375em] text-text-strong first:mt-2",
  3: "mb-2 mt-4 text-[1rem] font-bold leading-[1.375em] text-text-strong first:mt-1",
} as const;

interface Contexto {
  opts: RenderOptions;
  naCitacao: boolean;
  /** profundidade de lista: a partir de 1, `ul` vira círculo e perde a margem de baixo. */
  lista: number;
}

/** Quais parágrafos das pontas do texto ficam em linha (ver `MarkdownProps.emLinha`). */
export type EmLinha = "primeiro" | "ultimo" | "ambos";

/** Só o nível de cima do texto: citação e lista não herdam as pontas. */
interface Pontas {
  emLinha?: EmLinha;
  sufixo?: ReactNode;
}

function renderBlocos(blocks: Block[], ctx: Contexto, pontas?: Pontas): ReactNode[] {
  const { opts } = ctx;
  const ultimoIndice = blocks.length - 1;
  const ultimo = blocks[ultimoIndice];
  const temSufixo = pontas?.sufixo !== undefined && pontas.sufixo !== null && pontas.sufixo !== false;
  // o sufixo entra dentro do último parágrafo; se o último bloco é outra coisa
  // (código, lista, citação, linha vazia), vai logo depois dele
  const sufixoDentro = temSufixo && ultimo?.t === "p" && ultimo.c.length > 0;

  const nos: ReactNode[] = blocks.map((b, i) => {
    switch (b.t) {
      case "p": {
        // linha vazia vira só a quebra
        if (b.c.length === 0) return <br key={i} />;
        const emLinha =
          (i === 0 && (pontas?.emLinha === "primeiro" || pontas?.emLinha === "ambos")) ||
          (i === ultimoIndice && (pontas?.emLinha === "ultimo" || pontas?.emLinha === "ambos"));
        return (
          <div key={i} className={emLinha ? "inline" : undefined}>
            {renderInline(b.c, opts)}
            {sufixoDentro && i === ultimoIndice ? pontas?.sufixo : null}
          </div>
        );
      }
      case "h": {
        const Tag = `h${b.level}` as const;
        return (
          <Tag key={i} className={CLASSE_DO_TITULO[b.level]}>
            {renderInline(b.c, opts)}
          </Tag>
        );
      }
      case "sub":
        // `.markup small`: bloco, `--text-subtle`, 0.875rem com linha 1.20313rem
        return (
          <small key={i} className="block text-[0.875rem] leading-[1.20313rem] text-text-subtle">
            {renderInline(b.c, opts)}
          </small>
        );
      case "quote":
        // `.blockquoteContainer`: flex com margem `--space-4` (4px) em cima e
        // embaixo; a barra é `.blockquoteDivider` (4px, raio 4px,
        // `--spine-default`); o texto é `blockquote` com `padding-inline:12px 8px`,
        // `max-width:90%` e cor `--text-subtle`
        return (
          <div key={i} className="my-1 flex">
            <div aria-hidden className="w-[4px] min-w-[4px] rounded bg-spine-default" />
            <blockquote className="min-w-0 max-w-[90%] pl-3 pr-2 text-text-subtle">
              {renderBlocos(b.c, { ...ctx, naCitacao: true })}
            </blockquote>
          </div>
        );
      case "list": {
        // `.markup ol, ul`: `list-style-position:outside`, margem 4px em cima e
        // 16px à esquerda; `li` com 4px embaixo. Aninhada: `ul` em círculo e
        // sem margem de baixo. `ol` recua pelo número de dígitos do maior
        // número (`calc(.4em + var(--totalCharacters)*.6em)`), senão "10." vaza
        const aninhada = ctx.lista > 0;
        const itens = b.itens.map((item, k) => (
          <li key={k} className="mb-1 [white-space:break-spaces]">
            {renderInline(item.c, opts)}
            {item.filhos.length > 0 && renderBlocos(item.filhos, { ...ctx, lista: ctx.lista + 1 })}
          </li>
        ));
        if (b.ordenada) {
          const digitos = String(b.inicio + b.itens.length - 1).length;
          return (
            <ol
              key={i}
              start={b.inicio}
              className="mt-1 list-outside list-decimal"
              style={{ marginInlineStart: `calc(0.4em + ${digitos} * 0.6em)` }}
            >
              {itens}
            </ol>
          );
        }
        return (
          <ul key={i} className={`ml-4 mt-1 list-outside ${aninhada ? "mb-0 list-[circle]" : "list-disc"}`}>
            {itens}
          </ul>
        );
      }
      case "codeblock":
        return <BlocoDeCodigo key={i} lang={b.lang} v={b.v} naCitacao={ctx.naCitacao} />;
    }
  });

  if (temSufixo && !sufixoDentro) nos.push(<Fragment key="sufixo">{pontas?.sufixo}</Fragment>);
  return nos;
}

export interface MarkdownProps extends RenderOptions {
  text: string;
  /**
   * Parágrafo das pontas em linha (`display:inline` no `<div>` do parágrafo,
   * que não tem classe nenhuma): `"primeiro"`, `"ultimo"` ou `"ambos"`. Só vale
   * para parágrafo com texto, no nível de cima — título, lista, citação e
   * código continuam blocos.
   *
   * Para o MessageItem: no modo compacto o horário e o nome vêm antes do texto
   * na mesma linha (`"primeiro"`), e o "(editado)" fica colado ao fim da última
   * linha em vez de cair numa linha só dele (`"ultimo"`).
   */
  emLinha?: EmLinha;
  /**
   * Nó anexado ao fim do texto — o "(editado)" do MessageItem. Entra **dentro**
   * do último parágrafo, então segue a última palavra e quebra com ela; se o
   * último bloco não é parágrafo (código, lista, citação), entra logo depois
   * dele. `null`/`undefined`/`false` = nada.
   */
  sufixo?: ReactNode;
}

/** Mensagem inteira renderizada. */
export function Markdown({ text, emLinha, sufixo, ...opts }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  // "jumbo" é decidido aqui, sobre a mensagem inteira: um emoji sozinho numa
  // frase continua do tamanho da linha (ver soEmojis)
  const render = { ...opts, jumbo: opts.jumbo ?? soEmojis(blocks) };
  // O jumbo não mexe na fonte do contêiner: com o Twemoji o emoji Unicode é
  // imagem de 3rem, como o personalizado, e a linha fica com a altura dela.
  // `.markup__75297` (606633.*.css): 1rem, linha `--chat-markup-line-height`
  // (1.375rem, VARIAVEIS.md), `white-space:break-spaces` — espaços repetidos
  // aparecem, como no Discord — e `word-wrap:break-word`. Em `contents` as
  // propriedades herdáveis descem para os blocos sem criar caixa, e o que vem
  // antes (compacto) ou depois (o `sufixo`) do texto divide a linha com ele.
  return (
    <span
      className={`${render.jumbo ? "block" : "contents"} text-[1rem] leading-[1.375rem] [white-space:break-spaces] [word-wrap:break-word]`}
    >
      {renderBlocos(blocks, { opts: render, naCitacao: false, lista: 0 }, { emLinha, sufixo })}
    </span>
  );
}
