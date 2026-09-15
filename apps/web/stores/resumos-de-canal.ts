"use client";

import { create } from "zustand";
import type { ResumoDeCanal } from "@streamz/shared";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

/**
 * Resumos de canal pedidos pela pílula de `<#id>` (`lib/markdown.tsx`).
 *
 * A pílula procura o canal primeiro no que já está carregado — canais do
 * servidor aberto, threads do canal, conversas — e só cai aqui para o que é de
 * fora: canal de outro servidor, conversa fora da lista. Cada id vai ao
 * servidor **uma vez** (`GET /channels/:id/resumo`), por mais que a mesma
 * menção apareça em cem mensagens da tela: o estado "carregando" já é a trava
 * que deduplica.
 *
 * Estados por id:
 * - `carregando`: pedido em curso;
 * - `ok`: o resumo chegou;
 * - `sem-acesso`: a API disse 403 ou 404 — o canal é privado, não existe ou
 *   é de um servidor em que não estou. A pílula mostra "sem acesso".
 *
 * Qualquer outro erro (rede, 5xx) **não** fica gravado: some do cache, e a
 * próxima pílula que montar com esse id tenta de novo (a que já está na tela
 * não repete sozinha, para não martelar a API com a rede fora). Guardar "sem
 * acesso" por um soluço de rede mentiria até o F5.
 */
export type EstadoDoResumo =
  | { estado: "carregando" }
  | { estado: "ok"; resumo: ResumoDeCanal }
  | { estado: "sem-acesso" };

interface ResumosState {
  porId: Record<string, EstadoDoResumo>;
  /** Pede o resumo se ainda não há nada para este id (nem pedido em curso). */
  garantir: (channelId: string) => void;
  clear: () => void;
}

export const useResumosDeCanal = create<ResumosState>((set, get) => ({
  porId: {},

  garantir: (channelId) => {
    if (get().porId[channelId]) return;
    set((s) => ({ porId: { ...s.porId, [channelId]: { estado: "carregando" } } }));

    api.resumoDoCanal(channelId).then(
      (resumo) => {
        set((s) => ({ porId: { ...s.porId, [channelId]: { estado: "ok", resumo } } }));
      },
      (e: unknown) => {
        const semAcesso = e instanceof ApiError && (e.status === 403 || e.status === 404);
        set((s) => {
          const porId = { ...s.porId };
          if (semAcesso) porId[channelId] = { estado: "sem-acesso" };
          else delete porId[channelId];
          return { porId };
        });
      },
    );
  },

  clear: () => set({ porId: {} }),
}));
