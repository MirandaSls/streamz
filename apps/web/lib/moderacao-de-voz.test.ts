import { Permission, type PermissionOverwrite, type Role } from "@streamz/shared";
import { describe, expect, it } from "vitest";
import {
  podeEnsurdecerNoServidor,
  podeSilenciarNoServidor,
  type MembroDeVoz,
} from "./moderacao-de-voz";

/**
 * A regra é a mesma do servidor (`GuildsService.assertCanModerarVoz`): contra
 * mim mesmo só o bit importa, contra outra pessoa é bit **e** hierarquia
 * (meu cargo mais alto estritamente acima do dela) — ver o comentário de
 * `moderacao-de-voz.ts`. Os testes cobrem as duas metades da regra, não o
 * cálculo de `computePermissions`/`highestPosition` em si (isso é
 * `packages/shared`).
 */

const everyone: Role = {
  id: "everyone",
  guildId: "g1",
  name: "@everyone",
  color: null,
  position: 0,
  permissions: 0,
  hoist: false,
  mentionable: false,
  isDefault: true,
};

function role(id: string, position: number, permissions = 0): Role {
  return {
    id,
    guildId: "g1",
    name: id,
    color: null,
    position,
    permissions,
    hoist: false,
    mentionable: true,
    isDefault: false,
  };
}

function membro(userId: string, roleIds: readonly string[] = [], isOwner = false): MembroDeVoz {
  return { userId, isOwner, roleIds };
}

describe("podeSilenciarNoServidor", () => {
  it("sem MUTE_MEMBERS não deixa silenciar ninguém", () => {
    const roles = [everyone, role("sem-bit", 1)];
    const eu = membro("eu", ["sem-bit"]);
    const alvo = membro("alvo");
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(false);
  });

  it("com o bit, em mim mesmo, não depende de hierarquia", () => {
    const roles = [everyone, role("moderador", 1, Permission.MUTE_MEMBERS)];
    const eu = membro("eu", ["moderador"]);
    expect(podeSilenciarNoServidor(eu, eu, roles)).toBe(true);
  });

  it("com o bit, contra cargo mais alto que o meu, não pode", () => {
    const roles = [
      everyone,
      role("moderador", 1, Permission.MUTE_MEMBERS),
      role("chefe", 2),
    ];
    const eu = membro("eu", ["moderador"]);
    const alvo = membro("alvo", ["chefe"]);
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(false);
  });

  it("com o bit, contra cargo mais baixo que o meu, pode", () => {
    const roles = [
      everyone,
      role("moderador", 2, Permission.MUTE_MEMBERS),
      role("novato", 1),
    ];
    const eu = membro("eu", ["moderador"]);
    const alvo = membro("alvo", ["novato"]);
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(true);
  });

  it("dono pode, mesmo sem cargo com o bit", () => {
    const roles = [everyone, role("qualquer", 5)];
    const eu = membro("eu", [], true);
    const alvo = membro("alvo", ["qualquer"]);
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(true);
  });

  it("ninguém silencia o dono, exceto ele mesmo", () => {
    const roles = [everyone, role("moderador", 9, Permission.MUTE_MEMBERS)];
    const eu = membro("eu", ["moderador"]);
    const dono = membro("dono", [], true);
    expect(podeSilenciarNoServidor(eu, dono, roles)).toBe(false);
  });
});

describe("podeSilenciarNoServidor — override de canal", () => {
  it("deny de MUTE_MEMBERS no @everyone do canal bloqueia quem tem o bit no servidor", () => {
    const roles = [everyone, role("moderador", 1, Permission.MUTE_MEMBERS)];
    const eu = membro("eu", ["moderador"]);
    const alvo = membro("alvo");
    const regras: PermissionOverwrite[] = [
      { roleId: "everyone", userId: null, allow: 0, deny: Permission.MUTE_MEMBERS },
    ];
    expect(podeSilenciarNoServidor(eu, alvo, roles, regras)).toBe(false);
    // sem a regra do canal, o bit do servidor continua valendo
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(true);
  });

  it("deny de MUTE_MEMBERS no cargo do canal bloqueia quem tem o bit no servidor", () => {
    const roles = [everyone, role("moderador", 1, Permission.MUTE_MEMBERS)];
    const eu = membro("eu", ["moderador"]);
    const alvo = membro("alvo");
    const regras: PermissionOverwrite[] = [
      { roleId: "moderador", userId: null, allow: 0, deny: Permission.MUTE_MEMBERS },
    ];
    expect(podeSilenciarNoServidor(eu, alvo, roles, regras)).toBe(false);
  });

  it("allow de MUTE_MEMBERS só no canal libera quem não tem o bit no servidor", () => {
    const roles = [everyone, role("sem-bit", 1)];
    const eu = membro("eu", ["sem-bit"]);
    const alvo = membro("alvo");
    const regras: PermissionOverwrite[] = [
      { roleId: "sem-bit", userId: null, allow: Permission.MUTE_MEMBERS, deny: 0 },
    ];
    expect(podeSilenciarNoServidor(eu, alvo, roles, regras)).toBe(true);
    // sem a regra do canal, ninguém tem o bit no servidor
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(false);
  });

  it("override de usuário (allow) conta e vence o deny do @everyone do canal", () => {
    const roles = [everyone, role("sem-bit", 1)];
    const eu = membro("eu", ["sem-bit"]);
    const alvo = membro("alvo");
    const regras: PermissionOverwrite[] = [
      { roleId: "everyone", userId: null, allow: 0, deny: Permission.MUTE_MEMBERS },
      { roleId: null, userId: "eu", allow: Permission.MUTE_MEMBERS, deny: 0 },
    ];
    expect(podeSilenciarNoServidor(eu, alvo, roles, regras)).toBe(true);
  });

  it("override de usuário (deny) conta e bloqueia quem tem o bit no servidor", () => {
    const roles = [everyone, role("moderador", 1, Permission.MUTE_MEMBERS)];
    const eu = membro("eu", ["moderador"]);
    const alvo = membro("alvo");
    const regras: PermissionOverwrite[] = [
      { roleId: null, userId: "eu", allow: 0, deny: Permission.MUTE_MEMBERS },
    ];
    expect(podeSilenciarNoServidor(eu, alvo, roles, regras)).toBe(false);
  });
});

describe("podeEnsurdecerNoServidor", () => {
  it("segue a mesma regra, com DEAFEN_MEMBERS", () => {
    const roles = [
      everyone,
      role("moderador", 2, Permission.DEAFEN_MEMBERS),
      role("novato", 1),
    ];
    const eu = membro("eu", ["moderador"]);
    const alvo = membro("alvo", ["novato"]);
    expect(podeEnsurdecerNoServidor(eu, alvo, roles)).toBe(true);
    // MUTE_MEMBERS não dá DEAFEN_MEMBERS de brinde
    expect(podeSilenciarNoServidor(eu, alvo, roles)).toBe(false);
  });
});
