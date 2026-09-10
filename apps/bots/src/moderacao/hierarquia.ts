/**
 * Quem pode moderar quem. **A parte que não pode errar**, e por isso é pura.
 *
 * Toda ação deste bot passa por `avaliar()` antes de sair do processo. A regra
 * é a do Discord, e ela tem seis linhas — nesta ordem, porque a ordem é o que
 * decide qual frase a pessoa lê:
 *
 * 1. quem chamou **tem a permissão** do comando (`BAN_MEMBERS` para `/banir`,
 *    `MODERATE_MEMBERS` para `/silenciar`, …);
 * 2. ninguém modera **a si mesmo**;
 * 3. ninguém modera **o bot** (um `/banir @Streamz Moderação` obedecido é o bot
 *    se expulsando do servidor a pedido de qualquer um com a permissão);
 * 4. ninguém modera **o dono** do servidor;
 * 5. ninguém modera quem tem **cargo igual ou mais alto** que o seu — e isto
 *    vale **inclusive para o administrador**: `ADMINISTRATOR` dá a permissão,
 *    não a hierarquia. É assim no Discord, e o contrário significaria que
 *    qualquer administrador pode banir todos os outros;
 * 6. o **bot** também precisa estar acima do alvo, senão a API recusa e a
 *    mensagem de erro sai técnica em vez de acionável.
 *
 * O dono do servidor pula 5 (ele está acima de todo mundo por definição), mas
 * não pula 2, 3 nem 4.
 *
 * Nada aqui toca em rede, cache ou `discord.js`: entra um retrato do ator, do
 * alvo e do bot, sai um veredito com a frase pronta. É o que permite testar as
 * seis linhas em milissegundos em vez de subir uma bancada.
 */

/** `ADMINISTRATOR` no bitfield **do Discord** (é o que o discord.js entrega). */
export const ADMINISTRADOR = 1n << 3n;

/** Retrato de quem está agindo ou de quem está sendo moderado. */
export interface Retrato {
  /** O snowflake, para comparar identidade sem depender de objeto. */
  id: string;
  /** Nome legível, só para a frase. */
  nome: string;
  /** `true` se é o dono do servidor. */
  ehDono: boolean;
  /**
   * Posição do cargo mais alto (o `@everyone` é 0).
   *
   * O dono não usa este número — ele ganha por `ehDono` —, mas ele vem
   * preenchido do mesmo jeito para o retrato não ter campo condicional.
   */
  posicaoMaisAlta: number;
  /** Bitfield de permissões **do Discord**, como o discord.js calcula. */
  permissoes: bigint;
}

export type MotivoDaRecusa =
  | "semPermissao"
  | "simesmo"
  | "euMesmo"
  | "oDono"
  | "hierarquiaDoAtor"
  | "hierarquiaDoBot";

export type Veredito = { pode: true } | { pode: false; motivo: MotivoDaRecusa; frase: string };

/** O nome amigável de cada permissão que este bot exige. */
export const NOME_DA_PERMISSAO: Record<string, string> = {
  "4": "Banir membros",
  "2": "Expulsar membros",
  "8192": "Gerenciar mensagens",
  "1099511627776": "Moderar membros",
  "32": "Gerenciar servidor",
};

/** `1n << 2n` → "Banir membros"; o número cru quando não conhecemos o bit. */
export function nomeDaPermissao(bit: bigint): string {
  return NOME_DA_PERMISSAO[bit.toString()] ?? `permissão ${bit}`;
}

/** Tem o bit, ou é administrador (que implica todos). */
export function temPermissao(permissoes: bigint, exigida: bigint): boolean {
  if ((permissoes & ADMINISTRADOR) === ADMINISTRADOR) return true;
  return (permissoes & exigida) === exigida;
}

export interface Avaliacao {
  ator: Retrato;
  alvo: Retrato;
  /** O próprio bot no servidor: ele também obedece à hierarquia. */
  bot: Retrato;
  /** O bit exigido pelo comando, no bitfield do Discord. */
  exigida: bigint;
  /** O verbo, para a frase: "banir", "expulsar", "silenciar". */
  acao: string;
}

/**
 * O veredito, com a frase pronta para a resposta **efêmera**.
 *
 * A frase é montada aqui, e não no comando, porque ela é parte da regra: uma
 * recusa que não diz **qual** das seis linhas barrou faz a pessoa tentar de
 * novo igual. Todas dizem o que fazer a seguir.
 */
export function avaliar({ ator, alvo, bot, exigida, acao }: Avaliacao): Veredito {
  if (!temPermissao(ator.permissoes, exigida)) {
    return {
      pode: false,
      motivo: "semPermissao",
      frase: `Você não tem a permissão **${nomeDaPermissao(exigida)}** neste servidor, que é a que \`${acao}\` exige.`,
    };
  }

  if (alvo.id === ator.id) {
    return {
      pode: false,
      motivo: "simesmo",
      frase: `Não dá para ${acao} você mesmo.`,
    };
  }

  if (alvo.id === bot.id) {
    return {
      pode: false,
      motivo: "euMesmo",
      frase: `Não vou ${acao} a mim mesmo. Para me tirar do servidor, use a tela de aplicativos do servidor.`,
    };
  }

  if (alvo.ehDono) {
    return {
      pode: false,
      motivo: "oDono",
      frase: `**${alvo.nome}** é o dono do servidor — ninguém pode ${acao} o dono.`,
    };
  }

  // O dono está acima de todo mundo; o administrador **não**.
  if (!ator.ehDono && ator.posicaoMaisAlta <= alvo.posicaoMaisAlta) {
    return {
      pode: false,
      motivo: "hierarquiaDoAtor",
      frase: `Você não pode ${acao} **${alvo.nome}**: o cargo mais alto dele está no seu nível ou acima.`,
    };
  }

  if (!bot.ehDono && bot.posicaoMaisAlta <= alvo.posicaoMaisAlta) {
    return {
      pode: false,
      motivo: "hierarquiaDoBot",
      frase:
        `Não consigo ${acao} **${alvo.nome}**: o meu cargo mais alto está no nível dele ou abaixo. ` +
        "Suba o meu cargo na lista de cargos do servidor.",
    };
  }

  return { pode: true };
}

/**
 * A versão sem alvo: comandos que só exigem uma permissão (`/limpar`,
 * `/registro-de-moderacao`).
 */
export function avaliarSemAlvo(
  ator: Retrato,
  exigida: bigint,
  acao: string,
): Veredito {
  if (temPermissao(ator.permissoes, exigida)) return { pode: true };
  return {
    pode: false,
    motivo: "semPermissao",
    frase: `Você não tem a permissão **${nomeDaPermissao(exigida)}** neste servidor, que é a que \`${acao}\` exige.`,
  };
}
