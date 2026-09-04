// Cargos e permissões — o bitfield e o cálculo da permissão efetiva (ADR-0002).
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── c-cargos ─────────────────────────────────────────────────
/**
 * Permissões como bitfield (ver `docs/adr/0002-cargos-e-permissoes.md`).
 *
 * Os bits são **estáveis para sempre**: o valor fica gravado em cada linha de
 * `Role` e de `ChannelOverride`. Permissão nova entra no próximo bit livre —
 * nenhuma é renumerada nem reciclada.
 *
 * É `number` (e não `bigint`) porque `&`/`|`/`~` do JavaScript operam em 32 bits
 * com sinal: com bigint toda checagem exigiria conversão, e um `Number()`
 * esquecido viraria bug silencioso. O preço é o teto de 30 bits utilizáveis.
 */
export const Permission = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  MANAGE_MESSAGES: 1 << 2,
  MANAGE_CHANNELS: 1 << 3,
  MANAGE_ROLES: 1 << 4,
  KICK_MEMBERS: 1 << 5,
  BAN_MEMBERS: 1 << 6,
  MANAGE_GUILD: 1 << 7,
  CREATE_INVITE: 1 << 8,
  ATTACH_FILES: 1 << 9,
  ADD_REACTIONS: 1 << 10,
  MENTION_EVERYONE: 1 << 11,
  CONNECT: 1 << 12,
  SPEAK: 1 << 13,
  MUTE_MEMBERS: 1 << 14,
  /** silenciar temporariamente (timeout) — usado pela moderação. */
  MODERATE_MEMBERS: 1 << 15,
  MANAGE_EMOJIS: 1 << 16,
  VIEW_AUDIT_LOG: 1 << 17,
  /** ignora todas as outras checagens, inclusive overrides de canal. */
  ADMINISTRATOR: 1 << 18,
  /** arrastar alguém de um canal de voz para outro do mesmo servidor. */
  MOVE_MEMBERS: 1 << 19,
  /** ligar a câmera e compartilhar a tela num canal de voz (o "Vídeo" do Discord). */
  STREAM: 1 << 20,
} as const;

export type PermissionName = keyof typeof Permission;

/** Nome legível e explicação de cada permissão (UI de edição de cargo). */
export const PERMISSION_INFO: Record<
  PermissionName,
  { label: string; description: string; group: "geral" | "membros" | "mensagens" | "voz" }
> = {
  VIEW_CHANNEL: {
    label: "Ver canais",
    description: "Permite ver os canais do servidor por padrão (antes das regras de cada canal).",
    group: "geral",
  },
  SEND_MESSAGES: {
    label: "Enviar mensagens",
    description: "Permite escrever nos canais de texto.",
    group: "mensagens",
  },
  MANAGE_MESSAGES: {
    label: "Gerenciar mensagens",
    description: "Permite apagar mensagens de outras pessoas.",
    group: "mensagens",
  },
  MANAGE_CHANNELS: {
    label: "Gerenciar canais",
    description: "Permite criar, renomear, reordenar e apagar canais.",
    group: "geral",
  },
  MANAGE_ROLES: {
    label: "Gerenciar cargos",
    description: "Permite criar e editar cargos abaixo do seu cargo mais alto.",
    group: "geral",
  },
  KICK_MEMBERS: {
    label: "Expulsar membros",
    description: "Permite remover membros do servidor (eles voltam com convite).",
    group: "membros",
  },
  BAN_MEMBERS: {
    label: "Banir membros",
    description: "Permite banir e desbanir membros.",
    group: "membros",
  },
  MANAGE_GUILD: {
    label: "Gerenciar servidor",
    description: "Permite mudar nome, ícone e descrição, e administrar convites.",
    group: "geral",
  },
  CREATE_INVITE: {
    label: "Criar convite",
    description: "Permite gerar convites para o servidor.",
    group: "geral",
  },
  ATTACH_FILES: {
    label: "Anexar arquivos",
    description: "Permite enviar imagens e arquivos nas mensagens.",
    group: "mensagens",
  },
  ADD_REACTIONS: {
    label: "Adicionar reações",
    description: "Permite reagir às mensagens com emoji.",
    group: "mensagens",
  },
  MENTION_EVERYONE: {
    label: "Mencionar todos",
    description: "Permite notificar todo mundo do canal de uma vez.",
    group: "mensagens",
  },
  CONNECT: {
    label: "Conectar",
    description: "Permite entrar em canais de voz.",
    group: "voz",
  },
  SPEAK: {
    label: "Falar",
    description: "Permite transmitir áudio nos canais de voz.",
    group: "voz",
  },
  MUTE_MEMBERS: {
    label: "Silenciar membros",
    description: "Permite tirar o microfone de outras pessoas na voz.",
    group: "voz",
  },
  MOVE_MEMBERS: {
    label: "Mover membros",
    description: "Permite arrastar alguém de um canal de voz para outro do servidor.",
    group: "voz",
  },
  STREAM: {
    label: "Vídeo",
    description: "Permite ligar a câmera e compartilhar a tela nos canais de voz.",
    group: "voz",
  },
  MODERATE_MEMBERS: {
    label: "Moderar membros",
    description: "Permite deixar um membro de castigo (sem falar) por um tempo.",
    group: "membros",
  },
  MANAGE_EMOJIS: {
    label: "Gerenciar emojis",
    description: "Permite adicionar e remover emojis personalizados.",
    group: "geral",
  },
  VIEW_AUDIT_LOG: {
    label: "Ver registro de auditoria",
    description: "Permite consultar o histórico de ações administrativas.",
    group: "geral",
  },
  ADMINISTRATOR: {
    label: "Administrador",
    description:
      "Concede todas as permissões e ignora as regras de cada canal. Dê com cuidado.",
    group: "geral",
  },
};

