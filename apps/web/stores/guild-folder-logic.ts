import {
  MAX_FOLDER_NAME_LENGTH,
  MAX_GUILDS_PER_FOLDER,
  MAX_GUILD_FOLDERS,
  type GuildFolder,
  type GuildLayout,
  type GuildLayoutItem,
} from "@streamz/shared";

/**
 * Pastas da barra de servidores: o que muda no `GuildLayout` quando alguém
 * arrasta um ícone, renomeia, colore ou desfaz uma pasta.
 *
 * Lógica pura de propósito, como em `channel-order.ts`: a barra só desenha o
 * resultado e manda o layout inteiro no `PUT /users/@me/guild-layout`. O
 * cálculo (que é onde erra) fica testável sem DOM, store nem servidor.
 *
 * Três regras valem para todas as funções daqui:
 * - nunca mutam o layout recebido;
 * - quando nada muda devolvem **o mesmo objeto** (`===`), para quem chama
 *   poder pular o PUT com uma comparação de referência;
 * - não produzem layout que o `guildLayoutSchema` recusaria por limite: se a
 *   operação estouraria `MAX_GUILD_FOLDERS` ou `MAX_GUILDS_PER_FOLDER`, o
 *   layout volta inalterado. Recusar em silêncio é o que o Discord faz (o
 *   ícone volta ao lugar); a alternativa seria um PUT fadado a 400.
 *
 * Pasta que fica vazia some na hora — o schema recusa pasta vazia, e na barra
 * ela seria um ícone sem nada dentro.
 */

/**
 * Chave estável de um item do topo, no formato `guild:<id>` ou `folder:<id>`.
 *
 * O prefixo existe porque o id da pasta é gerado pelo cliente e nada no
 * contrato impede que coincida com o id de um servidor; com a chave, quem
 * arrasta (e quem usa como `key` do React) nunca confunde um com o outro.
 */
export type ChaveDoItem = `guild:${string}` | `folder:${string}`;

export function chaveDoItem(item: GuildLayoutItem): ChaveDoItem {
  return item.kind === "guild" ? `guild:${item.guildId}` : `folder:${item.folder.id}`;
}

/** Onde um servidor está no layout. */
export interface PosicaoDoServidor {
  /** Índice no topo: o do próprio servidor, se solto, ou o da pasta que o contém. */
  indiceNoTopo: number;
  /** `null` = servidor solto. */
  pastaId: string | null;
  /** Índice dentro da pasta; `null` quando solto. */
  indiceNaPasta: number | null;
}

function localizarEm(items: GuildLayoutItem[], guildId: string): PosicaoDoServidor | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "guild") {
      if (item.guildId === guildId) return { indiceNoTopo: i, pastaId: null, indiceNaPasta: null };
      continue;
    }
    const j = item.folder.guildIds.indexOf(guildId);
    if (j >= 0) return { indiceNoTopo: i, pastaId: item.folder.id, indiceNaPasta: j };
  }
  return null;
}

/** Onde está o servidor (solto ou dentro de qual pasta); `null` se não está no layout. */
export function localizarServidor(layout: GuildLayout, guildId: string): PosicaoDoServidor | null {
  return localizarEm(layout.items, guildId);
}

function indiceDaPasta(items: GuildLayoutItem[], pastaId: string): number {
  return items.findIndex((item) => item.kind === "folder" && item.folder.id === pastaId);
}

function comPasta(folder: GuildFolder): GuildLayoutItem {
  return { kind: "folder", folder };
}

function mesmaPasta(a: GuildFolder, b: GuildFolder): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.color === b.color &&
    a.guildIds.length === b.guildIds.length &&
    a.guildIds.every((id, i) => id === b.guildIds[i])
  );
}

function mesmoItem(a: GuildLayoutItem, b: GuildLayoutItem): boolean {
  if (a.kind === "guild") return b.kind === "guild" && a.guildId === b.guildId;
  return b.kind === "folder" && mesmaPasta(a.folder, b.folder);
}

