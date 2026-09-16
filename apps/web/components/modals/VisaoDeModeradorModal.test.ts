import { describe, expect, it } from "vitest";
import { Permission, type AuditLogEntry } from "@streamz/shared";
import { atividadeDeModeracaoDoMembro, permissoesChaveDoMembro } from "./VisaoDeModeradorModal";

/**
 * Funções puras do painel "Visualização de moderador" (ESPEC2 §J).
 *
 * O que estes testes protegem:
 * 1. `permissoesChaveDoMembro` só lista as permissões-chave que o bitfield
 *    tem ligadas, na ordem fixa do cartão — não as nove com um X do lado.
 * 2. `atividadeDeModeracaoDoMembro` filtra pelo ALVO (não pelo ator) e corta
 *    nas últimas N, já que a API só filtra por ator.
 */

describe("permissoesChaveDoMembro", () => {
  it("sem bit nenhum ligado, lista vazia", () => {
    expect(permissoesChaveDoMembro(0)).toEqual([]);
  });

  it("ADMINISTRATOR sozinho aparece só como Administrador", () => {
    const r = permissoesChaveDoMembro(Permission.ADMINISTRATOR);
    expect(r).toEqual([{ permission: Permission.ADMINISTRATOR, label: "Administrador" }]);
  });

  it("respeita a ordem do cartão, não a ordem em que os bits foram ligados", () => {
    const bits = Permission.MENTION_EVERYONE | Permission.BAN_MEMBERS | Permission.MANAGE_GUILD;
    const r = permissoesChaveDoMembro(bits);
    expect(r.map((p) => p.label)).toEqual(["Gerenciar servidor", "Banir", "Mencionar @everyone"]);
  });

  it("MODERATE_MEMBERS vira o rótulo 'Castigar' do cartão, não 'Moderar membros'", () => {
    const r = permissoesChaveDoMembro(Permission.MODERATE_MEMBERS);
    expect(r).toEqual([{ permission: Permission.MODERATE_MEMBERS, label: "Castigar" }]);
  });

  it("permissão fora da lista-chave (ex.: CONNECT) não aparece", () => {
    expect(permissoesChaveDoMembro(Permission.CONNECT)).toEqual([]);
  });
});

function entrada(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: "e1",
    guildId: "g1",
    actor: null,
    action: "MEMBER_KICK",
    targetId: null,
    targetType: null,
    targetName: null,
    changes: [],
    reason: null,
    createdAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("atividadeDeModeracaoDoMembro", () => {
  it("sem entradas, lista vazia", () => {
    expect(atividadeDeModeracaoDoMembro([], "u1")).toEqual([]);
  });

  it("ignora entradas que não têm este usuário como alvo", () => {
    const entries = [
      entrada({ id: "a", targetType: "USER", targetId: "u2" }),
      entrada({ id: "b", targetType: "CHANNEL", targetId: "u1" }),
    ];
    expect(atividadeDeModeracaoDoMembro(entries, "u1")).toEqual([]);
  });

  it("mantém só as entradas com targetType USER e targetId do membro", () => {
    const alvo = entrada({ id: "alvo", targetType: "USER", targetId: "u1" });
    const outro = entrada({ id: "outro", targetType: "USER", targetId: "u2" });
    expect(atividadeDeModeracaoDoMembro([alvo, outro, alvo], "u1")).toEqual([alvo, alvo]);
  });

  it("corta nas últimas N (a lista já vem mais-recente-primeiro)", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      entrada({ id: `e${i}`, targetType: "USER", targetId: "u1" }),
    );
    const r = atividadeDeModeracaoDoMembro(entries, "u1", 3);
    expect(r).toHaveLength(3);
    expect(r.map((e) => e.id)).toEqual(["e0", "e1", "e2"]);
  });
});