/** Ordem em que a UI lista as permissões (agrupada, como no Discord). */
export const PERMISSION_ORDER: readonly PermissionName[] = [
  "ADMINISTRATOR",
  "VIEW_CHANNEL",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_GUILD",
  "MANAGE_EMOJIS",
  "CREATE_INVITE",
  "VIEW_AUDIT_LOG",
  "SEND_MESSAGES",
  "MANAGE_MESSAGES",
  "ATTACH_FILES",
  "ADD_REACTIONS",
  "MENTION_EVERYONE",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "MODERATE_MEMBERS",
  "CONNECT",
  "SPEAK",
  "STREAM",
  "MUTE_MEMBERS",
  "MOVE_MEMBERS",
];

/** Todas as permissões ligadas — o que o dono e o ADMINISTRATOR recebem. */
export const ALL_PERMISSIONS: number = PERMISSION_ORDER.reduce(
  (bits, name) => bits | Permission[name],
  0,
);

/** O que o @everyone ganha ao nascer o servidor (mesmo padrão do Discord). */
export const DEFAULT_PERMISSIONS: number =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.CREATE_INVITE |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.STREAM;

/**
 * Permissões numa conversa direta: não há cargo nem override lá.
 * `MANAGE_MESSAGES` fica **de fora** de propósito — é o que faz "em DM só o
 * autor apaga" continuar valendo.
 */
export const DM_PERMISSIONS: number =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.STREAM;

/** Nome do cargo padrão de todo servidor (não é apagável nem renomeável). */
export const EVERYONE_ROLE_NAME = "@everyone";
/** Cargo criado com o servidor para o atalho `GuildMember.role = ADMIN`. */
export const ADMIN_ROLE_NAME = "Administrador";

export const MAX_ROLE_NAME = 32;

/** true se o bitfield contém **todos** os bits de `permission`. */
export function hasPermission(bits: number, permission: number): boolean {
  return (bits & permission) === permission;
}

/** Nomes das permissões contidas num bitfield (para UI e depuração). */
export function permissionNames(bits: number): PermissionName[] {
  return PERMISSION_ORDER.filter((name) => hasPermission(bits, Permission[name]));
}

/** Paleta de cores de cargo oferecida na UI (as do Discord). */
export const ROLE_COLORS: readonly string[] = [
  "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63",
  "#f1c40f", "#e67e22", "#e74c3c", "#95a5a6", "#607d8b",
  "#11806a", "#1f8b4c", "#206694", "#71368a", "#ad1457",
  "#c27c0e", "#a84300", "#992d22", "#979c9f", "#546e7a",
];

