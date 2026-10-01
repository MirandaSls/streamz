import type { APIEmbed } from "discord.js";
import { escaparMarkdown, formatarDuracao, formatarDuracaoOuAoVivo, truncar } from "./formatar";

/**
 * Volt Lime (`design.md`). Duplicada de `comandos.ts` porque lá não é exportada
 * e este arquivo não pode importar de lá (comandos.ts importa daqui).
 */
export const COR_DO_EMBED = 0x9be31f;

/** Limites do Discord, em caracteres. */
const LIMITE_TITULO = 250;
const LIMITE_DESCRICAO = 4096;

export const MENSAGEM_PLAYLIST_GERADA_SPOTIFY =
  "O Spotify não libera playlists geradas por ele (This Is, Daily Mix, Top Hits) para outros apps. Use uma playlist criada por uma pessoa, ou o link da playlist no YouTube.";

/**
 * Reconhece a fonte pelo `sourceName` do Lavalink e, na falta dele, pelo host
 * da URI: faixas resolvidas por busca textual às vezes chegam sem `sourceName`.
 */
export function nomeDaFonte(sourceName?: string | null, uri?: string | null): string {
  const porNome = (sourceName ?? "").trim().toLowerCase();
  if (porNome.includes("spotify")) return "Spotify";
  if (porNome.includes("youtube")) return "YouTube";
  if (porNome.includes("soundcloud")) return "SoundCloud";
  if (porNome.includes("jiosaavn") || porNome.includes("saavn")) return "JioSaavn";

  let host = "";
  try {
    host = new URL(uri ?? "").hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (host.endsWith("spotify.com")) return "Spotify";
  if (host.endsWith("youtube.com") || host.endsWith("youtu.be")) return "YouTube";
  if (host.endsWith("soundcloud.com")) return "SoundCloud";
  if (host.endsWith("jiosaavn.com") || host.endsWith("saavn.com")) return "JioSaavn";
  return "Outra fonte";
}

/** Link só para http(s): qualquer outro esquema não vira link clicável. */
function urlSegura(url?: string): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Título em negrito, linkado se a URL for segura. `)` na URL quebraria o link. */
function tituloLinkado(texto: string, url?: string): string {
  const nome = escaparMarkdown(texto);
  const seguro = urlSegura(url);
  return seguro ? `**[${nome}](${seguro.replace(/\)/g, "%29")})**` : `**${nome}**`;
}

function plural(n: number): string {
  return n === 1 ? "1 faixa" : `${n} faixas`;
}

export interface DadosDeLote {
  nome: string;
  url?: string;
  capaUrl?: string;
  fonte: string;
  total: number;
  duracaoTotalMs: number;
  pediuPor?: string;
  nota?: string;
}

/** Confirmação de playlist/álbum enfileirado, no estilo "Added X with N tracks". */
export function embedDeLote(d: DadosDeLote): APIEmbed {
  const duracao = formatarDuracao(d.duracaoTotalMs);
  // O nome é cortado antes de escapar: cortar depois poderia separar a barra do caractere.
  const descricao = `${tituloLinkado(truncar(d.nome, 200), d.url)}\n${plural(d.total)} · ${duracao}`;
  const fields = [
    { name: "Faixas", value: String(d.total), inline: true },
    { name: "Duração total", value: duracao, inline: true },
    ...(d.pediuPor ? [{ name: "Pedido por", value: `<@${d.pediuPor}>`, inline: true }] : []),
  ];
  return {
    color: COR_DO_EMBED,
    author: { name: truncar(`Playlist do ${d.fonte}`, 256) },
    title: "Playlist na fila",
    description: truncar(descricao, LIMITE_DESCRICAO),
    ...(d.capaUrl ? { thumbnail: { url: d.capaUrl } } : {}),
    fields,
    ...(d.nota ? { footer: { text: truncar(d.nota, 200) } } : {}),
  };
}

export interface DadosDeFaixa {
  titulo: string;
  autor: string;
  url?: string;
  capaUrl?: string;
  duracaoMs: number;
  aoVivo: boolean;
  fonte: string;
  pediuPor?: string;
  posicaoNaFila?: number;
  nota?: string;
}

export function embedDeFaixa(estado: "tocando" | "fila", d: DadosDeFaixa): APIEmbed {
  const titulo =
    estado === "tocando"
      ? "Tocando agora"
      : d.posicaoNaFila !== undefined
        ? `Na fila, posição ${d.posicaoNaFila}`
        : "Na fila";
  const descricao = `${tituloLinkado(truncar(d.titulo, 200), d.url)}\n${escaparMarkdown(truncar(d.autor, 100))}`;
  const fields = [
    { name: "Duração", value: formatarDuracaoOuAoVivo(d.duracaoMs, d.aoVivo), inline: true },
    ...(d.pediuPor ? [{ name: "Pedido por", value: `<@${d.pediuPor}>`, inline: true }] : []),
  ];
  return {
    color: COR_DO_EMBED,
    author: { name: truncar(d.fonte, 256) },
    title: truncar(titulo, LIMITE_TITULO),
    description: truncar(descricao, LIMITE_DESCRICAO),
    ...(d.capaUrl ? { thumbnail: { url: d.capaUrl } } : {}),
    fields,
    ...(d.nota ? { footer: { text: truncar(d.nota, 200) } } : {}),
  };
}
