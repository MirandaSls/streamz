import {
  MEDIA_QUALITY,
  SCREEN_QUALITY,
  SCREEN_QUALITY_PADRAO,
  type ScreenQuality,
} from "@streamz/shared";

/**
 * A lógica pura do seletor de compartilhamento de tela — o que dá para testar
 * sem DOM nem Tauri: os dois seletores de qualidade do rodapé, a estimativa de
 * banda, a divisão das fontes por aba e o pedido que vai para a captura nativa.
 */

// ── qualidade ──────────────────────────────────────────────────────────────

/** "9,0 Mbps": o custo de subida do preset, com vírgula decimal. */
export function estimativaDeBanda(q: ScreenQuality): string {
  const mbps = SCREEN_QUALITY[q].maxBitrate / 1_000_000;
  return `${mbps.toFixed(1).replace(".", ",")} Mbps`;
}

/** A chave `<resolução><fps>` separada nos dois seletores do rodapé. */
export function separarPreset(q: ScreenQuality): { resolucao: string; fps: "30" | "60" } {
  return { resolucao: q.slice(0, -2), fps: q.endsWith("60") ? "60" : "30" };
}

/**
 * Volta de resolução + taxa para a chave do preset. Toda combinação das listas
 * abaixo existe em `SCREEN_QUALITY`; o padrão é a saída de segurança para uma
 * chave que o contrato não tenha (nunca alcançável pela UI, mas o tipo exige).
 */
export function juntarPreset(resolucao: string, fps: string): ScreenQuality {
  const chave = `${resolucao}${fps}`;
  return chave in SCREEN_QUALITY ? (chave as ScreenQuality) : SCREEN_QUALITY_PADRAO;
}

const CHAVES = Object.keys(SCREEN_QUALITY) as ScreenQuality[];

/**
 * As opções dos dois seletores saem do próprio contrato: o que
 * `SCREEN_QUALITY` oferece é o que aparece no rodapé, em ordem crescente.
 * Não há "Fonte" (resolução nativa da janela) porque não existe preset para
 * ela — entrar com essa opção é mudar `packages/shared`, não a UI.
 */
export const RESOLUCOES: string[] = [...new Set(CHAVES.map((q) => separarPreset(q).resolucao))].sort(
  (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
);

export const TAXAS: ("30" | "60")[] = [...new Set(CHAVES.map((q) => separarPreset(q).fps))].sort(
  (a, b) => Number(a) - Number(b),
);

// ── fontes ─────────────────────────────────────────────────────────────────

export type Aba = "aplicativos" | "telas";

/** O que o Rust devolve em `fontes_de_tela` (ver `tela/mod.rs`). */
export interface FonteDeTela {
  id: string;
  tipo: "janela" | "monitor";
  titulo: string;
  app: string | null;
  /** data URL PNG do ícone do executável; null = genérico. */
  icone: string | null;
  largura: number;
  altura: number;
  principal: boolean;
}

/**
 * As fontes de uma aba. O Rust já ordena (monitores: principal primeiro;
 * janelas: por app e título), então aqui é só a divisão — e a garantia de que
 * uma fonte com tipo desconhecido não some em silêncio nem cai na aba errada.
 */
export function fontesDaAba(fontes: readonly FonteDeTela[], aba: Aba): FonteDeTela[] {
  const tipo = aba === "telas" ? "monitor" : "janela";
  return fontes.filter((f) => f.tipo === tipo);
}

/**
 * Nome que aparece sob a miniatura. Janela: "Streamz – Google Chrome" no
 * Discord é o **título da janela**, que já traz o app no fim na maioria dos
 * programas; quando o título não menciona o app, o app entra atrás dele.
 * Monitor: "Tela 1", como veio.
 */
export function rotuloDaFonte(f: Pick<FonteDeTela, "tipo" | "titulo" | "app">): string {
  if (f.tipo === "monitor" || !f.app) return f.titulo;
  const app = f.app.toLowerCase();
  return f.titulo.toLowerCase().includes(app) ? f.titulo : `${f.titulo} – ${f.app}`;
}

// ── pedido para o Rust ─────────────────────────────────────────────────────

/** O que `iniciar_tela` recebe (ver `tela/transmissao.rs`, `Pedido`). */
export interface PedidoDeTela {
  url: string;
  token: string;
  fonteId: string;
  largura: number;
  altura: number;
  fps: number;
  maxBitrate: number;
  /** Levar o som do sistema (WASAPI loopback no Rust). */
  audio: boolean;
  /** Teto do áudio da tela — `MEDIA_QUALITY.screenAudioBitrate`, o mesmo da web. */
  audioMaxBitrate: number;
}

/** Monta o pedido a partir do preset: os contratos `SCREEN_QUALITY` e `MEDIA_QUALITY` são os únicos. */
export function montarPedido(
  fonteId: string,
  q: ScreenQuality,
  creds: { url: string; token: string },
  audio: boolean,
): PedidoDeTela {
  const p = SCREEN_QUALITY[q];
  return {
    url: creds.url,
    token: creds.token,
    fonteId,
    largura: p.width,
    altura: p.height,
    fps: p.frameRate,
    maxBitrate: p.maxBitrate,
    audio,
    audioMaxBitrate: MEDIA_QUALITY.screenAudioBitrate,
  };
}
