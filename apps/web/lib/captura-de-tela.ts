/**
 * Compartilhar a tela **pelo navegador** — a detecção de suporte e a captura.
 *
 * Existe separado do botão porque a resposta a "dá para compartilhar aqui?"
 * agora tem dois consumidores com desenhos diferentes: a barra do desktop
 * (`ScreenShareButton`) e a barra do celular (`ControlesMobile`), que precisa
 * mostrar o botão **desabilitado** e explicar por quê.
 *
 * ## Por que o botão não some no celular
 *
 * `navigator.mediaDevices.getDisplayMedia` **não existe** no Safari do iOS nem
 * no Chrome do Android — nenhum dos dois deixa uma página capturar a tela do
 * aparelho, e isso é uma decisão dos sistemas, não uma falta nossa. Sumir com o
 * botão faria a pessoa procurar por ele; deixá-lo clicável faria a captura
 * falhar em silêncio (foi o que acontecia: o `getDisplayMedia` inexistente caía
 * no `if` e o toast dizia só "este navegador não permite"). O certo é o botão
 * **estar lá, apagado**, e o toque dizer onde a coisa funciona.
 *
 * Não há gambiarra possível aqui e nem se tenta: capturar a própria aba
 * (`getUserMedia` com `preferCurrentTab`, um `canvas` desenhando o DOM) não
 * compartilha a tela do telefone — compartilha o Streamz consigo mesmo.
 */

import { restricoesDeCaptura, type Aba } from "@/lib/seletor-de-tela";
import type { ScreenQuality } from "@streamz/shared";

/**
 * O navegador sabe capturar a tela?
 *
 * Só a presença da função. Não dá para perguntar antes se a permissão existe —
 * `getDisplayMedia` não tem entrada na Permissions API —, e chamar para
 * descobrir abriria o diálogo do sistema sem ninguém ter pedido.
 */
export function suportaCapturaDeTela(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/**
 * A frase que o toque no botão apagado mostra. É a que o usuário pediu, e diz
 * a única saída que de fato existe — o app de computador, que captura pelo
 * Rust (ver §7 do processo).
 */
export const SEM_CAPTURA_DE_TELA =
  "Seu navegador não permite compartilhar a tela; use o app no computador";

/**
 * Abre o diálogo do navegador e devolve a captura, ou `null` quando não há
 * suporte.
 *
 * Tem de ser chamada **dentro do gesto do usuário**: `getDisplayMedia` é
 * bloqueada fora dele. Por isso ela não tenta nada antes — nenhum `await`
 * precede a chamada.
 */
export async function capturarTelaNoNavegador(
  qualidade: ScreenQuality,
  audio: boolean,
  /** Aba do nosso seletor, só para dar a dica de `displaySurface` ao diálogo. */
  aba: Aba = "telas",
): Promise<MediaStream | null> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
  if (!md?.getDisplayMedia) return null;
  return md.getDisplayMedia(restricoesDeCaptura(qualidade, audio, aba));
}
