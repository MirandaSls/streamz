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
 *
 * ## Tratamento por plataforma (2026-09-29)
 *
 * O custo acima virou queixa real: "retorno do microfone nas transmissões" —
 * quem transmite ouvindo em alto-falante devolve a transmissão para dentro
 * dela. Nova decisão do usuário: **fora do macOS** o padrão volta a ser eco e
 * ganho automático ligados; no macOS continua "No app", porque lá o motivo da
 * decisão de 2026-09-22 (a VPIO do WebKit) segue de pé. Vale para o Mac também
 * no Safari, não só no Tauri — o defeito é do WebKit, não do app.
 *
 * `ECO_PADRAO`/`GANHO_PADRAO` continuam exportados, mas agora são só o valor do
 * Mac ("No app"); quem monta o padrão real chama `tratamentoPadrao(ehMac)`.
 * Quem já estava no trio "No app" fora do Mac é religado uma vez
 * (`migrarEcoForaDoMac`); qualquer outra combinação é escolha e não se toca.
 */
export type NivelDeRuidoSalvo = "off" | "padrao" | "avancada";

export const RUIDO_PADRAO: NivelDeRuidoSalvo = "avancada";
/** Valores do Mac ("No app"); fora dele o padrão é o oposto, ver `tratamentoPadrao`. */
export const ECO_PADRAO = false;
export const GANHO_PADRAO = false;

export const MARCA_DA_MIGRACAO = "voiceRuidoPadraoAvancada";
export const MARCA_DA_MIGRACAO_TRATAMENTO = "voiceTratamentoNoAppPadrao";
export const MARCA_DA_MIGRACAO_ECO_FORA_DO_MAC = "voiceEcoLigadoForaDoMac";

/** O trio de processamento como ele é gravado no `localStorage`. */
export interface ProcessamentoSalvo {
  eco: boolean;
  ruido: NivelDeRuidoSalvo;
  ganho: boolean;
}

/** O padrão de fábrica anterior a 2026-09-22: tratamento pelo sistema. */
const TRATAMENTO_ANTIGO: ProcessamentoSalvo = { eco: true, ruido: RUIDO_PADRAO, ganho: true };

/** O trio "No app" (padrão de 2026-09-22 até 2026-09-29 em qualquer plataforma). */
const TRATAMENTO_NO_APP: ProcessamentoSalvo = {
  eco: ECO_PADRAO,
  ruido: RUIDO_PADRAO,
  ganho: GANHO_PADRAO,
};

function mesmoTrio(a: ProcessamentoSalvo, b: ProcessamentoSalvo): boolean {
  return a.eco === b.eco && a.ruido === b.ruido && a.ganho === b.ganho;
}

/**
 * O padrão de fábrica do tratamento. Função pura de propósito: quem detecta a
 * plataforma é o chamador (`ehMac` de `lib/desktop.ts`), e o teste cobre as
 * duas sem fingir `navigator`.
 */
export function tratamentoPadrao(ehMac: boolean): ProcessamentoSalvo {
  return ehMac ? { ...TRATAMENTO_NO_APP } : { eco: true, ruido: RUIDO_PADRAO, ganho: true };
}

export function migrarRuido(
  nivel: NivelDeRuidoSalvo,
  jaMigrado: boolean,
): { nivel: NivelDeRuidoSalvo; mudou: boolean } {
  if (jaMigrado || nivel !== "padrao") return { nivel, mudou: false };
  return { nivel: RUIDO_PADRAO, mudou: true };
}

/**
 * Leva para o padrão da plataforma quem ainda estava no padrão de fábrica
 * antigo (tratamento pelo sistema), uma vez só (a marca é
 * `MARCA_DA_MIGRACAO_TRATAMENTO`). No Mac isso é "No app"; fora dele o padrão
 * da plataforma é o próprio trio antigo, então nada muda de fato.
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
 * migrado junto. No Mac esse caso volta ao que quer ligando de novo o
 * interruptor de cancelamento de eco na aba de voz — e, a partir daí, a marca
 * já gravada protege a escolha.
 */
export function migrarTratamento(
  processamento: ProcessamentoSalvo,
  jaMigrado: boolean,
  ehMac: boolean,
): { processamento: ProcessamentoSalvo; mudou: boolean } {
  if (jaMigrado || !mesmoTrio(processamento, TRATAMENTO_ANTIGO)) {
    return { processamento, mudou: false };
  }
  const alvo = tratamentoPadrao(ehMac);
  return { processamento: alvo, mudou: !mesmoTrio(processamento, alvo) };
}

/**
 * Fora do Mac, religa eco e ganho de quem está exatamente no trio "No app",
 * uma vez só (a marca é `MARCA_DA_MIGRACAO_ECO_FORA_DO_MAC`). Decisão de
 * 2026-09-29: o padrão de 2026-09-22 deixou instalações não-Mac com o trio
 * desligado sem que ninguém tivesse escolhido — só herdaram o padrão — e o
 * resultado é o retorno do microfone nas transmissões.
 *
 * Mesma régua das outras: só o trio inteiro conta como "não mexeu"; qualquer
 * outra combinação é escolha. Quem escolheu "No app" de propósito e não mexeu
 * em mais nada é indistinguível e é religado junto; desliga de novo na aba de
 * voz e a marca gravada protege a escolha. No Mac não faz nada: lá "No app"
 * continua sendo o padrão.
 */
export function migrarEcoForaDoMac(
  processamento: ProcessamentoSalvo,
  jaMigrado: boolean,
  ehMac: boolean,
): { processamento: ProcessamentoSalvo; mudou: boolean } {
  if (jaMigrado || ehMac || !mesmoTrio(processamento, TRATAMENTO_NO_APP)) {
    return { processamento, mudou: false };
  }
  return { processamento: tratamentoPadrao(false), mudou: true };
}

/**
 * As três migrações na ordem em que precisam rodar, para o `carregarAudio` da
 * store ter um único ponto de entrada.
 *
 * A do ruído vem primeiro **de propósito**: quem ainda estava no `padrao` do
 * navegador sobe para `avancada` e só então é comparado com o padrão de fábrica
 * antigo — sem isso ele pareceria "mexido" e ficaria preso no tratamento pelo
 * sistema. A do tratamento vem antes da do eco fora do Mac porque esta última
 * olha o estado **já resolvido**: quem estava no padrão de 2026-09-22 (Mac) ou
 * ainda mais atrás precisa ter chegado ao seu destino antes de ser comparado
 * com o trio "No app", senão a decisão dela seria tomada sobre um valor que a
 * anterior ainda ia mudar. Compor aqui dentro é o que trava essa ordem;
 * espalhada pelo `carregarAudio` ela seria invertível sem nenhum teste
 * reclamar.
 */
export function migrarProcessamento(
  processamento: ProcessamentoSalvo,
  marcas: { ruidoMigrado: boolean; tratamentoMigrado: boolean; ecoForaDoMacMigrado: boolean },
  ehMac: boolean,
): { processamento: ProcessamentoSalvo; mudou: boolean } {
  const ruido = migrarRuido(processamento.ruido, marcas.ruidoMigrado);
  const tratamento = migrarTratamento(
    { ...processamento, ruido: ruido.nivel },
    marcas.tratamentoMigrado,
    ehMac,
  );
  const eco = migrarEcoForaDoMac(tratamento.processamento, marcas.ecoForaDoMacMigrado, ehMac);
  return {
    processamento: eco.processamento,
    mudou: ruido.mudou || tratamento.mudou || eco.mudou,
  };
}
