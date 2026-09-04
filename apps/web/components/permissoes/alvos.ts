import {
  EVERYONE_ROLE_NAME,
  alvoDoOverwrite,
  type PermissionOverwrite,
  type Role,
} from "@streamz/shared";

/**
 * A coluna "CARGOS/MEMBROS" da tela de permissões, como dado.
 *
 * Separada do componente porque é a única parte da tela que tem regra de
 * verdade — ordem, o @everyone que existe mesmo sem regra, o alvo cuja origem
 * sumiu — e porque assim ela se testa sem montar React (os testes daqui rodam
 * em `environment: node`, ver `apps/web/vitest.config.ts`).
 *
 * O módulo não conhece store nem componente: recebe as regras, os cargos e os
 * membros e devolve linhas. É o que permite servir às duas telas (canal e
 * categoria) com o mesmo código — as regras das duas são a mesma forma
 * (`PermissionOverwrite`), só muda a coluna do dono.
 */

export interface Alvo {
  /** `cargo:<id>` ou `membro:<id>` — a mesma chave de `alvoDoOverwrite`. */
  chave: string;
  tipo: "cargo" | "membro";
  id: string;
  nome: string;
  /** cor do cargo (`#rrggbb`) para o pontinho da linha; null em membro e em cargo sem cor. */
  cor: string | null;
  /** o @everyone: fica sempre no topo e não se remove. */
  padrao: boolean;
}

/** O mínimo que esta lista precisa saber de um membro do servidor. */
export interface MembroDoAlvo {
  id: string;
  nome: string;
}

/** Texto comparável: sem acento e em minúsculas, para o filtro do "+". */
export function comparavel(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function doCargo(role: Role): Alvo {
  return {
    chave: `cargo:${role.id}`,
    tipo: "cargo",
    id: role.id,
    nome: role.isDefault ? EVERYONE_ROLE_NAME : role.name,
    cor: role.color,
    padrao: role.isDefault,
  };
}

function doMembro(membro: MembroDoAlvo): Alvo {
  return {
    chave: `membro:${membro.id}`,
    tipo: "membro",
    id: membro.id,
    nome: membro.nome,
    cor: null,
    padrao: false,
  };
}

/**
 * As linhas da coluna, na ordem do Discord: @everyone, depois os outros cargos
 * do mais alto para o mais baixo, depois os membros em ordem alfabética.
 *
 * O @everyone entra **mesmo sem regra gravada**: ele é o padrão do canal, e uma
 * lista que só o mostrasse depois da primeira edição obrigaria a descobrir que
 * é preciso adicioná-lo antes de poder mexer no que todo mundo pode.
 *
 * Alvo cuja origem sumiu (cargo apagado, membro que saiu) continua na lista com
 * um nome de resto: a regra existe no servidor, e escondê-la deixaria a pessoa
 * sem como apagá-la.
 */
export function alvosDasRegras(
  overrides: readonly PermissionOverwrite[],
  roles: readonly Role[],
  membros: readonly MembroDoAlvo[],
): Alvo[] {
  const everyone = roles.find((r) => r.isDefault) ?? null;
  const cargos: Alvo[] = [];
  const pessoas: Alvo[] = [];

  for (const o of overrides) {
    const chave = alvoDoOverwrite(o);
    if (o.roleId) {
      if (everyone && o.roleId === everyone.id) continue; // entra pela cabeça da lista
      const role = roles.find((r) => r.id === o.roleId);
      cargos.push(
        role
          ? doCargo(role)
          : { chave, tipo: "cargo", id: o.roleId, nome: "Cargo removido", cor: null, padrao: false },
      );
      continue;
    }
    if (!o.userId) continue; // regra sem dono não existe no contrato; ignorar é mais seguro que adivinhar
    const membro = membros.find((m) => m.id === o.userId);
    pessoas.push(
      membro
        ? doMembro(membro)
        : { chave, tipo: "membro", id: o.userId, nome: "Membro desconhecido", cor: null, padrao: false },
    );
  }

  const posicao = (a: Alvo) => roles.find((r) => r.id === a.id)?.position ?? -1;
  cargos.sort((a, b) => posicao(b) - posicao(a) || a.nome.localeCompare(b.nome, "pt-BR"));
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [...(everyone ? [doCargo(everyone)] : []), ...cargos, ...pessoas];
}

/**
 * O que o "+" ainda pode oferecer: cargos e membros que **não** têm regra.
 *
 * O @everyone fica de fora porque já está na lista por definição. O filtro é
 * por trecho, sem acento — quem procura "joao" acha "João".
 */
export function alvosDisponiveis(
  overrides: readonly PermissionOverwrite[],
  roles: readonly Role[],
  membros: readonly MembroDoAlvo[],
  filtro = "",
): Alvo[] {
  const jaTem = new Set(overrides.map(alvoDoOverwrite));
  const busca = comparavel(filtro.trim());
  const passa = (a: Alvo) => !jaTem.has(a.chave) && (!busca || comparavel(a.nome).includes(busca));

  const cargos = roles
    .filter((r) => !r.isDefault)
    .map(doCargo)
    .filter(passa)
    .sort((a, b) => {
      const p = (x: Alvo) => roles.find((r) => r.id === x.id)?.position ?? 0;
      return p(b) - p(a) || a.nome.localeCompare(b.nome, "pt-BR");
    });

  const pessoas = membros
    .map(doMembro)
    .filter(passa)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [...cargos, ...pessoas];
}
