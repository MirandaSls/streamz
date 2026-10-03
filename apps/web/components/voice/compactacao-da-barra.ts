import { createContext } from "react";

/**
 * Compactação da cápsula central de controles do palco de voz.
 *
 * O palco cabe numa coluna estreita (ex.: janela de 960px com o painel de
 * perfil aberto na DM), e a cápsula completa transbordaria por cima do painel
 * vizinho. Ela perde peças em níveis, na ordem que dói menos:
 *  1. as setas de dispositivo — a troca continua em "Ajustes de voz";
 *  2. tela e sons — continuam no painel "Voz conectada" do rodapé; mic, câmera e "Mais" viram uma cápsula única.
 */

/** 0 = completo, 1 = sem setas de dispositivo, 2 = só "Mais". */
export type NivelDaBarra = 0 | 1 | 2;

/** Nível 0: cápsula mic+cam com setas 182 + cápsula tela/sons/mais 184 + desligar 72 + 2×12 de gap. */
export const LARGURA_NIVEL_0_PX = 462;
/** Nível 1: sem as setas, mic+cam vira 124 — 124 + 184 + 72 + 24. */
export const LARGURA_NIVEL_1_PX = 404;
/**
 * Nível 2: sem setas, sem tela e sem sons, e mic + câmera + "Mais" numa cápsula
 * só (8 + 3×56 + 8 = 184) + gap-2 (8) + desligar (72).
 */
export const LARGURA_NIVEL_2_PX = 264;
/** Colchão para não trocar de nível a cada pixel de arredondamento. */
export const FOLGA_PX = 8;

/** Largura disponível para a cápsula central (px) → nível. */
export function nivelDaBarra(disponivelPx: number): NivelDaBarra {
  if (disponivelPx >= LARGURA_NIVEL_0_PX + FOLGA_PX) return 0;
  if (disponivelPx >= LARGURA_NIVEL_1_PX + FOLGA_PX) return 1;
  return 2;
}

/** `px-4` da raiz da fileira, dos dois lados. */
const PADDING_NORMAL_PX = 32;
/** `px-2` da raiz da fileira quando os laterais somem, dos dois lados. */
const PADDING_APERTADO_PX = 16;
/** `gap-4` entre as colunas da grade. */
const GAP_PX = 16;

/**
 * Largura que sobra para a cápsula central, dada a largura da raiz da fileira.
 *
 * As colunas `1fr` vazias continuam cobrando gap e padding mesmo sem conteúdo:
 * com laterais escondidos a fileira passa a `gap-0 px-2`, senão o centro
 * perderia 64px à toa.
 */
export function larguraDoCentro(raiz: number, lateraisEscondidos: boolean): number {
  if (lateraisEscondidos) return raiz - PADDING_APERTADO_PX;
  return raiz - PADDING_NORMAL_PX - 2 * GAP_PX;
}

/** Largura disponível para o centro da fileira, ou `null` antes da primeira medição. */
export const LarguraDaFileira = createContext<number | null>(null);
