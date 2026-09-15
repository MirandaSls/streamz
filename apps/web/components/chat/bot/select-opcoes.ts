// Helpers do `SelectDeBot` e dos campos de select do `ModalDeBot` (onda 3,
// cartões 3d-selects e 3f; rodada de correção). Duas metades:
//
// 1. **Puras** (valores iniciais, limites de seleção, busca dentro da lista,
//    resolução do emoji parcial que o bot manda numa opção) — sem DOM,
//    testadas em `select-opcoes.test.ts`.
// 2. **Montagem das opções vivas** (`iconeDeCanal`, `opcaoDeUsuario`,
//    `opcoesDeCargo`, `opcaoDeItemDeCanal`) — as mesmas nos dois lugares que
//    listam usuário/cargo/canal para um bot; antes cada arquivo tinha a sua
//    cópia (e a do modal já tinha divergido: avatar sem presença nem pílula
//    BOT). Devolvem `ReactNode` no `prefixo`/`sufixo`, por isso importam
//    React, os ícones, o `Avatar` e o `TagDeBot`; o arquivo segue `.ts` (sem JSX, `createElement`)
//    para não trocar de nome debaixo de quem já o importa.
//
// A forma do componente é a do Discord (`ComponenteDeSelect`, de
// `@streamz/shared`): `type` 3 (texto, com `options` do próprio bot), 5
// (usuário), 6 (cargo), 7 (mencionável) e 8 (canal) — os quatro últimos não
// trazem opções, só `default_values` (cuids, já traduzidos do snowflake do
// Discord pelo DTO da API); quem preenche a lista é o servidor (as stores de
// membros/cargos/canais/categorias que já existem), não o bot.

import { createElement, type ReactNode } from "react";
import type {
  Channel,
  CustomEmoji,
  EmojiParcial,
  PublicUser,
  Role,
  SelectDeBot as ComponenteDeSelect,
} from "@streamz/shared";
import type { OpcaoDeSelect } from "@/components/ui/primitivos";
import { ChevronDown, Hash, Lock, Megaphone, Shield, Volume2 } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import { useLiveUser } from "@/stores/presence";
import type { ItemDoSelectDeCanal } from "./select-canais";

/** `true` quando o componente aceita mais de uma escolha (`max_values > 1`). */
export function multiploDoComponente(componente: Pick<ComponenteDeSelect, "max_values">): boolean {
  return (componente.max_values ?? 1) > 1;
}

/**
 * `min_values`/`max_values` efetivos. O Discord aplica 1 e 1 quando o bot
 * omite os dois campos (`components/reference.mdx`, "default 1 for both") —
 * o schema (`camposDeSelect`) só valida a faixa, não aplica esse padrão.
 */
export function limitesDoComponente(
  componente: Pick<ComponenteDeSelect, "min_values" | "max_values">,
): { min: number; max: number } {
  return { min: componente.min_values ?? 1, max: componente.max_values ?? 1 };
}

/** A contagem `qtd` cabe entre `min` e `max` (inclusive)? */
export function dentroDoLimite(qtd: number, min: number, max: number): boolean {
  return qtd >= min && qtd <= max;
}

/**
 * O que já vem marcado ao abrir a mensagem: no `type` 3 são as `options` com
 * `default: true`; nos outros quatro, `default_values` — ambos já em cuid, a
 * mesma forma que `escolherNoSelect` espera de volta.
 */
export function valoresIniciais(componente: ComponenteDeSelect): string[] {
  if (componente.type === 3) {
    return componente.options.filter((o) => o.default).map((o) => o.value);
  }
  return (componente.default_values ?? []).map((v) => v.id);
}

/** `s` sem espaço nas pontas e em minúsculas pt-BR — o mesmo corte do `Select` primitivo. */
export function normalizarBusca(s: string): string {
  return s.trim().toLocaleLowerCase("pt-BR");
}

/** Filtra `lista` pelo texto que `extrai` devolve de cada item; `busca` vazia devolve tudo. */
export function filtrarPorTexto<T>(lista: readonly T[], busca: string, extrai: (item: T) => string): T[] {
  if (!busca.trim()) return [...lista];
  const alvo = normalizarBusca(busca);
  return lista.filter((item) => normalizarBusca(extrai(item)).includes(alvo));
}

/** Texto do placeholder quando o bot não mandou um. Decisão deste cartão — o Discord não documenta um padrão; não é medida. */
export function placeholderPadrao(type: ComponenteDeSelect["type"]): string {
  switch (type) {
    case 3:
      return "Selecione uma opção";
    case 5:
      return "Selecione um usuário";
    case 6:
      return "Selecione um cargo";
    case 7:
      return "Selecione um usuário ou cargo";
    case 8:
      return "Selecione um canal";
  }
}

export type EmojiDeOpcaoResolvido =
  | { tipo: "personalizado"; url: string; animado: boolean; alt: string }
  | { tipo: "unicode"; caractere: string }
  /** emoji personalizado que não existe mais (ou de outro servidor): sobra o nome, como o Discord. */
  | { tipo: "nome"; texto: string };