/**
 * Devolve o layout original quando o novo é igual a ele. Várias operações
 * (soltar no mesmo lugar, reordenar para onde já estava) passam pelo cálculo
 * inteiro e chegam ao mesmo layout; comparar no fim é mais simples e menos
 * frágil do que prever cada um desses casos na entrada.
 */
function inalteradoSeIgual(original: GuildLayout, novo: GuildLayoutItem[]): GuildLayout {
  const igual =
    original.items.length === novo.length && original.items.every((item, i) => mesmoItem(item, novo[i]));
  return igual ? original : { items: novo };
}

function estouraLimites(items: GuildLayoutItem[]): boolean {
  let pastas = 0;
  for (const item of items) {
    if (item.kind !== "folder") continue;
    pastas += 1;
    if (item.folder.guildIds.length > MAX_GUILDS_PER_FOLDER) return true;
  }
  return pastas > MAX_GUILD_FOLDERS;
}

/**
 * Tira o servidor de onde estiver. `topoRemovido` é o índice do item do topo
 * que sumiu (o servidor solto, ou a pasta que ficou vazia) — quem insere
 * depois precisa dele para descontar o deslocamento do índice de destino.
 */
function retirarServidor(
  items: GuildLayoutItem[],
  guildId: string,
): { items: GuildLayoutItem[]; topoRemovido: number | null } | null {
  const pos = localizarEm(items, guildId);
  if (!pos) return null;
  const item = items[pos.indiceNoTopo];
  const semOItem = () => items.filter((_, i) => i !== pos.indiceNoTopo);

  if (item.kind === "guild") return { items: semOItem(), topoRemovido: pos.indiceNoTopo };

  const restantes = item.folder.guildIds.filter((id) => id !== guildId);
  if (restantes.length === 0) return { items: semOItem(), topoRemovido: pos.indiceNoTopo };

  const copia = [...items];
  copia[pos.indiceNoTopo] = comPasta({ ...item.folder, guildIds: restantes });
  return { items: copia, topoRemovido: null };
}

/**
 * Converte o índice de destino — medido na lista do topo **como ela está
 * desenhada**, com o item arrastado ainda no lugar (0 = antes do primeiro,
 * `items.length` = depois do último) — para a lista já sem o item. Sem isso,
 * arrastar para baixo deixaria o item uma posição acima de onde foi solto.
 */
function indiceAposRemocao(indice: number, topoRemovido: number | null, tamanho: number): number {
  const ajustado = topoRemovido !== null && topoRemovido < indice ? indice - 1 : indice;
  return Math.max(0, Math.min(ajustado, tamanho));
}

/**
 * Soltar um servidor **sobre** outro servidor.
 *
 * - Alvo solto: nasce a pasta `novoIdPasta` no lugar do alvo, com
 *   `[alvo, arrastado]`, sem nome nem cor (como no Discord, o nome deriva dos
 *   dois servidores). O arrastado sai de onde estava, e a pasta de onde ele
 *   veio some se esvaziar.
 * - Alvo dentro de uma pasta: o arrastado entra nessa pasta logo depois do
 *   alvo (não existe pasta dentro de pasta). Vale também para reordenar
 *   dentro da mesma pasta.
 *
 * Inalterado quando: arrastar sobre si mesmo, algum dos dois não está no
 * layout, `novoIdPasta` já é id de outra pasta, ou o resultado estouraria
 * `MAX_GUILD_FOLDERS`/`MAX_GUILDS_PER_FOLDER`.
 */
