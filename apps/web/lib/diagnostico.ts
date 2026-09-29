/**
 * Diagnóstico do cliente: erros de JS, quedas de voz e do socket viram eventos
 * enviados a `POST /diagnostics/client`, para o operador ver o que acontece na
 * máquina do usuário sem pedir print de console.
 *
 * Tudo aqui é best-effort e **nunca** pode piorar o app: falha de envio é
 * descartada calada (reportar a falha do relatório geraria outro relatório,
 * e o ciclo só terminaria com o usuário sem rede). Por isso o envio usa
 * `fetch` direto, e não o `api`: o `request` do `api.ts` renova token em 401 e
 * redireciona para o login, efeitos que um relatório não deve provocar.
 */
import {
  MAX_EVENTOS_DE_DIAGNOSTICO,
  type EventoDeDiagnostico,
  type TipoDeDiagnostico,
} from "@streamz/shared";
import { API_URL } from "./config";
import { cabecalhoDoCliente } from "./cliente";
import { identificacaoDoCliente } from "./desktop";
import { getAccessToken } from "./session";

const MAX_MENSAGEM = 500;
const MAX_DETALHE = 4000;
const JANELA_DEDUP_MS = 60_000;
const TETO_POR_MINUTO = 30;
const DEBOUNCE_MS = 3_000;
/** Fila máxima na memória: um loop de erro não pode encher a aba enquanto o envio espera. */
const MAX_FILA = 100;

const fila: EventoDeDiagnostico[] = [];
const vistos = new Map<string, number>();
let janelaInicio = 0;
let contagemNaJanela = 0;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let enviando = false;

/**
 * Os chamadores juntam contexto estruturado (sala, rede, etapa...), mas o
 * servidor recebe texto: objeto vira JSON tolerante, sem nunca lançar.
 */
function detalheComoTexto(detalhe: string | Record<string, unknown> | undefined): string | undefined {
  if (detalhe === undefined || detalhe === null) return undefined;
  if (typeof detalhe === "string") return detalhe;
  try {
    return JSON.stringify(detalhe, (_chave, valor) =>
      valor instanceof Error
        ? { name: valor.name, message: valor.message, stack: valor.stack }
        : valor,
    );
  } catch {
    return String(detalhe);
  }
}

/** Enfileira um evento; nunca lança. */
export function reportarDiagnostico(
  tipo: TipoDeDiagnostico,
  mensagem: string,
  detalhe?: string | Record<string, unknown>,
): void {
  try {
    const texto = detalheComoTexto(detalhe);
    const msg = String(mensagem).slice(0, MAX_MENSAGEM);
    // o console local sempre recebe, mesmo quando o relatório é descartado
    console.warn(`[diagnostico] ${tipo}: ${msg}`);

    const agora = Date.now();
    const chave = `${tipo}\u0000${msg}`;
    const ultimo = vistos.get(chave);
    if (ultimo !== undefined && agora - ultimo < JANELA_DEDUP_MS) return;
    vistos.set(chave, agora);
    // poda o mapa para não crescer sem limite numa sessão longa
    if (vistos.size > 200) {
      for (const [k, t] of vistos) if (agora - t >= JANELA_DEDUP_MS) vistos.delete(k);
    }

    if (agora - janelaInicio >= 60_000) {
      janelaInicio = agora;
      contagemNaJanela = 0;
    }
    if (contagemNaJanela >= TETO_POR_MINUTO) return;
    contagemNaJanela += 1;

    if (fila.length >= MAX_FILA) return;
    fila.push({
      tipo,
      mensagem: msg,
      ...(texto ? { detalhe: texto.slice(0, MAX_DETALHE) } : {}),
      em: new Date().toISOString(),
      ...(typeof location !== "undefined" ? { rota: location.pathname } : {}),
    });
    agendar();
  } catch {
    /* diagnóstico jamais derruba quem o chamou */
  }
}

function agendar(): void {
  if (temporizador || typeof window === "undefined") return;
  temporizador = setTimeout(() => {
    temporizador = null;
    void despachar();
  }, DEBOUNCE_MS);
}

async function despachar(): Promise<void> {
  if (enviando || fila.length === 0) return;
  enviando = true;
  try {
    const token = await getAccessToken();
    // sem login não há a quem atribuir o relatório: descarta
    if (!token) {
      fila.length = 0;
      return;
    }
    const cliente = identificacaoDoCliente();
    while (fila.length > 0) {
      const eventos = fila.splice(0, MAX_EVENTOS_DE_DIAGNOSTICO);
      // falha (rede, 401, 429...) descarta o lote: sem retry, sem novo relatório
      await fetch(`${API_URL}/api/diagnostics/client`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...cabecalhoDoCliente(),
        },
        body: JSON.stringify({ eventos, ...(cliente ? { cliente } : {}) }),
      }).catch(() => undefined);
    }
  } catch {
    fila.length = 0;
  } finally {
    enviando = false;
  }
}

/** Ruído conhecido: não é bug nosso e não vale a cota do minuto. */
function ehRuido(mensagem: string, arquivo?: string): boolean {
  if (/ResizeObserver loop/i.test(mensagem)) return true;
  const alvo = `${mensagem} ${arquivo ?? ""}`;
  return /(chrome|moz|safari-web)-extension:\/\//.test(alvo);
}

let desinstalar: (() => void) | null = null;

/**
 * Liga a captura global de erros. Idempotente: uma segunda chamada devolve a
 * mesma função de limpeza, sem duplicar ouvintes (o React em modo estrito
 * monta o efeito duas vezes em dev).
 */
export function instalarCapturaDeErros(): () => void {
  if (typeof window === "undefined") return () => {};
  if (desinstalar) return desinstalar;

  const aoErro = (e: ErrorEvent) => {
    const base = e.message || "erro desconhecido";
    if (ehRuido(base, e.filename)) return;
    const onde = e.filename ? ` (${e.filename}:${e.lineno})` : "";
    const stack = e.error instanceof Error ? e.error.stack : undefined;
    reportarDiagnostico("js.erro", `${base}${onde}`, stack);
  };
  const aoRejeitar = (e: PromiseRejectionEvent) => {
    const r = e.reason;
    const msg = r instanceof Error ? r.message : String(r);
    const stack = r instanceof Error ? r.stack : undefined;
    if (ehRuido(msg, stack)) return;
    reportarDiagnostico("js.promessa", msg, stack);
  };
  // ao fechar/ocultar a aba o debounce de 3 s não teria tempo: tenta despachar já
  // (o token é assíncrono, então não dá para usar `keepalive` com segurança)
  const aoSair = () => {
    if (temporizador) {
      clearTimeout(temporizador);
      temporizador = null;
    }
    void despachar();
  };

  window.addEventListener("error", aoErro);
  window.addEventListener("unhandledrejection", aoRejeitar);
  window.addEventListener("pagehide", aoSair);
  desinstalar = () => {
    window.removeEventListener("error", aoErro);
    window.removeEventListener("unhandledrejection", aoRejeitar);
    window.removeEventListener("pagehide", aoSair);
    desinstalar = null;
  };
  return desinstalar;
}
