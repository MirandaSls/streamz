"use client";

import {
  colorRoleOf,
  displayNameOf,
  type OpcaoDeComando,
  type Role,
} from "@streamz/shared";
import type { ItemAutocomplete } from "@/components/chat/Autocomplete";
import Avatar from "@/components/ui/Avatar";
import { Hash, Volume2 } from "@/components/ui/icones";
import { COR_DE_CARGO_SEM_COR } from "@/lib/cor-de-cargo";
import { buscarEmojisUnicode } from "@/lib/emojis-unicode";
import type { Gatilho } from "@/lib/composer-autocomplete";

/** Sugestões mostradas de uma vez em cada gatilho. */
const MAX_SUGESTOES = 10;
/**
 * Escolhas de uma opção: o Discord aceita até 25 `choices` por opção, e todas
 * cabem na lista — cortar em 10 esconderia escolhas válidas que o bot declarou.
 */
const MAX_ESCOLHAS = 25;

export interface FontesDeSugestao {
  membros: {
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; status: string };
    roleIds: readonly string[];
  }[];
  canais: { id: string; name: string | null; type: string }[];
  emojisPorGuild: { emojis: { id: string; name: string; url: string }[] }[];
  cargos: readonly Role[];
}

export const TITULO_GATILHO: Record<Gatilho["tipo"], string> = {
  ":": "Emojis",
  "@": "Membros",
  "#": "Canais de texto",
  "/": "Comandos",
};

/**
 * Candidatos do popup de `:` `@` `#`. O `/` não passa por aqui: comando tem
 * seletor próprio, agrupado por app (`SeletorDeComandos`).
 */
export function montarSugestoes(gatilho: Gatilho | null, fontes: FontesDeSugestao): ItemAutocomplete[] {
  if (!gatilho || gatilho.tipo === "/") return [];
  const q = gatilho.termo.toLowerCase();

  if (gatilho.tipo === ":") {
    const custom = fontes.emojisPorGuild
      .flatMap((g) => g.emojis)
      .filter((e) => e.name.includes(q))
      .slice(0, MAX_SUGESTOES)
      .map<ItemAutocomplete>((e) => ({
        chave: `c${e.id}`,
        valor: `:${e.name}:`,
        rotulo: `:${e.name}:`,
        detalhe: "do servidor",
        icone: (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.url} alt="" className="h-5 w-5 object-contain" />
        ),
      }));
    const unicode = buscarEmojisUnicode(q, MAX_SUGESTOES - custom.length).map<ItemAutocomplete>((e) => ({
      chave: `u${e.nome}`,
      valor: e.char,
      rotulo: `:${e.nome}:`,
      icone: <span className="text-text-lg">{e.char}</span>,
    }));
    return [...custom, ...unicode];
  }

  if (gatilho.tipo === "@") {
    const alcance: ItemAutocomplete[] = [
      { chave: "everyone", valor: "@everyone", rotulo: "@everyone", detalhe: "avisa todo mundo" },
      { chave: "here", valor: "@here", rotulo: "@here", detalhe: "avisa quem está online" },
    ].filter((i) => i.rotulo.slice(1).startsWith(q));

    // ── c-cargos ── só cargo com `mentionable` aparece; o texto grava o id,
    // porque cargo é renomeável e o nome quebraria a menção depois
    const cargos = fontes.cargos
      .filter((r) => r.mentionable && r.name.toLowerCase().includes(q))
      .slice(0, MAX_SUGESTOES - alcance.length)
      .map<ItemAutocomplete>((r) => itemDeCargo(r, `<@&${r.id}>`, "cargo"));

    const pessoas = fontes.membros
      .filter((m) => m.user.username.toLowerCase().includes(q) || displayNameOf(m.user).toLowerCase().includes(q))
      .slice(0, MAX_SUGESTOES - alcance.length - cargos.length)
      // a menção grava o username: é o que o `mentionsUser` do contrato casa
      .map<ItemAutocomplete>((m) => itemDeMembro(m, `@${m.user.username}`, fontes.cargos));
    return [...alcance, ...cargos, ...pessoas];
  }

  return fontes.canais
    .filter((c) => c.type === "TEXT" && (c.name ?? "").toLowerCase().includes(q))
    .slice(0, MAX_SUGESTOES)
    .map<ItemAutocomplete>((c) => itemDeCanal(c, `#${c.name}`));
}