/** Cor de cargo válida: `#rrggbb`. */
export function isRoleColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export interface Role {
  id: string;
  guildId: string;
  name: string;
  /** "#rrggbb"; null = sem cor (o nome fica na cor padrão do tema). */
  color: string | null;
  /** hierarquia: maior = mais alto. O @everyone é sempre 0. */
  position: number;
  permissions: number;
  /** membros deste cargo aparecem numa seção própria da lista de membros. */
  hoist: boolean;
  mentionable: boolean;
  /** o @everyone do servidor: não se apaga, não se renomeia, não se atribui. */
  isDefault: boolean;
}

/**
 * Uma regra de permissão: para um cargo **ou** para um usuário, nunca os dois.
 *
 * É a forma que canal e categoria compartilham — a única diferença entre as
 * duas é a coluna que diz a quem a regra pertence. Tudo que só precisa
 * calcular (`computePermissions`, a UI tri-estado) fala nesta forma e serve aos
 * dois casos sem duplicação.
 */
export interface PermissionOverwrite {
  roleId: string | null;
  userId: string | null;
  allow: number;
  deny: number;
}

/** Regra de um canal para um cargo **ou** um usuário (nunca os dois). */
export interface ChannelOverride extends PermissionOverwrite {
  channelId: string;
}

/**
 * Regra de uma **categoria**. Vale por si (a categoria é privada ou não) e é
 * o que os canais sincronizados herdam — ver `overridesEfetivos`.
 */
export interface CategoryOverride extends PermissionOverwrite {
  categoryId: string;
}

/**
 * As regras que valem de fato para um canal.
 *
 * O Discord chama de "sincronizado" o canal cujas permissões são as da
 * categoria. Enquanto ele está sincronizado, quem manda é a categoria; a
 * primeira edição feita **no canal** o dessincroniza (a API copia as regras da
 * categoria para o canal antes de aplicar a edição, e a partir daí o canal
 * anda sozinho). Ter as duas leituras — a cópia gravada e esta função — é de
 * propósito: se a cópia divergir por qualquer motivo, o cálculo continua
 * devolvendo o que a tela promete.
 */
export function overridesEfetivos<T extends PermissionOverwrite>(
  sincronizado: boolean,
  doCanal: readonly T[],
  daCategoria: readonly T[],
): readonly T[] {
  return sincronizado ? daCategoria : doCanal;
}

/** Chave de um alvo de regra: `cargo:<id>` ou `membro:<id>`. */
export function alvoDoOverwrite(o: PermissionOverwrite): string {
  return o.roleId ? `cargo:${o.roleId}` : `membro:${o.userId}`;
}

/**
 * true quando os dois conjuntos de regras dizem exatamente a mesma coisa.
 * É como a API decide se um canal continua "sincronizado" com a categoria
 * depois de uma edição — e como a tela mostra o aviso de dessincronizado.
 */
