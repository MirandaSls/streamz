"use client";

/**
 * A cor dominante da foto de perfil — o fundo do tile de chamada.
 *
 * No Discord o tile de quem está numa call **não** é cinza: ele é pintado com a
 * cor que domina a foto da pessoa, e o avatar fica no meio, do mesmo tom (ver
 * `docs/Reference/Captura de tela 2026-09-03 203909.png`, onde o tile inteiro é
 * o azul-claro do avatar). Medido no print: o fundo do tile e o fundo da foto
 * são o **mesmo** pixel — não há clarear nem escurecer.
 *
 * Isso é **dado**, não token de paleta: a cor vem da imagem de cada pessoa e
 * muda quando ela troca a foto. Por isso mora aqui e não no `tailwind.config`.
 *
 * A extração acontece no cliente, num `<canvas>` de 16×16 — desenhar a foto
 * reduzida é o próprio jeito barato de amostrar: o navegador faz a média dos
 * blocos ao redimensionar, e sobram 256 pixels para contar em vez de milhares.
 *
 * Duas coisas que este módulo protege:
 *
 * - **Cache por URL.** A mesma foto aparece no palco, na faixa de miniaturas e
 *   na prévia; sem cache, cada tile abriria a própria imagem e faria a própria
 *   leitura, a cada remontagem da grade.
 * - **Falhar em silêncio.** A foto vem de outro domínio (`api.streamz.chat`) e
 *   `getImageData` num canvas contaminado por CORS **lança**. Quando isso
 *   acontece — ou quando a pessoa não tem foto — a cor é a do avatar sem
 *   imagem (`corDoAvatar`), que já é estável por id.
 */

import { useEffect, useState } from "react";

/** Cor de fundo em `#rrggbb`, ou `null` quando não deu para decidir. */
export type Cor = string | null;

/**
 * A parte pura: qual cor domina uma leitura RGBA.
 *
 * O agrupamento é por faixas de 16 níveis por canal (4096 caixas). Contar cor
 * exata não serviria — numa foto quase todo pixel é único —, e caixas grandes
 * demais (4 níveis) misturariam o céu com a pele. Escolhida a caixa mais
 * povoada, a cor devolvida é a **média dos pixels dela**, e não o centro da
 * caixa: é o que evita o degrau de 16 em cada canal.
 *
 * Pixels transparentes não contam: um PNG de avatar com fundo vazado tem mais
 * transparência que desenho, e a cor "dominante" seria o nada.
 */
export function corDominanteDosPixels(dados: ArrayLike<number>): Cor {
  const caixas = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < dados.length; i += 4) {
    const a = dados[i + 3];
    if (a < 128) continue;
    const r = dados[i];
    const g = dados[i + 1];
    const b = dados[i + 2];
    const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const caixa = caixas.get(chave);
    if (caixa) {
      caixa.n++;
      caixa.r += r;
      caixa.g += g;
      caixa.b += b;
    } else {
      caixas.set(chave, { n: 1, r, g, b });
    }
  }

  let melhor: { n: number; r: number; g: number; b: number } | null = null;
  for (const caixa of caixas.values()) {
    if (!melhor || caixa.n > melhor.n) melhor = caixa;
  }
  if (!melhor) return null;
  return paraHex(
    Math.round(melhor.r / melhor.n),
    Math.round(melhor.g / melhor.n),
    Math.round(melhor.b / melhor.n),
  );
}

export function paraHex(r: number, g: number, b: number): string {
  const dois = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${dois(r)}${dois(g)}${dois(b)}`;
}

/** Lado do canvas de amostragem. 16 basta: a conta é sobre blocos, não detalhes. */
const LADO = 16;

/** Uma leitura por URL — inclusive a que falhou (`null`), que não se repete. */
const cache = new Map<string, Cor>();
/** Leituras em voo, para que dez tiles da mesma pessoa não baixem dez vezes. */
const emVoo = new Map<string, Promise<Cor>>();

/** O que já se sabe desta URL, sem disparar leitura nenhuma. */
export function corDominanteEmCache(url: string): Cor | undefined {
  return cache.get(url);
}

/** Só para os testes: esquece o que foi lido. */
export function limparCacheDeCores() {
  cache.clear();
  emVoo.clear();
}

/**
 * Lê a cor dominante de uma imagem, com cache por URL.
 *
 * `crossOrigin = "anonymous"` **antes** do `src` é o que permite ler os pixels
 * de outra origem; sem ele o canvas fica contaminado e a leitura lança. Se o
 * servidor não mandar `Access-Control-Allow-Origin`, a imagem nem carrega — e
 * o `catch` devolve `null`, que o chamador troca pela cor do avatar.
 */
export function corDominanteDaImagem(url: string): Promise<Cor> {
  const pronta = cache.get(url);
  if (pronta !== undefined) return Promise.resolve(pronta);
  const andando = emVoo.get(url);
  if (andando) return andando;

  const p = new Promise<Cor>((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new globalThis.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = LADO;
        canvas.height = LADO;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, LADO, LADO);
        resolve(corDominanteDosPixels(ctx.getImageData(0, 0, LADO, LADO).data));
      } catch {
        // canvas contaminado (CORS) ou imagem sem quadro decodificável
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  }).then((cor) => {
    cache.set(url, cor);
    emVoo.delete(url);
    return cor;
  });

  emVoo.set(url, p);
  return p;
}

/**
 * A cor de fundo do tile desta pessoa: a dominante da foto, ou `padrao`
 * enquanto ela não chega (e para sempre, se não houver foto).
 *
 * Começa já no valor em cache quando ele existe: sem isso, trocar de foco
 * repintaria todo tile de cinza por um quadro antes de voltar à cor certa.
 */
export function useCorDominante(url: string | null | undefined, padrao: string): string {
  const [cor, setCor] = useState<string>(() => (url && cache.get(url)) || padrao);

  useEffect(() => {
    if (!url) {
      setCor(padrao);
      return;
    }
    const pronta = cache.get(url);
    if (pronta !== undefined) {
      setCor(pronta ?? padrao);
      return;
    }
    let vivo = true;
    void corDominanteDaImagem(url).then((c) => {
      if (vivo) setCor(c ?? padrao);
    });
    return () => {
      vivo = false;
    };
  }, [url, padrao]);

  return cor;
}
