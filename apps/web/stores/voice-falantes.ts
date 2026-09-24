import { donoDaIdentidade } from "@streamz/shared";

/**
 * Quem está falando agora — a **única** fonte do anel verde.
 *
 * O anel aparecia em dois lugares com duas contas diferentes: o palco somava o
 * conjunto da store ao `participant.isSpeaking` lido no render, e a lista
 * lateral usava só o conjunto. Duas contas dão duas respostas, e foi isso que
 * produziu "no palco acende, na lista não" e "às vezes nem no palco acende".
 * Agora existe um conjunto só (`falando`, em `stores/voice.ts`), alimentado
 * aqui, e todo mundo o lê.
 *
 * Três decisões que este módulo carrega:
 *
 * 1. **Identidade do LiveKit não é `userId`.** Quem transmite pelo desktop
 *    entra como um segundo participante, `<userId>#tela`, e o áudio da tela
 *    dele vira "fala" na conta do LiveKit. `donoDaIdentidade` traz os dois de
 *    volta para a mesma pessoa — sem isso um `userId#tela` falante nunca
 *    casava com nenhuma linha da lista.
 * 2. **O conjunto só é trocado quando muda de verdade.** O LiveKit reordena
 *    `activeSpeakers` por nível a cada atualização; entregar um `Set` novo a
 *    cada reordenação re-renderizava a barra lateral, a grade e a lista de
 *    membros várias vezes por segundo sem nada ter mudado na tela.
 * 3. **A minha fala não espera o servidor de mídia.** O SFU só reporta quem
 *    passa do limiar dele, a cada meio segundo, por um canal de dados que pode
 *    perder pacote — daí a intermitência. Para mim, que tenho o microfone na
 *    mão, o nível sai daqui mesmo (`passoDeFala`), na hora.
 */

/** Nenhum falante. Referência estável: `set` com ela não re-renderiza ninguém. */
export const NINGUEM: ReadonlySet<string> = new Set<string>();

/** Donos das identidades do LiveKit, sem repetição (o `#tela` vira a pessoa). */
export function falantesDeIdentidades(identidades: readonly string[]): Set<string> {
  const donos = new Set<string>();
  for (const identidade of identidades) donos.add(donoDaIdentidade(identidade));
  return donos;
}

/** Os dois conjuntos têm exatamente os mesmos ids? */
export function mesmoConjunto(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * Conjunto seguinte, mantendo a **mesma referência** quando nada muda — é o que
 * transforma "o LiveKit avisou de novo" em "ninguém re-renderiza".
 */
export function proximoConjunto(
  atual: ReadonlySet<string>,
  proximo: ReadonlySet<string>,
): ReadonlySet<string> {
  return mesmoConjunto(atual, proximo) ? atual : proximo;
}

/** O mesmo, para uma pessoa só (o detector local mexe só em mim). */
export function comFalante(
  atual: ReadonlySet<string>,
  userId: string,
  falando: boolean,
): ReadonlySet<string> {
  if (falando === atual.has(userId)) return atual;
  const proximo = new Set(atual);
  if (falando) proximo.add(userId);
  else proximo.delete(userId);
  return proximo;
}

// ── detector local de fala ───────────────────────────────────

/**
 * RMS de um bloco de `getByteTimeDomainData` (silêncio = 128), em 0–1.
 *
 * Vale para o anel e para o medidor do teste de microfone: é a mesma pergunta
 * ("quanto sinal tem aqui"), e ter duas implementações era ter duas escalas.
 */
export function rmsDeAmostras(amostras: ArrayLike<number>): number {
  if (amostras.length === 0) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i += 1) {
    const x = (amostras[i] - 128) / 128;
    soma += x * x;
  }
  return Math.sqrt(soma / amostras.length);
}

/**
 * Limiar de fala do detector local.
 *
 * O anel responde "há som saindo do meu microfone", não "passou do limiar do
 * SFU" — não é sensibilidade de captura, é o indicador refletir o que já está
 * sendo transmitido. Como o detector mede a faixa já processada (depois do
 * supressor de ruído e do ganho), é o supressor quem filtra o fundo, não este
 * número: ele só separa silêncio digital/ruído residual de som de verdade,
 * então qualquer fala, mesmo baixa, passa (≈ −46 dBFS).
 */
export const LIMIAR_DE_FALA = 0.005;

/**
 * Quanto o anel fica aceso depois de o nível cair.
 *
 * Sem esta folga o anel pisca entre as sílabas — a fala tem pausas de 100 ms o
 * tempo todo, e um detector sem soltura as desenha todas.
 */
export const SOLTURA_DA_FALA_MS = 250;

export interface EstadoDeFala {
  falando: boolean;
  /** enquanto `agora` for menor que isto, continua aceso mesmo em silêncio. */
  ateMs: number;
}

export const FALA_INICIAL: EstadoDeFala = { falando: false, ateMs: 0 };

/**
 * Um passo do detector: nível medido agora vira "está falando" com ataque
 * imediato e soltura com folga. Devolve o **mesmo** objeto quando nada muda,
 * para o chamador poder sair cedo.
 */
export function passoDeFala(
  estado: EstadoDeFala,
  nivel: number,
  agoraMs: number,
  limiar: number = LIMIAR_DE_FALA,
  solturaMs: number = SOLTURA_DA_FALA_MS,
): EstadoDeFala {
  if (nivel >= limiar) return { falando: true, ateMs: agoraMs + solturaMs };
  if (!estado.falando) return estado;
  if (agoraMs < estado.ateMs) return estado;
  return FALA_INICIAL;
}
