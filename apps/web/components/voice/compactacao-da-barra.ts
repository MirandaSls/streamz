import { createContext } from "react";

/**
 * Compactação da cápsula central de controles do palco de voz.
 *
 * O palco cabe numa coluna estreita (ex.: janela de 960px com o painel de
 * perfil aberto na DM), e a cápsula completa transbordaria por cima do painel
 * vizinho. Ela perde peças em níveis, na ordem que dói menos:
 *  1. as setas de dispositivo — a troca continua em "Ajustes de voz";
 *  2. tela e sons — continuam no painel "Voz conectada" do rodapé.
 */

/** 0 = completo, 1 = sem setas de dispositivo, 2 = só "Mais". */
export type NivelDaBarra = 0 | 1 | 2;

/** Nível 0: cápsula mic+cam com setas 170 + cápsula tela/sons/mais 172 + desligar 66 + 2×12 de gap. */
export const LARGURA_NIVEL_0_PX = 432;
/** Nível 1: sem as setas, mic+cam vira 116 — 116 + 172 + 66 + 24. */
export const LARGURA_NIVEL_1_PX = 378;
/** Colchão para não trocar de nível a cada pixel de arredondamento. */
export const FOLGA_PX = 8;

/** Largura disponível para a cápsula central (px) → nível. */
export function nivelDaBarra(disponivelPx: number): NivelDaBarra {
  if (disponivelPx >= LARGURA_NIVEL_0_PX + FOLGA_PX) return 0;
  if (disponivelPx >= LARGURA_NIVEL_1_PX + FOLGA_PX) return 1;
  return 2;
}

/** Largura disponível para o centro da fileira, ou `null` antes da primeira medição. */
export const LarguraDaFileira = createContext<number | null>(null);
