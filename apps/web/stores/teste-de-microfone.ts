/**
 * O estado temporário do teste de microfone, e o que ele decide.
 *
 * "Testar microfone" no Discord não é só um medidor: enquanto o teste corre,
 * você fica **surdo** — não ouve os outros e eles não te ouvem — e ouve a si
 * mesmo. A tentação é implementar isso ligando mudo e surdo de verdade; seria
 * errado, porque mudo e surdo são preferências persistidas (`voicePrefs`, com
 * som próprio e ícone no rodapé) e quem entra num teste não pediu para mudar
 * nada: sairia dele mudo, sem saber por quê.
 *
 * Então o teste é uma camada **por cima** das preferências, e este módulo é a
 * regra dessa camada, sem DOM e sem LiveKit para poder ser testada:
 *
 * - o teste nunca escreve em `prefs` — o que ele faz é sobrepor;
 * - parar o teste não "restaura um retrato": as preferências nunca saíram do
 *   lugar, então basta parar de sobrepor. É por isso que trocar de mudo no meio
 *   do teste vale ao sair dele, e não é desfeito.
 *
 * O gateway também não fica sabendo: `voice.update` continua mandando as flags
 * das preferências. O Discord ensurdece só de um lado, e é o certo — os outros
 * não têm o que fazer com "fulano está testando o microfone", e uma linha
 * "mudo" piscando na lista a cada teste seria ruído.
 */

export interface PrefsDeVoz {
  muted: boolean;
  deafened: boolean;
  /** o que `voicePrefs.micAberto()` responde (já considera mudo, surdo e PTT). */
  micAberto: boolean;
}

export interface EstadoDeVozNoTeste {
  prefs: PrefsDeVoz;
  /** transitório: não é persistido e não vai para o gateway. */
  testando: boolean;
}

/** Liga/desliga o teste sem tocar nas preferências. */
export function comTeste(estado: EstadoDeVozNoTeste, testando: boolean): EstadoDeVozNoTeste {
  if (estado.testando === testando) return estado;
  return { prefs: estado.prefs, testando };
}

/** O microfone deve estar publicado na sala agora? Durante o teste, nunca. */
export function microfoneNaSala(estado: EstadoDeVozNoTeste): boolean {
  return estado.testando ? false : estado.prefs.micAberto;
}

/**
 * O áudio de um participante remoto deve estar calado agora?
 *
 * Assinatura solta (e não `EstadoDeVozNoTeste`) porque quem pergunta é um
 * `<audio>` por faixa, em `AudioRemotoHost`: ele já tem os três booleanos na
 * mão e montar um objeto por faixa a cada render seria cerimônia à toa.
 */
export function saidaCalada(deafened: boolean, testando: boolean, silenciadoLocal = false): boolean {
  return testando || deafened || silenciadoLocal;
}

/**
 * O que o gateway vê. É o espelho de `flags()` em `stores/voice.ts` — `muted`
 * ali é "o microfone está fechado agora", que o PTT também decide — e existe
 * aqui para o teste poder provar que **não** aparece nele.
 */
export function flagsParaOGateway(estado: EstadoDeVozNoTeste): { muted: boolean; deafened: boolean } {
  return { muted: !estado.prefs.micAberto, deafened: estado.prefs.deafened };
}
