import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Observable } from "rxjs";
import { aplicarContentTypeDoDiscord } from "./content-type";
import { CODIGO, ErroDoDiscord } from "./erros";
import type { RequisicaoDeBot } from "./tipos";

/**
 * Os cabeçalhos `X-RateLimit-*` que o `@discordjs/rest` usa para montar os
 * buckets por rota.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * Se eles não vierem, a lib **não quebra** (trata a rota como sem limite), mas
 * perde o enfileiramento e, num 429 sem `retry_after`, entra em retry cego.
 * Então mandamos sempre:
 *
 * ```
 * X-RateLimit-Limit: 50
 * X-RateLimit-Remaining: 47
 * X-RateLimit-Reset: 1789045123.482      # epoch em segundos, com fração
 * X-RateLimit-Reset-After: 0.518         # segundos
 * X-RateLimit-Bucket: <string opaca e estável por rota+recurso>
 * ```
 *
 * E no 429: `Retry-After`, `X-RateLimit-Scope: user`, e o corpo
 * `{"message":"You are being rate limited.","retry_after":0.734,"global":false}`
 * — `retry_after` é **float em segundos**. Errar a unidade faz o bot dormir 700
 * segundos.
 *
 * A contagem é por `bot:<applicationId>`, teto de 50 req/s (o mesmo do
 * Discord). Ver §5, "Rate limit".
 *
 * ## Por que um balde próprio, e não o `ThrottlerStorage` do `@nestjs/throttler`
 *
 * O §5 sugeria reaproveitar o storage (que tem Redis quando há `REDIS_URL`).
 * Três coisas não encaixam, e as três são visíveis pelo bot:
 *
 * 1. **Precisão.** `ThrottlerStorage.increment` devolve `timeToExpire` em
 *    segundos inteiros (`Math.ceil(ms / 1000)`). Numa janela de 1 s isso é
 *    sempre `1`: o `X-RateLimit-Reset` nunca se moveria e todo 429 mandaria o
 *    bot dormir um segundo cheio. Os cabeçalhos do Discord são fracionários de
 *    propósito.
 * 2. **Custo.** O storage em memória agenda um `setTimeout` por acerto; a 50
 *    req/s por bot são 50 temporizadores vivos por bot, para contar o que uma
 *    subtração conta.
 * 3. **O corpo do 429.** O do Discord é `{message, retry_after, global}` — e a
 *    `ThrottlerException` produz o `{statusCode, message}` do Nest, que o
 *    `FiltroDeErrosDoDiscord` traduziria para `{code: 0, message}`, perdendo o
 *    `retry_after`. Aqui o 429 é uma `ErroDoDiscord` com o corpo ajustado
 *    (`LimiteExcedido`, abaixo), então continua havendo **um só** caminho de
 *    erro — o filtro que todo controller de compat já declara.
 *
 * **Dívida registrada:** a contagem é **desta instância**. Hoje a API roda num
 * contêiner só (a mesma ressalva do §7 para a ponte de eventos); com N
 * instâncias o teto efetivo vira N × 50/s e é preciso um contador em Redis com
 * precisão de milissegundo.
 */

/** Requisições por segundo, por bot. É o teto do Discord (§5). */
const TETO_POR_SEGUNDO = 50;

/** Tamanho da janela, em ms. */
const JANELA_MS = 1000;

/**
 * Baldes ociosos são varridos quando o mapa passa disto.
 *
 * Sem a varredura, um bot que sumiu deixaria a chave dele para sempre — é
 * cache de contagem, não registro.
 */
const TETO_DE_BALDES = 10_000;

/** O mínimo do `Response` do Express que o interceptor usa. */
interface RespostaHttp {
  setHeader(nome: string, valor: string): void;
}

/**
 * O 429, no corpo exato do Discord.
 *
 * É uma `ErroDoDiscord` para cair no `FiltroDeErrosDoDiscord` como todo o
 * resto — mas o corpo do 429 do Discord **não tem `code`** e tem `retry_after`,
 * e o construtor de `ErroDoDiscord` só sabe montar `{code, message}`. Como
 * `getResponse()` devolve o próprio objeto, ele é ajustado aqui, uma vez, na
 * construção.
 *
 * A alternativa era escrever a resposta na mão dentro do interceptor e devolver
 * `EMPTY` — e ela **quebra**: o Nest faz `lastValueFrom` do que o interceptor
 * devolve, `EMPTY` levanta `EmptyError`, o filtro tenta responder por cima do
 * que já foi escrito e o processo morre com `ERR_HTTP_HEADERS_SENT`. Um 429
 * derrubava a API inteira; foi assim que se descobriu.
 */
