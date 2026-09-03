/**
 * O que acontece com o arquivo entre "escolhi este" e "subiu" — a parte que
 * não depende de canvas nem de store, e por isso é testável.
 *
 * A regra que interessa aqui é o **GIF**. Foto de perfil e banner passam por um
 * ajuste de enquadramento que recorta num `<canvas>`, e canvas só sabe desenhar
 * **um quadro**: um GIF animado que passasse por ali voltaria parado. Como a
 * API não tem `sharp` para recortar do outro lado (não está no lockfile nem na
 * imagem Docker), mandar "a imagem inteira mais um retângulo" também não
 * resolveria — não haveria quem aplicasse o retângulo.
 *
 * Então o GIF **não é recortado**: sobe como veio, e o enquadramento fica por
 * conta do `object-fit: cover` de quem desenha (que é o mesmo comportamento
 * que todo avatar tinha antes do recorte existir). A pessoa é avisada numa
 * linha, porque é uma troca — animação em vez de escolher o pedaço.
 *
 * Só o teto de bytes é conferido antes de subir: é o erro barato de pegar aqui
 * (evita esperar 8 MB subirem para receber 413). Formato, assinatura e
 * dimensões são decisão do servidor, que olha os bytes.
 */

import {
  MAX_AVATAR_SIZE,
  MAX_BANNER_SIZE,
  ehGifDeclarado,
  maxDaImagemDePerfil,
} from "@streamz/shared";
import type { FormatoDeRecorte } from "@/lib/recorte";

/** O que o arquivo escolhido precisa ter para as contas daqui. */
export interface ArquivoEscolhido {
  type?: string;
  name?: string;
  size: number;
}

/** Teto estático de cada formato (o do GIF é o mesmo para os dois). */
export const MAX_ESTATICO: Record<FormatoDeRecorte, number> = {
  avatar: MAX_AVATAR_SIZE,
  banner: MAX_BANNER_SIZE,
};

/** true quando o arquivo se anuncia como GIF — e portanto pula o recorte. */
export function ehGif(arquivo: ArquivoEscolhido): boolean {
  return ehGifDeclarado(arquivo);
}

/** Teto em bytes deste arquivo neste formato. */
export function limiteDe(arquivo: ArquivoEscolhido, formato: FormatoDeRecorte): number {
  return maxDaImagemDePerfil(arquivo, MAX_ESTATICO[formato]);
}

/**
 * Mensagem de "arquivo grande demais", ou null se cabe. O texto traz o teto
 * que vale para *este* arquivo — dizer "4 MB" para um GIF que pode ter 8
 * mandaria a pessoa comprimir à toa.
 */
export function erroDeTamanho(
  arquivo: ArquivoEscolhido,
  formato: FormatoDeRecorte,
): string | null {
  const limite = limiteDe(arquivo, formato);
  if (arquivo.size <= limite) return null;
  const nome = formato === "avatar" ? "A foto" : "O banner";
  return `${nome} passa de ${Math.round(limite / 1024 / 1024)} MB. Escolha um arquivo menor.`;
}

/** Aviso mostrado quando o GIF sobe inteiro, sem passar pelo enquadramento. */
export const AVISO_DO_GIF =
  "GIF enviado inteiro: a animação é preservada, e o enquadramento é automático.";
