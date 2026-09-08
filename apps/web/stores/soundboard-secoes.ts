import type { GuildSoundboard, SoundboardSound } from "@streamz/shared";

/**
 * As seções do painel de efeitos sonoros, na ordem em que ele as desenha.
 *
 * Parte pura, fora do componente e fora da store, porque é a única coisa aqui
 * que tem regra: a ordem das seções, o que a busca casa, e — o que mais quebra
 * na prática — o que fazer com um id favoritado cujo som **não existe mais**
 * (foi apagado, ou saí do servidor). Um componente que resolvesse isso na
 * marcha renderizaria `undefined` no primeiro card.
 *
 * A ordem é a do Discord (prints `2026-09-08 103446`/`103452`): **Favoritos**,
 * **Utilizados com frequência** e depois um bloco por servidor, começando pelo
 * que está aberto. Não há mais a seção "Sons do Streamz": o app não traz som
 * nenhum de fábrica.
 *
 * **Favoritos e Utilizados com frequência aparecem sempre, mesmo vazios** — é
 * assim no print, e foi o que faltou na primeira versão: quem nunca tocou um
 * som não via a seção existir, e concluía que ela não tinha sido feita.
 */

export type TipoDeSecao = "favoritos" | "frequentes" | "guild" | "busca";

export interface SecaoDoPainel {
  /** id estável, usado como âncora do atalho da coluna da esquerda. */
  id: string;
  titulo: string;
  tipo: TipoDeSecao;
  /** presente só em `tipo: "guild"`. */
  guildId?: string;
  guildIconUrl?: string | null;
  /** o servidor aberto agora — vem primeiro entre os servidores. */
  atual?: boolean;
  /** posso pôr som neste servidor? é o que desenha o card "+ Adicionar som". */
  podeAdicionar?: boolean;
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
  /** ids dos servidores em que eu posso adicionar/remover som. */
  guildsQuePossoGerenciar: string[];
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
  const posso = new Set(entrada.guildsQuePossoGerenciar);
  const todos = guilds.flatMap((g) => g.sounds);

  const termo = normalizar(busca);
  if (termo.length > 0) {
    // uma lista só: quem procura "quack" não sabe (nem precisa saber) de qual
    // dos seus servidores aquele som veio
    return [
      {
        id: "busca",
        titulo: "Resultados",
        tipo: "busca",
        sons: todos.filter((s) => normalizar(s.name).includes(termo)),
      },
    ];
  }

  const porId = new Map(todos.map((s) => [s.id, s]));
  const resolver = (ids: string[]): SoundboardSound[] =>
    ids.map((id) => porId.get(id)).filter((s): s is SoundboardSound => s !== undefined);

  const lista: SecaoDoPainel[] = [
    { id: "favoritos", titulo: "Favoritos", tipo: "favoritos", sons: resolver(favoritos) },
    {
      id: "frequentes",
      titulo: "Utilizados com frequência",
      tipo: "frequentes",
      sons: resolver(
        Object.entries(usos)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limiteFrequentes)
          .map(([id]) => id),
      ),
    },
  ];

  // o servidor aberto primeiro, os outros na ordem em que a store os entrega
  const ordenados = [...guilds].sort(
    (a, b) => Number(b.guildId === guildIdAtivo) - Number(a.guildId === guildIdAtivo),
  );
  for (const g of ordenados) {
    const podeAdicionar = posso.has(g.guildId);
    // servidor sem som e onde eu não posso pôr nenhum não tem o que mostrar
    if (g.sounds.length === 0 && !podeAdicionar) continue;
    lista.push({
      id: `guild:${g.guildId}`,
      titulo: g.guildName,
      tipo: "guild",
      guildId: g.guildId,
      guildIconUrl: g.guildIconUrl,
      atual: g.guildId === guildIdAtivo,
      podeAdicionar,
      sons: g.sounds,
    });
  }

  return lista;
}