/**
 * `emoji` de uma opção/botão do bot → o que dá para desenhar. O DTO da API já
 * troca o `id` de snowflake por cuid (contrato da onda 3, §"O DTO sempre
 * traz..."), então basta procurar em `emojisDoServidor` (`todosOsEmojis` da
 * store `emojis`); sem `id`, `name` é o caractere Unicode (o bot manda o
 * emoji "cru", sem `:` — como o Discord).
 */
export function resolverEmojiDeOpcao(
  emoji: EmojiParcial | null | undefined,
  emojisDoServidor: readonly CustomEmoji[],
): EmojiDeOpcaoResolvido | null {
  if (!emoji) return null;
  if (emoji.id) {
    const achado = emojisDoServidor.find((e) => e.id === emoji.id);
    if (achado) return { tipo: "personalizado", url: achado.url, animado: achado.animated, alt: achado.name };
    return emoji.name ? { tipo: "nome", texto: emoji.name } : null;
  }
  if (emoji.name) return { tipo: "unicode", caractere: emoji.name };
  return null;
}

// ── montagem das opções vivas (usuário, cargo, canal) ──────────────────────

/** Ícone de 16 do tipo do canal, o mesmo da barra lateral (voz, anúncio, texto). */
export function iconeDeCanal(type: Channel["type"], className = "text-icon-muted"): ReactNode {
  const Icone = type === "VOICE" ? Volume2 : type === "ANNOUNCEMENT" ? Megaphone : Hash;
  return createElement(Icone, { size: 16, "aria-hidden": true, className });
}

/**
 * Avatar + bolinha de presença de uma linha de usuário/mencionável. Medido em
 * `select-de-usuario.webp` (doc oficial): a bolinha de status aparece mesmo
 * dentro do select, junto do avatar — não é exclusiva da lista de membros.
 *
 * `surface` = `border-background-surface-high`: a lista vive sobre
 * `--background-surface-high` (a do `Popout`), e é essa a cor do recorte do
 * selo — a entrada no `FUNDO_DO_SELO` do `Avatar` vem de outro cartão da
 * rodada de correção.
 */
function PrefixoDeUsuario({ user }: { user: PublicUser }) {
  const vivo = useLiveUser(user);
  return createElement(Avatar, {
    user: vivo,
    size: "xs",
    status: vivo.status,
    surface: "border-background-surface-high",
  });
}

/**
 * Uma linha de usuário (select 5 e metade do 7). A pílula de bot vai no
 * `sufixo`, à direita da linha — no `select-de-usuario.webp` o "APP" do Helper
 * encosta na borda direita, não no avatar. É o `TagDeBot` do app (BOT, texto
 * escuro sobre o limão), não uma pílula própria.
 */
export function opcaoDeUsuario(user: PublicUser): OpcaoDeSelect<string> {
  return {
    valor: user.id,
    rotulo: user.displayName ?? user.username,
    prefixo: createElement(PrefixoDeUsuario, { user }),
    sufixo: user.bot ? createElement(TagDeBot) : undefined,
  };
}

/** Os cargos atribuíveis, do mais alto para o mais baixo (select 6 e metade do 7). */
export function opcoesDeCargo(roles: readonly Role[]): OpcaoDeSelect<string>[] {
  return roles
    .filter((r) => !r.isDefault) // @everyone não é atribuível — mesma regra de c-cargos
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      valor: r.id,
      rotulo: r.name,
      // cor arbitrária do servidor (cargo), não token — mesma regra do `color`
      // do embed: dado, não estilo de classe
      prefixo: createElement(Shield, {
        size: 16,
        "aria-hidden": true,
        className: r.color ? "" : "text-icon-muted",
        style: r.color ? { color: r.color } : undefined,
      }),
    }));
}

/**
 * Uma linha do select de canal (8): ícone do tipo + cadeado se privado; a
 * categoria (`channel_types` com 4) leva o chevron do cabeçalho de categoria
 * da barra lateral — **não medido**: nenhum print nem imagem da doc mostra
 * uma categoria dentro do select de canal do Discord.
 */
export function opcaoDeItemDeCanal(item: ItemDoSelectDeCanal): OpcaoDeSelect<string> {
  if (item.tipo === "categoria") {
    return {
      valor: item.id,
      rotulo: item.nome,
      prefixo: createElement(ChevronDown, { size: 16, "aria-hidden": true, className: "shrink-0 text-icon-muted" }),
    };
  }
  return {
    valor: item.id,
    rotulo: item.nome,
    prefixo: createElement(
      "span",
      { className: "flex shrink-0 items-center gap-0.5" },
      iconeDeCanal(item.canal.type),
      item.canal.private
        ? createElement(Lock, { size: 12, "aria-hidden": true, className: "text-icon-muted" })
        : null,
    ),
  };
}
