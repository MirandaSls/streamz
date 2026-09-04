import { displayNameOf, type GuildMemberView } from "@streamz/shared";

/**
 * A lógica da tabela de membros — busca, filtro por cargo, ordenação e
 * paginação — fora do componente.
 *
 * Separada porque é a única parte da tela que pode estar *errada* sem parecer
 * errada: uma ordenação instável ou uma página que sai do intervalo só aparece
 * num servidor grande, que é justamente o que não dá para abrir aqui. Como
 * funções puras, elas têm teste (`membros-tabela.test.ts`); o resto da aba é
 * marcação e se confere olhando.
 */

/** Ordens oferecidas pelo botão "Ordenar" do print `2026-09-04 100649`. */
export type OrdemDeMembros = "recentes" | "antigos" | "nome" | "nome-desc";

export const ORDENS: { id: OrdemDeMembros; label: string }[] = [
  { id: "recentes", label: "Entraram por último" },
  { id: "antigos", label: "Entraram primeiro" },
  { id: "nome", label: "Nome (A–Z)" },
  { id: "nome-desc", label: "Nome (Z–A)" },
];

/** Quantos por página — o seletor "Mostrando [12] membros de 61" do print. */
export const POR_PAGINA = [12, 25, 50, 100] as const;

export interface FiltroDeMembros {
  /** casa com o nome de exibição **ou** com o @usuário, sem diferenciar caixa. */
  busca: string;
  /** id do cargo; vazio = todos. */
  cargoId: string;
}

export function filtrarMembros(
  membros: readonly GuildMemberView[],
  { busca, cargoId }: FiltroDeMembros,
): GuildMemberView[] {
  const q = busca.trim().toLowerCase();
  return membros.filter((m) => {
    const casaNome =
      !q ||
      m.user.username.toLowerCase().includes(q) ||
      displayNameOf(m.user).toLowerCase().includes(q);
    const casaCargo = !cargoId || m.roleIds.includes(cargoId);
    return casaNome && casaCargo;
  });
}

/**
 * Ordena sem mexer no array de entrada (ele vem da store).
 *
 * O desempate por `user.id` não é preciosismo: `Array.prototype.sort` é estável
 * por especificação, mas a entrada aqui **não** tem ordem garantida — a store
 * remonta a lista a cada evento de membro —, e sem o desempate duas pessoas que
 * entraram no mesmo instante trocariam de lugar sozinhas na tela.
 */
export function ordenarMembros(
  membros: readonly GuildMemberView[],
  ordem: OrdemDeMembros,
): GuildMemberView[] {
  const desempate = (a: GuildMemberView, b: GuildMemberView) => a.user.id.localeCompare(b.user.id);
  const porData = (a: GuildMemberView, b: GuildMemberView) =>
    new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  const porNome = (a: GuildMemberView, b: GuildMemberView) =>
    displayNameOf(a.user).localeCompare(displayNameOf(b.user), "pt-BR", { sensitivity: "base" });

  const comparar: Record<OrdemDeMembros, (a: GuildMemberView, b: GuildMemberView) => number> = {
    recentes: (a, b) => -porData(a, b) || desempate(a, b),
    antigos: (a, b) => porData(a, b) || desempate(a, b),
    nome: (a, b) => porNome(a, b) || desempate(a, b),
    "nome-desc": (a, b) => -porNome(a, b) || desempate(a, b),
  };
  return [...membros].sort(comparar[ordem]);
}

export interface Pagina<T> {
  /** a fatia visível. */
  itens: T[];
  /** quantas páginas existem (nunca menos de 1, para a barra não sumir). */
  paginas: number;
  /** a página realmente usada, já grampeada ao intervalo válido (1-based). */
  pagina: number;
}

/**
 * Fatia a lista, grampeando a página pedida.
 *
 * Grampear em vez de devolver vazio é o que evita a tela em branco depois de
 * filtrar: quem estava na página 4 e digita uma busca que deixa 3 resultados
 * cai na página 1, e não num "nenhum membro" mentiroso.
 */
export function paginar<T>(lista: readonly T[], pagina: number, porPagina: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  const inicio = (atual - 1) * porPagina;
  return { itens: lista.slice(inicio, inicio + porPagina), paginas, pagina: atual };
}

/**
 * Os números que a barra de paginação desenha, com reticências quando não cabem
 * todos: `1 … 4 5 6 … 20`. `null` é a reticência.
 */
export function numerosDePagina(pagina: number, paginas: number, janela = 5): (number | null)[] {
  if (paginas <= janela + 2) return Array.from({ length: paginas }, (_, i) => i + 1);
  const meio = Math.floor(janela / 2);
  let de = Math.max(2, pagina - meio);
  const ate = Math.min(paginas - 1, de + janela - 1);
  de = Math.max(2, ate - janela + 1);
  const out: (number | null)[] = [1];
  if (de > 2) out.push(null);
  for (let p = de; p <= ate; p++) out.push(p);
  if (ate < paginas - 1) out.push(null);
  out.push(paginas);
  return out;
}

/**
 * "29 dias atrás", "2 meses atrás", "1 ano atrás" — a coluna "Membro desde".
 *
 * O mês vale 30 dias e o ano 365 de propósito: a coluna é uma noção de há
 * quanto tempo, não uma conta de calendário, e o print do Discord mostra
 * exatamente essa aproximação ("1 mês atrás" logo depois de "29 dias atrás").
 */
export function haQuantoTempo(iso: string, agora: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const dias = Math.max(0, Math.floor((agora.getTime() - t) / 86_400_000));
  if (dias < 1) return "hoje";
  if (dias === 1) return "1 dia atrás";
  if (dias < 30) return `${dias} dias atrás`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "1 mês atrás" : `${meses} meses atrás`;
  const anos = Math.floor(dias / 365);
  return anos === 1 ? "1 ano atrás" : `${anos} anos atrás`;
}
