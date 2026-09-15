import {
  DOWNLOAD_PLATAFORMAS,
  rotuloPlataforma,
  type DownloadCatalogo,
  type DownloadDisponivel,
  type DownloadPlataforma,
} from "@streamz/shared";
import { isApiError } from "@/lib/api-error";

/**
 * A lógica da página de download sem React: o que detectar, o que oferecer no
 * topo e como traduzir a falha da API. Separada da tela para ter teste
 * (`plataformas.test.ts`) — é aqui que mora a regra "Android antes de Linux",
 * que já custou o instalador errado a todo telefone uma vez.
 *
 * Nada aqui decide se alguém PODE baixar: a senha é conferida só pela API
 * (`POST /api/downloads/token`). Este módulo só escolhe o que mostrar.
 */

/** O sistema de quem abriu a página. `ios` existe só para explicar a ausência. */
export type SistemaDetectado = DownloadPlataforma | "ios" | null;

/**
 * Sistema provável pelo user agent, só para escolher o botão principal.
 *
 * A ordem das perguntas é a ordem do dano:
 * - **iPhone/iPad antes de macOS.** O UA do iPhone traz `like Mac OS X`; sem
 *   esta guarda ele receberia "Baixar para macOS". O iPad do iPadOS 13+ vai
 *   além e manda o UA de um Mac inteiro — só se denuncia pelo toque
 *   (`navigator.maxTouchPoints`), que Mac nenhum tem.
 * - **Android antes de Linux.** O UA de um Android também casa com `Linux`, e
 *   trocar a ordem daria o instalador de desktop a todo telefone.
 */
export function detectarSistema(userAgent: string, toquesMaximos = 0): SistemaDetectado {
  const ua = userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Android/i.test(ua)) return "android";
  if (/Mac OS X|Macintosh/i.test(ua)) return toquesMaximos > 1 ? "ios" : "macos";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return null;
}

/**
 * `?plataforma=android` na URL escolhe o botão principal no lugar do UA. Serve
 * a quem manda o link já sabendo o sistema (um aviso do app, uma mensagem no
 * chat). Valor fora da lista é ignorado — nunca vira texto na tela.
 */
export function plataformaDaUrl(search: string): DownloadPlataforma | null {
  const valor = new URLSearchParams(search).get("plataforma");
  return (DOWNLOAD_PLATAFORMAS as readonly string[]).includes(valor ?? "")
    ? (valor as DownloadPlataforma)
    : null;
}

/** O instalador publicado para esta plataforma, se houver. */
export function disponivelPara(
  catalogo: DownloadCatalogo | null,
  plataforma: DownloadPlataforma,
): DownloadDisponivel | null {
  if (!catalogo?.configurado) return null;
  return catalogo.disponiveis.find((d) => d.plataforma === plataforma) ?? null;
}

/** Estado do catálogo, como a página o enxerga. */
export type EstadoDoCatalogo =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  | { tipo: "pronto"; catalogo: DownloadCatalogo };

/** O que o topo da página oferece. */
export type OfertaDoTopo =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  /** sem `DOWNLOAD_PASSWORD` no servidor: explica em vez de pedir senha */
  | { tipo: "nao-configurado" }
  /** configurado, mas nenhum instalador publicado */
  | { tipo: "vazio" }
  /** o sistema detectado tem instalador: um botão só, "Baixar para <sistema>" */
  | { tipo: "principal"; disponivel: DownloadDisponivel }
  /** o sistema não foi detectado ou não tem instalador: a lista do que existe */
  | { tipo: "lista"; disponiveis: DownloadDisponivel[]; sistema: SistemaDetectado };

