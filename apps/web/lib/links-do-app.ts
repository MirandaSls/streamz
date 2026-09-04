/**
 * Transformar um caminho do app na URL que se **cola em outro lugar**.
 *
 * O mesmo defeito do link de convite (#129) valia para "Copiar link da
 * mensagem", "Copiar link do canal" e "Copiar link do tópico": os três
 * montavam a URL com `window.location.origin`, e no app de desktop a origem é
 * `http://tauri.localhost` — o WebView2 serve o export estático de dentro do
 * app. Quem copiava do desktop entregava um endereço que só existe na máquina
 * dele; colado no chat, não abria para ninguém.
 *
 * A regra é a do convite, e por isso a lista de origens é a mesma
 * (`origensDoApp`): o link nasce na origem **pública** configurada (`WEB_URL`,
 * ver `lib/config.ts`) e só cai na origem da janela quando não há configuração
 * nenhuma — o caso do desenvolvimento local, onde `http://localhost:3000` é de
 * fato o endereço público.
 *
 * `urlPublica` é pura sobre `origens`: a impureza (ler `window`) fica em
 * `origensDoApp`, que é a fronteira com o ambiente.
 */

import { WEB_URL } from "@/lib/config";

/**
 * As origens que contam como "este app", na ordem de preferência: a pública
 * configurada primeiro, a da janela depois.
 *
 * Serve para **gerar** link (a primeira ganha) e para **reconhecer** link nosso
 * colado no chat (qualquer uma vale) — é o mesmo conjunto nos dois usos, e uma
 * segunda lista em algum canto seria a que esquece de acompanhar a primeira.
 */
export function origensDoApp(): string[] {
  const daJanela = typeof window === "undefined" ? "" : (window.location?.origin ?? "");
  return [WEB_URL, daJanela].filter(Boolean);
}

/**
 * O caminho como URL pública. Sem origem nenhuma (SSR sem configuração)
 * devolve o próprio caminho — é relativo, mas continua clicável dentro do app,
 * que é melhor do que uma URL com origem vazia.
 */
export function urlPublica(caminho: string, origens = origensDoApp()): string {
  const base = origens.find(Boolean) ?? "";
  const path = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return `${base}${path}`;
}
