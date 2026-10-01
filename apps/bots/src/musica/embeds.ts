import type { APIActionRowComponent, APIEmbed, APIComponentInMessageActionRow } from "discord.js";
import { escaparMarkdown, truncar } from "./formatar";

/**
 * Volt Lime (`design.md`). Duplicada de `comandos.ts` porque lá não é exportada
 * e este arquivo não pode importar de lá (comandos.ts importa daqui).
 */
export const COR_DO_EMBED = 0x9be31f;

/** Barra lateral dos embeds compactos de "adicionado": verde do Spotify, violeta nas demais fontes. */
export const COR_SPOTIFY = 0x1db954;
export const COR_PADRAO = 0x8b6cf0;
/** Âmbar do aviso de saída por inatividade. */
export const COR_AVISO = 0xf5a623;

/** Limites do Discord, em caracteres. */
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

/** Ícone do embed por fonte; o Spotify ganha o verde, as demais o check. */
export function iconeDaFonte(fonte: string): string {
  switch (fonte) {
    case "Spotify":
      return "🟢";
    case "YouTube":
      return "▶️";
    case "SoundCloud":
      return "☁️";
    default:
      return "✅";
  }
}

const corDaFonte = (fonte: string): number => (fonte === "Spotify" ? COR_SPOTIFY : COR_PADRAO);

/** `mm:ss` com minuto de dois dígitos (`02:37`); acima de 1h vira `h:mm:ss`. */
function duracaoCompacta(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const dois = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

/** Limite do título dentro do embed compacto: mantém a linha curta. */
const LIMITE_TITULO_COMPACTO = 70;

export interface DadosDeAdicionado {
  titulo: string;
  autor?: string | undefined;
  url?: string;
  duracaoMs: number;
  aoVivo: boolean;
  fonte: string;
  /** "ao topo da fila" quando entrou no topo; senão "à fila". */
  noTopo?: boolean;
}

/** Uma linha só, sem título/thumbnail/campos/rodapé: é o que o bot de referência mostra. */
export function embedDeAdicionado(d: DadosDeAdicionado): APIEmbed {
  // Cortar antes de escapar: cortar depois poderia separar a barra do caractere.
  const nome = truncar(d.autor ? `${d.autor} - ${d.titulo}` : d.titulo, LIMITE_TITULO_COMPACTO);
  const duracao = d.aoVivo ? "ao vivo" : duracaoCompacta(d.duracaoMs);
  const destino = d.noTopo ? "ao topo da fila" : "à fila";
  return {
    color: corDaFonte(d.fonte),
    description: truncar(
      `${iconeDaFonte(d.fonte)} Adicionado ${tituloLinkado(nome, d.url)} - \`${duracao}\` ${destino}.`,
      LIMITE_DESCRICAO,
    ),
  };
}

export interface DadosDeAdicionados {
  nome: string;
  url?: string;
  fonte: string;
  total: number;
  noTopo?: boolean;
}

export function embedDeAdicionados(d: DadosDeAdicionados): APIEmbed {
  const nome = truncar(d.nome, LIMITE_TITULO_COMPACTO);
  const destino = d.noTopo ? "ao topo da fila" : "à fila";
  return {
    color: corDaFonte(d.fonte),
    description: truncar(
      `${iconeDaFonte(d.fonte)} Adicionado ${tituloLinkado(nome, d.url)} com ${plural(d.total)} ${destino}.`,
      LIMITE_DESCRICAO,
    ),
  };
}

/** Aviso enviado quando o timer de fila vazia derruba o player. */
export function embedDeInatividade(): APIEmbed {
  return {
    color: COR_AVISO,
    description: "Saí do canal de voz por inatividade.\nVocê pode desativar isso usando o comando /24-7.",
  };
}

/**
 * Botão de link para o painel web, lido de `WEB_PUBLIC_URL` a cada chamada
 * (testável e sem estado). Sem URL http(s) válida não há botão.
 */
export function botaoDoSite(): APIActionRowComponent<APIComponentInMessageActionRow>[] | undefined {
  const url = urlSegura(process.env.WEB_PUBLIC_URL?.trim().replace(/\/+$/, ""));
  if (!url) return undefined;
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "Controle a música direto pelo nosso site",
          emoji: { name: "🌐" },
          url,
        },
      ],
    },
  ];
}
