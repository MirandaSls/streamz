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
 * **Dentro do Tauri a resposta depende da plataforma**, e é o único lugar em
 * que ela depende. O mesmo `apps/web/out` é embutido em três apps:
 *
 * - **Tauri desktop** (Windows): sempre `false`. A janela pode ser arrastada
 *   para menos de 768px de largura, e virar barra de abas ali seria uma
 *   regressão do produto que o usuário instalou — o desktop tem piso de largura
 *   próprio e a barra de título nossa, que não existem no leiaute mobile.
 * - **Tauri Android/iOS**: sempre `true`. É um telefone; a dúvida não existe.
 *   Sem isto o app de celular abriria o shell de quatro colunas com rolagem
 *   horizontal, que é exatamente o defeito que o leiaute mobile veio tirar.
 * - **Navegador**: a consulta de mídia decide, como sempre.
 *
 * ## Por que `navigator.userAgent` e não `@tauri-apps/plugin-os`
 *
 * O `platform()` do `plugin-os` é a resposta "oficial" e seria mais bonita.
 * Custaria: uma crate Rust nova no `Cargo.toml` (que entraria no `.exe` do
 * Windows também), um pacote npm novo no `pnpm-lock.yaml`, uma permissão nova
 * em **cada** `capabilities/*.json` e um passo de inicialização do plugin no
 * `lib.rs`. Tudo isso para responder uma pergunta que o próprio webview já
 * responde de graça — o WebView2 do Windows diz `Windows NT`, o WebView do
 * Android diz `Android`, o WKWebView do iPhone diz `iPhone`.
 *
 * Pesa também o **momento**: esta resposta é usada no primeiro quadro, e o
 * `platform()` do plugin depende de o runtime do plugin já ter injetado o valor
 * na página. O `navigator.userAgent` está lá antes do primeiro script.
 *
 * A armadilha conhecida do caminho do UA é o **iPad**, cujo WKWebView se
 * apresenta como `Macintosh` desde o iPadOS 13. Por isso a regra não é só o UA:
 * um UA de Mac **com ponteiro grosso** é um iPad, porque nenhum Mac de verdade
 * reporta `(pointer: coarse)`.
 *
 * ## Por que não há divergência de hidratação
 *
 * O servidor (e o export estático, que é como a web é servida) não tem
 * `matchMedia` nem `navigator`: a primeira renderização é **sempre** `false`,
 * no servidor e no cliente. Quem troca é um `useLayoutEffect`, que roda *antes
 * da pintura* — o React descarta o quadro do leiaute desktop e o celular nunca
 * chega a vê-lo. Um `useEffect` comum não serviria: ele roda depois da pintura,
 * e aí haveria um quadro com o shell de 940px e barra de rolagem horizontal.
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

/** Consulta que separa dedo de mouse; usada só para desempatar o iPad. */
export const CONSULTA_PONTEIRO_GROSSO = "(pointer: coarse)";

/** O que a decisão precisa saber do ambiente. Ver `decidirMobile`. */
export interface AmbienteDeLeiaute {
  /** Estamos dentro de um app Tauri (desktop **ou** celular)? */
  tauri: boolean;
  /** `navigator.userAgent`. Só pesa quando `tauri` é verdadeiro. */
  userAgent: string;
  /** `(pointer: coarse)` bate? Desempata o iPad, que se diz um Mac. */
  ponteiroGrosso: boolean;
  /** `CONSULTA_MOBILE` bate? É a resposta do navegador. */
  consultaMobile: boolean;
}

/**
 * O app Tauri em que estamos rodando é um **telefone/tablet**?
 *
 * Parte pura, e é ela que os testes cobrem. Só faz sentido dentro do Tauri: no
 * navegador o UA de um celular é informação sobre o aparelho, não sobre o
 * leiaute, e lá quem manda é a largura da janela.
 */
export function ehTauriDeCelular(userAgent: string, ponteiroGrosso: boolean): boolean {
  if (/Android/i.test(userAgent)) return true;
  if (/iPhone|iPod|iPad/i.test(userAgent)) return true;
  // iPadOS 13+ se apresenta como `Macintosh; Intel Mac OS X` no WKWebView.
  // Nenhum Mac de verdade responde `(pointer: coarse)`, então o par desempata.
  if (/Macintosh|Mac OS X/i.test(userAgent) && ponteiroGrosso) return true;
  return false;
}

