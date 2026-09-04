import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  Permission,
  bitsDoEscopo,
  comEstadoDaRegra,
  computePermissions,
  estadoDaRegra,
  hasPermission,
  overridesEfetivos,
  overridesIguais,
  secoesDePermissoes,
  type PermissionMember,
  type PermissionOverwrite,
  type Role,
} from "@streamz/shared";

/**
 * Herança categoria → canal e a precedência do cálculo.
 *
 * O `permissions.test.ts` ao lado cobre `computePermissions` etapa a etapa. Este
 * cobre o que a categoria acrescentou: qual conjunto de regras entra no cálculo
 * quando o canal está sincronizado, e o que a tela tri-estado grava e lê.
 * Errar aqui é canal privado que aparece — por isso os casos são explícitos e
 * não derivados uns dos outros.
 */

const everyone: Role = {
  id: "r-everyone",
  guildId: "g1",
  name: "@everyone",
  color: null,
  position: 0,
  permissions: DEFAULT_PERMISSIONS,
  hoist: false,
  mentionable: false,
  isDefault: true,
};

const cargo: Role = {
  id: "r-mod",
  guildId: "g1",
  name: "Moderação",
  color: null,
  position: 5,
  permissions: 0,
  hoist: false,
  mentionable: false,
  isDefault: false,
};

function regra(over: Partial<PermissionOverwrite>): PermissionOverwrite {
  return { roleId: null, userId: null, allow: 0, deny: 0, ...over };
}

const membro = (roleIds: string[] = []): PermissionMember => ({ isOwner: false, roleIds });

// "categoria privada": o @everyone perde VIEW_CHANNEL, o cargo recupera
const categoriaPrivada = [
  regra({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL }),
  regra({ roleId: cargo.id, allow: Permission.VIEW_CHANNEL }),
];

describe("overridesEfetivos — herança categoria → canal", () => {
  it("canal sincronizado usa as regras da CATEGORIA, mesmo tendo as suas", () => {
    const doCanal = [regra({ roleId: everyone.id, allow: Permission.VIEW_CHANNEL })];
    expect(overridesEfetivos(true, doCanal, categoriaPrivada)).toEqual(categoriaPrivada);
  });

  it("canal dessincronizado usa as próprias, e ignora a categoria", () => {
    const doCanal = [regra({ roleId: everyone.id, allow: Permission.VIEW_CHANNEL })];
    expect(overridesEfetivos(false, doCanal, categoriaPrivada)).toEqual(doCanal);
  });

  it("canal sincronizado com categoria sem regra nenhuma volta ao padrão do cargo", () => {
    expect(overridesEfetivos(true, [regra({ deny: Permission.SEND_MESSAGES })], [])).toEqual([]);
  });

  it("um canal sincronizado com categoria privada esconde o canal de quem não tem o cargo", () => {
    const regras = overridesEfetivos(true, [], categoriaPrivada);
    const semCargo = computePermissions(membro(), [everyone, cargo], regras);
    const comCargo = computePermissions(membro([cargo.id]), [everyone, cargo], regras);
    expect(hasPermission(semCargo, Permission.VIEW_CHANNEL)).toBe(false);
    expect(hasPermission(comCargo, Permission.VIEW_CHANNEL)).toBe(true);
  });

  it("dessincronizar preservando a cópia mantém exatamente o mesmo resultado", () => {
    // é o que `dessincronizarDaCategoria` faz: copia antes de soltar
    const copiado = [...categoriaPrivada];
    const antes = computePermissions(membro(), [everyone, cargo], overridesEfetivos(true, [], categoriaPrivada));
    const depois = computePermissions(membro(), [everyone, cargo], overridesEfetivos(false, copiado, categoriaPrivada));
    expect(depois).toBe(antes);
  });

  it("o dono do servidor atravessa a categoria privada", () => {
    const regras = overridesEfetivos(true, [], categoriaPrivada);
    const bits = computePermissions({ isOwner: true, roleIds: [] }, [everyone, cargo], regras);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL)).toBe(true);
  });

  it("o ADMINISTRATOR também: o deny da categoria não tranca o administrador para fora", () => {
    const admin: Role = { ...cargo, id: "r-admin", permissions: Permission.ADMINISTRATOR };
    const regras = overridesEfetivos(true, [], [
      regra({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL }),
      regra({ roleId: admin.id, deny: Permission.VIEW_CHANNEL }),
    ]);
    const bits = computePermissions(membro([admin.id]), [everyone, admin], regras);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL)).toBe(true);
  });
});

