/**
 * Validação da foto de perfil e do banner — inclusive **GIF animado**.
 *
 * O que muda em relação ao que havia antes: o arquivo continua sendo aceito
 * pelos bytes (`sniffImage`, magic-bytes, nunca pelo content-type declarado),
 * mas agora o GIF tem regras próprias, porque ele é o único formato que chega
 * aqui **do jeito que a pessoa escolheu**. Os outros passam pelo recorte do
 * cliente, que grava um WebP pequeno; recortar GIF num canvas achataria a
 * animação num quadro só, então o cliente desvia e manda o arquivo inteiro.
 *
 * Como a API não tem `sharp` (não está no lockfile nem na imagem Docker), não
 * há redimensionar nem recortar do lado de cá: o GIF é guardado byte a byte,
 * o que é justamente o que preserva a animação. Em troca, os limites são
 * verificados aqui — teto de bytes maior (8 MB) e um lado máximo em pixels,
 * já que nada vai reduzir a imagem depois.
 *
 * Funções puras de propósito: o service traduz o resultado em exceção HTTP.
 */

import {
  MAX_IMAGEM_DE_PERFIL_GIF,
  MAX_LADO_IMAGEM_DE_PERFIL_GIF,
  TIPOS_DE_IMAGEM_DE_PERFIL,
} from "@streamz/shared";
import { assinaturaGif, gifAnimado, sniffImage, webpAnimado } from "../uploads/media";

export type ResultadoDaImagemDePerfil =
  | {
      ok: true;
      mime: string;
      /** sufixo da chave no bucket — é dele que sai o content-type do proxy. */
      extensao: string;
      width: number | null;
      height: number | null;
      /** GIF com laço ou WebP com o bloco ANIM. */
      animado: boolean;
    }
  | { ok: false; motivo: string; grande?: boolean };

export interface LimitesDaImagemDePerfil {
  /** teto de bytes dos formatos que passam pelo recorte do cliente. */
  maxEstatico: number;
  /** como a imagem se chama no texto do erro ("Avatar", "Banner"). */
  rotulo: string;
}

const EXTENSAO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const MIME_DA_EXTENSAO: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Extensão do arquivo a partir do mime — vira o sufixo da chave no bucket. */
export function extensaoDe(mime: string): string {
  return EXTENSAO[mime] ?? "bin";
}

/**
 * Content-type que o proxy público (`GET /users/:id/avatar`) devolve.
 *
 * Vem da extensão gravada na chave, e não de uma coluna nova: o objeto no
 * bucket é escrito uma vez e a chave já viaja em todo lugar. Chaves criadas
 * antes desta mudança não têm extensão — para elas fica o `image/*` de antes,
 * que era o que a rota mandava para todo mundo. Um tipo exato importa mais
 * agora: a resposta vai com `X-Content-Type-Options: nosniff`, e é ele que
 * diz ao browser que aquilo é um GIF (e não um PNG que por acaso se mexe).
 */
export function contentTypeDaChave(chave: string): string {
  const extensao = chave.split(".").pop()?.toLowerCase() ?? "";
  return MIME_DA_EXTENSAO[extensao] ?? "image/*";
}

/** O que uma resposta precisa para os cabeçalhos abaixo (subconjunto de `ServerResponse`). */
export interface RespostaComCabecalhos {
  setHeader(nome: string, valor: string): unknown;
  removeHeader(nome: string): unknown;
}

