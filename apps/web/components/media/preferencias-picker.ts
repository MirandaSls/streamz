"use client";

import { useEffect, useState } from "react";
import type { GifResult } from "@streamz/shared";

/**
 * O que o painel de emoji/GIF/figurinha lembra entre sessões: os emojis mais
 * usados, as figurinhas recentes, os GIFs favoritados e o tom de pele.
 *
 * Fica no `localStorage` e não no servidor porque nada disso existe no
 * contrato: o back não tem rota de "frequentes" nem de "favoritos". Enquanto
 * não tiver, guardar por navegador entrega o comportamento do Discord sem
 * inventar payload — a perda ao trocar de máquina é aceitável para preferência
 * de conveniência. Ver as pendências no relatório da branch.
 */

const CHAVE = "picker:prefs:v1";
/** quantos emojis a faixa "usados com frequência" mostra (duas linhas de 9). */
const LIMITE_FREQUENTES = 18;
const LIMITE_RECENTES = 16;
/** teto do histórico de contagem, para o objeto não crescer sem fim. */
const LIMITE_HISTORICO = 200;

export interface PrefsPicker {
  /** token do emoji (`😀` ou `<:nome:id>`) → quantas vezes foi escolhido. */
  usosEmoji: Record<string, number>;
  /** ids de figurinha, da mais recente para a mais antiga. */
  figurinhasRecentes: string[];
  /** id da figurinha → quantas vezes foi enviada. */
  usosFigurinha: Record<string, number>;
  gifsFavoritos: GifResult[];
  tomDePele: string;
}

const VAZIO: PrefsPicker = {
  usosEmoji: {},
  figurinhasRecentes: [],
  usosFigurinha: {},
  gifsFavoritos: [],
  tomDePele: "neutro",
};

let estado: PrefsPicker = VAZIO;
let carregado = false;
const ouvintes = new Set<() => void>();

function carregar(): void {
  if (carregado || typeof window === "undefined") return;
  carregado = true;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) estado = { ...VAZIO, ...(JSON.parse(bruto) as Partial<PrefsPicker>) };
  } catch {
    // storage cheio, desligado ou com lixo de uma versão antiga: seguimos vazios
  }
}

function aplicar(mudanca: Partial<PrefsPicker>): void {
  estado = { ...estado, ...mudanca };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // sem persistência a sessão atual ainda funciona; não vale derrubar nada
  }
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * Lê as preferências já carregadas do `localStorage`.
 *
 * Começa vazio e só preenche no efeito porque o servidor não tem
 * `localStorage`: renderizar os frequentes já no primeiro passe faria o HTML
 * do servidor e o do cliente divergirem.
 */
export function usePrefsPicker(): PrefsPicker {
  const [snapshot, setSnapshot] = useState<PrefsPicker>(VAZIO);
  useEffect(() => {
    carregar();
    setSnapshot(estado);
    const ouvinte = () => setSnapshot(estado);
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);
  return snapshot;
}

export function registrarUsoEmoji(token: string): void {
  carregar();
  const usos = { ...estado.usosEmoji, [token]: (estado.usosEmoji[token] ?? 0) + 1 };
  const podados = Object.entries(usos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITE_HISTORICO);
  aplicar({ usosEmoji: Object.fromEntries(podados) });
}

/** Tokens de emoji mais usados, do mais para o menos frequente. */
export function emojisFrequentes(prefs: PrefsPicker): string[] {
  return Object.entries(prefs.usosEmoji)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITE_FREQUENTES)
    .map(([token]) => token);
}

export function registrarUsoFigurinha(id: string): void {
  carregar();
  const recentes = [id, ...estado.figurinhasRecentes.filter((x) => x !== id)].slice(
    0,
    LIMITE_RECENTES,
  );
  const usos = { ...estado.usosFigurinha, [id]: (estado.usosFigurinha[id] ?? 0) + 1 };
  const podados = Object.entries(usos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITE_HISTORICO);
  aplicar({ figurinhasRecentes: recentes, usosFigurinha: Object.fromEntries(podados) });
}

/** Ids de figurinha mais enviados, do mais para o menos frequente. */
export function figurinhasFrequentes(prefs: PrefsPicker): string[] {
  return Object.entries(prefs.usosFigurinha)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITE_RECENTES)
    .map(([id]) => id);
}

export function alternarGifFavorito(gif: GifResult): void {
  carregar();
  const jaEra = estado.gifsFavoritos.some((g) => g.id === gif.id);
  aplicar({
    gifsFavoritos: jaEra
      ? estado.gifsFavoritos.filter((g) => g.id !== gif.id)
      : [gif, ...estado.gifsFavoritos],
  });
}

export function definirTomDePele(tom: string): void {
  carregar();
  aplicar({ tomDePele: tom });
}
