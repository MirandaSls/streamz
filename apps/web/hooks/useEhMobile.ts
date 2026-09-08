"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { isTauri } from "@/lib/desktop";

/**
 * "Estamos num celular?" — a única pergunta que liga o leiaute mobile.
 *
 * O corte é **767px**, e não um teste de toque: o que não cabe no celular é a
 * largura. O shell de quatro colunas do `app/app/page.tsx` tem piso de 940px
 * (rail + coluna + conteúdo + membros); abaixo de 768 nenhuma das quatro cabe,
 * e é aí que o leiaute de abas do Discord mobile entra. Um tablet de 800 e um
 * notebook pequeno continuam no leiaute de sempre.
 *
 * **Dentro do Tauri a resposta é sempre `false`.** O app de desktop embute esta
 * mesma web (`apps/web/out`) e a janela pode ser arrastada para menos de 768px
 * de largura; virar barra de abas ali seria uma regressão do produto que o
 * usuário instalou. O desktop tem piso de largura próprio e a barra de título
 * nossa, que não existem no leiaute mobile.
 *
 * ## Por que não há divergência de hidratação
 *
 * O servidor (e o export estático, que é como a web é servida) não tem
 * `matchMedia`: a primeira renderização é **sempre** `false`, no servidor e no
 * cliente. Quem troca é um `useLayoutEffect`, que roda *antes da pintura* — o
 * React descarta o quadro do leiaute desktop e o celular nunca chega a vê-lo.
 * Um `useEffect` comum não serviria: ele roda depois da pintura, e aí haveria
 * um quadro com o shell de 940px e barra de rolagem horizontal.
 *
 * Isso cobre a hidratação, não o HTML estático que o navegador pinta antes de o
 * JS subir. Esse quadro é resolvido no CSS: o shell desktop leva `max-md:hidden`
 * (ver `app/app/page.tsx`), então abaixo de 768px ele já nasce escondido.
 */
/**
 * ## O telefone deitado
 *
 * A largura sozinha não bastava. Um iPhone 14 **em paisagem** mede 844×390 pt:
 * 844 passa dos 767, e girar o aparelho durante uma chamada devolvia o shell de
 * quatro colunas — rail, lista de canais, palco e card do usuário espremidos em
 * 390pt de **altura** (visto e fotografado ao levantar a call do celular). Não é
 * um caso de borda: girar é o gesto de quem quer ver uma transmissão maior.
 *
 * Por isso a consulta tem uma segunda alternativa: **pouca altura, deitado e com
 * dedo**. Os três juntos descrevem um telefone virado e mais nada — uma janela
 * de navegador baixinha num computador continua sendo desktop porque o ponteiro
 * dela é `fine`, e um tablet deitado tem altura de sobra.
 *
 * 500pt de teto: um iPhone Pro Max deitado chega a 430 e um Android grande a
 * ~412; um iPad mini deitado tem 744. O corte cai confortavelmente entre os
 * dois.
 */
export const CONSULTA_MOBILE =
  "(max-width: 767px), (max-height: 500px) and (orientation: landscape) and (pointer: coarse)";

/** `useLayoutEffect` no cliente; no servidor o React avisa que não roda. */
const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Resposta fora do React — para código que não é componente (um handler, uma
 * store). Mesma regra do hook; sem `window`, `false`.
 */
export function ehMobileAgora(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (isTauri()) return false;
  return window.matchMedia(CONSULTA_MOBILE).matches;
}

/**
 * `true` quando a janela é de celular e não estamos no app de desktop.
 * Acompanha rotação e redimensionamento (o `change` do `matchMedia`).
 */
export function useEhMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(false);

  useEfeitoDeLeiaute(() => {
    // no Tauri nem chegamos a observar: a resposta é constante
    if (isTauri() || typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia(CONSULTA_MOBILE);
    const aplicar = () => setEhMobile(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return ehMobile;
}
