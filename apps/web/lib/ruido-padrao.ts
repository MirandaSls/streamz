/**
 * O padrão de fábrica do processamento de voz — e as migrações de quem já
 * tinha preferência salva quando cada padrão mudou.
 *
 * ## Supressão de ruído: `avancada`
 *
 * É o nível que o botão "Supressão de ruído" da barra de voz mostra como
 * ligado (`PopoverDeRuido`): com o padrão antigo (`padrao`, a do navegador)
 * o botão aparecia desligado para todo mundo, e o pedido de 2026-09-16 foi
 * que ele viesse ativo.
 *
 * Quem já tinha preferência salva passa por esta migração **uma vez** (a
 * marca fica em `MARCA_DA_MIGRACAO`): quem estava no padrão antigo sobe para
 * `avancada`; quem escolheu `off` ou já estava em `avancada` fica como está.
 * Sem a marca, quem desligasse de novo seria religado a cada abertura.
 *
 * ## Tratamento: "No app" (`eco: false`, `ganho: false`)
 *
 * Pedido explícito do usuário em 2026-09-22, depois de testar as combinações
 * da tela: "quero que a supressão de ruído no app avançada seja a padrão".
 * O motivo é o macOS. O WebKit liga a `VoiceProcessingIO` do sistema exatamente
 * quando `echoCancellation` está ativo (`CoreAudioCaptureUnit.cpp`:
 * `m_shouldUseVPIO = enableEchoCancellation()`), e essa unidade assume entrada
 * **e** saída: entrar numa chamada estragava o áudio da máquina inteira. O
 * cancelamento de eco é a única chave desta tela que mexe nisso — a redução de
 * ruído nunca teve parte, e foi por isso que mexer nela "mesmo desligada" não
 * mudava nada.
 *
 * **O custo, sem suavizar:** com o cancelamento de eco desligado por padrão,
 * quem fala em alto-falante devolve o próprio som da chamada para dentro dela.
 * O defeito é pior por ser silencioso: quem o causa não o ouve, quem sofre são
 * os outros. A troca foi decidida pelo usuário, com conhecimento do sintoma, e
 * fica registrada aqui para quem vier depois não "consertar" de volta sem
 * saber o que estava sendo consertado. Quem usa alto-falante liga de volta o
 * interruptor de cancelamento de eco na aba de voz e recupera o cancelamento.
 */
export type NivelDeRuidoSalvo = "off" | "padrao" | "avancada";

export const RUIDO_PADRAO: NivelDeRuidoSalvo = "avancada";
export const ECO_PADRAO = false;
export const GANHO_PADRAO = false;

export const MARCA_DA_MIGRACAO = "voiceRuidoPadraoAvancada";
export const MARCA_DA_MIGRACAO_TRATAMENTO = "voiceTratamentoNoAppPadrao";

/** O trio de processamento como ele é gravado no `localStorage`. */
export interface ProcessamentoSalvo {
  eco: boolean;
  ruido: NivelDeRuidoSalvo;
  ganho: boolean;
}

/** O padrão de fábrica anterior a 2026-09-22: tratamento pelo sistema. */
const TRATAMENTO_ANTIGO: ProcessamentoSalvo = { eco: true, ruido: RUIDO_PADRAO, ganho: true };

export function migrarRuido(
  nivel: NivelDeRuidoSalvo,
  jaMigrado: boolean,
): { nivel: NivelDeRuidoSalvo; mudou: boolean } {
  if (jaMigrado || nivel !== "padrao") return { nivel, mudou: false };
  return { nivel: RUIDO_PADRAO, mudou: true };
}

/**
 * Leva para "No app" quem ainda estava no padrão de fábrica antigo, uma vez só
 * (a marca é `MARCA_DA_MIGRACAO_TRATAMENTO`).
 *
 * A condição é o trio **inteiro** estar no padrão antigo, e não só `eco`: é o
 * mais perto de "nunca mexeu nesta seção" que o storage permite chegar, porque
 * ele guarda o valor, não a intenção. Qualquer divergência — ruído em `off`,
 * ganho desligado na mão, já estar em "No app" — é sinal de escolha e fica
 * intocada. Mesmo padrão da migração do `ruido` acima, e pela mesma razão: sem
 * marca, quem voltasse para "Sistema" de propósito seria arrastado de novo a
 * cada abertura do app.
 *
 * Sobra uma ambiguidade que o storage não resolve: quem escolheu "Sistema" de
 * propósito, e não mexeu em mais nada, gravou exatamente o padrão antigo e é
 * migrado junto. Esse caso volta ao que quer ligando de novo o interruptor de
 * cancelamento de eco na aba de voz — e, a partir daí, a marca já gravada
 * protege a escolha.
 */
export function migrarTratamento(
  processamento: ProcessamentoSalvo,
  jaMigrado: boolean,
): { processamento: ProcessamentoSalvo; mudou: boolean } {
  const noPadraoAntigo =
    processamento.eco === TRATAMENTO_ANTIGO.eco &&
    processamento.ganho === TRATAMENTO_ANTIGO.ganho &&
    processamento.ruido === TRATAMENTO_ANTIGO.ruido;
  if (jaMigrado || !noPadraoAntigo) return { processamento, mudou: false };
  return {
    processamento: { eco: ECO_PADRAO, ruido: RUIDO_PADRAO, ganho: GANHO_PADRAO },
    mudou: true,
  };
}

/**
 * As duas migrações na ordem em que precisam rodar, para o `carregarAudio` da
 * store ter um único ponto de entrada.
 *
 * A do ruído vem primeiro **de propósito**: quem ainda estava no `padrao` do
 * navegador sobe para `avancada` e só então é comparado com o padrão de fábrica
 * antigo — sem isso ele pareceria "mexido" e ficaria preso no tratamento pelo
 * sistema. Compor aqui dentro é o que trava essa ordem; espalhada pelo
 * `carregarAudio` ela seria invertível sem nenhum teste reclamar.
 */
export function migrarProcessamento(
  processamento: ProcessamentoSalvo,
  marcas: { ruidoMigrado: boolean; tratamentoMigrado: boolean },
): { processamento: ProcessamentoSalvo; mudou: boolean } {
  const ruido = migrarRuido(processamento.ruido, marcas.ruidoMigrado);
  const tratamento = migrarTratamento(
    { ...processamento, ruido: ruido.nivel },
    marcas.tratamentoMigrado,
  );
  return { processamento: tratamento.processamento, mudou: ruido.mudou || tratamento.mudou };
}
