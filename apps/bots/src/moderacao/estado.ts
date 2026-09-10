/**
 * O estado do bot de moderação: **um arquivo JSON por servidor**.
 *
 * ## Por que não uma tabela no banco do Streamz
 *
 * Porque a fundação dos bots oficiais não previu estado, e acrescentar uma
 * tabela significaria mexer em `apps/api` — o `schema.prisma`, uma migration e
 * um módulo — que é exatamente o terreno compartilhado que o `CONTRATO.md`
 * manda um bot novo não pisar ("um bot = uma pasta em `src/`"). Cinco bots
 * nascendo ao mesmo tempo, cada um com a sua migration, dariam o conflito que o
 * contrato existe para evitar; e o conflito numa migration não é o tipo que o
 * `git` resolve.
 *
 * O preço é conhecido e está escrito aqui embaixo, no "caminho de migração".
 *
 * ## O formato
 *
 * `<DIR>/<guildSnowflake>.json`, com `DIR` em `MODERACAO_DIR` (padrão
 * `/dados`, que no compose é um volume só deste container). Um arquivo **por
 * servidor** e não um só: um servidor grande não trava a escrita dos outros, e
 * um arquivo corrompido custa um servidor, não todos.
 *
 * ## A escrita é atômica
 *
 * `write` num temporário no **mesmo diretório**, `fsync`, `rename`. O `rename`
 * dentro do mesmo sistema de arquivos é atômico no POSIX: quem ler durante a
 * troca vê o arquivo antigo inteiro ou o novo inteiro, nunca meio JSON. Sem
 * isso, um `docker stop` no meio de um `writeFile` deixa um arquivo truncado —
 * e um JSON truncado é um servidor que perde todos os avisos na próxima subida.
 *
 * As escritas de um mesmo servidor são **enfileiradas** (`emFila`): dois
 * `/aviso` no mesmo segundo entrariam em corrida de leitura-modificação-escrita
 * e um dos dois sumiria em silêncio.
 *
 * ## Caminho de migração para o banco
 *
 * Quando os bots oficiais ganharem estado de verdade na API — a forma natural é
 * uma tabela `BotGuildState { applicationId, guildId, chave, valor Json }` com
 * rota `GET/PUT /api/v10/applications/:app/guilds/:gid/estado` atrás do
 * `BotTokenGuard` —, este módulo vira a **única** peça a trocar: a interface
 * (`ler`, `escrever`) já é assíncrona por isso. A migração é um laço sobre os
 * arquivos deste diretório mandando cada um para a rota nova; o `versao: 1` no
 * corpo existe para esse laço saber o que está lendo.
 */

import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AvisoGuardado } from "./formatar";

/** A versão do formato gravado. Sobe quando o corpo mudar de forma. */
export const VERSAO = 1;

export interface EstadoDoServidor {
  versao: number;
  /** Snowflake do canal onde o bot publica cada ação. `null` = não configurado. */
  canalDeRegistro: string | null;
  /** Avisos por snowflake de usuário. */
  avisos: Record<string, AvisoGuardado[]>;
  /** Contador do `#id` dos avisos. Nunca reaproveitado, mesmo depois de apagar. */
  proximoAviso: number;
}

export function estadoVazio(): EstadoDoServidor {
  return { versao: VERSAO, canalDeRegistro: null, avisos: {}, proximoAviso: 1 };
}

/** O diretório do volume. Configurável para os testes e para a bancada. */
export function diretorio(): string {
  return process.env.MODERACAO_DIR?.trim() || "/dados";
}

/**
 * O nome do arquivo, **sanitizado**.
 *
 * O snowflake vem de `ctx.guildId`, que a nossa API produz, mas o dia em que
 * ele vier de outro lugar não pode ser o dia em que um `../../etc/algo` escreve
 * fora do volume. Só dígito passa.
 */
export function arquivoDe(guildId: string): string {
  const limpo = guildId.replace(/[^0-9A-Za-z_-]/g, "");
  if (limpo === "") throw new Error(`id de servidor inválido: ${JSON.stringify(guildId)}`);
  return join(diretorio(), `${limpo}.json`);
}

// ── leitura, com cache e fila de escrita ────────────────────────────────────

const cache = new Map<string, EstadoDoServidor>();
const emFila = new Map<string, Promise<unknown>>();

/**
 * Valida o que veio do disco antes de confiar nele.
 *
 * Um arquivo editado à mão (ou escrito por uma versão futura) não pode virar
 * `undefined.push` três camadas adiante: o que não bater com a forma esperada é
 * substituído pelo vazio daquele campo, e o resto do arquivo sobrevive.
 */
export function normalizar(bruto: unknown): EstadoDoServidor {
  const vazio = estadoVazio();
  if (!bruto || typeof bruto !== "object") return vazio;
  const obj = bruto as Partial<EstadoDoServidor>;

  const avisos: Record<string, AvisoGuardado[]> = {};
  if (obj.avisos && typeof obj.avisos === "object") {
    for (const [usuario, lista] of Object.entries(obj.avisos)) {
      if (!Array.isArray(lista)) continue;
      const limpos = lista.filter(
        (a): a is AvisoGuardado =>
          Boolean(a) &&
          typeof a === "object" &&
          typeof (a as AvisoGuardado).id === "number" &&
          typeof (a as AvisoGuardado).motivo === "string" &&
          typeof (a as AvisoGuardado).quando === "number",
      );
      if (limpos.length > 0) avisos[usuario] = limpos;
    }
  }

  const maiorId = Object.values(avisos)
    .flat()
    .reduce((maior, a) => Math.max(maior, a.id), 0);

  return {
    versao: typeof obj.versao === "number" ? obj.versao : VERSAO,
    canalDeRegistro: typeof obj.canalDeRegistro === "string" ? obj.canalDeRegistro : null,
    avisos,
    // O contador nunca pode andar para trás: um `#3` reaproveitado apontaria
    // dois avisos diferentes no registro publicado.
    proximoAviso: Math.max(
      typeof obj.proximoAviso === "number" ? obj.proximoAviso : 1,
      maiorId + 1,
    ),
  };
}

