/**
 * Enquadramento de imagem — a conta por trás de "escolher que pedaço da foto
 * vira o avatar/banner".
 *
 * Isto é matemática pura de propósito: o modal só desenha e arrasta, e o
 * `drawImage` final sai daqui. Assim o miolo (o que acontece ao dar zoom perto
 * da borda, o que sai no arquivo) é testável sem canvas nem DOM.
 *
 * O modelo é o do Discord: a **moldura** é fixa (o quadrado do avatar, a faixa
 * do banner) e a imagem se mexe atrás dela. `zoom` é relativo ao *cobrir* —
 * `1` é a maior imagem que ainda deixa a moldura inteira preenchida —, e por
 * isso nenhum enquadramento válido tem buraco: não existe zoom "para fora".
 */

export type FormatoDeRecorte = "avatar" | "banner";

export interface Tamanho {
  largura: number;
  altura: number;
}

/** Onde a imagem está parada atrás da moldura. */
export interface Enquadramento {
  /** múltiplo do "cobrir" (1 = cobre exatamente). */
  zoom: number;
  /** deslocamento do centro da imagem em px de tela, a partir do centro da moldura. */
  x: number;
  y: number;
}

/** Retângulo de origem para o `drawImage`, em pixels da imagem original. */
export interface RecorteEmPixels {
  sx: number;
  sy: number;
  largura: number;
  altura: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;

export const FORMATOS: Record<
  FormatoDeRecorte,
  {
    /** largura ÷ altura da moldura. */
    proporcao: number;
    /** largura máxima do arquivo gerado, em px. */
    larguraDeSaida: number;
    /** avatar aparece redondo em todo lugar; o recorte segue quadrado. */
    redondo: boolean;
    titulo: string;
  }
> = {
  avatar: { proporcao: 1, larguraDeSaida: 512, redondo: true, titulo: "Ajustar foto de perfil" },
  // 5:2 é a faixa do cartão de perfil (600×240 no Discord)
  banner: { proporcao: 5 / 2, larguraDeSaida: 960, redondo: false, titulo: "Ajustar banner" },
};

export function limitar(valor: number, minimo: number, maximo: number): number {
  if (maximo < minimo) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Escala que faz a imagem *cobrir* a moldura (o `object-fit: cover`).
 * É o zoom 1: qualquer valor menor deixaria faixa vazia.
 */
export function escalaBase(moldura: Tamanho, natural: Tamanho): number {
  if (natural.largura <= 0 || natural.altura <= 0) return 1;
  return Math.max(moldura.largura / natural.largura, moldura.altura / natural.altura);
}

/** Tamanho da imagem na tela, em px, no zoom dado. */
export function tamanhoNaTela(moldura: Tamanho, natural: Tamanho, zoom: number): Tamanho {
  const escala = escalaBase(moldura, natural) * zoom;
  return { largura: natural.largura * escala, altura: natural.altura * escala };
}

/**
 * Quanto a imagem pode ser arrastada para cada lado antes de descolar da
 * moldura. É a metade da sobra — com zoom 1 numa imagem já na proporção da
 * moldura a sobra é zero e a imagem fica travada, que é o certo.
 */
export function limiteDeArrasto(moldura: Tamanho, natural: Tamanho, zoom: number): Tamanho {
  const tela = tamanhoNaTela(moldura, natural, zoom);
  return {
    largura: Math.max(0, (tela.largura - moldura.largura) / 2),
    altura: Math.max(0, (tela.altura - moldura.altura) / 2),
  };
}

/**
 * Devolve o enquadramento mais próximo do pedido que ainda é válido.
 *
 * Chamar isto **depois de cada mudança de zoom** é o que evita o buraco: ao
 * afastar, a sobra encolhe e um deslocamento que era legítimo deixa de ser.
 */
export function limitarEnquadramento(
  enquadramento: Enquadramento,
  moldura: Tamanho,
  natural: Tamanho,
): Enquadramento {
  const zoom = limitar(enquadramento.zoom, ZOOM_MIN, ZOOM_MAX);
  const limite = limiteDeArrasto(moldura, natural, zoom);
  return {
    zoom,
    x: limitar(enquadramento.x, -limite.largura, limite.largura),
    y: limitar(enquadramento.y, -limite.altura, limite.altura),
  };
}

/**
 * Traduz o enquadramento para o retângulo da imagem original que ficou visível.
 *
 * O ponto `(u,v)` da imagem aparece na moldura em
 * `moldura/2 + deslocamento + (u - natural/2) × escala`; isolar `u` no canto
 * superior esquerdo da moldura dá o `sx`/`sy` abaixo.
 */
export function recorteEmPixels(
  enquadramento: Enquadramento,
  moldura: Tamanho,
  natural: Tamanho,
): RecorteEmPixels {
  const { zoom, x, y } = limitarEnquadramento(enquadramento, moldura, natural);
  const escala = escalaBase(moldura, natural) * zoom;
  const largura = Math.min(natural.largura, moldura.largura / escala);
  const altura = Math.min(natural.altura, moldura.altura / escala);
  return {
    largura,
    altura,
    // o `limitar` cobre o arredondamento de ponto flutuante nas bordas: sem ele
    // um sx de -0.0000001 já faz o canvas desenhar uma faixa transparente
    sx: limitar(natural.largura / 2 - (moldura.largura / 2 + x) / escala, 0, natural.largura - largura),
    sy: limitar(natural.altura / 2 - (moldura.altura / 2 + y) / escala, 0, natural.altura - altura),
  };
}

/**
 * Tamanho do arquivo gerado. Nunca **amplia**: recortar um pedaço de 120px e
 * gravar 512px só engorda o upload sem acrescentar um pixel de detalhe.
 */
export function tamanhoDeSaida(recorte: RecorteEmPixels, larguraAlvo: number): Tamanho {
  const escala = Math.min(1, larguraAlvo / recorte.largura);
  return {
    largura: Math.max(1, Math.round(recorte.largura * escala)),
    altura: Math.max(1, Math.round(recorte.altura * escala)),
  };
}

/** Tamanho da moldura na tela, respeitando a proporção do formato. */
export function molduraDoFormato(formato: FormatoDeRecorte, larguraMaxima: number): Tamanho {
  const { proporcao } = FORMATOS[formato];
  return { largura: larguraMaxima, altura: Math.round(larguraMaxima / proporcao) };
}