/**
 * A regra inteira, sem tocar em `window`: dado o ambiente, o leiaute é o de
 * celular?
 *
 * Dentro do Tauri a plataforma decide e a largura da janela é ignorada (o
 * desktop encolhido continua desktop, o telefone deitado continua telefone);
 * fora dele decide a consulta de mídia.
 */
export function decidirMobile(ambiente: AmbienteDeLeiaute): boolean {
  if (ambiente.tauri) return ehTauriDeCelular(ambiente.userAgent, ambiente.ponteiroGrosso);
  return ambiente.consultaMobile;
}

/** `useLayoutEffect` no cliente; no servidor o React avisa que não roda. */
const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Lê do ambiente o que `decidirMobile` precisa. `null` quando não há DOM. */
function lerAmbiente(): AmbienteDeLeiaute | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return {
    tauri: isTauri(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    ponteiroGrosso: window.matchMedia(CONSULTA_PONTEIRO_GROSSO).matches,
    consultaMobile: window.matchMedia(CONSULTA_MOBILE).matches,
  };
}

/**
 * Resposta fora do React — para código que não é componente (um handler, uma
 * store). Mesma regra do hook; sem `window`, `false`.
 */
export function ehMobileAgora(): boolean {
  const ambiente = lerAmbiente();
  return ambiente ? decidirMobile(ambiente) : false;
}

/**
 * `true` quando o leiaute é o de celular: no app de Android/iOS sempre, no
 * navegador quando a janela é de celular, e nunca no app de desktop.
 * Acompanha rotação e redimensionamento (o `change` do `matchMedia`).
 */
export function useEhMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(false);

  useEfeitoDeLeiaute(() => {
    const ambiente = lerAmbiente();
    if (!ambiente) return;
    setEhMobile(decidirMobile(ambiente));
    // No Tauri a resposta é constante — a plataforma não muda em runtime —,
    // então não há o que observar. No navegador, sim: girar o aparelho e
    // arrastar a janela trocam o leiaute.
    if (ambiente.tauri) return;
    const consulta = window.matchMedia(CONSULTA_MOBILE);
    const aplicar = () => setEhMobile(consulta.matches);
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return ehMobile;
}

/**
 * **Telefone deitado.** Não é o contrário de "retrato": é o caso em que a
 * **altura** é o recurso escasso — 390pt num iPhone virado. Serve a quem precisa
 * ceder espaço vertical, como a conversa ao lado do palco de uma chamada de DM,
 * que deitada ficava com 154px de palco.
 */
export const CONSULTA_PAISAGEM =
  "(pointer: coarse) and (max-height: 599px) and (orientation: landscape)";

/**
 * `true` num telefone deitado.
 *
 * **Esta continua observando o `matchMedia` mesmo dentro do Tauri**, e a
 * diferença em relação ao `useEhMobile` é de assunto, não de descuido: lá a
 * pergunta é "que produto é este?", e a plataforma responde de uma vez para
 * sempre; aqui a pergunta é "o aparelho está deitado agora?", e girar o
 * telefone é justamente o evento que interessa. No app de Windows a resposta
 * sai `false` de graça — `CONSULTA_PAISAGEM` exige `(pointer: coarse)`, que
 * nenhum computador reporta —, então não é preciso perguntar pelo Tauri.
 */
export function useEhPaisagem(): boolean {
  return useConsultaDeMidia(CONSULTA_PAISAGEM);
}

/**
 * Observa uma consulta de mídia: começa em `false` (é o que o servidor e o
 * export estático renderizam) e troca num `useLayoutEffect`, antes da pintura.
 */
function useConsultaDeMidia(consultaCSS: string): boolean {
  const [resposta, setResposta] = useState(false);

  useEfeitoDeLeiaute(() => {
    if (typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia(consultaCSS);
    const aplicar = () => setResposta(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, [consultaCSS]);

  return resposta;
}
