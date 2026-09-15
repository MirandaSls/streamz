import { create } from "zustand";
import {
  formatCustomEmoji,
  type CustomEmoji,
  type GuildEmojis,
  type GuildStickers,
  type Sticker,
} from "@streamz/shared";
import { api } from "@/lib/api";

/**
 * Emojis personalizados e figurinhas de todos os servidores do usuário.
 *
 * Carregam uma vez no login e se atualizam por `emoji.updated`/`sticker.updated`
 * (ver `hooks/useRealtime.ts`). Ficam aqui, e não no componente do seletor,
 * porque três telas dependem deles ao mesmo tempo: o seletor, o autocomplete de
 * `:` no composer e o render da mensagem, que precisa resolver `<:nome:id>` sem
 * ir ao servidor a cada linha.
 */

interface EmojisState {
  /** por servidor, na ordem em que o seletor mostra as seções. */
  guilds: GuildEmojis[];
  stickerGuilds: GuildStickers[];
  carregado: boolean;
  /**
   * true quando a última tentativa de carregar emojis OU figurinhas caiu em
   * `.catch` — ver "falha aqui não pode derrubar a tela" em `load()`. Sem
   * esta bandeira o seletor e as telas de gestão não tinham como diferenciar
   * "usuário sem nenhum emoji" de "a rede falhou": as duas chegam com a
   * mesma lista vazia. `false` de novo a cada chamada de `load()` — inclusive
   * a primeira —, para uma tentativa que dá certo depois de uma que falhou
   * apagar o aviso.
   */
  falhouCarregar: boolean;

  load: () => Promise<void>;
  /** tenta de novo depois de uma falha — é o que o botão "Tentar de novo" chama. */
  recarregar: () => Promise<void>;
  /** aplica o evento `emoji.updated` de um servidor. */
  applyEmojis: (guildId: string, emojis: CustomEmoji[]) => void;
  applyStickers: (guildId: string, stickers: Sticker[]) => void;
  clear: () => void;
}

export const useEmojis = create<EmojisState>((set, get) => ({
  guilds: [],
  stickerGuilds: [],
  carregado: false,
  falhouCarregar: false,

  load: async () => {
    // falha aqui não pode derrubar a tela: sem emoji personalizado o chat
    // continua inteiro, então o erro só apaga a lista — mas fica registrado
    // em `falhouCarregar`, para quem mostra a lista poder avisar em vez de
    // fingir que está tudo vazio.
    let falhou = false;
    const [guilds, stickerGuilds] = await Promise.all([
      api.myEmojis().catch(() => {
        falhou = true;
        return [] as GuildEmojis[];
      }),
      api.myStickers().catch(() => {
        falhou = true;
        return [] as GuildStickers[];
      }),
    ]);
    set({ guilds, stickerGuilds, carregado: true, falhouCarregar: falhou });
  },

  recarregar: () => get().load(),

  applyEmojis: (guildId, emojis) => {
    const atual = get().guilds;
    const i = atual.findIndex((g) => g.guildId === guildId);
    // servidor que ainda não estava na lista (acabei de entrar): recarrega tudo
    if (i < 0) {
      void get().load();
      return;
    }
    const guilds = atual.slice();
    guilds[i] = { ...guilds[i], emojis };
    set({ guilds });
  },

  applyStickers: (guildId, stickers) => {
    const atual = get().stickerGuilds;
    const i = atual.findIndex((g) => g.guildId === guildId);
    if (i < 0) {
      void get().load();
      return;
    }
    const stickerGuilds = atual.slice();
    stickerGuilds[i] = { ...stickerGuilds[i], stickers };
    set({ stickerGuilds });
  },

  clear: () => set({ guilds: [], stickerGuilds: [], carregado: false, falhouCarregar: false }),
}));

/** Todos os emojis personalizados que eu posso usar, em lista plana. */
export function todosOsEmojis(guilds: GuildEmojis[]): CustomEmoji[] {
  return guilds.flatMap((g) => g.emojis);
}

/**
 * Troca `:nome:` pela forma interna `<:nome:id>` antes de enviar.
 *
 * É aqui que o texto digitado vira o que fica gravado: o id sobrevive a um
 * rename do emoji, e some sozinho quando o emoji é apagado. `:nome:` que não
 * casa com nenhum emoji fica como está — pode ser só dois-pontos no meio da
 * frase (`10:30:00`), e reescrever isso seria pior que não fazer nada.
 */
export function aplicarEmojisPersonalizados(texto: string, emojis: CustomEmoji[]): string {
  if (emojis.length === 0) return texto;
  const porNome = new Map(emojis.map((e) => [e.name, e]));
  return texto.replace(/:([a-z0-9_]{2,32}):/g, (bruto, nome: string) => {
    const emoji = porNome.get(nome);
    return emoji ? formatCustomEmoji(emoji.name, emoji.id) : bruto;
  });
}

/** Hook: emojis do servidor aberto primeiro, depois os dos outros. */
export function useEmojisOrdenados(guildIdAtivo?: string | null): GuildEmojis[] {
  const guilds = useEmojis((s) => s.guilds);
  if (!guildIdAtivo) return guilds;
  const atual = guilds.filter((g) => g.guildId === guildIdAtivo);
  return [...atual, ...guilds.filter((g) => g.guildId !== guildIdAtivo)];
}
