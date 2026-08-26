import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  Permission,
  PERMISSION_ORDER,
  colorRoleOf,
  computePermissions,
  hasPermission,
  highestPosition,
  isRoleColor,
  permissionNames,
  rolesOf,
  type ChannelOverride,
  type PermissionMember,
  type Role,
} from "@streamz/shared";

/**
 * `computePermissions` é a única regra de autorização do projeto — errar a
 * ordem das etapas é falha de segurança silenciosa (ver ADR-0002). Por isso o
 * teste cobre cada etapa isolada, e não só o caminho feliz.
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

function role(over: Partial<Role> & { id: string }): Role {
  return {
    guildId: "g1",
    name: over.id,
    color: null,
    position: 1,
    permissions: 0,
    hoist: false,
    mentionable: false,
    isDefault: false,
    ...over,
  };
}

function override(over: Partial<ChannelOverride>): ChannelOverride {
  return { channelId: "c1", roleId: null, userId: null, allow: 0, deny: 0, ...over };
}

const membro = (roleIds: string[] = []): PermissionMember => ({ isOwner: false, roleIds });
const dono: PermissionMember = { isOwner: true, roleIds: [] };

describe("bits de Permission", () => {
  it("não repete nenhum bit", () => {
    const bits = PERMISSION_ORDER.map((n) => Permission[n]);
    expect(new Set(bits).size).toBe(bits.length);
  });

  it("cabe em 30 bits (o teto do inteiro com sinal do JS)", () => {
    for (const bit of Object.values(Permission)) {
      expect(bit).toBeGreaterThan(0);
      expect(bit).toBeLessThanOrEqual(1 << 29);
    }
  });

  it("ALL_PERMISSIONS contém todas e nada além", () => {
    for (const nome of PERMISSION_ORDER) {
      expect(hasPermission(ALL_PERMISSIONS, Permission[nome])).toBe(true);
    }
    expect(permissionNames(ALL_PERMISSIONS).length).toBe(PERMISSION_ORDER.length);
  });

  it("DEFAULT_PERMISSIONS deixa o @everyone ver e falar, mas não moderar", () => {
    expect(hasPermission(DEFAULT_PERMISSIONS, Permission.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(DEFAULT_PERMISSIONS, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(DEFAULT_PERMISSIONS, Permission.MANAGE_MESSAGES)).toBe(false);
    expect(hasPermission(DEFAULT_PERMISSIONS, Permission.ADMINISTRATOR)).toBe(false);
  });
});

describe("hasPermission", () => {
  it("exige todos os bits pedidos, não apenas um", () => {
    const bits = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES;
    expect(hasPermission(bits, Permission.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL | Permission.KICK_MEMBERS)).toBe(false);
  });

  it("0 não tem nenhuma permissão", () => {
    expect(hasPermission(0, Permission.VIEW_CHANNEL)).toBe(false);
  });
});

describe("computePermissions — etapa 1: dono", () => {
  it("recebe tudo mesmo sem cargo nenhum", () => {
    expect(computePermissions(dono, [everyone])).toBe(ALL_PERMISSIONS);
  });

  it("ignora deny de canal, inclusive o do @everyone", () => {
    const overrides = [override({ roleId: everyone.id, deny: ALL_PERMISSIONS })];
    expect(computePermissions(dono, [everyone], overrides)).toBe(ALL_PERMISSIONS);
  });

  it("recebe tudo mesmo sem o @everyone existir", () => {
    expect(computePermissions(dono, [])).toBe(ALL_PERMISSIONS);
  });
});

describe("computePermissions — etapa 2: base", () => {
  it("membro sem cargo herda só o @everyone", () => {
    expect(computePermissions(membro(), [everyone])).toBe(DEFAULT_PERMISSIONS);
  });

  it("soma (OR) as permissões de todos os cargos do membro", () => {
    const mod = role({ id: "r1", permissions: Permission.KICK_MEMBERS });
    const editor = role({ id: "r2", permissions: Permission.MANAGE_MESSAGES });
    const bits = computePermissions(membro(["r1", "r2"]), [everyone, mod, editor]);
    expect(hasPermission(bits, Permission.KICK_MEMBERS)).toBe(true);
    expect(hasPermission(bits, Permission.MANAGE_MESSAGES)).toBe(true);
    expect(hasPermission(bits, Permission.BAN_MEMBERS)).toBe(false);
  });

  it("ignora cargo que o membro não tem", () => {
    const mod = role({ id: "r1", permissions: Permission.BAN_MEMBERS });
    const bits = computePermissions(membro([]), [everyone, mod]);
    expect(hasPermission(bits, Permission.BAN_MEMBERS)).toBe(false);
  });

  it("@everyone sem permissão nenhuma deixa o membro sem nada", () => {
    const mudo = { ...everyone, permissions: 0 };
    expect(computePermissions(membro(), [mudo])).toBe(0);
  });

  it("um roleId listado que não existe entre os cargos é ignorado", () => {
    expect(computePermissions(membro(["fantasma"]), [everyone])).toBe(DEFAULT_PERMISSIONS);
  });
});

describe("computePermissions — etapa 3: ADMINISTRATOR", () => {
  it("dá tudo a quem tem o bit por cargo", () => {
    const admin = role({ id: "r1", permissions: Permission.ADMINISTRATOR });
    expect(computePermissions(membro(["r1"]), [everyone, admin])).toBe(ALL_PERMISSIONS);
  });

  it("sai ANTES dos overrides — um deny de canal não tranca o administrador", () => {
    const admin = role({ id: "r1", permissions: Permission.ADMINISTRATOR });
    const overrides = [
      override({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL }),
      override({ roleId: "r1", deny: ALL_PERMISSIONS }),
      override({ userId: "u1", deny: ALL_PERMISSIONS }),
    ];
    expect(computePermissions(membro(["r1"]), [everyone, admin], overrides)).toBe(ALL_PERMISSIONS);
  });

  it("vale também quando o bit vem do próprio @everyone", () => {
    const aberto = { ...everyone, permissions: Permission.ADMINISTRATOR };
    expect(computePermissions(membro(), [aberto])).toBe(ALL_PERMISSIONS);
  });
});

describe("computePermissions — etapa 4: override do @everyone", () => {
  it("deny do @everyone tira a permissão de quem só tem o padrão", () => {
    const overrides = [override({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL })];
    const bits = computePermissions(membro(), [everyone], overrides);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL)).toBe(false);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
  });

  it("allow do @everyone concede o que o cargo não dava", () => {
    const overrides = [override({ roleId: everyone.id, allow: Permission.MANAGE_MESSAGES })];
    const bits = computePermissions(membro(), [everyone], overrides);
    expect(hasPermission(bits, Permission.MANAGE_MESSAGES)).toBe(true);
  });

  it("no mesmo override, allow vence o deny do próprio override", () => {
    const overrides = [
      override({ roleId: everyone.id, deny: Permission.SEND_MESSAGES, allow: Permission.SEND_MESSAGES }),
    ];
    const bits = computePermissions(membro(), [everyone], overrides);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
  });

  it("canal somente-leitura: deny SEND_MESSAGES no @everyone bloqueia o membro comum", () => {
    const overrides = [override({ roleId: everyone.id, deny: Permission.SEND_MESSAGES })];
    const bits = computePermissions(membro(), [everyone], overrides);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(false);
  });
});

describe("computePermissions — etapa 5: overrides de cargo", () => {
  it("allow de cargo repõe o que o @everyone negou (canal privado)", () => {
    const time = role({ id: "r1" });
    const overrides = [
      override({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL }),
      override({ roleId: "r1", allow: Permission.VIEW_CHANNEL }),
    ];
    expect(hasPermission(computePermissions(membro(["r1"]), [everyone, time], overrides), Permission.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(computePermissions(membro([]), [everyone, time], overrides), Permission.VIEW_CHANNEL)).toBe(false);
  });

  it("os overrides dos cargos se somam: deny de um e allow de outro → allow vence", () => {
    const a = role({ id: "r1", position: 5 });
    const b = role({ id: "r2", position: 1 });
    const overrides = [
      override({ roleId: "r1", deny: Permission.SEND_MESSAGES }),
      override({ roleId: "r2", allow: Permission.SEND_MESSAGES }),
    ];
    const bits = computePermissions(membro(["r1", "r2"]), [everyone, a, b], overrides);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
  });

  it("a posição do cargo não muda o override — só o deny/allow acumulado", () => {
    const alto = role({ id: "r1", position: 99 });
    const baixo = role({ id: "r2", position: 1 });
    const overrides = [
      override({ roleId: "r1", allow: Permission.KICK_MEMBERS }),
      override({ roleId: "r2", deny: Permission.KICK_MEMBERS }),
    ];
    const invertido = [...overrides].reverse();
    const bits = computePermissions(membro(["r1", "r2"]), [everyone, alto, baixo], overrides);
    const bitsInvertido = computePermissions(membro(["r1", "r2"]), [everyone, alto, baixo], invertido);
    expect(bits).toBe(bitsInvertido);
    expect(hasPermission(bits, Permission.KICK_MEMBERS)).toBe(true);
  });

  it("override de cargo que o membro não tem é ignorado", () => {
    const outro = role({ id: "r9" });
    const overrides = [override({ roleId: "r9", deny: Permission.SEND_MESSAGES })];
    const bits = computePermissions(membro([]), [everyone, outro], overrides);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
  });
});

describe("computePermissions — etapa 6: override do usuário", () => {
  it("é a última palavra: deny do usuário derruba allow de cargo", () => {
    const time = role({ id: "r1" });
    const overrides = [
      override({ roleId: "r1", allow: Permission.SEND_MESSAGES }),
      override({ userId: "u1", deny: Permission.SEND_MESSAGES }),
    ];
    const bits = computePermissions(membro(["r1"]), [everyone, time], overrides);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(false);
  });

  it("allow do usuário repõe o que o @everyone e o cargo negaram", () => {
    const time = role({ id: "r1" });
    const overrides = [
      override({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL }),
      override({ roleId: "r1", deny: Permission.VIEW_CHANNEL }),
      override({ userId: "u1", allow: Permission.VIEW_CHANNEL }),
    ];
    const bits = computePermissions(membro(["r1"]), [everyone, time], overrides);
    expect(hasPermission(bits, Permission.VIEW_CHANNEL)).toBe(true);
  });
});

describe("computePermissions — cenários completos", () => {
  it("canal privado convertido da allowlist: só quem tem override de usuário vê", () => {
    const overrides = [
      override({ roleId: everyone.id, deny: Permission.VIEW_CHANNEL }),
      override({ userId: "u1", allow: Permission.VIEW_CHANNEL }),
    ];
    const liberado = computePermissions(membro(), [everyone], overrides);
    const deFora = computePermissions(membro(), [everyone], overrides.slice(0, 1));
    expect(hasPermission(liberado, Permission.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(deFora, Permission.VIEW_CHANNEL)).toBe(false);
  });

  it("sem override nenhum, a permissão do canal é a do servidor", () => {
    const mod = role({ id: "r1", permissions: Permission.MANAGE_MESSAGES });
    const noServidor = computePermissions(membro(["r1"]), [everyone, mod]);
    const noCanal = computePermissions(membro(["r1"]), [everyone, mod], []);
    expect(noCanal).toBe(noServidor);
  });
});

describe("highestPosition", () => {
  it("é a maior posição entre os cargos do membro", () => {
    const a = role({ id: "r1", position: 3 });
    const b = role({ id: "r2", position: 7 });
    expect(highestPosition(membro(["r1", "r2"]), [everyone, a, b])).toBe(7);
  });

  it("membro sem cargo fica em 0 (a altura do @everyone)", () => {
    expect(highestPosition(membro(), [everyone, role({ id: "r1", position: 4 })])).toBe(0);
  });

  it("o dono não tem teto", () => {
    expect(highestPosition(dono, [everyone])).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("colorRoleOf e rolesOf", () => {
  it("a cor vem do cargo mais alto que tem cor", () => {
    const alto = role({ id: "r1", position: 9, color: null });
    const medio = role({ id: "r2", position: 5, color: "#ff0000" });
    const baixo = role({ id: "r3", position: 1, color: "#00ff00" });
    expect(colorRoleOf(["r1", "r2", "r3"], [everyone, alto, medio, baixo])?.color).toBe("#ff0000");
  });

  it("sem cargo colorido, não há cor", () => {
    expect(colorRoleOf(["r1"], [everyone, role({ id: "r1" })])).toBeNull();
  });

  it("o @everyone nunca colore o nome", () => {
    const colorido = { ...everyone, color: "#123456" };
    expect(colorRoleOf([colorido.id], [colorido])).toBeNull();
  });

  it("rolesOf devolve do mais alto para o mais baixo, sem o @everyone", () => {
    const a = role({ id: "r1", position: 2 });
    const b = role({ id: "r2", position: 8 });
    expect(rolesOf(["r1", "r2", everyone.id], [everyone, a, b]).map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});

describe("isRoleColor", () => {
  it("aceita #rrggbb e recusa o resto", () => {
    expect(isRoleColor("#5865f2")).toBe(true);
    expect(isRoleColor("#ABCDEF")).toBe(true);
    expect(isRoleColor("5865f2")).toBe(false);
    expect(isRoleColor("#58f")).toBe(false);
    expect(isRoleColor("#5865f2ff")).toBe(false);
    expect(isRoleColor("red")).toBe(false);
  });
});
