/**
 * Métricas em formato Prometheus, sem `prom-client`.
 *
 * O que o MVP precisa cabe em duas primitivas — contador acumulado e gauge
 * calculado na hora do scrape —, e uma dependência a mais (com registry
 * global, coletores de processo e `gc` nativo) custaria mais do que resolve.
 * Se um dia precisarmos de histogramas com buckets, aí sim vale trocar.
 *
 * Regra de ouro respeitada aqui: **rótulo não pode ter cardinalidade aberta**.
 * Por isso contamos requisição por método e classe de status (`2xx`, `4xx`),
 * nunca por caminho — `/api/guilds/<id>` viraria uma série por servidor.
 */

type Rotulos = Record<string, string>;

interface Serie {
  nome: string;
  ajuda: string;
  tipo: "counter" | "gauge";
  rotulos: Rotulos;
  valor: number;
}

/** Contadores acumulados, indexados por nome+rótulos. */
const contadores = new Map<string, Serie>();

/** Gauges lidos no momento do scrape (sockets conectados, mensagens/min…). */
const gauges = new Map<string, { ajuda: string; ler: () => number | Promise<number> }>();

function chave(nome: string, rotulos: Rotulos): string {
  const partes = Object.keys(rotulos)
    .sort()
    .map((k) => `${k}=${rotulos[k]}`)
    .join(",");
  return partes ? `${nome}{${partes}}` : nome;
}

/** Soma `quantidade` ao contador. Cria a série na primeira chamada. */
export function incrementar(
  nome: string,
  rotulos: Rotulos = {},
  quantidade = 1,
  ajuda = nome,
): void {
  const id = chave(nome, rotulos);
  const atual = contadores.get(id);
  if (atual) {
    atual.valor += quantidade;
    return;
  }
  contadores.set(id, { nome, ajuda, tipo: "counter", rotulos, valor: quantidade });
}

/**
 * Registra um valor lido sob demanda. Chamar de novo com o mesmo nome
 * substitui a fonte — o boot da API é idempotente e reregistrar não duplica
 * séries.
 */
export function registrarGauge(
  nome: string,
  ajuda: string,
  ler: () => number | Promise<number>,
): void {
  gauges.set(nome, { ajuda, ler });
}

/** Só para os testes: zera o estado acumulado entre casos. */
export function zerarMetricas(): void {
  contadores.clear();
  gauges.clear();
}

/** Escapa o valor de um rótulo conforme o formato de exposição do Prometheus. */
function escapar(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function linha(nome: string, rotulos: Rotulos, valor: number): string {
  const chaves = Object.keys(rotulos).sort();
  const marcacao = chaves.length
    ? `{${chaves.map((k) => `${k}="${escapar(rotulos[k])}"`).join(",")}}`
    : "";
  return `${nome}${marcacao} ${valor}`;
}

/**
 * Renderiza o texto de exposição (`text/plain; version=0.0.4`).
 *
 * Gauge que falha ao ler (banco fora do ar, por exemplo) é **omitido** em vez
 * de derrubar o scrape inteiro: métrica ausente o Prometheus sabe tratar; um
 * 500 no /metrics cega tudo de uma vez.
 */
export async function renderizarMetricas(): Promise<string> {
  const blocos: string[] = [];

  // Agrupa por nome para emitir um único HELP/TYPE por família.
  const porNome = new Map<string, Serie[]>();
  for (const serie of contadores.values()) {
    const lista = porNome.get(serie.nome) ?? [];
    lista.push(serie);
    porNome.set(serie.nome, lista);
  }
  for (const [nome, series] of porNome) {
    blocos.push(`# HELP ${nome} ${series[0].ajuda}`);
    blocos.push(`# TYPE ${nome} counter`);
    for (const s of series) blocos.push(linha(nome, s.rotulos, s.valor));
  }

  for (const [nome, gauge] of gauges) {
    let valor: number;
    try {
      valor = await gauge.ler();
    } catch {
      continue;
    }
    if (!Number.isFinite(valor)) continue;
    blocos.push(`# HELP ${nome} ${gauge.ajuda}`);
    blocos.push(`# TYPE ${nome} gauge`);
    blocos.push(linha(nome, {}, valor));
  }

  return `${blocos.join("\n")}\n`;
}

/** Classe de status (`2xx`), para não abrir uma série por código. */
export function classeDeStatus(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

/**
 * Middleware Express que conta requisições e tempo total. Fica aqui (e não no
 * `main.ts`) para o teste conseguir exercitá-lo sem subir o Nest.
 */
export function metricsMiddleware(
  req: { method?: string },
  res: { statusCode: number; on(evento: string, fn: () => void): void },
  next: () => void,
) {
  const inicio = process.hrtime.bigint();
  res.on("finish", () => {
    const metodo = (req.method ?? "GET").toUpperCase();
    const rotulos = { method: metodo, status: classeDeStatus(res.statusCode) };
    incrementar(
      "streamz_http_requests_total",
      rotulos,
      1,
      "Requisições HTTP atendidas, por método e classe de status",
    );
    const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
    incrementar(
      "streamz_http_request_duration_seconds_sum",
      rotulos,
      segundos,
      "Tempo total gasto atendendo requisições HTTP, em segundos",
    );
  });
  next();
}

/** Gauges do processo — servem para ver reinício e vazamento de memória. */
export function registrarGaugesDeProcesso(): void {
  registrarGauge(
    "streamz_process_uptime_seconds",
    "Segundos desde o boot do processo da API",
    () => process.uptime(),
  );
  registrarGauge(
    "streamz_process_resident_memory_bytes",
    "Memória residente do processo da API, em bytes",
    () => process.memoryUsage().rss,
  );
}
