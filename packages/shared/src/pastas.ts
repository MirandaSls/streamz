import { z } from "zod";
import { idSchema } from "./internos";
import { ROLE_COLORS } from "./permissoes";

// ── pastas de servidores ─────────────────────────────────────
//
// Como no Discord: arrastar um servidor sobre outro na barra lateral cria uma
// pasta. O layout é **do usuário** (não do servidor) e sincroniza entre os
// dispositivos dele.
//
// Escrita e leitura são REST, não WebSocket — não existe comando
// cliente → servidor para isto:
//   - `GET /users/me/guild-layout` → `GuildLayout | null` (`null` = o usuário
//     nunca arrumou a barra; o cliente mostra tudo solto).
//   - `PUT /users/me/guild-layout` com corpo validado por `guildLayoutSchema`
//     → devolve o `GuildLayout` gravado.
// O layout é um documento inteiro trocado de uma vez (último a gravar vence):
// arrastar um ícone mexe em duas ou três posições, e mandar só o delta
// obrigaria a API a resolver conflito de ordem que o usuário nem vê.
//
// Depois do PUT a API emite `WS_EVENTS.GUILD_LAYOUT_UPDATE` (payload
// `GuildLayout`) na sala `user:<id>`, para as outras abas e o desktop do mesmo
// usuário redesenharem a barra sem recarregar.
//
// Quem recebe um layout (GET, PUT ou evento) passa sempre por
// `resolveGuildLayout` com a lista atual de servidores: entre gravar e usar,
// `guild.joined`/`guild.removed` podem ter mudado a lista, e o layout gravado
// não é reescrito a cada entrada/saída de servidor.

/** Teto do nome de pasta (o do Discord). */
export const MAX_FOLDER_NAME_LENGTH = 32;
/** Teto de pastas num layout. */
export const MAX_GUILD_FOLDERS = 50;
/** Teto de servidores numa pasta — o mesmo teto de servidores por conta do Discord. */
export const MAX_GUILDS_PER_FOLDER = 200;

/**
 * Paleta do seletor de cor da pasta: duas linhas de 10, as do Discord.
 *
 * É a mesma paleta dos cargos (o Discord usa o mesmo seletor nos dois
 * lugares), por isso aponta para `ROLE_COLORS` em vez de repetir as 20 cores —
 * duas listas iguais escritas à mão acabam divergindo. Não há cor padrão
 * aqui de propósito: `color: null` quer dizer "a cor padrão da UI", que é o
 * accent do tema, e o contrato não deve fixar uma cor de tema.
 */
export const GUILD_FOLDER_COLORS: readonly string[] = ROLE_COLORS;

/** Uma pasta da barra lateral. */
export interface GuildFolder {
  /** Gerado pelo cliente ao criar a pasta; único dentro do layout. */
  id: string;
  /**
   * `null` = nome derivado dos dois primeiros servidores (ver
   * `guildFolderDisplayName`). Não guardamos o nome derivado porque ele muda
   * quando um servidor é renomeado ou sai da pasta.
   */
  name: string | null;
  /** Hex `#RRGGBB`; `null` = cor padrão da UI. */
  color: string | null;
  /** A ordem importa: é a ordem de cima para baixo dentro da pasta aberta. */
  guildIds: string[];
}

/** Um item da barra: servidor solto ou pasta, discriminado por `kind`. */
export type GuildLayoutItem =
  | { kind: "guild"; guildId: string }
  | { kind: "folder"; folder: GuildFolder };

/**
 * A barra de servidores inteira, de cima para baixo: servidores soltos e
 * pastas intercalados. Payload de `GET`/`PUT /users/me/guild-layout` e de
 * `guild.layout.update`.
 */
export interface GuildLayout {
  items: GuildLayoutItem[];
}

const guildFolderNameSchema = z
  .string({ invalid_type_error: "deve ser texto" })
  .trim()
  .max(MAX_FOLDER_NAME_LENGTH, `Nome da pasta acima de ${MAX_FOLDER_NAME_LENGTH} caracteres`)
  .nullable()
  // Apagar o nome no campo manda "" — que é o mesmo que "sem nome": volta a
  // derivar dos servidores. Normalizar aqui evita que cada ponta trate "" e
  // `null` como coisas diferentes.
  .transform((nome) => (nome ? nome : null));

const guildFolderColorSchema = z
  .string({ invalid_type_error: "deve ser texto" })
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hexadecimal #RRGGBB");

const guildFolderSchema = z.object({
  id: idSchema,
  name: guildFolderNameSchema,
  color: guildFolderColorSchema.nullable(),
  guildIds: z
    .array(idSchema)
    // Pasta com um servidor só é permitida (o Discord a mantém quando os
    // outros saem); pasta vazia não existe na barra, então é recusada.
    .min(1, "Pasta vazia")
    .max(MAX_GUILDS_PER_FOLDER, `Pasta acima de ${MAX_GUILDS_PER_FOLDER} servidores`),
});

const guildLayoutItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("guild"), guildId: idSchema }),
  z.object({ kind: z.literal("folder"), folder: guildFolderSchema }),
]);

/**
 * Validação de **escrita** (corpo do `PUT /users/me/guild-layout`).
 *
 * As regras que cruzam itens — servidor repetido em qualquer lugar do layout,
 * id de pasta repetido, teto de pastas — ficam no `superRefine` porque nenhum
 * item sozinho sabe delas. Um servidor em dois lugares desenharia o mesmo
 * ícone duas vezes e tornaria ambíguo para onde ele vai ao ser arrastado.
 *
 * Não confere se o usuário é membro dos servidores: isso é da API, que passa
 * o corpo por `resolveGuildLayout` antes de gravar (id alheio some, servidor
 * esquecido volta solto no fim).
 */
export const guildLayoutSchema: z.ZodType<GuildLayout, z.ZodTypeDef, unknown> = z
  .object({ items: z.array(guildLayoutItemSchema) })
  .superRefine((layout, ctx) => {
    const servidores = new Set<string>();
    const pastas = new Set<string>();
    let totalDePastas = 0;

    const conferirServidor = (guildId: string, path: (string | number)[]) => {
      if (servidores.has(guildId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Servidor repetido no layout" });
      }
      servidores.add(guildId);
    };

    layout.items.forEach((item, i) => {
      if (item.kind === "guild") {
        conferirServidor(item.guildId, ["items", i, "guildId"]);
        return;
      }
      totalDePastas += 1;
      if (pastas.has(item.folder.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", i, "folder", "id"],
          message: "Pasta repetida no layout",
        });
      }
      pastas.add(item.folder.id);
      item.folder.guildIds.forEach((guildId, j) =>
        conferirServidor(guildId, ["items", i, "folder", "guildIds", j]),
      );
    });

    if (totalDePastas > MAX_GUILD_FOLDERS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: `Layout acima de ${MAX_GUILD_FOLDERS} pastas`,
      });
    }
  });

/**
 * Reconcilia um layout gravado com os servidores que o usuário tem **agora**.
 *
 * - remove ids de servidores que ele não tem mais (e repetidos, por garantia);
 * - remove a pasta que ficou vazia;
 * - anexa ao fim, soltos e na ordem de `guildIds`, os servidores que o layout
 *   não conhece (entrou depois de gravar, ou gravou noutro dispositivo antes
 *   de entrar);
 * - `layout === null` = todos soltos, na ordem de `guildIds`.
 *
 * Pura e idempotente: aplicar duas vezes dá o mesmo resultado, por isso API e
 * cliente podem resolver o mesmo layout sem combinar quem faz.
 */
export function resolveGuildLayout(layout: GuildLayout | null, guildIds: string[]): GuildLayout {
  const atuais = new Set(guildIds);
  const vistos = new Set<string>();
  // Marca como visto e diz se o servidor fica: só os atuais, uma vez cada.
  const fica = (guildId: string): boolean => {
    if (!atuais.has(guildId) || vistos.has(guildId)) return false;
    vistos.add(guildId);
    return true;
  };

  const items: GuildLayoutItem[] = [];
  for (const item of layout?.items ?? []) {
    if (item.kind === "guild") {
      if (fica(item.guildId)) items.push({ kind: "guild", guildId: item.guildId });
      continue;
    }
    const restantes = item.folder.guildIds.filter(fica);
    if (restantes.length > 0) {
      items.push({ kind: "folder", folder: { ...item.folder, guildIds: restantes } });
    }
  }

  for (const guildId of guildIds) {
    if (fica(guildId)) items.push({ kind: "guild", guildId });
  }

  return { items };
}

/**
 * Nome que a UI mostra para a pasta: o `name` dela; sem nome, os dois
 * primeiros servidores (ex.: "Fazenda, Mansão Dev"), como o Discord faz.
 *
 * Os nomes entram **como estão** (só `trim` nas bordas), ligados por ", ":
 * sem normalizar nem remover emoji ou Unicode estilizado ("𝓕𝓪𝔃𝓮𝓷𝓭𝓪",
 * "Mansão Dev 💻") — quem desenha o emoji é a UI.
 *
 * Servidor cujo nome ainda não chegou ao cliente é pulado em vez de virar
 * "undefined" no tooltip; sem nenhum nome conhecido, "Pasta".
 */
export function guildFolderDisplayName(
  folder: GuildFolder,
  guildNameById: (id: string) => string | undefined,
): string {
  const nome = folder.name?.trim();
  if (nome) return nome;
  const nomes = folder.guildIds
    .map((id) => guildNameById(id)?.trim())
    .filter((n): n is string => !!n)
    .slice(0, 2);
  return nomes.length > 0 ? nomes.join(", ") : "Pasta";
}