/**
 * Candidatos para o valor da opção de comando que se está preenchendo.
 *
 * É o seletor de alvo do Discord: escolhas fixas (`choices`), sim/não, e
 * usuário, canal e cargo **do servidor** — o valor que entra no campo é a menção
 * (`<@id>`, `<#id>`, `<@&id>`), que `converterOpcao` devolve ao bot como id.
 * Texto livre e número não têm lista: não há o que sugerir.
 */
export function sugestoesDeOpcao(
  opcao: OpcaoDeComando,
  termo: string,
  fontes: Pick<FontesDeSugestao, "membros" | "canais" | "cargos">,
): ItemAutocomplete[] {
  // o termo pode estar no meio de uma menção já escrita (`<@ab`): a busca é
  // pelo que sobra sem a pontuação
  const q = termo.replace(/^"|"$/g, "").replace(/^<[@#]?[&!]?/, "").replace(/>$/, "").trim().toLowerCase();

  if (opcao.choices && opcao.choices.length > 0) {
    return opcao.choices
      .filter((c) => c.name.toLowerCase().includes(q) || String(c.value).toLowerCase() === q)
      .slice(0, MAX_ESCOLHAS)
      .map((c) => ({ chave: `escolha:${c.value}`, valor: c.name, rotulo: c.name }));
  }

  switch (opcao.type) {
    case 5:
      return [
        { chave: "sim", valor: "true", rotulo: "Verdadeiro" },
        { chave: "nao", valor: "false", rotulo: "Falso" },
      ].filter((i) => !q || i.rotulo.toLowerCase().startsWith(q) || i.valor.startsWith(q));
    case 6:
      return fontes.membros
        .filter((m) => m.user.username.toLowerCase().includes(q) || displayNameOf(m.user).toLowerCase().includes(q))
        .slice(0, MAX_SUGESTOES)
        .map((m) => itemDeMembro(m, `<@${m.user.id}>`, fontes.cargos));
    case 7:
      return fontes.canais
        // conversa direta não é alvo de comando de servidor
        .filter((c) => c.type !== "DM" && c.type !== "GROUP" && (c.name ?? "").toLowerCase().includes(q))
        .slice(0, MAX_SUGESTOES)
        .map((c) => itemDeCanal(c, `<#${c.id}>`));
    case 8:
      return fontes.cargos
        .filter((r) => r.name.toLowerCase().includes(q))
        .slice(0, MAX_SUGESTOES)
        .map((r) => itemDeCargo(r, `<@&${r.id}>`));
    default:
      return [];
  }
}

function itemDeMembro(
  m: FontesDeSugestao["membros"][number],
  valor: string,
  cargos: readonly Role[],
): ItemAutocomplete {
  return {
    chave: m.user.id,
    valor,
    rotulo: displayNameOf(m.user),
    detalhe: m.user.username,
    // o nome do membro sai na cor do cargo mais alto, como na timeline
    cor: colorRoleOf(m.roleIds, cargos)?.color ?? undefined,
    icone: <Avatar user={m.user as never} size="sm" />,
  };
}

function itemDeCanal(c: FontesDeSugestao["canais"][number], valor: string): ItemAutocomplete {
  const Icone = c.type === "VOICE" ? Volume2 : Hash;
  return {
    chave: c.id,
    valor,
    rotulo: c.type === "VOICE" ? (c.name ?? "") : `#${c.name}`,
    icone: <Icone size={16} className="text-channels-default" />,
  };
}

function itemDeCargo(r: Role, valor: string, detalhe?: string): ItemAutocomplete {
  return {
    chave: `r${r.id}`,
    valor,
    rotulo: `@${r.name}`,
    detalhe,
    cor: r.color ?? undefined,
    icone: (
      <span
        aria-hidden="true"
        style={{ backgroundColor: r.color ?? COR_DE_CARGO_SEM_COR }}
        className="h-3 w-3 rounded-full"
      />
    ),
  };
}
