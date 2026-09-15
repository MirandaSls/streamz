/**
 * Nome de canal de texto como o Discord o escreve **enquanto se digita**:
 * "Bate Papo" vira "bate-papo" letra a letra, e não só depois de salvar.
 *
 * Três regras, e só elas (cartão configuracoes-e-criacao-de-canal):
 *
 * 1. minúsculas;
 * 2. espaço vira hífen (qualquer sequência de espaços é um hífen só);
 * 3. hífens repetidos colapsam num.
 *
 * O que ela **não** faz, de propósito:
 *
 * - não apara hífen na ponta. A função roda a cada tecla: quem digita "bate "
 *   está a caminho de "bate papo", e cortar o hífen final ali engoliria o
 *   espaço antes de a próxima palavra chegar. O `trim()` de quem grava
 *   (`CreateChannelModal`/`ChannelSettingsModal`) segue cuidando das bordas.
 * - não tira acento nem símbolo: o contrato aceita esses nomes hoje, e mudar o
 *   que a API aceita não é desta função.
 *
 * Só se aplica a TEXT e ANNOUNCEMENT. Canal de voz fica livre ("Sala de
 * Música"), como no Discord.
 */
export function normalizarNomeDeCanal(v: string): string {
  return v.toLowerCase().replace(/\s+/g, "-").replace(/-{2,}/g, "-");
}
