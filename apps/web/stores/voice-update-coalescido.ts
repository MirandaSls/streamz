/**
 * Emissor coalescido: junta rajada de chamadas próximas num envio só.
 *
 * Nasceu do mudo/desmudo repetido em `syncFlags` (`stores/voice.ts`): cada
 * toggle emitia `WS_EVENTS.VOICE_UPDATE` na hora, e o token bucket do
 * gateway (WS na "Rate limiting em duas camadas" do CLAUDE.md) descarta o
 * excesso **em silêncio** — o último estado podia nunca chegar, e o ícone de
 * mudo na lista da call (que vem do servidor, não do cliente local) ficava
 * atrasado ou errado depois de uma rajada.
 *
 * Regra de throttle com borda de subida e de descida:
 * - nada foi enviado nos últimos `intervaloMs` → envia na hora (a pessoa que
 *   mutou uma vez só não espera nada);
 * - já tem um envio "em voo" (dentro da janela) → guarda só o valor mais
 *   recente, e ele sai sozinho quando a janela fecha — se enquanto isso
 *   chegar outro valor, a janela se renova, sempre carregando só o último;
 * - valor igual ao último **efetivamente enviado** nunca dispara envio novo
 *   (inclusive quando a rajada termina de volta no estado original).
 *
 * Isso garante duas coisas ao mesmo tempo: a rajada nunca estoura o token
 * bucket (no máx. 1 envio por janela), e o estado que o gateway vê no fim
 * **sempre** é o final de verdade, não o que por acaso não foi descartado.
 *
 * Puro e sem dependência de store — por isso testável isoladamente.
 */
export interface EmissorCoalescido<T> {
  /** Pede o envio de `valor`; pode sair na hora ou ficar para o fim da janela. */
  pedir(valor: T): void;
  /**
   * Cancela o timer pendente e esquece o último valor enviado.
   *
   * Usar ao entrar/sair de uma sala: o próximo `pedir` não pode ser
   * suprimido por comparação com o estado de uma sala anterior, nem herdar
   * uma janela que não faz mais sentido nesta.
   */
  zerar(): void;
}

export function criarEmissorCoalescido<T>(
  enviar: (valor: T) => void,
  intervaloMs: number,
  iguais: (a: T, b: T) => boolean,
): EmissorCoalescido<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendente: T | null = null;
  let temPendente = false;
  let ultimoEnviado: T | null = null;
  let temUltimoEnviado = false;

  function realmenteEnviar(valor: T) {
    ultimoEnviado = valor;
    temUltimoEnviado = true;
    enviar(valor);
  }

  /** Fim da janela: manda o que ficou pendente, se ainda fizer diferença. */
  function aoFecharJanela() {
    if (temPendente) {
      const valor = pendente as T;
      pendente = null;
      temPendente = false;
      if (!(temUltimoEnviado && iguais(valor, ultimoEnviado as T))) {
        // ainda muda algo: manda e renova a janela — é assim que uma rajada
        // longa vira "um envio por intervaloMs", não um só no começo
        realmenteEnviar(valor);
        timer = setTimeout(aoFecharJanela, intervaloMs);
        return;
      }
    }
    // nada pendente, ou o pendente voltou a ser igual ao já enviado: a
    // janela fecha de vez, o próximo `pedir` é que decide se reabre
    timer = null;
  }

  return {
    pedir(valor: T) {
      if (timer === null) {
        // nada em voo: repetir o que já está do outro lado não muda nada
        if (temUltimoEnviado && iguais(valor, ultimoEnviado as T)) return;
        realmenteEnviar(valor);
        timer = setTimeout(aoFecharJanela, intervaloMs);
        return;
      }
      // janela aberta: só o mais recente sobrevive até ela fechar
      pendente = valor;
      temPendente = true;
    },
    zerar() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendente = null;
      temPendente = false;
      ultimoEnviado = null;
      temUltimoEnviado = false;
    },
  };
}