describe("precedência dentro do conjunto herdado", () => {
  it("a regra do MEMBRO vence a do cargo, que vence a do @everyone", () => {
    const roles = [everyone, cargo];
    const bit = Permission.SEND_MESSAGES;
    const base = computePermissions(membro([cargo.id]), roles, []);
    expect(hasPermission(base, bit)).toBe(true); // DEFAULT_PERMISSIONS

    const soEveryone = computePermissions(membro([cargo.id]), roles, [
      regra({ roleId: everyone.id, deny: bit }),
    ]);
    expect(hasPermission(soEveryone, bit)).toBe(false);

    const cargoRecupera = computePermissions(membro([cargo.id]), roles, [
      regra({ roleId: everyone.id, deny: bit }),
      regra({ roleId: cargo.id, allow: bit }),
    ]);
    expect(hasPermission(cargoRecupera, bit)).toBe(true);

    const membroNega = computePermissions(membro([cargo.id]), roles, [
      regra({ roleId: everyone.id, deny: bit }),
      regra({ roleId: cargo.id, allow: bit }),
      regra({ userId: "u1", deny: bit }),
    ]);
    expect(hasPermission(membroNega, bit)).toBe(false);
  });

  it("entre cargos, allow vence deny (os overrides de cargo se somam)", () => {
    const outro: Role = { ...cargo, id: "r-outro", position: 2 };
    const bits = computePermissions(membro([cargo.id, outro.id]), [everyone, cargo, outro], [
      regra({ roleId: cargo.id, deny: Permission.SEND_MESSAGES }),
      regra({ roleId: outro.id, allow: Permission.SEND_MESSAGES }),
    ]);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
  });
});

describe("tri-estado (o que a tela grava e lê)", () => {
  const bit = Permission.CONNECT;

  it("sem regra, a permissão está em 'herdar'", () => {
    expect(estadoDaRegra(undefined, bit)).toBe("herdar");
    expect(estadoDaRegra(regra({ roleId: "r1" }), bit)).toBe("herdar");
  });

  it("permitir e negar são exclusivos: trocar um limpa o outro", () => {
    const zero = regra({ roleId: "r1" });
    const negado = comEstadoDaRegra(zero, bit, "negar");
    expect(estadoDaRegra(negado, bit)).toBe("negar");
    const permitido = comEstadoDaRegra(negado, bit, "permitir");
    expect(estadoDaRegra(permitido, bit)).toBe("permitir");
    expect(hasPermission(permitido.deny, bit)).toBe(false);
    const herdado = comEstadoDaRegra(permitido, bit, "herdar");
    expect(herdado.allow).toBe(0);
    expect(herdado.deny).toBe(0);
  });

  it("mexer num bit não mexe nos outros", () => {
    const r = comEstadoDaRegra(
      regra({ roleId: "r1", deny: Permission.SPEAK }),
      Permission.CONNECT,
      "permitir",
    );
    expect(hasPermission(r.deny, Permission.SPEAK)).toBe(true);
    expect(hasPermission(r.allow, Permission.CONNECT)).toBe(true);
  });
});

describe("overridesIguais — é assim que se sabe se o canal ainda está sincronizado", () => {
  it("ordem não importa", () => {
    const a = [regra({ roleId: "r1", allow: 1 }), regra({ userId: "u1", deny: 2 })];
    const b = [regra({ userId: "u1", deny: 2 }), regra({ roleId: "r1", allow: 1 })];
    expect(overridesIguais(a, b)).toBe(true);
  });

  it("regra vazia não conta: ela não diz nada", () => {
    expect(overridesIguais([regra({ roleId: "r1" })], [])).toBe(true);
  });

  it("um bit diferente basta para dessincronizar", () => {
    const a = [regra({ roleId: "r1", allow: Permission.CONNECT })];
    const b = [regra({ roleId: "r1", allow: Permission.SPEAK })];
    expect(overridesIguais(a, b)).toBe(false);
  });
});

describe("seções da tela de permissões", () => {
  it("canal de texto não oferece permissão de voz, e vice-versa", () => {
    const texto = secoesDePermissoes("texto").map((s) => s.id);
    const voz = secoesDePermissoes("voz").map((s) => s.id);
    expect(texto).toContain("texto");
    expect(texto).not.toContain("voz");
    expect(voz).toContain("voz");
    expect(voz).not.toContain("texto");
  });

  it("a categoria mostra tudo — os canais dela podem ser dos dois tipos", () => {
    const categoria = secoesDePermissoes("categoria").map((s) => s.id);
    expect(categoria).toEqual(["geral", "assinatura", "texto", "voz"]);
  });

  it("toda permissão listada existe de verdade em Permission", () => {
    for (const escopo of ["categoria", "texto", "voz"] as const) {
      for (const secao of secoesDePermissoes(escopo)) {
        for (const nome of secao.permissions) {
          expect(Permission[nome]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("bitsDoEscopo é a união dos bits das seções daquele escopo", () => {
    expect(hasPermission(bitsDoEscopo("voz"), Permission.CONNECT)).toBe(true);
    expect(hasPermission(bitsDoEscopo("voz"), Permission.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(bitsDoEscopo("categoria"), Permission.SEND_MESSAGES)).toBe(true);
  });
});
