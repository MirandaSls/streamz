/**
 * "Esta URL colada no chat é um convite do Streamz?" — a decisão pura.
 *
 * O defeito que este módulo resolve: no app de desktop, uma mensagem com
 * `https://streamz.chat/invite/jsc2zafi` aparecia como prévia genérica de link
 * ("Streamz — Chat de comunidade — voz, vídeo e tela") em vez do cartão com o
 * botão Entrar. A causa é a origem: dentro do Tauri o app é servido de
 * `http://tauri.localhost`, então qualquer comparação com
 * `window.location.origin` erra o `https://streamz.chat` do link, e um build
 * exportado que não recebeu a variável do host público não tem com o que
 * comparar.
 *
 * A regra aqui é a mesma dos dois lados: **o caminho** é `/invite/<código>` e
 * **o host** é um dos nossos — o host público configurado (`WEB_URL`, ver
 * `lib/config.ts`) *ou* o host de onde o próprio app está sendo servido
 * (`streamz.chat` no navegador, `tauri.localhost` no desktop, `localhost:3000`
 * em desenvolvimento). Link de terceiro com o mesmo caminho não vira convite:
 * `https://exemplo.com/invite/x` é uma prévia de link como outra qualquer.
 *
 * Comparamos por **host** (nome + porta), não por origem inteira: o mesmo
 * convite colado como `http://` e como `https://` é o mesmo convite.
 */

import { WEB_URL } from "@/lib/config";

/**
 * `/invite/<código>`, com barra final opcional. O código é o alfabeto dos
 * convites da API (`invites.service.ts`: minúsculas e dígitos); o intervalo
 * aqui é folgado de propósito, para um código futuro maior continuar sendo
 * reconhecido — quem decide se ele existe é o `GET /invites/:code`.
 */
const CAMINHO = /^\/invite\/([A-Za-z0-9_-]{1,64})\/?$/;

/** Host (nome + porta) de uma origem ou URL; `""` quando não dá para ler. */
function hostDe(origem: string): string {
  if (!origem) return "";
  try {
    return new URL(origem).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * O código do convite desta URL, ou `null` se ela não for um convite nosso.
 *
 * `origens` são as origens que valem como "nosso host" — ver
 * `origensDeConvite()`, que é quem as monta a partir da configuração e da
 * janela. Aqui não se lê `window` nem `process.env`: é o que torna a regra
 * testável.
 */
export function codigoDeConvite(bruto: string, origens: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const nossos = new Set(origens.map(hostDe).filter(Boolean));
  if (!nossos.has(url.host.toLowerCase())) return null;

  return CAMINHO.exec(url.pathname)?.[1] ?? null;
}

/**
 * As origens que contam como "nosso host" agora: a pública configurada e a de
 * onde este app está rodando. Impura de propósito — é a fronteira entre a
 * regra (acima) e o ambiente.
 */
export function origensDeConvite(): string[] {
  const daJanela = typeof window === "undefined" ? "" : (window.location?.origin ?? "");
  return [WEB_URL, daJanela].filter(Boolean);
}

/** Atalho para quem só tem a URL em mãos (o caminho normal na interface). */
export function codigoDeConviteDaUrl(bruto: string): string | null {
  return codigoDeConvite(bruto, origensDeConvite());
}
