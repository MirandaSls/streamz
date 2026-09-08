import { SONS_PADRAO, type GuildSoundboard, type SoundboardSound } from "@streamz/shared";

/**
 * As seções do painel de efeitos sonoros, na ordem em que ele as desenha.
 *
 * Parte pura, fora do componente e fora da store, porque é a única coisa aqui
 * que tem regra: a ordem das seções, o que a busca casa, e — o que mais quebra
 * na prática — o que fazer com um id favoritado cujo som **não existe mais**
 * (foi apagado, ou saí do servidor). Um componente que resolvesse isso na
 * marcha renderizaria `undefined` no primeiro card.
 *
 * A ordem é a do Discord (prints `2026-09-08 103446`/`103452`): Favoritos,
 * Utilizados com frequência, o **servidor aberto** (é ele que ganha o botão
 * "+ Adicionar som"), os sons que vêm com o app e, por último, os outros
 * servidores.
 */

export type TipoDeSecao = "favoritos" | "frequentes" | "guild" | "padrao";

export interface SecaoDoPainel {
  /** id estável, usado como âncora do atalho da coluna da esquerda. */
  id: string;
  titulo: string;
  tipo: TipoDeSecao;
  /** presente só em `tipo: "guild"`. */
  guildId?: string;
  guildIconUrl?: string | null;
  /** o servidor aberto agora — é a seção que ganha o "+ Adicionar som". */
  atual?: boolean;
  sons: SoundboardSound[];
}

export interface EntradaDoPainel {
  guilds: GuildSoundboard[];
  favoritos: string[];
  usos: Record<string, number>;
  busca: string;
  guildIdAtivo: string | null;
  /** quantos sons a seção "Utilizados com frequência" mostra. */
  limiteFrequentes: number;
}

/** Sem acento e em minúsculas — a busca não pode depender de teclado. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function secoesDoPainel(entrada: EntradaDoPainel): SecaoDoPainel[] {
  const { guilds, favoritos, usos, busca, guildIdAtivo, limiteFrequentes } = entrada;
  const todos = [...SONS_PADRAO, ...guilds.flatMap((g) => g.sounds)];

  const termo = normalizar(busca);
  if (termo.length > 0) {
    // uma lista só: quem procura "quack" não sabe (nem precisa saber) se ele é
    // um som do servidor ou um dos que vêm com o app
    return [
      {
        id: "busca",
        titulo: "Resultados",
        tipo: "padrao",
        sons: todos.filter((s) => normalizar(s.name).includes(termo)),
      },
    ];
  }

  const porId = new Map(todos.map((s) => [s.id, s]));
  const resolver = (ids: string[]): SoundboardSound[] =>
    ids.map((id) => porId.get(id)).filter((s): s is SoundboardSound => s !== undefined);

  const lista: SecaoDoPainel[] = [];

  // Favoritos aparece **sempre**, mesmo vazio: é o alvo do coração dos cards, e
  // uma seção que some quando esvazia deixa quem desfavoritou sem saber para
  // onde o som foi.
  lista.push({
    id: "favoritos",
    titulo: "Favoritos",
    tipo: "favoritos",
    sons: resolver(favoritos),
  });

  const frequentes = resolver(
    Object.entries(usos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limiteFrequentes)
      .map(([id]) => id),
  );
  if (frequentes.length > 0) {
    lista.push({
      id: "frequentes",
      titulo: "Utilizados com frequência",
      tipo: "frequentes",
      sons: frequentes,
    });
  }

  const atual = guildIdAtivo ? guilds.find((g) => g.guildId === guildIdAtivo) : undefined;
  if (atual) {
    // vazia também entra: é a seção do "+ Adicionar som", e sem ela não haveria
    // caminho para o primeiro som de um servidor
    lista.push(secaoDeGuild(atual, true));
  }

  lista.push({
    id: "padrao",
    titulo: "Sons do Streamz",
    tipo: "padrao",
    sons: [...SONS_PADRAO],
  });

  for (const g of guilds) {
    if (g.guildId === guildIdAtivo) continue;
    if (g.sounds.length === 0) continue;
    lista.push(secaoDeGuild(g, false));
  }

  return lista;
}

function secaoDeGuild(g: GuildSoundboard, atual: boolean): SecaoDoPainel {
  return {
    id: `guild:${g.guildId}`,
    titulo: g.guildName,
    tipo: "guild",
    guildId: g.guildId,
    guildIconUrl: g.guildIconUrl,
    atual,
    sons: g.sounds,
  };
}
