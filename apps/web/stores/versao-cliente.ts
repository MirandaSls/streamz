import { create } from "zustand";
import { clientOutdatedSchema, type ClientOutdatedPayload } from "@streamz/shared";

/**
 * Aviso do servidor de que este app desktop está abaixo da versão configurada.
 *
 * O desktop embrulha uma web empacotada que não se atualiza sozinha, então só o
 * servidor sabe que ela ficou velha. `aviso` é dispensável (some até a página
 * recarregar); `bloqueado` não: o servidor derruba a conexão, e esconder o
 * recado deixaria o usuário diante de um app que simplesmente não conecta.
 */
interface EstadoVersaoCliente {
  nivel: ClientOutdatedPayload["nivel"] | null;
  versaoAtual: string | null;
  versaoMinima: string | null;
  /** Só vale para o nível "aviso"; "bloqueado" ignora. */
  dispensar: () => void;
  definir: (p: ClientOutdatedPayload) => void;
}

export const useVersaoCliente = create<EstadoVersaoCliente>((set, get) => ({
  nivel: null,
  versaoAtual: null,
  versaoMinima: null,
  dispensar: () => {
    if (get().nivel === "aviso") set({ nivel: null });
  },
  definir: (p) =>
    set((atual) => {
      // bloqueado nunca regride para aviso (um evento atrasado não pode
      // devolver o app a quem já foi barrado)
      if (atual.nivel === "bloqueado" && p.nivel === "aviso") return atual;
      return { nivel: p.nivel, versaoAtual: p.versaoAtual, versaoMinima: p.versaoMinima };
    }),
}));

/**
 * Valida o payload cru do socket. Inválido vira `null` com aviso no console:
 * um evento malformado do servidor nunca pode quebrar o cliente.
 */
export function lerClientOutdated(bruto: unknown): ClientOutdatedPayload | null {
  const r = clientOutdatedSchema.safeParse(bruto);
  if (!r.success) {
    console.warn("[versao] payload de client.outdated inválido, ignorado", r.error.issues);
    return null;
  }
  return r.data;
}
