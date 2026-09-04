/**
 * A máquina de estados do teste de microfone.
 *
 * "Testar microfone" no Discord não é um medidor: é uma cabine. Enquanto o
 * teste corre você fica **mudo e surdo** — não ouve ninguém, ninguém te ouve —
 * e escuta a si mesmo, com o mesmo processamento que o outro lado receberia. É
 * o que responde a pergunta que levou a pessoa ali ("estou pegando o
 * ventilador?"): com a sala tocando por cima é impossível julgar o próprio som.
 *
 * A primeira versão (#102) ensurdecia **por dentro**: um estado transitório
 * (`testandoMicrofone`) sobrepunha mudo/surdo sem escrevê-los e sem avisar o
 * gateway. Funcionava e não deixava rastro, mas era invisível: os ícones do
 * rodapé e da cápsula continuavam dizendo que você estava ouvindo, e os outros
 * te viam normal enquanto você não ouvia nada. A decisão do usuário
 * (2026-09-04) é a do Discord: o teste **muta e ensurdece de verdade**, pelos
 * mesmos caminhos do botão do rodapé — com som, com ícone e com `voice.update`
 * para o gateway —, e ao parar **restaura exatamente** o que estava antes.
 *
 * Daí este módulo, sem DOM, sem LiveKit e sem store, só a regra:
 *
 * - **entrar**: guarda o par mudo/surdo de agora e pede o par do teste;
 * - **sair**: devolve o par guardado — mas só se ninguém tiver mexido nele no
 *   meio do caminho. Se o usuário desmutou/dessurdou na mão, a escolha dele é
 *   mais nova que a nossa e fica (e o teste para: `testeSobrevive`);
 * - quem já estava surdo antes do teste entra e sai sem que nada mude — sem
 *   escrita, sem som.
 *
 * O que sobra para a store (`stores/voice.ts`) é aplicar: escrever em
 * `voicePrefs` com `setMuteDeafen`, tirar o microfone da sala
 * (`definirMicrofoneEmTeste`) e ligar o retorno. Ver o cabeçalho de
 * `components/voice/useTesteDeMicrofone.ts` para a parte de mídia.
 */

/** O par que o rodapé mostra e o gateway recebe. */
export interface PrefsDeVoz {
  muted: boolean;
  deafened: boolean;
}

/**
 * O que o teste exige enquanto dura.
 *
 * Surdo **e** mudo, porque no Discord surdo implica mudo — é a mesma regra de
 * `voicePrefs.toggleDeafen`, e o par tem de bater com o que ela escreve para a
 * restauração saber que foi o teste quem pôs isso ali.
 */
export const PREFS_DO_TESTE: PrefsDeVoz = { muted: true, deafened: true };

export interface EstadoDoTeste {
  testando: boolean;
  /** o mudo/surdo de antes do teste; `null` fora dele. */
  anterior: PrefsDeVoz | null;
}

export const FORA_DO_TESTE: EstadoDoTeste = { testando: false, anterior: null };

/** O estado seguinte e o que escrever em `voicePrefs` (`null` = nada a fazer). */
export interface PassoDoTeste {
  estado: EstadoDoTeste;
  aplicar: PrefsDeVoz | null;
}

export function mesmasPrefs(a: PrefsDeVoz, b: PrefsDeVoz): boolean {
  return a.muted === b.muted && a.deafened === b.deafened;
}

/**
 * Começa o teste: guarda o estado atual e pede o do teste.
 *
 * Chamar duas vezes não faz nada — e, principalmente, **não** regrava o
 * `anterior`: um segundo "Testar" (o popover e a aba podem estar abertos ao
 * mesmo tempo) guardaria o par já ensurdecido pelo primeiro e a restauração
 * deixaria a pessoa surda para sempre.
 */
export function iniciarTeste(estado: EstadoDoTeste, atual: PrefsDeVoz): PassoDoTeste {
  if (estado.testando) return { estado, aplicar: null };
  return {
    estado: { testando: true, anterior: { ...atual } },
    aplicar: mesmasPrefs(atual, PREFS_DO_TESTE) ? null : PREFS_DO_TESTE,
  };
}

/**
 * Para o teste (botão, popover fechado, aba trocada, saída da call, desmonte)
 * e diz o que restaurar.
 *
 * A condição de restaurar é "as preferências ainda são exatamente as que o
 * teste pôs". É ela que faz o caminho do usuário no meio do teste — desmutar
 * ou dessurdar na mão — não ser desfeito: aí `atual` já não é
 * `PREFS_DO_TESTE`, e nada é escrito por cima da escolha dele.
 */
export function pararTeste(estado: EstadoDoTeste, atual: PrefsDeVoz): PassoDoTeste {
  if (!estado.testando) return { estado: FORA_DO_TESTE, aplicar: null };
  const { anterior } = estado;
  const restaurar =
    anterior !== null && mesmasPrefs(atual, PREFS_DO_TESTE) && !mesmasPrefs(anterior, atual);
  return { estado: FORA_DO_TESTE, aplicar: restaurar ? anterior : null };
}

/**
 * O teste continua de pé com estas preferências?
 *
 * Não: mexeu no mudo ou no surdo enquanto o teste corria, o teste acabou. O
 * botão do rodapé (e o Ctrl+Shift+M/D) é um pedido para voltar à call, e
 * manter a cabine aberta por cima dele deixaria o ícone e o áudio brigando.
 */
export function testeSobrevive(atual: PrefsDeVoz): boolean {
  return mesmasPrefs(atual, PREFS_DO_TESTE);
}

/**
 * O áudio de um participante remoto deve estar calado agora?
 *
 * Assinatura solta (e não um objeto) porque quem pergunta é um `<audio>` por
 * faixa, em `AudioRemotoHost`: ele já tem os três booleanos na mão e montar um
 * objeto por faixa a cada render seria cerimônia à toa.
 *
 * Durante o teste `deafened` já é verdade — quem cala é o surdo de verdade,
 * como em qualquer outro momento. O `testando` fica como cinto de segurança
 * para a fração de render entre "o teste começou" e "as preferências foram
 * escritas", e para o teste fora de qualquer call.
 */
export function saidaCalada(deafened: boolean, testando: boolean, silenciadoLocal = false): boolean {
  return testando || deafened || silenciadoLocal;
}
