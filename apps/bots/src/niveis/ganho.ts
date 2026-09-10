/**
 * Quem ganha XP, quanto, e quando **não** ganha.
 *
 * Tudo aqui é puro: recebe o relógio e o sorteio como parâmetro em vez de
 * chamar `Date.now()` e `Math.random()`. É o que torna a carência testável — e
 * a carência é a regra que mais importa neste bot, porque é ela que separa
 * "conversar" de "apertar Enter trinta vezes".
 */

import type { ConfigDoServidor, UsuarioDeNiveis } from "./dados";
import { nivelDoXp } from "./curva";

/** Um minuto entre ganhos, como manda a tradição do gênero. */
export const CARENCIA_PADRAO_MS = 60_000;

/** A faixa de XP por mensagem. Aleatória de propósito — ver `xpAleatorio`. */
export const XP_MINIMO = 15;
export const XP_MAXIMO = 25;

/**
 * Já passou a carência?
 *
 * `ultimoGanhoEm = 0` é quem nunca ganhou: ganha. Um relógio que ande para trás
 * (NTP corrigindo, contêiner migrado) deixaria `agora - ultimo` negativo e
 * prenderia a pessoa até o futuro alcançar o carimbo — por isso o carimbo no
 * futuro também **libera**, em vez de bloquear.
 */
export function passouACarencia(
  ultimoGanhoEm: number,
  agora: number,
  carenciaMs: number = CARENCIA_PADRAO_MS,
): boolean {
  if (!Number.isFinite(ultimoGanhoEm) || ultimoGanhoEm <= 0) return true;
  const decorrido = agora - ultimoGanhoEm;
  if (decorrido < 0) return true;
  return decorrido >= carenciaMs;
}

/**
 * XP aleatório na faixa, extremos inclusive.
 *
 * Aleatório e não fixo porque com valor fixo dá para calcular exatamente quantas
 * mensagens faltam para o próximo nível, e aí o ranking vira planilha. O
 * `sorteio` entra por parâmetro para o teste poder fixar as pontas.
 */
export function xpAleatorio(
  sorteio: () => number = Math.random,
  minimo: number = XP_MINIMO,
  maximo: number = XP_MAXIMO,
): number {
  const baixo = Math.min(minimo, maximo);
  const alto = Math.max(minimo, maximo);
  return baixo + Math.floor(sorteio() * (alto - baixo + 1));
}

/** Aplica o multiplicador do servidor, arredondando para baixo (mínimo 0). */
export function comMultiplicador(xp: number, multiplicador: number): number {
  const m = Number.isFinite(multiplicador) ? Math.max(0, multiplicador) : 1;
  return Math.max(0, Math.floor(xp * m));
}

/**
 * Uma mensagem que **não** deve dar XP.
 *
 * Três motivos, e todos importam: outro bot conversando (senão dois bots
 * oficiais no mesmo canal sobem de nível um ao outro), uma invocação de comando
 * (`!nivel` não é conversa; premiar isso ensina a apertar `!` em vez de falar),
 * e um canal que o servidor marcou como ignorado.
 *
 * **O que falta, e por quê:** a *mensagem de sistema* ("fulano entrou no
 * servidor", "fulano fixou uma mensagem") ainda pontua. Não é esquecimento: a
 * casca de compatibilidade manda `type: 0` para **tudo**, `DEFAULT` e
 * `SYSTEM_*` (é decisão dela, documentada em
 * `apps/api/src/modules/discord-compat/traducao/mensagem.ts` — um tipo que a
 * lib não conhece vira `undefined` em algumas delas). Então o bot não tem como
 * distinguir, e casar o texto da narração seria adivinhação presa ao idioma.
 * O custo é um ganho de 15–25 XP por entrada no servidor; a correção, no dia em
 * que a casca mandar o tipo real, é uma linha: `if (mensagem.sistema) return
 * "sistema"`.
 */
export function motivoParaIgnorar(mensagem: {
  autorEhBot: boolean;
  conteudo: string;
  canalId: string;
  prefixo: string;
  canaisIgnorados: string[];
}): "bot" | "comando" | "canal-ignorado" | null {
  if (mensagem.autorEhBot) return "bot";
  const texto = mensagem.conteudo.trimStart();
  if (mensagem.prefixo !== "" && texto.startsWith(mensagem.prefixo)) return "comando";
  // O `/` do composer nunca chega como mensagem (vira interação), mas alguém
  // pode digitar `/nivel` num cliente que não tenha o composer — mesma regra.
  if (texto.startsWith("/")) return "comando";
  if (mensagem.canaisIgnorados.includes(mensagem.canalId)) return "canal-ignorado";
  return null;
}

/** O que aconteceu com uma mensagem: ganhou XP, subiu de nível, nada. */
export interface ResultadoDaMensagem {
  ganhou: boolean;
  /** XP creditado (0 quando não ganhou). */
  xp: number;
  nivelAntes: number;
  nivelDepois: number;
  subiu: boolean;
  /** O estado do usuário **depois** — o chamador grava isto. */
  usuario: UsuarioDeNiveis;
}

/**
 * A regra inteira de uma mensagem, sem tocar em disco nem no relógio.
 *
 * Devolve um `usuario` **novo** em vez de mutar o que entrou: o serviço grava o
 * resultado no estado e sabe, pelo `subiu`, se precisa anunciar. Um objeto
 * mutado no lugar economizaria uma alocação e custaria a possibilidade de
 * testar isto sem um estado inteiro em volta.
 */
export function aplicarMensagem(
  anterior: UsuarioDeNiveis,
  config: Pick<ConfigDoServidor, "multiplicador">,
  agora: number,
  sorteio: () => number = Math.random,
  carenciaMs: number = CARENCIA_PADRAO_MS,
): ResultadoDaMensagem {
  const nivelAntes = nivelDoXp(anterior.xp);
  const mensagens = anterior.mensagens + 1;

  if (!passouACarencia(anterior.ultimoGanhoEm, agora, carenciaMs)) {
    // A mensagem conta, o XP não. Contar mesmo assim é o que deixa o
    // `/nivel` dizer "1.204 mensagens" sem mentir por causa da carência.
    return {
      ganhou: false,
      xp: 0,
      nivelAntes,
      nivelDepois: nivelAntes,
      subiu: false,
      usuario: { ...anterior, mensagens },
    };
  }

  const ganho = comMultiplicador(xpAleatorio(sorteio), config.multiplicador);
  const xp = anterior.xp + ganho;
  const nivelDepois = nivelDoXp(xp);

  return {
    ganhou: ganho > 0,
    xp: ganho,
    nivelAntes,
    nivelDepois,
    subiu: nivelDepois > nivelAntes,
    usuario: { xp, mensagens, ultimoGanhoEm: agora },
  };
}

/**
 * Os cargos que alguém passa a merecer ao ir de `nivelAntes` para `nivelDepois`.
 *
 * Devolve **todos** os limiares cruzados, e não só o do nível novo: um
 * `/dar-xp @fulano 50000` pula do 2 ao 20 de uma vez, e entregar só o cargo do
 * 20 deixaria a pessoa sem os quatro do caminho.
 */
export function cargosConquistados(
  cargosPorNivel: { nivel: number; cargoId: string }[],
  nivelAntes: number,
  nivelDepois: number,
): string[] {
  const conquistados = cargosPorNivel
    .filter((c) => c.nivel > nivelAntes && c.nivel <= nivelDepois)
    .map((c) => c.cargoId);
  return [...new Set(conquistados)];
}