export function ofertaDoTopo(estado: EstadoDoCatalogo, sistema: SistemaDetectado): OfertaDoTopo {
  if (estado.tipo !== "pronto") return estado;
  const { catalogo } = estado;
  if (!catalogo.configurado) return { tipo: "nao-configurado" };
  // a ordem da lista é a de `DOWNLOAD_PLATAFORMAS`, não a do servidor: a página
  // não pode trocar a posição dos botões porque um arquivo foi republicado
  const disponiveis = DOWNLOAD_PLATAFORMAS.map((p) => disponivelPara(catalogo, p)).filter(
    (d): d is DownloadDisponivel => d !== null,
  );
  if (disponiveis.length === 0) return { tipo: "vazio" };
  if (sistema && sistema !== "ios") {
    const detectado = disponivelPara(catalogo, sistema);
    if (detectado) return { tipo: "principal", disponivel: detectado };
  }
  return { tipo: "lista", disponiveis, sistema };
}

/** "Windows, macOS, Linux e Android" — a lista das plataformas por extenso. */
export function juntarComE(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Todas as plataformas que o Streamz publica, por extenso, na ordem do contrato. */
export function plataformasPorExtenso(): string {
  return juntarComE(DOWNLOAD_PLATAFORMAS.map(rotuloPlataforma));
}

/**
 * Data do instalador ("12/09/2026"). `null` quando o servidor manda algo que não
 * é data — melhor não mostrar nada do que "Invalid Date".
 */
export function dataDoInstalador(iso: string, fusoHorario?: string): string | null {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: fusoHorario,
  });
}

/**
 * A mensagem de uma falha de `downloadAutorizar`. Os mesmos quatro casos da
 * página antiga: senha errada, limite de tentativas, e 404/503 com a frase do
 * próprio servidor (sem instalador para o sistema, download desligado).
 */
export function mensagemDeErroDoDownload(erro: unknown): string {
  if (isApiError(erro, 401)) return "Senha incorreta";
  if (isApiError(erro, 429)) return "Muitas tentativas — espere um minuto";
  if (isApiError(erro, 404) || isApiError(erro, 503)) return (erro as Error).message;
  return "Não foi possível liberar o download. Tente de novo.";
}

/** Base da API de produção — o padrão embutido no `public/instalar-mac.sh`. */
export const API_PADRAO_DO_INSTALADOR = "https://api.streamz.chat";

/** Origem usada quando a página não roda em http(s) (e no pré-render). */
export const ORIGEM_PADRAO_DO_INSTALADOR = "https://streamz.chat";

/**
 * Aspeia um valor para entrar num comando de shell com segurança.
 *
 * `origem` e a URL da API não são digitadas por quem vê a tela — vêm de
 * `window.location.origin` e de configuração —, mas iriam sem aspas para dentro
 * do `curl`/`STREAMZ_API=…`: um valor com espaço ou `&` quebraria o comando (e,
 * num ambiente que os controlasse, injetaria outro). Aspas simples, com o único
 * caractere que elas não escapam (`'`) fechado e reaberto por fora.
 */
export function aspasDeShell(valor: string): string {
  return `'${valor.replaceAll("'", `'\\''`)}'`;
}

/**
 * De onde o comando baixa o `instalar-mac.sh`. O arquivo mora em `public/`, então
 * toda origem que serve esta página serve o script — homologação e dev copiam o
 * comando do próprio ambiente. Fora de http(s) (o `tauri://` do app de desktop)
 * não há script servido, e fica a origem de produção.
 */
export function origemDoInstalador(protocolo: string, origem: string): string {
  return protocolo === "https:" || protocolo === "http:" ? origem : ORIGEM_PADRAO_DO_INSTALADOR;
}

/**
 * O comando de instalação do macOS pelo Terminal.
 *
 * A API só entra quando não é a de produção, e entra **do lado do `bash`**: um
 * `STREAMZ_API=… curl … | bash` definiria a variável para o `curl`, não para o
 * script que a lê.
 */
export function comandoDoTerminalMac(origem: string, apiUrl: string): string {
  const variavelDaApi = apiUrl === API_PADRAO_DO_INSTALADOR ? "" : `STREAMZ_API=${aspasDeShell(apiUrl)} `;
  return `curl -fsSL ${aspasDeShell(`${origem}/instalar-mac.sh`)} | ${variavelDaApi}bash`;
}
