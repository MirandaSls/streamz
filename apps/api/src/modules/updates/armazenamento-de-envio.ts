import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CAMPOS_DE_ENVIO,
  LIMITE_DA_ASSINATURA,
  type CampoDeEnvio,
} from "./publicacao";

/**
 * O que o `StorageEngine` abaixo devolve para cada arquivo — o multer mescla
 * estes campos no objeto do arquivo que chega ao handler.
 */
export interface ArquivoRecebido {
  fieldname: string;
  originalname: string;
  size: number;
  /** Temporário no disco (`dmg`, `bundle`), na **mesma pasta** do destino. */
  caminhoTemporario?: string;
  /** Conteúdo em memória (só o `sig`, que tem centenas de bytes). */
  buffer?: Buffer;
  sha256: string;
  /** O que a assinatura minisign `ED` assina — calculado no mesmo passe. */
  blake2b512: Buffer;
  /** Primeiros 16 bytes (gzip) e últimos 512 (trailer `koly` do dmg). */
  inicio: Buffer;
  fim: Buffer;
}

/** Prefixo dos temporários: começa com ponto, então nenhuma rota os serve. */
export const PREFIXO_TEMPORARIO = ".envio-";

/** Só a forma que o multer usa — `multer` não é dependência direta da api. */
interface ArquivoDoMulter {
  fieldname: string;
  originalname: string;
  stream: Readable;
}
type Retorno = (erro?: unknown, info?: Partial<ArquivoRecebido>) => void;

/**
 * `StorageEngine` do multer que grava **direto no destino final** (pasta de
 * `downloads` para o `.dmg`, de `updates` para o `.app.tar.gz`), com nome
 * temporário, calculando sha256 e BLAKE2b-512 enquanto escreve.
 *
 * Por que não o `memoryStorage` dos outros uploads da API: um `.dmg` universal
 * passa de 100 MB, e a API roda com `mem_limit: 1g`. Por que na mesma pasta:
 * a publicação vira um `link` (atômico, sem cópia) do temporário para o nome
 * final — dois sistemas de arquivos diferentes obrigariam a copiar.
 *
 * O multer chama `_removeFile` sozinho quando a requisição falha no meio
 * (limite de tamanho, campo inesperado); o sucesso é responsabilidade de quem
 * publica (`PublicacaoMacosService`), que sempre apaga os temporários.
 */
export function armazenamentoDeEnvio(destino: (campo: CampoDeEnvio) => string) {
  return {
    _handleFile(_req: unknown, arquivo: ArquivoDoMulter, pronto: Retorno): void {
      receber(arquivo, destino).then(
        (info) => pronto(null, info),
        (erro) => {
          arquivo.stream.resume();
          pronto(erro);
        },
      );
    },
    _removeFile(
      _req: unknown,
      arquivo: Partial<ArquivoRecebido>,
      pronto: (erro: Error | null) => void,
    ): void {
      if (!arquivo.caminhoTemporario) return pronto(null);
      unlink(arquivo.caminhoTemporario).then(
        () => pronto(null),
        () => pronto(null),
      );
    },
  };
}

async function receber(
  arquivo: ArquivoDoMulter,
  destino: (campo: CampoDeEnvio) => string,
): Promise<Partial<ArquivoRecebido>> {
  const campo = arquivo.fieldname as CampoDeEnvio;
  if (!CAMPOS_DE_ENVIO.includes(campo)) {
    throw new HttpException(`Campo de arquivo inesperado: ${arquivo.fieldname}`, HttpStatus.BAD_REQUEST);
  }

  const sha256 = createHash("sha256");
  const blake = createHash("blake2b512");
  let size = 0;
  let inicio = Buffer.alloc(0);
  let fim = Buffer.alloc(0);
  const partes: Buffer[] = [];
  const emMemoria = campo === "sig";

  async function* contar(fonte: AsyncIterable<Buffer>) {
    for await (const pedaco of fonte) {
      size += pedaco.length;
      if (emMemoria && size > LIMITE_DA_ASSINATURA) {
        throw new HttpException("O .sig passa do tamanho de uma assinatura", HttpStatus.PAYLOAD_TOO_LARGE);
      }
      sha256.update(pedaco);
      blake.update(pedaco);
      if (inicio.length < 16) inicio = Buffer.concat([inicio, pedaco.subarray(0, 16 - inicio.length)]);
      fim = Buffer.concat([fim, pedaco]);
      if (fim.length > 512) fim = fim.subarray(fim.length - 512);
      if (emMemoria) partes.push(pedaco);
      else yield pedaco;
    }
  }

  let caminhoTemporario: string | undefined;
  if (emMemoria) {
    // consome sem gravar: o gerador acumula em `partes`
    for await (const _ of contar(arquivo.stream)) void _;
  } else {
    const pasta = destino(campo);
    caminhoTemporario = join(pasta, `${PREFIXO_TEMPORARIO}${randomUUID()}.parcial`);
    try {
      await mkdir(pasta, { recursive: true });
      await pipeline(arquivo.stream, contar, createWriteStream(caminhoTemporario, { flags: "wx", mode: 0o644 }));
    } catch (erro) {
      await unlink(caminhoTemporario).catch(() => undefined);
      throw traduzirErroDeDisco(erro, pasta);
    }
  }

  return {
    size,
    caminhoTemporario,
    buffer: emMemoria ? Buffer.concat(partes) : undefined,
    sha256: sha256.digest("hex"),
    blake2b512: blake.digest(),
    inicio,
    fim,
  };
}

/**
 * Erro de permissão vira uma mensagem que diz o que fazer: o contêiner roda
 * como `node` (uid 1000) e a pasta do host costuma ser do root.
 */
export function traduzirErroDeDisco(erro: unknown, pasta: string): unknown {
  if (erro instanceof HttpException) return erro;
  const codigo = (erro as NodeJS.ErrnoException)?.code;
  if (codigo === "EACCES" || codigo === "EROFS" || codigo === "EPERM") {
    return new ServiceUnavailableException(
      `Sem permissão de escrita em ${pasta} (${codigo}). No host: a pasta precisa ser gravável pelo uid 1000 do contêiner e o volume não pode ser :ro.`,
    );
  }
  if (codigo === "ENOSPC") return new ServiceUnavailableException(`Disco cheio ao gravar em ${pasta}`);
  return erro;
}
