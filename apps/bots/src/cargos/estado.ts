import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODO_PADRAO, normalizarModo, type Modo } from "./modos";
import type { ChaveDeEmoji } from "./emoji";

/**
 * O estado dos painéis: **um arquivo JSON por servidor**, em volume próprio.
 *
 * ## Por que não uma tabela no banco do Streamz
 *
 * Porque o banco do Streamz é o produto, e um bot oficial não é motivo para
 * uma migration: a tabela viraria contrato entre `apps/api` e `apps/bots`, e
 * qualquer bot novo pediria a sua. O estado aqui é pequeno (dezenas de linhas
 * por servidor), só este processo escreve, e perdê-lo custa refazer um painel —
 * não é dado do usuário.
 *
 * ## Escrita atômica
 *
 * `write` num `.tmp` do **mesmo diretório** e `rename` por cima. O `rename`
 * dentro de um sistema de arquivos é atômico no POSIX: ou o arquivo antigo
 * está lá inteiro, ou o novo está lá inteiro. Sem isso, um `docker stop` no
 * meio de um `writeFile` deixa um JSON cortado ao meio — e um JSON cortado ao
 * meio some com todos os painéis do servidor na próxima subida, calado.
 *
 * Tudo é síncrono de propósito: os arquivos têm poucos KB, o processo é um só,
 * e `readFileSync`/`renameSync` eliminam a classe inteira de bug de duas
 * escritas intercaladas sem precisar de trava.
 *
 * ## Reconciliação
 *
 * Painel cujo canal ou mensagem sumiu é **esquecido** na subida
 * (`reconciliar`), sem derrubar o bot: alguém apagou a mensagem do painel, ou o
 * canal inteiro, e insistir nele só renderia um erro por reação para sempre.
 */

/** Um emoji do painel e o cargo que ele dá. */
export interface ItemDePainel {
  cargoId: string;
  /** O rótulo que aparece na mensagem. Vazio = só o nome do cargo. */
  rotulo: string;
  /** Como escrever o emoji (`👍` ou `<:festa:1414…>`). */
  emoji: string;
  /** O que mandar para a rota de reação (`👍` ou `festa:1414…`). */
  paraReagir: string;
}

/** Um painel: a mensagem que o bot publicou e o que cada reação dela faz. */
export interface Painel {
  canalId: string;
  titulo: string;
  descricao: string;
  modo: Modo;
  criadoEm: string;
  /** `chave do emoji → item`. A chave é a de `emoji.ts`. */
  itens: Record<ChaveDeEmoji, ItemDePainel>;
}

/** O arquivo de um servidor. */
export interface EstadoDoServidor {
  versao: 1;
  /** `messageId → painel`. O id do painel **é** o id da mensagem. */
  paineis: Record<string, Painel>;
}

export const DIRETORIO_PADRAO = "/dados";

export function diretorioDoEstado(): string {
  return process.env.CARGOS_DIR?.trim() || DIRETORIO_PADRAO;
}

/**
 * Só snowflake vira nome de arquivo.
 *
 * O `guildId` vem do gateway e é sempre numérico, mas um `../../etc/passwd`
 * chegando aqui escreveria fora do volume — e a checagem custa uma regex.
 */
const ID_VALIDO = /^[0-9A-Za-z_-]{1,64}$/;

function vazio(): EstadoDoServidor {
  return { versao: 1, paineis: {} };
}

/**
 * Lê o que estiver no disco e **descarta o que não entende**.
 *
 * Um item sem `cargoId`, um modo que não existe mais, um painel sem canal: em
 * vez de derrubar o bot com um `TypeError` na primeira reação, some com a
 * linha torta e segue. O que se perde é um item de painel; o que se ganha é o
 * bot no ar.
 */
