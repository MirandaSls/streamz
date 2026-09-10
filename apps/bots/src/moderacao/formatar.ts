/**
 * Formatação e leitura de texto do bot de moderação. Tudo função pura.
 *
 * Duas famílias moram aqui, e as duas são o tipo de código em que o erro passa
 * batido pela revisão e aparece em produção:
 *
 * 1. **Ler o alvo** (`analisarAlvo`). No Streamz a menção viaja como texto
 *    (`traducao/mensagem.ts`: "a F1 não resolve as menções: elas ficam no
 *    `content`"), então `@fulano` chega como `@fulano` e não como `<@123>`.
 *    Quem escrever este parser esperando o formato do Discord acha que
 *    funciona — até o primeiro `!banir @fulano`.
 * 2. **Escrever o registro** (`textoDoRegistro`, `embedDoRegistro`). O registro
 *    é a única memória de por que alguém foi punido; um campo trocado ali é
 *    descoberto meses depois, quando não dá mais para consertar.
 *
 * ## Por que tudo é dito **em texto**, e o embed é o enfeite
 *
 * A nossa API **descarta os embeds**: `interactions.service.ts` registra
 * `embeds descartados (N): F5` e manda a mensagem sem eles, e o
 * `POST /channels/:id/messages` da casca recusa um corpo só com `embeds`
 * (`50035 content[BASE_TYPE_REQUIRED]: Cannot send an empty message`). Um bot
 * que dependesse do embed responderia **nada** — que foi o que aconteceu na
 * primeira execução da prova.
 *
 * Então toda resposta leva o conteúdo em `conteudo`, em markdown, e o embed vai
 * junto para o dia em que a F5 chegar (e para um cliente compatível com o
 * Discord, que já os desenha). Nenhuma informação mora **só** no embed.
 */

import type { APIEmbed } from "discord.js";

/** Volt Lime (`design.md`): a cor de destaque do Streamz. */
export const COR = 0x9be31f;

/** Vermelho para as ações que tiram alguém do servidor. */
export const COR_GRAVE = 0xed4245;

/** O que aparece no registro quando o moderador não escreveu motivo. */
export const MOTIVO_PADRAO = "sem motivo informado";

/**
 * Escapa o markdown de um nome vindo de fora.
 *
 * Um usuário chamado `[clique](http://x)` não pode virar um **link** dentro do
 * registro de moderação escrito pelo bot: o registro é a peça que precisa ser
 * confiável, e ele carrega nome e motivo digitados por gente.
 */
