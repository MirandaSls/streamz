import { SCREEN_QUALITY, type ScreenQuality } from "@streamz/shared";

/**
 * A lógica pura do seletor de compartilhamento de tela — o que dá para testar
 * sem DOM nem Tauri: o alternador SD/HD, o texto do rodapé, a divisão das
 * fontes por aba e o pedido que vai para a captura nativa.
 */

// ── SD / HD ────────────────────────────────────────────────────────────────

export type Perfil = "sd" | "hd";

/** SD é um preset só: 720p a 30 fps, o que qualquer conexão aguenta. */
export const PRESET_SD: ScreenQuality = "720p30";
/** HD começa em 1080p60; a engrenagem pode subir (1440p) e o alternador lembra. */
export const PRESET_HD_PADRAO: ScreenQuality = "1080p60";

/** Qual dos dois lados do alternador um preset acende. */
export function perfilDoPreset(q: ScreenQuality): Perfil {
  return q === PRESET_SD ? "sd" : "hd";
}

/**
 * Preset ao clicar num lado do alternador. "HD" volta para o que a engrenagem
 * definiu por último acima de SD (`ultimoHd`), e só cai no padrão quando o
 * usuário nunca mexeu — trocar SD→HD não pode desfazer um 1440p escolhido.
 */
export function presetDoPerfil(perfil: Perfil, ultimoHd: ScreenQuality | null): ScreenQuality {
  if (perfil === "sd") return PRESET_SD;
  return ultimoHd && ultimoHd !== PRESET_SD ? ultimoHd : PRESET_HD_PADRAO;
}

// ── rodapé ─────────────────────────────────────────────────────────────────

/**
 * As duas linhas do rodapé: o nome do perfil e o resumo do preset — o que o
 * Discord escreve como "Jogos" / "Vídeo mais suave · 720p · 30fps". Não temos
 * os perfis de atividade dele; o título é o lado do alternador por extenso, e o
 * descritor vem da taxa de quadros: 60 fps privilegia movimento, 30 fps deixa
 * bitrate para nitidez de texto (a faixa sobe com `contentHint = "detail"`).
 */
export function descreverPreset(q: ScreenQuality): { titulo: string; resumo: string } {
  const p = SCREEN_QUALITY[q];
  const descritor = p.frameRate >= 60 ? "Vídeo mais suave" : "Texto mais nítido";
  return {
    titulo: perfilDoPreset(q) === "sd" ? "Definição padrão" : "Alta definição",
    resumo: `${descritor} · ${p.height}p · ${p.frameRate}fps`,
  };
}

/** "9,0 Mbps": o custo de subida do preset, com vírgula decimal. */
export function estimativaDeBanda(q: ScreenQuality): string {
  const mbps = SCREEN_QUALITY[q].maxBitrate / 1_000_000;
  return `${mbps.toFixed(1).replace(".", ",")} Mbps`;
}

/** A chave `<resolução><fps>` separada nos dois controles da engrenagem. */
export function separarPreset(q: ScreenQuality): { resolucao: string; fps: "30" | "60" } {
  return { resolucao: q.slice(0, -2), fps: q.endsWith("60") ? "60" : "30" };
}

export function juntarPreset(resolucao: string, fps: string): ScreenQuality {
  const chave = `${resolucao}${fps}`;
  return chave in SCREEN_QUALITY ? (chave as ScreenQuality) : PRESET_HD_PADRAO;
}

// ── fontes ─────────────────────────────────────────────────────────────────

export type Aba = "aplicativos" | "telas" | "dispositivos";

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
  if (aba === "dispositivos") return [];
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
}

/** Monta o pedido a partir do preset: o contrato `SCREEN_QUALITY` é o único. */
export function montarPedido(
  fonteId: string,
  q: ScreenQuality,
  creds: { url: string; token: string },
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
  };
}