export function normalizarEstado(bruto: unknown): EstadoDoServidor {
  const estado = vazio();
  const raiz = bruto as { paineis?: Record<string, unknown> } | null;
  const paineis = raiz && typeof raiz === "object" ? raiz.paineis : undefined;
  if (!paineis || typeof paineis !== "object") return estado;

  for (const [mensagemId, cru] of Object.entries(paineis)) {
    const p = cru as Partial<Painel> | null;
    if (!p || typeof p !== "object" || typeof p.canalId !== "string" || p.canalId === "") continue;

    const itens: Record<string, ItemDePainel> = {};
    for (const [chave, item] of Object.entries(p.itens ?? {})) {
      const i = item as Partial<ItemDePainel> | null;
      if (!i || typeof i.cargoId !== "string" || i.cargoId === "") continue;
      itens[chave] = {
        cargoId: i.cargoId,
        rotulo: typeof i.rotulo === "string" ? i.rotulo : "",
        emoji: typeof i.emoji === "string" ? i.emoji : chave.replace(/^u:/, ""),
        paraReagir: typeof i.paraReagir === "string" ? i.paraReagir : chave.replace(/^u:/, ""),
      };
    }

    estado.paineis[mensagemId] = {
      canalId: p.canalId,
      titulo: typeof p.titulo === "string" ? p.titulo : "Cargos",
      descricao: typeof p.descricao === "string" ? p.descricao : "",
      modo: normalizarModo(p.modo) ?? MODO_PADRAO,
      criadoEm: typeof p.criadoEm === "string" ? p.criadoEm : new Date(0).toISOString(),
      itens,
    };
  }
  return estado;
}

/**
 * Os arquivos de painel, com um cache em memória.
 *
 * O cache existe porque o caminho quente é a reação: uma leitura de disco por
 * reação de cada pessoa em cada painel seria gratuita. Só este processo
 * escreve, então o cache nunca fica velho.
 */
export class DepositoDePaineis {
  private readonly cache = new Map<string, EstadoDoServidor>();

  constructor(private readonly diretorio: string = diretorioDoEstado()) {}

  /** Cria o diretório se preciso. Chamado uma vez, na subida. */
  preparar(): void {
    mkdirSync(this.diretorio, { recursive: true });
  }

  /** Os servidores que têm arquivo — é por onde a reconciliação começa. */
  servidoresConhecidos(): string[] {
    try {
      return readdirSync(this.diretorio)
        .filter((n) => n.endsWith(".json"))
        .map((n) => n.slice(0, -".json".length))
        .filter((id) => ID_VALIDO.test(id));
    } catch {
      // diretório ainda não existe: nenhum painel, e não é erro
      return [];
    }
  }

  caminho(guildId: string): string {
    if (!ID_VALIDO.test(guildId)) throw new Error(`id de servidor inválido: ${guildId}`);
    return join(this.diretorio, `${guildId}.json`);
  }

  /** O estado de um servidor. Nunca lança: arquivo torto vira estado vazio. */
  ler(guildId: string): EstadoDoServidor {
    const emMemoria = this.cache.get(guildId);
    if (emMemoria) return emMemoria;

    let estado = vazio();
    try {
      estado = normalizarEstado(JSON.parse(readFileSync(this.caminho(guildId), "utf8")));
    } catch {
      // não existe, ou está ilegível: começa vazio (ver o cabeçalho)
    }
    this.cache.set(guildId, estado);
    return estado;
  }

  /** Grava — `.tmp` + `rename`, ver o cabeçalho. Some com o arquivo se ficou vazio. */
  gravar(guildId: string, estado: EstadoDoServidor): void {
    this.cache.set(guildId, estado);
    const destino = this.caminho(guildId);

    if (Object.keys(estado.paineis).length === 0) {
      // Servidor sem painel nenhum não precisa de arquivo. Isso é o que faz o
      // `/painel apagar` do último painel não deixar lixo para a próxima
      // reconciliação varrer.
      try {
        rmSync(destino, { force: true });
      } catch {
        /* já não estava lá */
      }
      return;
    }

    mkdirSync(this.diretorio, { recursive: true });
    const temporario = `${destino}.tmp`;
    writeFileSync(temporario, `${JSON.stringify(estado, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporario, destino);
  }

  /** Lê, deixa `mudar` mexer, grava. O jeito de não esquecer o `gravar`. */
  editar(guildId: string, mudar: (estado: EstadoDoServidor) => void): EstadoDoServidor {
    const estado = this.ler(guildId);
    mudar(estado);
    this.gravar(guildId, estado);
    return estado;
  }
}
