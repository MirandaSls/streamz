/**
 * A forma do estado de um servidor, e só isso: nenhuma leitura de disco mora
 * aqui (isso é o `estado.ts`).
 *
 * Separado do armazenamento de propósito — as regras puras (`ganho.ts`,
 * `ranking.ts`, `formatar.ts`) precisam **destes tipos** e não do `node:fs`.
 */

/** Onde o anúncio de subida de nível vai parar. */
export type ModoDeAnuncio =
  /** no canal onde a pessoa escreveu (o padrão) */
  | "mesmo"
  /** sempre num canal fixo (`canalDeAnuncio`) */
  | "canal"
  /** em lugar nenhum */
  | "desligado";

/** Um cargo entregue ao alcançar um nível. */
export interface CargoPorNivel {
  nivel: number;
  cargoId: string;
}

export interface ConfigDoServidor {
  anuncio: ModoDeAnuncio;
  /** Só vale com `anuncio: "canal"`. */
  canalDeAnuncio: string | null;
  /** Multiplica o XP de cada mensagem. `1` é o normal. */
  multiplicador: number;
  /** Canais onde escrever não dá XP (o `#flood`, o `#bots`). */
  canaisIgnorados: string[];
  cargosPorNivel: CargoPorNivel[];
}

export interface UsuarioDeNiveis {
  xp: number;
  mensagens: number;
  /** `Date.now()` do último ganho — é o que a carência olha. */
  ultimoGanhoEm: number;
}

/**
 * O arquivo de um servidor, inteiro.
 *
 * `versao` existe desde a primeira linha gravada: o dia em que este formato
 * mudar (ou migrar para o banco), quem lê precisa saber o que está lendo sem
 * adivinhar pelo formato dos campos.
 */
export interface EstadoDoServidor {
  versao: 1;
  config: ConfigDoServidor;
  usuarios: Record<string, UsuarioDeNiveis>;
}

export const MULTIPLICADOR_MINIMO = 0;
export const MULTIPLICADOR_MAXIMO = 5;

export function configPadrao(): ConfigDoServidor {
  return {
    anuncio: "mesmo",
    canalDeAnuncio: null,
    multiplicador: 1,
    canaisIgnorados: [],
    cargosPorNivel: [],
  };
}

export function estadoVazio(): EstadoDoServidor {
  return { versao: 1, config: configPadrao(), usuarios: {} };
}

export function usuarioVazio(): UsuarioDeNiveis {
  return { xp: 0, mensagens: 0, ultimoGanhoEm: 0 };
}

/**
 * Aceita um JSON de disco e devolve um estado **válido**, campo por campo.
 *
 * Não é paranoia: o arquivo é editável na mão (é um JSON num volume, e essa é
 * metade da graça de guardar assim), e um `multiplicador: "muito"` que passasse
 * daqui viraria `NaN` em todo XP do servidor — um estrago silencioso que só
 * apareceria dias depois, com o ranking inteiro zerado.
 */
export function sanearEstado(bruto: unknown): EstadoDoServidor {
  const entrada = (bruto ?? {}) as Partial<EstadoDoServidor>;
  const config = (entrada.config ?? {}) as Partial<ConfigDoServidor>;
  const padrao = configPadrao();

  const anuncio: ModoDeAnuncio =
    config.anuncio === "canal" || config.anuncio === "desligado" || config.anuncio === "mesmo"
      ? config.anuncio
      : padrao.anuncio;

  const multiplicador =
    typeof config.multiplicador === "number" && Number.isFinite(config.multiplicador)
      ? Math.min(Math.max(config.multiplicador, MULTIPLICADOR_MINIMO), MULTIPLICADOR_MAXIMO)
      : padrao.multiplicador;

  const cargosPorNivel = Array.isArray(config.cargosPorNivel)
    ? config.cargosPorNivel
        .filter(
          (c): c is CargoPorNivel =>
            !!c && Number.isFinite(c.nivel) && typeof c.cargoId === "string" && c.cargoId !== "",
        )
        .map((c) => ({ nivel: Math.max(1, Math.floor(c.nivel)), cargoId: c.cargoId }))
        .sort((a, b) => a.nivel - b.nivel)
    : [];

  const usuarios: Record<string, UsuarioDeNiveis> = {};
  for (const [id, valor] of Object.entries(entrada.usuarios ?? {})) {
    const u = (valor ?? {}) as Partial<UsuarioDeNiveis>;
    usuarios[id] = {
      xp: Number.isFinite(u.xp) ? Math.max(0, Math.floor(u.xp as number)) : 0,
      mensagens: Number.isFinite(u.mensagens) ? Math.max(0, Math.floor(u.mensagens as number)) : 0,
      ultimoGanhoEm: Number.isFinite(u.ultimoGanhoEm) ? (u.ultimoGanhoEm as number) : 0,
    };
  }

  return {
    versao: 1,
    config: {
      anuncio,
      canalDeAnuncio: typeof config.canalDeAnuncio === "string" ? config.canalDeAnuncio : null,
      multiplicador,
      canaisIgnorados: Array.isArray(config.canaisIgnorados)
        ? config.canaisIgnorados.filter((c): c is string => typeof c === "string" && c !== "")
        : [],
      cargosPorNivel,
    },
    usuarios,
  };
}