/**
 * Cabeçalhos das duas imagens **públicas** de perfil (`/users/:id/avatar` e
 * `/users/:id/banner`).
 *
 * Elas não têm dono nem token: qualquer um que saiba a URL vê a foto — é assim
 * que um `<img src>` funciona, e é por isso que as rotas nem passam pelo
 * `JwtGuard`. O que faltava era **dizer isso ao cache do browser**.
 *
 * O `app.enableCors()` global (main.ts) trata toda resposta como se dependesse
 * de quem pediu: o pacote `cors` sempre acrescenta `Vary: Origin`, devolve
 * `Access-Control-Allow-Origin` **só** quando a requisição trouxe `Origin`, e
 * ainda manda `Access-Control-Allow-Credentials: true`. Para uma imagem pública
 * isso não é só supérfluo — quebra:
 *
 * - Um `<img src>` comum é `no-cors` e **não** manda `Origin`; a foto é
 *   guardada no cache como a variante "sem Origin".
 * - O palco da chamada lê a cor dominante da mesma foto com um
 *   `new Image(); crossOrigin = "anonymous"` (`apps/web/lib/cor-dominante.ts`),
 *   que **manda** `Origin`. Com `Vary: Origin`, é outra variante.
 * - O Chromium (e o WebView2 do desktop, que é o mesmo motor) guarda **uma**
 *   variante por URL: a segunda a chegar despeja a primeira. Sem `ETag` nem
 *   `Last-Modified` não há revalidação — só download inteiro —, e o
 *   `immutable` não salva uma entrada que já não existe.
 *
 * O resultado é que, no palco, toda remontagem de tile (pôr no destaque e
 * tirar, abrir o chat da chamada, redimensionar a janela) baixa a foto de novo,
 * e o avatar fica **em branco** por uma ida e volta inteira à rede. Medido:
 * com estes cabeçalhos, 10 downloads das mesmas duas fotos num passeio curto e
 * o avatar em branco no foco/desfoco; com os de agora, 4 downloads e nenhum
 * instante em branco.
 *
 * `Access-Control-Allow-Origin: *` é o que uma imagem pública já é. Ele obriga
 * a tirar o `Access-Control-Allow-Credentials` (o browser recusa a combinação)
 * — o que está certo: a rota ignora cookie e token. Sem `Vary`, os dois modos
 * de requisição passam a compartilhar a mesma entrada de cache.
 *
 * O `<img>` comum não corre risco nenhum com isso: `no-cors` nem olha estes
 * cabeçalhos. Quem depende deles é só a leitura de cor — e ela agora acerta.
 */
export function cabecalhosDeImagemPublica(
  res: RespostaComCabecalhos,
  contentType: string,
): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  // a URL carrega a versão (`?v=<chave>`), então a resposta é a mesma para todo
  // mundo — e uma entrada de cache só serve os dois modos de requisição
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.removeHeader("Access-Control-Allow-Credentials");
  res.removeHeader("Vary");
}

/**
 * Valida o arquivo enviado. `grande: true` distingue "passou do tamanho"
 * (413) de "formato/dimensão inválidos" (400).
 */
export function validarImagemDePerfil(
  buf: Buffer | undefined,
  limites: LimitesDaImagemDePerfil,
): ResultadoDaImagemDePerfil {
  if (!buf?.length) return { ok: false, motivo: "Arquivo vazio" };

  // o GIF é reconhecido pela assinatura, não pelo que o cliente declarou:
  // `image/gif` num PNG renomeado não compra teto de 8 MB
  const gif = assinaturaGif(buf) !== null;
  const maxBytes = gif ? MAX_IMAGEM_DE_PERFIL_GIF : limites.maxEstatico;
  if (buf.length > maxBytes) {
    return {
      ok: false,
      grande: true,
      motivo: `${limites.rotulo} acima de ${mb(maxBytes)} MB`,
    };
  }

  const info = sniffImage(buf);
  if (!info || !(TIPOS_DE_IMAGEM_DE_PERFIL as readonly string[]).includes(info.mime)) {
    return {
      ok: false,
      motivo: `${limites.rotulo} precisa ser uma imagem (PNG, JPEG, GIF ou WebP)`,
    };
  }

  // só o GIF tem teto de lado: é o único que ninguém reduz no caminho
  if (info.mime === "image/gif") {
    if (!info.width || !info.height) {
      return { ok: false, motivo: "Não foi possível ler as dimensões do GIF" };
    }
    const lado = MAX_LADO_IMAGEM_DE_PERFIL_GIF;
    if (info.width > lado || info.height > lado) {
      return {
        ok: false,
        motivo: `GIF de ${info.width}×${info.height}px: o máximo é ${lado}×${lado}px`,
      };
    }
  }

  return {
    ok: true,
    mime: info.mime,
    extensao: extensaoDe(info.mime),
    width: info.width,
    height: info.height,
    animado:
      info.mime === "image/gif"
        ? gifAnimado(buf)
        : info.mime === "image/webp"
          ? webpAnimado(buf)
          : false,
  };
}

/** Bytes em MB para o texto do erro, sem casa decimal sobrando. */
function mb(bytes: number): string {
  const valor = bytes / 1024 / 1024;
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1);
}
