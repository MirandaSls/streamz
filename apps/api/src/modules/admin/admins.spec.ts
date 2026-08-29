import { describe, expect, it } from "vitest";
import { ehAdminDaInstancia, parseAdminEmails } from "./admins";

const CONTA = {
  email: "streamzcontato@gmail.com",
  emailVerificado: true,
  desativada: false,
  excluida: false,
};

describe("parseAdminEmails", () => {
  it("aceita lista com espaços e caixa mista", () => {
    expect(parseAdminEmails(" Dono@Exemplo.com , outro@exemplo.com ")).toEqual([
      "dono@exemplo.com",
      "outro@exemplo.com",
    ]);
  });

  it("variável ausente ou vazia não faz ninguém admin", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails(" , ,")).toEqual([]);
  });
});

describe("ehAdminDaInstancia", () => {
  const lista = parseAdminEmails("streamzcontato@gmail.com");

  it("reconhece o e-mail da lista, ignorando a caixa", () => {
    expect(ehAdminDaInstancia(lista, CONTA)).toBe(true);
    expect(ehAdminDaInstancia(lista, { ...CONTA, email: "StreamzContato@Gmail.com" })).toBe(true);
  });

  it("lista vazia desliga o painel para todo mundo", () => {
    expect(ehAdminDaInstancia([], CONTA)).toBe(false);
  });

  it("recusa quem não está na lista", () => {
    expect(ehAdminDaInstancia(lista, { ...CONTA, email: "outro@exemplo.com" })).toBe(false);
    expect(ehAdminDaInstancia(lista, { ...CONTA, email: null })).toBe(false);
  });

  // o cenário que a verificação existe para barrar: excluir a conta libera o
  // e-mail, e quem registrasse uma nova com ele herdaria o painel
  it("recusa e-mail não verificado", () => {
    expect(ehAdminDaInstancia(lista, { ...CONTA, emailVerificado: false })).toBe(false);
  });

  it("recusa conta desativada ou excluída", () => {
    expect(ehAdminDaInstancia(lista, { ...CONTA, desativada: true })).toBe(false);
    expect(ehAdminDaInstancia(lista, { ...CONTA, excluida: true })).toBe(false);
  });

  it("sem conta não há admin", () => {
    expect(ehAdminDaInstancia(lista, null)).toBe(false);
  });
});