export function soltarServidorSobreServidor(
  layout: GuildLayout,
  arrastadoId: string,
  alvoId: string,
  novoIdPasta: string,
): GuildLayout {
  if (arrastadoId === alvoId) return layout;
  if (!localizarEm(layout.items, alvoId)) return layout;
  const retirada = retirarServidor(layout.items, arrastadoId);
  if (!retirada) return layout;

  const items = [...retirada.items];
  // o alvo continua no layout: só o arrastado saiu
  const alvo = localizarEm(items, alvoId)!;
  const itemDoAlvo = items[alvo.indiceNoTopo];

  if (itemDoAlvo.kind === "guild") {
    // id de pasta repetido seria recusado pelo schema; conferir depois de
    // retirar o arrastado deixa reaproveitar o id da pasta que acabou de sumir
    if (indiceDaPasta(items, novoIdPasta) >= 0) return layout;
    items[alvo.indiceNoTopo] = comPasta({
      id: novoIdPasta,
      name: null,
      color: null,
      guildIds: [alvoId, arrastadoId],
    });
  } else {
    const guildIds = [...itemDoAlvo.folder.guildIds];
    guildIds.splice(alvo.indiceNaPasta! + 1, 0, arrastadoId);
    items[alvo.indiceNoTopo] = comPasta({ ...itemDoAlvo.folder, guildIds });
  }

  if (estouraLimites(items)) return layout;
  return inalteradoSeIgual(layout, items);
}

/**
 * Soltar um servidor sobre o ícone de uma pasta: entra no fim dela.
 *
 * Servidor que já está nessa pasta fica onde está — soltar no ícone da
 * própria pasta não é pedido de reordenar, e jogá-lo para o fim seria um
 * salto que a pessoa não pediu.
 */
export function soltarServidorSobrePasta(
  layout: GuildLayout,
  arrastadoId: string,
  pastaId: string,
): GuildLayout {
  const pos = localizarEm(layout.items, arrastadoId);
  if (!pos || pos.pastaId === pastaId) return layout;
  if (indiceDaPasta(layout.items, pastaId) < 0) return layout;

  const items = [...retirarServidor(layout.items, arrastadoId)!.items];
  // a pasta de destino não continha o arrastado, então não pode ter sumido
  const i = indiceDaPasta(items, pastaId);
  const destino = items[i] as Extract<GuildLayoutItem, { kind: "folder" }>;
  items[i] = comPasta({ ...destino.folder, guildIds: [...destino.folder.guildIds, arrastadoId] });

  if (estouraLimites(items)) return layout;
  return inalteradoSeIgual(layout, items);
}

/**
 * Move um item do topo (servidor solto ou pasta inteira, pela `chaveDoItem`)
 * para o vão `indice` da lista do topo, medido com o item ainda no lugar.
 */
export function moverItemNoTopo(layout: GuildLayout, itemChave: string, indice: number): GuildLayout {
  const atual = layout.items.findIndex((item) => chaveDoItem(item) === itemChave);
  if (atual < 0) return layout;
  const items = layout.items.filter((_, i) => i !== atual);
  items.splice(indiceAposRemocao(indice, atual, items.length), 0, layout.items[atual]);
  return inalteradoSeIgual(layout, items);
}

/**
 * Põe o servidor solto no vão `indiceNoTopo` da lista do topo (medido como
 * ela está desenhada antes de soltar). Se estava numa pasta, sai dela — e a
 * pasta some se esvaziar. Também move servidor que já estava solto, para
 * quem arrasta não precisar saber de onde ele veio.
 */
export function tirarDaPasta(layout: GuildLayout, guildId: string, indiceNoTopo: number): GuildLayout {
  const retirada = retirarServidor(layout.items, guildId);
  if (!retirada) return layout;
  const items = [...retirada.items];
  items.splice(indiceAposRemocao(indiceNoTopo, retirada.topoRemovido, items.length), 0, {
    kind: "guild",
    guildId,
  });
  return inalteradoSeIgual(layout, items);
}

/**
 * Soltar no vão entre dois itens do topo. `arrastadoId` é o id de uma pasta
 * (move a pasta inteira) ou de um servidor (fica solto nesse vão, saindo da
 * pasta se estava numa).
 *
 * Pasta é procurada antes de servidor: o id da pasta só aparece no arrasto
 * quando é a pasta que está sendo arrastada.
 */