/** O estado de um servidor. Arquivo ausente é estado vazio, não erro. */
export async function ler(guildId: string): Promise<EstadoDoServidor> {
  const guardado = cache.get(guildId);
  if (guardado) return guardado;

  let estado: EstadoDoServidor;
  try {
    const texto = await readFile(arquivoDe(guildId), "utf8");
    estado = normalizar(JSON.parse(texto));
  } catch (erro) {
    // `ENOENT` é o caminho normal: um servidor que nunca usou o bot não tem
    // arquivo. Qualquer outro erro (JSON quebrado, permissão) também cai no
    // vazio, mas quem chama recebe o aviso por `motivoDaFalha`.
    estado = estadoVazio();
    if ((erro as NodeJS.ErrnoException)?.code !== "ENOENT") {
      falhasDeLeitura.set(guildId, erro instanceof Error ? erro.message : String(erro));
    }
  }
  cache.set(guildId, estado);
  return estado;
}

/** Leituras que caíram no vazio por defeito, não por ausência. */
const falhasDeLeitura = new Map<string, string>();

/** `null` quando a última leitura foi limpa. Para o log, não para o usuário. */
export function motivoDaFalha(guildId: string): string | null {
  return falhasDeLeitura.get(guildId) ?? null;
}

/**
 * Lê, deixa `mudar` alterar, grava — **em fila por servidor**.
 *
 * Devolve o que `mudar` devolver, para o comando não precisar reler.
 */
export async function alterar<T>(
  guildId: string,
  mudar: (estado: EstadoDoServidor) => T | Promise<T>,
): Promise<T> {
  const anterior = emFila.get(guildId) ?? Promise.resolve();
  const proxima = anterior.then(async () => {
    const estado = await ler(guildId);
    const resultado = await mudar(estado);
    await gravar(guildId, estado);
    return resultado;
  });
  // A fila não pode morrer com um comando que falhou: sem este `catch` o
  // primeiro erro deixaria todas as escritas seguintes daquele servidor
  // penduradas numa promessa rejeitada.
  emFila.set(
    guildId,
    proxima.catch(() => undefined),
  );
  return proxima;
}

/**
 * A escrita atômica: temporário no mesmo diretório → `fsync` → `rename`.
 *
 * O `fsync` antes do `rename` é o que separa "atômico" de "atômico até a
 * máquina desligar": sem ele o `rename` pode chegar ao disco antes do conteúdo,
 * e a queda de energia deixa o nome novo apontando para um arquivo vazio.
 */
export async function gravar(guildId: string, estado: EstadoDoServidor): Promise<void> {
  const destino = arquivoDe(guildId);
  await mkdir(diretorio(), { recursive: true });

  const temporario = `${destino}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const corpo = `${JSON.stringify({ ...estado, versao: VERSAO }, null, 2)}\n`;

  await writeFile(temporario, corpo, { encoding: "utf8", mode: 0o600 });
  const arquivo = await open(temporario, "r+");
  try {
    await arquivo.sync();
  } finally {
    await arquivo.close();
  }
  await rename(temporario, destino);

  cache.set(guildId, estado);
  falhasDeLeitura.delete(guildId);
}

/** Só para os testes e para o desligamento: esquece o que está em memória. */
export function esquecer(): void {
  cache.clear();
  emFila.clear();
  falhasDeLeitura.clear();
}

/** Espera as escritas pendentes — o `aoDesligar` chama antes de o processo sair. */
export async function drenar(): Promise<void> {
  await Promise.allSettled([...emFila.values()]);
}

// ── as operações de que os comandos precisam ────────────────────────────────

/** Guarda um aviso e devolve o registro criado (com o `#id` definitivo). */
export async function guardarAviso(
  guildId: string,
  alvoId: string,
  aviso: Omit<AvisoGuardado, "id">,
): Promise<AvisoGuardado> {
  return alterar(guildId, (estado) => {
    const completo: AvisoGuardado = { id: estado.proximoAviso, ...aviso };
    estado.proximoAviso += 1;
    (estado.avisos[alvoId] ??= []).push(completo);
    return completo;
  });
}

/** Os avisos de alguém, do mais antigo para o mais novo (o embed reordena). */
export async function avisosDe(guildId: string, alvoId: string): Promise<AvisoGuardado[]> {
  const estado = await ler(guildId);
  return [...(estado.avisos[alvoId] ?? [])];
}

/** Apaga todos os avisos de alguém e devolve quantos eram. */
export async function limparAvisos(guildId: string, alvoId: string): Promise<number> {
  return alterar(guildId, (estado) => {
    const quantos = estado.avisos[alvoId]?.length ?? 0;
    delete estado.avisos[alvoId];
    return quantos;
  });
}

/** Define (ou tira, com `null`) o canal de registro. */
export async function definirCanalDeRegistro(
  guildId: string,
  canalId: string | null,
): Promise<void> {
  await alterar(guildId, (estado) => {
    estado.canalDeRegistro = canalId;
  });
}

/** O canal de registro configurado, ou `null`. */
export async function canalDeRegistro(guildId: string): Promise<string | null> {
  return (await ler(guildId)).canalDeRegistro;
}
