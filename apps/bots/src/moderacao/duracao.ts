/**
 * O parser de duração do `/silenciar` — `10m`, `1h`, `7d`.
 *
 * Função pura, testada, e separada por um motivo prático: é a peça em que um
 * erro passa despercebido. `1d` interpretado como um minuto silencia alguém por
 * 60 segundos e o moderador só descobre no dia seguinte; `60` sem unidade
 * interpretado como 60 **minutos** silencia alguém por uma hora quando ele
 * quis um minuto. Nos dois casos nada falha, nada aparece no log, e o defeito é
 * uma reclamação de usuário uma semana depois.
 *
 * As unidades são as do Discord (`s`, `m`, `h`, `d`) e o teto é o dele:
 * 28 dias. Não é capricho de paridade — é o que a `communication_disabled_until`
 * aceita, e mandar mais que isso rende um 400 que o moderador não sabe ler.
 */

/** O teto do timeout, o mesmo do Discord: 28 dias. */
export const MAXIMO_MS = 28 * 24 * 60 * 60 * 1000;

/** O piso: menos de um segundo não é silêncio, é ruído. */
export const MINIMO_MS = 1000;

const UNIDADES: Record<string, number> = {
  s: 1000,
  seg: 1000,
  segundo: 1000,
  segundos: 1000,
  m: 60_000,
  min: 60_000,
  minuto: 60_000,
  minutos: 60_000,
  h: 3_600_000,
  hora: 3_600_000,
  horas: 3_600_000,
  d: 86_400_000,
  dia: 86_400_000,
  dias: 86_400_000,
  // `sem` e não `w`: quem digita em português escreve semana, e `s` já é
  // segundo. Um `w` solto também é aceito porque é o que a metade da internet
  // usa.
  sem: 604_800_000,
  semana: 604_800_000,
  semanas: 604_800_000,
  w: 604_800_000,
};

export type Duracao =
  | { ok: true; ms: number }
  | { ok: false; motivo: "vazia" | "formato" | "curta" | "longa" };

/**
 * `"1h30m"` → `{ ok: true, ms: 5400000 }`.
 *
 * Aceita partes somadas (`1h30m`), espaço entre elas (`1h 30m`), vírgula
 * decimal (`1,5h`) e maiúsculas. **Recusa número sem unidade**: `10` poderia
 * ser dez segundos ou dez minutos, e adivinhar é exatamente o erro que este
 * módulo existe para evitar.
 */
export function analisarDuracao(bruta: string | null | undefined): Duracao {
  const texto = (bruta ?? "").trim().toLowerCase();
  if (texto === "") return { ok: false, motivo: "vazia" };

  const partes = texto.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-zç]+)/g);
  let ms = 0;
  let achou = false;
  let consumido = 0;

  for (const parte of partes) {
    const numero = Number(parte[1]!.replace(",", "."));
    const fator = UNIDADES[parte[2]!];
    if (!Number.isFinite(numero) || fator === undefined) return { ok: false, motivo: "formato" };
    ms += numero * fator;
    achou = true;
    consumido += parte[0]!.length;
  }

  // O que sobrou fora das partes casadas só pode ser espaço ou `+`. Sem esta
  // conferência, `10m banido por spam` viraria dez minutos e o resto sumiria em
  // silêncio — o mesmo defeito que o `restoDaLinha` evita no prefixo `!`.
  const resto = texto.replace(/(\d+(?:[.,]\d+)?)\s*([a-zç]+)/g, "").replace(/[\s+]/g, "");
  if (!achou || resto !== "" || consumido === 0) return { ok: false, motivo: "formato" };

  ms = Math.round(ms);
  if (ms < MINIMO_MS) return { ok: false, motivo: "curta" };
  if (ms > MAXIMO_MS) return { ok: false, motivo: "longa" };
  return { ok: true, ms };
}

/** A frase que o bot responde quando a duração não serve. */
export function explicarDuracao(motivo: Exclude<Duracao, { ok: true }>["motivo"]): string {
  if (motivo === "vazia") return "Diz por quanto tempo: `60s`, `10m`, `1h`, `1d`, `7d`.";
  if (motivo === "curta") return "O mínimo é 1 segundo.";
  if (motivo === "longa") return "O máximo é 28 dias — é o teto do silenciamento.";
  return "Não entendi a duração. Use número + unidade: `60s`, `10m`, `1h`, `1d`, `7d`.";
}

/**
 * `5400000` → `"1 h 30 min"`. O inverso do parser, para a confirmação e o
 * registro.
 *
 * Escreve só as duas maiores unidades não nulas: "7 d" e não
 * "7 d 0 h 0 min 0 s", e "1 h 30 min" e não "1 h 30 min 0 s".
 */
export function escreverDuracao(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return "0 s";
  const total = Math.floor(ms / 1000);
  const partes: string[] = [];
  const escala: [number, string][] = [
    [86_400, "d"],
    [3_600, "h"],
    [60, "min"],
    [1, "s"],
  ];
  let sobra = total;
  for (const [segundos, rotulo] of escala) {
    const quantos = Math.floor(sobra / segundos);
    if (quantos > 0) partes.push(`${quantos} ${rotulo}`);
    sobra -= quantos * segundos;
    if (partes.length === 2) break;
  }
  return partes.join(" ");
}