export function escaparMarkdown(texto: string): string {
  return texto.replace(/([\\`*_~|>[\]()])/g, "\\$1");
}

/** Corta sem estourar o campo do embed (limites do Discord são em caracteres). */
export function truncar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, Math.max(limite - 1, 0))}…`;
}

/** Motivo já limpo e cortado, ou o padrão. */
export function limparMotivo(bruto: string | null | undefined, limite = 400): string {
  const texto = (bruto ?? "").trim();
  if (texto === "") return MOTIVO_PADRAO;
  return truncar(texto, limite);
}

// ── Ler o alvo ──────────────────────────────────────────────────────────────

export type Alvo =
  | { tipo: "id"; id: string }
  | { tipo: "nome"; nome: string }
  | { tipo: "vazio" };

/**
 * `"<@123>"`, `"123"`, `"@fulano"`, `"fulano"` → o que procurar.
 *
 * As três primeiras formas existem porque as três aparecem:
 *
 * - `<@123>` / `<@!123>` é o que um cliente compatível com o Discord manda;
 * - `123…` (só dígitos, 15+) é o snowflake colado à mão — o caminho que sempre
 *   funciona e o que a recusa sugere;
 * - `@fulano` é o que o composer do Streamz produz hoje, porque a menção vive
 *   no texto da mensagem.
 *
 * O `@` do começo é comido em qualquer caso: quem digita o nome copiado da
 * lista de membros traz o arroba junto, e um nome procurado com arroba nunca
 * casaria.
 */
export function analisarAlvo(bruto: string | null | undefined): Alvo {
  const texto = (bruto ?? "").trim();
  if (texto === "") return { tipo: "vazio" };

  const mencao = /^<@!?(\d{1,32})>$/.exec(texto);
  if (mencao) return { tipo: "id", id: mencao[1]! };

  if (/^\d{15,32}$/.test(texto)) return { tipo: "id", id: texto };

  const nome = texto.replace(/^@+/, "").trim();
  if (nome === "") return { tipo: "vazio" };
  return { tipo: "nome", nome };
}

/**
 * Normaliza para comparar nomes de usuário: minúsculas e sem acento.
 *
 * Sem isto, `/aviso @André` não acha o `andre` da lista de membros e o
 * moderador conclui que a pessoa saiu do servidor.
 */
export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// ── Escrever o registro ─────────────────────────────────────────────────────

/** Uma ação de moderação, do jeito que o registro a guarda. */
export interface AcaoDeModeracao {
  /** `banir`, `expulsar`, `silenciar`, … — o id, não a frase. */
  tipo: string;
  moderador: { id: string; nome: string };
  alvo: { id: string; nome: string };
  motivo: string;
  /** Complemento: a duração do silenciamento, quantas mensagens foram apagadas. */
  detalhe?: string;
  /** Milissegundos desde a época; o registro imprime em data absoluta e relativa. */
  quando: number;
}

/** O rótulo humano de cada ação, e se ela é das graves (cor vermelha). */
const ACOES: Record<string, { rotulo: string; grave: boolean }> = {
  banir: { rotulo: "Banimento", grave: true },
  desbanir: { rotulo: "Desbanimento", grave: false },
  expulsar: { rotulo: "Expulsão", grave: true },
  silenciar: { rotulo: "Silenciamento", grave: true },
  dessilenciar: { rotulo: "Fim do silenciamento", grave: false },
  aviso: { rotulo: "Aviso", grave: false },
  "limpar-avisos": { rotulo: "Avisos apagados", grave: false },
  limpar: { rotulo: "Limpeza de mensagens", grave: false },
  "registro-de-moderacao": { rotulo: "Registro configurado", grave: false },
};

export function rotuloDaAcao(tipo: string): string {
  return ACOES[tipo]?.rotulo ?? tipo;
}

/**
 * `<t:1757…:f>` — o carimbo de tempo do Discord, que cada pessoa vê no fuso
 * dela.
 *
 * Um registro com a hora do servidor obriga quem lê a converter de cabeça, e
 * quem lê está sempre com pressa.
 */
export function carimbo(quando: number, estilo: "f" | "R" = "f"): string {
  return `<t:${Math.floor(quando / 1000)}:${estilo}>`;
}

/** Uma linha de texto puro — é o que vai para o log do container. */
export function linhaDoRegistro(acao: AcaoDeModeracao): string {
  const detalhe = acao.detalhe ? ` (${acao.detalhe})` : "";
  return (
    `[${rotuloDaAcao(acao.tipo)}]${detalhe} ` +
    `${acao.alvo.nome} (${acao.alvo.id}) ` +
    `por ${acao.moderador.nome} (${acao.moderador.id}): ${acao.motivo}`
  );
}

/**
 * O corpo em **markdown** da mensagem publicada no canal de registro.
 *
 * É esta a versão que as pessoas leem hoje: o embed abaixo é descartado pela
 * API (ver o cabeçalho deste arquivo). Os quatro campos são os quatro que uma
 * auditoria pergunta — **quem fez, em quem, por quê, quando** —, e o id fica
 * junto do nome porque apelido muda e id não: seis meses depois, o nome no
 * registro pode não existir mais.
 */
export function textoDoRegistro(acao: AcaoDeModeracao): string {
  const titulo = acao.detalhe
    ? `**${rotuloDaAcao(acao.tipo)}** — ${escaparMarkdown(truncar(acao.detalhe, 200))}`
    : `**${rotuloDaAcao(acao.tipo)}**`;
  return [
    titulo,
    `**Quem:** ${escaparMarkdown(truncar(acao.moderador.nome, 60))} (\`${acao.moderador.id}\`)`,
    `**Em quem:** ${escaparMarkdown(truncar(acao.alvo.nome, 60))} (\`${acao.alvo.id}\`)`,
    `**Quando:** ${carimbo(acao.quando)}`,
    `**Motivo:** ${escaparMarkdown(truncar(acao.motivo, 900))}`,
  ].join("\n");
}

/**
 * O embed publicado no canal de registro.
 *
 * Os quatro campos são os quatro que uma auditoria pergunta — **quem fez, em
 * quem, por quê, quando** — e nessa ordem. O id fica junto do nome porque
 * apelido muda e id não: seis meses depois, o nome no registro pode não existir
 * mais.
 */
export function embedDoRegistro(acao: AcaoDeModeracao): APIEmbed {
  const grave = ACOES[acao.tipo]?.grave ?? false;
  return {
    color: grave ? COR_GRAVE : COR,
    title: rotuloDaAcao(acao.tipo),
    ...(acao.detalhe ? { description: escaparMarkdown(truncar(acao.detalhe, 200)) } : {}),
    fields: [
      {
        name: "Quem",
        value: `${escaparMarkdown(truncar(acao.moderador.nome, 60))}\n\`${acao.moderador.id}\``,
        inline: true,
      },
      {
        name: "Em quem",
        value: `${escaparMarkdown(truncar(acao.alvo.nome, 60))}\n\`${acao.alvo.id}\``,
        inline: true,
      },
      { name: "Quando", value: `${carimbo(acao.quando)}`, inline: true },
      { name: "Motivo", value: escaparMarkdown(truncar(acao.motivo, 900)), inline: false },
    ],
  };
}

// ── A lista de avisos ───────────────────────────────────────────────────────

export interface AvisoGuardado {
  id: number;
  moderadorId: string;
  moderadorNome: string;
  motivo: string;
  quando: number;
}

/** Quantos avisos o `/avisos` mostra antes de resumir o resto. */
export const AVISOS_LISTADOS = 10;

/**
 * O embed do `/avisos`.
 *
 * Lista do mais recente para o mais antigo: quem pergunta "quantos avisos ele
 * tem?" quer saber o que aconteceu **agora**, não em janeiro.
 */
export function embedDosAvisos(
  alvo: { id: string; nome: string },
  avisos: readonly AvisoGuardado[],
): APIEmbed {
  if (avisos.length === 0) {
    return {
      color: COR,
      title: `Avisos de ${truncar(alvo.nome, 60)}`,
      description: "Nenhum aviso registrado.",
    };
  }

  const recentes = [...avisos].sort((a, b) => b.quando - a.quando);
  const mostrados = recentes.slice(0, AVISOS_LISTADOS);
  const sobra = recentes.length - mostrados.length;

  const linhas = mostrados.map(
    (a) =>
      `\`#${a.id}\` ${carimbo(a.quando, "R")} — por ${escaparMarkdown(truncar(a.moderadorNome, 40))}\n` +
      `> ${escaparMarkdown(truncar(a.motivo, 200))}`,
  );
  if (sobra > 0) linhas.push(`_e mais ${sobra} aviso${sobra === 1 ? "" : "s"} mais antigo(s)._`);

  return {
    color: COR,
    title: `Avisos de ${truncar(alvo.nome, 60)}`,
    description: truncar(linhas.join("\n"), 3900),
    footer: { text: `${recentes.length} aviso(s) no total · id ${alvo.id}` },
  };
}

/**
 * A lista de avisos em **markdown** — a versão que as pessoas leem hoje.
 *
 * Do mais recente para o mais antigo: quem pergunta "quantos avisos ele tem?"
 * quer saber o que aconteceu **agora**, não em janeiro.
 */
export function textoDosAvisos(
  alvo: { id: string; nome: string },
  avisos: readonly AvisoGuardado[],
): string {
  const titulo = `**Avisos de ${escaparMarkdown(truncar(alvo.nome, 60))}**`;
  if (avisos.length === 0) return `${titulo}\nNenhum aviso registrado.`;

  const recentes = [...avisos].sort((a, b) => b.quando - a.quando);
  const mostrados = recentes.slice(0, AVISOS_LISTADOS);
  const sobra = recentes.length - mostrados.length;

  const linhas = mostrados.map(
    (a) =>
      `\`#${a.id}\` ${carimbo(a.quando, "R")} — por ${escaparMarkdown(truncar(a.moderadorNome, 40))}\n` +
      `> ${escaparMarkdown(truncar(a.motivo, 200))}`,
  );
  if (sobra > 0) linhas.push(`_e mais ${sobra} aviso${sobra === 1 ? "" : "s"} mais antigo(s)._`);

  return truncar(
    `${titulo} — ${avisos.length} no total\n${linhas.join("\n")}`,
    1900,
  );
}

/** "1 mensagem" / "7 mensagens" — o plural que a resposta do `/limpar` usa. */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}