class LimiteExcedido extends ErroDoDiscord {
  constructor(retryAfterSegundos: number) {
    super(HttpStatus.TOO_MANY_REQUESTS, CODIGO.GERAL, "You are being rate limited.");
    const corpo = this.getResponse() as Record<string, unknown>;
    delete corpo.code;
    // segundos, com fração. Em milissegundos, o bot dormiria 700 vezes mais.
    corpo.retry_after = retryAfterSegundos;
    corpo.global = false;
  }
}

/** Uma janela de contagem. */
interface Balde {
  /** quantas requisições já entraram na janela em curso. */
  usadas: number;
  /** epoch em ms em que a janela zera. */
  reiniciaEm: number;
}

@Injectable()
export class RateLimitDoDiscordInterceptor implements NestInterceptor {
  private readonly baldes = new Map<string, Balde>();

  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const http = contexto.switchToHttp();
    const req = http.getRequest<RequisicaoDeBot>();
    const res = http.getResponse<RespostaHttp>();

    // O guard corre antes do interceptor no Nest, então `req.bot` existe em toda
    // rota de compat. O `anonimo` é a rede de segurança para a ordem mudar um
    // dia: contar por bot inexistente é melhor que não contar.
    const chave = `bot:${req.bot?.applicationId ?? "anonimo"}`;
    const agora = Date.now();
    const balde = this.balde(chave, agora);

    const restantesAntes = Math.max(0, TETO_POR_SEGUNDO - balde.usadas);
    const faltaMs = Math.max(0, balde.reiniciaEm - agora);

    // `application/json` sem `; charset=utf-8`: o discord.py compara o cabeçalho
    // por igualdade exata e, com o charset, entrega **todo** corpo como string.
    // Ver `content-type.ts` — foi o que reprovou a prova 4 da F1.
    aplicarContentTypeDoDiscord(res);

    res.setHeader("X-RateLimit-Limit", String(TETO_POR_SEGUNDO));
    res.setHeader("X-RateLimit-Bucket", bucketDaRota(contexto, req));
    res.setHeader("X-RateLimit-Reset", segundos(balde.reiniciaEm));
    res.setHeader("X-RateLimit-Reset-After", segundos(faltaMs));

    if (restantesAntes === 0) {
      res.setHeader("X-RateLimit-Remaining", "0");
      // `Retry-After` é o cabeçalho HTTP clássico, em segundos inteiros; quem
      // dorme com precisão é o `retry_after` do corpo.
      res.setHeader("Retry-After", String(Math.ceil(faltaMs / 1000)));
      res.setHeader("X-RateLimit-Scope", "user");
      // os cabeçalhos acima sobrevivem: o filtro só escreve status e corpo
      throw new LimiteExcedido(Number(segundos(faltaMs)));
    }

    balde.usadas += 1;
    res.setHeader("X-RateLimit-Remaining", String(restantesAntes - 1));
    return proximo.handle();
  }

  /** O balde da chave, com a janela já rolada se venceu. */
  private balde(chave: string, agora: number): Balde {
    const atual = this.baldes.get(chave);
    if (atual && atual.reiniciaEm > agora) return atual;

    if (this.baldes.size >= TETO_DE_BALDES) this.varrer(agora);
    const novo: Balde = { usadas: 0, reiniciaEm: agora + JANELA_MS };
    this.baldes.set(chave, novo);
    return novo;
  }

  /** Tira os baldes cuja janela já venceu. */
  private varrer(agora: number) {
    for (const [chave, balde] of this.baldes) {
      if (balde.reiniciaEm <= agora) this.baldes.delete(chave);
    }
  }
}

/** Epoch (ou duração) em ms → segundos com três casas, como o Discord manda. */
function segundos(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * A string opaca e estável do bucket.
 *
 * O `@discordjs/rest` usa o valor só como **chave** da fila que ele mantém por
 * rota: rotas com o mesmo bucket esperam juntas. Então o que importa é ser
 * estável entre reinícios e distinguir rota + recurso maior — que no Discord é
 * o canal, o servidor ou o webhook. O hash é curto para não inchar o cabeçalho e
 * para não anunciar o nome interno das nossas classes.
 */
function bucketDaRota(contexto: ExecutionContext, req: RequisicaoDeBot): string {
  const params = (req.params ?? {}) as Record<string, string>;
  // o `:id` de toda rota de compat é o recurso maior (canal, servidor, usuário)
  const cru = [
    contexto.getClass().name,
    contexto.getHandler().name,
    params.id ?? "-",
  ].join(":");
  return createHash("sha1").update(cru).digest("base64url").slice(0, 22);
}