export function overridesIguais(
  a: readonly PermissionOverwrite[],
  b: readonly PermissionOverwrite[],
): boolean {
  const chave = (o: PermissionOverwrite) => `${alvoDoOverwrite(o)}:${o.allow}:${o.deny}`;
  // regra vazia (allow 0, deny 0) não diz nada: some dos dois lados antes
  const util = (lista: readonly PermissionOverwrite[]) =>
    lista.filter((o) => o.allow !== 0 || o.deny !== 0).map(chave).sort();
  const x = util(a);
  const y = util(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Os três estados de uma permissão na tela de edição de regra. */
export type EstadoDaRegra = "negar" | "herdar" | "permitir";

/** Em que estado a permissão `bit` está numa regra. */
export function estadoDaRegra(o: PermissionOverwrite | undefined, bit: number): EstadoDaRegra {
  if (!o) return "herdar";
  if (hasPermission(o.allow, bit)) return "permitir";
  if (hasPermission(o.deny, bit)) return "negar";
  return "herdar";
}

/** A regra com `bit` posto no estado pedido (allow e deny são exclusivos). */
export function comEstadoDaRegra<T extends PermissionOverwrite>(
  o: T,
  bit: number,
  estado: EstadoDaRegra,
): T {
  const allow = estado === "permitir" ? o.allow | bit : o.allow & ~bit;
  const deny = estado === "negar" ? o.deny | bit : o.deny & ~bit;
  return { ...o, allow, deny };
}

/** O que `computePermissions` precisa saber do membro. */
export interface PermissionMember {
  /** dono do servidor: recebe tudo e ignora cargos e overrides. */
  isOwner: boolean;
  /** ids dos cargos atribuídos (o @everyone é injetado, não entra aqui). */
  roleIds: readonly string[];
}

/**
 * Permissão efetiva de um membro, opcionalmente dentro de um canal.
 *
 * Função **pura** — a API e o cliente usam esta mesma implementação, para que a
 * UI esconda exatamente o que a API recusaria. A ordem das etapas é a regra do
 * Discord e está justificada na ADR-0002; mexer nela é mudança de segurança:
 *
 *   1. dono → tudo;
 *   2. base = @everyone | OR dos cargos do membro;
 *   3. ADMINISTRATOR → tudo (**antes** dos overrides: um deny de canal não
 *      tranca o administrador para fora do próprio servidor);
 *   4. override do @everyone       (deny, depois allow);
 *   5. overrides dos cargos do membro, **somados entre si** (deny, depois allow);
 *   6. override do próprio usuário (deny, depois allow).
 *
 * `overrides` são as regras que valem para aquele canal — as dele, ou as da
 * categoria quando o canal está sincronizado (`overridesEfetivos`). Fora de
 * canal, passe `[]`.
 */
export function computePermissions(
  member: PermissionMember,
  roles: readonly Role[],
  overrides: readonly PermissionOverwrite[] = [],
): number {
  if (member.isOwner) return ALL_PERMISSIONS;

  const everyone = roles.find((r) => r.isDefault);
  const meus = roles.filter((r) => !r.isDefault && member.roleIds.includes(r.id));

  let bits = everyone?.permissions ?? 0;
  for (const r of meus) bits |= r.permissions;
  if (hasPermission(bits, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;

  if (everyone) {
    const o = overrides.find((x) => x.roleId === everyone.id);
    if (o) bits = (bits & ~o.deny) | o.allow;
  }

  // Overrides de cargo não se ordenam entre si: acumula deny e allow e aplica
  // uma vez, deny primeiro — é o comportamento do Discord.
  let allowCargos = 0;
  let denyCargos = 0;
  for (const r of meus) {
    const o = overrides.find((x) => x.roleId === r.id);
    if (!o) continue;
    allowCargos |= o.allow;
    denyCargos |= o.deny;
  }
  bits = (bits & ~denyCargos) | allowCargos;

  const meu = overrides.find((x) => x.userId !== null);
  if (meu) bits = (bits & ~meu.deny) | meu.allow;

  return bits;
}

/** Posição do cargo mais alto do membro — o teto do que ele pode mexer. */
export function highestPosition(member: PermissionMember, roles: readonly Role[]): number {
  if (member.isOwner) return Number.MAX_SAFE_INTEGER;
  return roles
    .filter((r) => !r.isDefault && member.roleIds.includes(r.id))
    .reduce((max, r) => Math.max(max, r.position), 0);
}

/** Cargo mais alto **com cor** do membro — é dele a cor do nome na tela. */
export function colorRoleOf(roleIds: readonly string[], roles: readonly Role[]): Role | null {
  let escolhido: Role | null = null;
  for (const r of roles) {
    if (r.isDefault || !r.color || !roleIds.includes(r.id)) continue;
    if (!escolhido || r.position > escolhido.position) escolhido = r;
  }
  return escolhido;
}

/** Cargos do membro, do mais alto para o mais baixo (sem o @everyone). */
export function rolesOf(roleIds: readonly string[], roles: readonly Role[]): Role[] {
  return roles
    .filter((r) => !r.isDefault && roleIds.includes(r.id))
    .sort((a, b) => b.position - a.position);
}

// ── c-cargos: payloads REST e eventos ────────────────────────
export const MAX_GUILD_DESCRIPTION = 300;
export const MAX_GUILD_ICON_SIZE = 4 * 1024 * 1024; // 4 MB

/** Campos editáveis de um cargo (POST/PATCH /guilds/:id/roles). */
export interface RoleInput {
  name?: string;
  color?: string | null;
  permissions?: number;
  hoist?: boolean;
  mentionable?: boolean;
}

/** Campos editáveis do servidor (PATCH /guilds/:id). */
export interface GuildUpdate {
  name?: string;
  description?: string | null;
}

/** Regra de canal gravada por PUT /guilds/:id/channels/:cid/overrides. */
export interface ChannelOverrideInput {
  roleId?: string | null;
  userId?: string | null;
  allow: number;
  deny: number;
}

/** Resposta de GET /guilds/:id/members/:uid/permissions. */
export interface MemberPermissions {
  userId: string;
  guildId: string;
  /** permissão no servidor (fora de canal). */
  permissions: number;
  roleIds: string[];
}

/** Cargo apagado — evento `role.deleted` na sala `guild:<id>`. */
export interface RoleDeletedEvent {
  guildId: string;
  roleId: string;
}

/** Overrides de um canal mudaram: quem está vendo recalcula o que pode. */
export interface ChannelOverridesEvent {
  guildId: string;
  channelId: string;
  overrides: ChannelOverride[];
}

/** Posse do servidor passou para outra pessoa. */
export interface GuildOwnerChangedEvent {
  guildId: string;
  ownerId: string;
  /** papel de quem entregou (vira ADMIN) — a UI atualiza a coroa. */
  previousOwnerId: string;
}


/** Overrides de uma categoria mudaram — evento `category.overrides`. */
export interface CategoryOverridesEvent {
  guildId: string;
  categoryId: string;
  overrides: CategoryOverride[];
}

/** Regra de categoria gravada por PUT /guilds/:id/categories/:cid/overrides. */
export type CategoryOverrideInput = ChannelOverrideInput;

// ── seções da tela de permissões (canal e categoria) ─────────

/**
 * Onde a lista de permissões está sendo editada. A categoria mostra tudo (os
 * canais dela podem ser de texto ou de voz); um canal mostra só o que se aplica
 * a ele — é o que o Discord faz, e evita oferecer "Falar" num canal de texto.
 */
export type EscopoDePermissao = "categoria" | "texto" | "voz";

export interface SecaoDePermissoes {
  id: string;
  label: string;
  permissions: readonly PermissionName[];
}

/**
 * As seções da aba "Permissões", na ordem do Discord (prints
 * `2026-09-04 102249`, `102300` e `102342`).
 *
 * A lista é **só o que o Streamz tem**: cada linha aqui é um bit que existe em
 * `Permission` e que alguma rota da API de fato consulta. As permissões do
 * Discord que não têm feature correspondente (webhooks, tópicos, figurinhas,
 * eventos, aplicativos, texto-para-voz, enquetes, modo lento, voz prioritária,
 * status do canal de voz) ficam de fora em vez de virarem caixinhas inertes.
 */
export function secoesDePermissoes(escopo: EscopoDePermissao): SecaoDePermissoes[] {
  const geral: SecaoDePermissoes = {
    id: "geral",
    label:
      escopo === "categoria"
        ? "Permissões gerais das categorias"
        : "Permissões gerais do canal",
    permissions: ["VIEW_CHANNEL", "MANAGE_CHANNELS", "MANAGE_ROLES"],
  };
  const assinatura: SecaoDePermissoes = {
    id: "assinatura",
    label: "Permissões da assinatura",
    permissions: ["CREATE_INVITE"],
  };
  const texto: SecaoDePermissoes = {
    id: "texto",
    label: "Permissões de canal de texto",
    permissions: [
      "SEND_MESSAGES",
      "ATTACH_FILES",
      "ADD_REACTIONS",
      "MENTION_EVERYONE",
      "MANAGE_MESSAGES",
    ],
  };
  const voz: SecaoDePermissoes = {
    id: "voz",
    label: "Permissões de canal de voz",
    permissions: ["CONNECT", "SPEAK", "STREAM", "MUTE_MEMBERS", "MOVE_MEMBERS"],
  };
  if (escopo === "texto") return [geral, assinatura, texto];
  if (escopo === "voz") return [geral, assinatura, voz];
  return [geral, assinatura, texto, voz];
}

/** Todos os bits editáveis num escopo — o que a tela pode mexer. */
export function bitsDoEscopo(escopo: EscopoDePermissao): number {
  return secoesDePermissoes(escopo)
    .flatMap((s) => s.permissions)
    .reduce((bits, name) => bits | Permission[name], 0);
}