export function soltarEntreItens(
  layout: GuildLayout,
  arrastadoId: string,
  indiceDestinoNoTopo: number,
): GuildLayout {
  if (indiceDaPasta(layout.items, arrastadoId) >= 0) {
    return moverItemNoTopo(layout, `folder:${arrastadoId}`, indiceDestinoNoTopo);
  }
  return tirarDaPasta(layout, arrastadoId, indiceDestinoNoTopo);
}

function atualizarPasta(
  layout: GuildLayout,
  pastaId: string,
  mudar: (folder: GuildFolder) => GuildFolder,
): GuildLayout {
  const i = indiceDaPasta(layout.items, pastaId);
  if (i < 0) return layout;
  const item = layout.items[i] as Extract<GuildLayoutItem, { kind: "folder" }>;
  const nova = mudar(item.folder);
  if (mesmaPasta(nova, item.folder)) return layout;
  const items = [...layout.items];
  items[i] = comPasta(nova);
  return { items };
}

/**
 * Nome como o schema o gravaria: aparado, vazio vira `null` (volta a derivar
 * dos servidores) e longo é cortado no teto.
 *
 * Cortar em vez de recusar imita o `maxLength` do campo, que já corta o que é
 * colado. O corte é por ponto de código para não partir um emoji ao meio (meio
 * par substituto viraria "�"), sem passar de `MAX_FOLDER_NAME_LENGTH` unidades
 * UTF-16 — que é o que o `.max()` do zod conta.
 */
function normalizarNomeDePasta(name: string | null): string | null {
  const aparado = name?.trim() ?? "";
  let cortado = "";
  for (const caractere of aparado) {
    if (cortado.length + caractere.length > MAX_FOLDER_NAME_LENGTH) break;
    cortado += caractere;
  }
  return cortado.trimEnd() || null;
}

/** Renomeia a pasta; `null` ou só espaços = sem nome (deriva dos servidores). */
export function renomearPasta(layout: GuildLayout, pastaId: string, name: string | null): GuildLayout {
  const nome = normalizarNomeDePasta(name);
  return atualizarPasta(layout, pastaId, (folder) => ({ ...folder, name: nome }));
}

const COR_HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Muda a cor da pasta; `null` = cor padrão da UI. Cor fora de `#RRGGBB` deixa
 * o layout inalterado em vez de virar um PUT que o schema recusaria.
 */
export function colorirPasta(layout: GuildLayout, pastaId: string, color: string | null): GuildLayout {
  if (color !== null && !COR_HEX.test(color)) return layout;
  return atualizarPasta(layout, pastaId, (folder) => ({ ...folder, color }));
}

/**
 * "Excluir pasta" do Discord: a pasta some e os servidores dela ficam soltos
 * no lugar que ela ocupava, na mesma ordem. Nenhum servidor sai da conta.
 */
export function removerPasta(layout: GuildLayout, pastaId: string): GuildLayout {
  const i = indiceDaPasta(layout.items, pastaId);
  if (i < 0) return layout;
  const item = layout.items[i] as Extract<GuildLayoutItem, { kind: "folder" }>;
  const soltos: GuildLayoutItem[] = item.folder.guildIds.map((guildId) => ({ kind: "guild", guildId }));
  return { items: [...layout.items.slice(0, i), ...soltos, ...layout.items.slice(i + 1)] };
}

/**
 * Ids dos servidores na ordem em que aparecem na barra, de cima para baixo:
 * soltos e os de pasta **aberta** (`abertas` = ids das pastas abertas). Os de
 * pasta fechada ficam de fora porque não estão na tela — é a lista que a
 * navegação por teclado percorre.
 */
export function todosOsIdsNaOrdemVisual(layout: GuildLayout, abertas: ReadonlySet<string>): string[] {
  const ids: string[] = [];
  for (const item of layout.items) {
    if (item.kind === "guild") ids.push(item.guildId);
    else if (abertas.has(item.folder.id)) ids.push(...item.folder.guildIds);
  }
  return ids;
}
