/**
 * Quem está falando com a API: o app de desktop ou o navegador.
 *
 * O app de desktop é Tauri 2 e no Windows roda em WebView2, cujo `User-Agent` é
 * o do Edge — letra por letra o mesmo de quem abriu o site no navegador. Sem um
 * sinal explícito, a aba "Dispositivos" mostrava "Edge no Windows" para o app
 * instalado. O sinal é o cabeçalho `X-Streamz-Client: desktop/<versão>`, que a
 * API lê no login e no refresh (as duas horas em que uma sessão nasce ou se
 * renova) e guarda na linha da sessão.
 *
 * Vale para toda requisição, e não só para o login: é barato, e no desktop as
 * requisições já são pré-verificadas por CORS de qualquer jeito (a origem é
 * `http://tauri.localhost`), então o cabeçalho não custa um preflight novo.
 *
 * O socket **não** entra aqui: a sessão não nasce dele — ele só apresenta o
 * access token de uma sessão que já existe — e o `WebSocket` do navegador não
 * deixa mandar cabeçalho no handshake.
 */
import { HEADER_CLIENTE } from "@streamz/shared";
import { identificacaoDoCliente } from "./desktop";

/** `{ "X-Streamz-Client": "desktop/0.0.14" }` no desktop; vazio no navegador. */
export function cabecalhoDoCliente(): Record<string, string> {
  const cliente = identificacaoDoCliente();
  return cliente ? { [HEADER_CLIENTE]: cliente } : {};
}
