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
 * Duas condições, e a segunda existe por causa da **paisagem**.
 *
 * Um iPhone deitado mede 844×390: a largura passa dos 767 e cairia no leiaute
 * de colunas — que tem piso de 940px, ou seja, girar o telefone devolvia a
 * rolagem horizontal que este trabalho veio tirar. O que não muda ao girar é o
 * ponteiro (grosso) e a **altura** (390): daí o segundo termo.
 *
 * Os 599px de teto de altura foram escolhidos para caber todo telefone deitado
 * (o maior hoje tem ~430) e nenhum tablet (o iPad menor tem 768 de lado curto).
 * Uma janela de computador de 844×390 não casa: lá o ponteiro é fino.
 */
export const CONSULTA_MOBILE = "(max-width: 767px), (pointer: coarse) and (max-height: 599px)";

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
  return useConsulta(CONSULTA_MOBILE);
}

/**
 * **Telefone deitado.** Não é o contrário de "retrato": é o caso em que a
 * **altura** é o recurso escasso — 390pt num iPhone virado. Serve a quem precisa
 * ceder espaço vertical, como a conversa ao lado do palco de uma chamada de DM,
 * que deitada ficava com 154px de palco.
 */
export const CONSULTA_PAISAGEM =
  "(pointer: coarse) and (max-height: 599px) and (orientation: landscape)";

/** `true` num telefone deitado (e nunca no app de desktop). */
export function useEhPaisagem(): boolean {
  return useConsulta(CONSULTA_PAISAGEM);
}

/**
 * O motor dos dois hooks acima: começa em `false` (é o que o servidor e o
 * export estático renderizam) e troca num `useLayoutEffect`, antes da pintura.
 */
function useConsulta(consultaCSS: string): boolean {
  const [resposta, setResposta] = useState(false);

  useEfeitoDeLeiaute(() => {
    // no Tauri nem chegamos a observar: a resposta é constante
    if (isTauri() || typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia(consultaCSS);
    const aplicar = () => setResposta(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, [consultaCSS]);

  return resposta;
}
