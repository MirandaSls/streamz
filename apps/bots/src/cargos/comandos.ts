import { PermissionFlagsBits, type Client, type Guild, type Role } from "discord.js";
import { TIPO_TEXTO, type Comando, type Contexto } from "../runtime/tipos";
import { lerEmojiDigitado } from "./emoji";
import { lerArgumentosDeAdicionar, lerMencaoDeCanal, lerMencaoDeCargo, separarTituloEDescricao } from "./entrada";
import type { Painel } from "./estado";
import { linhaDaLista, truncar } from "./formatar";
import { SEM_GERENCIAR_CARGOS, explicarHierarquia } from "./hierarquia";
import { EXPLICACAO_DO_MODO, MODOS, MODO_PADRAO, normalizarModo } from "./modos";
import { obterServico } from "./servico";

/**
 * `/painel` — o único comando do bot, com a ação como primeira opção.
 *
 * O porquê desta forma (e não de `/painel criar` como subcomando) está em
 * `entrada.ts`: subcomando é recusado no registro com `50035`, e uma família de
 * `/painel-criar`, `/painel-adicionar`… encheria o composer de linhas quase
 * iguais. No prefixo `!` lê-se exatamente como foi pedido:
 * `!painel criar #geral Cargos | Escolha os seus`.
 *
 * **Toda recusa é efêmera.** Um "você não pode fazer isso" no meio do canal é
 * uma pequena humilhação pública e polui a conversa; no prefixo `!` o runtime
 * degrada para uma resposta citada (não existe efêmera em canal de texto), que
 * é o melhor possível ali.
 */

const AJUDA =
  "Use: `/painel criar <canal> <título | descrição>` · " +
  "`/painel adicionar <id> <emoji> <cargo> [rótulo]` · " +
  "`/painel remover <id> <emoji>` · " +
  "`/painel modo <id> <normal|unico|so-adicionar|travado>` · " +
  "`/painel listar` · `/painel apagar <id>`";

// ── ajudantes ───────────────────────────────────────────────────────────────

/** O servidor da invocação, ou uma recusa efêmera. Painel não existe em DM. */
async function servidorDe(ctx: Contexto): Promise<Guild | null> {
  if (!ctx.guildId) {
    await ctx.responder({ conteudo: "Painel de cargos só existe dentro de um servidor.", efemera: true });
    return null;
  }
  const cliente = ctx.bot.cliente as Client<true>;
  try {
    return await cliente.guilds.fetch(ctx.guildId);
  } catch {
    await ctx.responder({ conteudo: "Não achei este servidor.", efemera: true });
    return null;
  }
}

/**
 * Só quem gerencia cargos mexe em painel.
 *
 * A conta é a do próprio Streamz: dono do servidor pode tudo,
 * `ADMINISTRATOR` idem (o `permissions.has` do discord.js já trata o bit de
 * administrador como coringa), e o resto precisa de `MANAGE_ROLES`. É a mesma
 * permissão que a API vai exigir na hora de dar o cargo — pedir menos aqui
 * só adiaria a recusa para um lugar pior.
 */
async function quemGerenciaCargos(ctx: Contexto, servidor: Guild): Promise<boolean> {
  if (servidor.ownerId === ctx.usuarioId) return true;
  const membro = await servidor.members.fetch({ user: ctx.usuarioId, force: true }).catch(() => null);
  if (membro?.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
  await ctx.responder({
    conteudo:
      "Só quem tem a permissão **Gerenciar cargos** pode mexer nos painéis — " +
      "senão qualquer pessoa se daria o cargo que quisesse.",
    efemera: true,
  });
  return false;
}

/** `<#123>`, `123` ou `#geral` → o canal de texto. */
async function acharCanal(servidor: Guild, bruto: string): Promise<string | null> {
  const porId = lerMencaoDeCanal(bruto);
  if (porId) {
    const canal = await servidor.channels.fetch(porId).catch(() => null);
    return canal?.isTextBased() ? canal.id : null;
  }
  const nome = bruto.trim().replace(/^#/, "").toLowerCase();
  if (nome === "") return null;
  await servidor.channels.fetch().catch(() => null);
  const achado = servidor.channels.cache.find(
    (c) => c.isTextBased() && c.name.toLowerCase() === nome,
  );
  return achado?.id ?? null;
}

/** `<@&123>`, `123` ou `@Streamer` → o cargo. */
async function acharCargo(servidor: Guild, bruto: string): Promise<Role | null> {
  await servidor.roles.fetch().catch(() => null);
  const porId = lerMencaoDeCargo(bruto);
  if (porId) return servidor.roles.cache.get(porId) ?? null;
  const nome = bruto.trim().replace(/^@/, "").toLowerCase();
  if (nome === "") return null;
  return servidor.roles.cache.find((c) => c.name.toLowerCase() === nome) ?? null;
}

/** O painel pelo id (que é o id da mensagem), ou uma recusa efêmera. */
async function painelDe(
  ctx: Contexto,
  guildId: string,
  bruto: string | null,
): Promise<{ id: string; painel: Painel } | null> {
  const id = (bruto ?? "").trim();
  const painel = id === "" ? undefined : obterServico().paineis.ler(guildId).paineis[id];
  if (!painel) {
    await ctx.responder({
      conteudo: `Não achei o painel \`${truncar(id, 30) || "(vazio)"}\`. Veja os ids com \`/painel listar\`.`,
      efemera: true,
    });
    return null;
  }
  return { id, painel };
}

// ── as ações ────────────────────────────────────────────────────────────────

async function criar(ctx: Contexto, servidor: Guild, alvo: string, argumentos: string) {
  const canalId = await acharCanal(servidor, alvo);
  if (!canalId) {
    await ctx.responder({
      conteudo: "Não achei esse canal de texto. Use a menção do canal (`#geral`) ou o id dele.",
      efemera: true,
    });
    return;
  }
  const { titulo, descricao } = separarTituloEDescricao(argumentos);
  if (titulo === "") {
    await ctx.responder({
      conteudo: "Falta o título do painel. Ex.: `/painel criar #geral Cargos | Escolha os seus`.",
      efemera: true,
    });
    return;
  }

  await ctx.pensando(true);
  const servico = obterServico();
  const painel: Painel = {
    canalId,
    titulo,
    descricao,
    modo: MODO_PADRAO,
    criadoEm: new Date().toISOString(),
    itens: {},
  };
  const mensagemId = await servico.publicarPainel(servidor, canalId, painel);
  servico.paineis.editar(servidor.id, (e) => {
    e.paineis[mensagemId] = painel;
  });

  await ctx.responder({
    conteudo:
      `Painel criado em <#${canalId}>. O id dele é \`${mensagemId}\`.\n` +
      `Agora ponha os cargos: \`/painel adicionar ${mensagemId} 🎧 @Cargo Rótulo\`.`,
    efemera: true,
  });
}

async function adicionar(ctx: Contexto, servidor: Guild, alvo: string, argumentos: string) {
  const achado = await painelDe(ctx, servidor.id, alvo);
  if (!achado) return;

  const partes = lerArgumentosDeAdicionar(argumentos);
  if (!partes) {
    await ctx.responder({
      conteudo: `Falta o emoji ou o cargo. Ex.: \`/painel adicionar ${achado.id} 🎧 @Ouvinte Avisos de live\`.`,
      efemera: true,
    });
    return;
  }

  const emoji = lerEmojiDigitado(partes.emoji);
  if (!emoji) {
    await ctx.responder({
      conteudo: `\`${truncar(partes.emoji, 40)}\` não parece um emoji. Use um emoji de verdade (👍) ou um do servidor (\`<:festa:…>\`).`,
      efemera: true,
    });
    return;
  }

  await ctx.pensando(true);
  const servico = obterServico();
  const cargo = await acharCargo(servidor, partes.cargo);
  if (!cargo) {
    await ctx.responder({ conteudo: "Não achei esse cargo. Use a menção (`@Cargo`) ou o id.", efemera: true });
    return;
  }
  if (cargo.id === servidor.id) {
    await ctx.responder({
      conteudo: "O `@everyone` já vale para todo mundo — não dá para distribuí-lo por reação.",
      efemera: true,
    });
    return;
  }

  // As duas checagens que evitam um painel que parece pronto e não funciona.
  if (!(await servico.possoGerenciarCargos(servidor))) {
    await ctx.responder({ conteudo: SEM_GERENCIAR_CARGOS, efemera: true });
    return;
  }
  if (!(await servico.possoDarOCargo(servidor, cargo))) {
    const meu = await servico.meuCargoMaisAlto(servidor);
    await ctx.responder({ conteudo: explicarHierarquia(cargo.name, meu?.name ?? null), efemera: true });
    return;
  }

  const jaTinha = achado.painel.itens[emoji.chave] !== undefined;
  achado.painel.itens[emoji.chave] = {
    cargoId: cargo.id,
    rotulo: partes.rotulo,
    emoji: emoji.exibicao,
    paraReagir: emoji.paraReagir,
  };
  servico.paineis.editar(servidor.id, (e) => {
    e.paineis[achado.id] = achado.painel;
  });

  await servico.atualizarPainel(achado.painel.canalId, achado.id, achado.painel);
  // A reação do bot é o que oferece a opção a quem lê. Se ela falhar, o item já
  // vale — quem reagir à mão ganha o cargo igual.
  await servico.reagirNoPainel(achado.painel.canalId, achado.id, emoji.paraReagir).catch(() => {
    ctx.bot.log.aviso("não deu para reagir no painel", { painel: achado.id, emoji: emoji.chave });
  });

  await ctx.responder({
    conteudo: `${emoji.exibicao} passa a dar <@&${cargo.id}> no painel \`${achado.id}\`${jaTinha ? " (substituiu o cargo anterior desse emoji)" : ""}.`,
    efemera: true,
  });
}

async function remover(ctx: Contexto, servidor: Guild, alvo: string, argumentos: string) {
  const achado = await painelDe(ctx, servidor.id, alvo);
  if (!achado) return;

  const emoji = lerEmojiDigitado(argumentos);
  if (!emoji || !achado.painel.itens[emoji.chave]) {
    await ctx.responder({ conteudo: "Esse emoji não está nesse painel.", efemera: true });
    return;
  }

  await ctx.pensando(true);
  const servico = obterServico();
  const item = achado.painel.itens[emoji.chave]!;
  delete achado.painel.itens[emoji.chave];
  servico.paineis.editar(servidor.id, (e) => {
    e.paineis[achado.id] = achado.painel;
  });
  await servico.atualizarPainel(achado.painel.canalId, achado.id, achado.painel);

  // Tirar as reações daquele emoji é cosmético e exige `MANAGE_MESSAGES`: se
  // não der, o item já não vale mais, que é o que importa.
  const cliente = ctx.bot.cliente as Client<true>;
  await cliente.rest
    .delete(
      `/channels/${achado.painel.canalId}/messages/${achado.id}/reactions/${encodeURIComponent(item.paraReagir)}`,
    )
    .catch(() => undefined);

  await ctx.responder({
    conteudo: `${emoji.exibicao} não dá mais cargo nenhum no painel \`${achado.id}\`.`,
    efemera: true,
  });
}

async function trocarModo(ctx: Contexto, servidor: Guild, alvo: string, argumentos: string) {
  const achado = await painelDe(ctx, servidor.id, alvo);
  if (!achado) return;

  const modo = normalizarModo(argumentos);
  if (!modo) {
    await ctx.responder({
      conteudo: `Modo desconhecido. Os que existem: ${MODOS.map((m) => `\`${m}\``).join(", ")}.`,
      efemera: true,
    });
    return;
  }

  await ctx.pensando(true);
  const servico = obterServico();
  achado.painel.modo = modo;
  servico.paineis.editar(servidor.id, (e) => {
    e.paineis[achado.id] = achado.painel;
  });
  await servico.atualizarPainel(achado.painel.canalId, achado.id, achado.painel);

  await ctx.responder({
    conteudo: `Painel \`${achado.id}\` agora é **${modo}**: ${EXPLICACAO_DO_MODO[modo]}.`,
    efemera: true,
  });
}

async function listar(ctx: Contexto, servidor: Guild) {
  const paineis = Object.entries(obterServico().paineis.ler(servidor.id).paineis);
  if (paineis.length === 0) {
    await ctx.responder({
      conteudo: `Nenhum painel neste servidor ainda. ${AJUDA}`,
      efemera: true,
    });
    return;
  }
  await ctx.responder({
    conteudo: paineis.map(([id, p]) => linhaDaLista(id, p)).join("\n"),
    efemera: true,
  });
}

async function apagar(ctx: Contexto, servidor: Guild, alvo: string) {
  const achado = await painelDe(ctx, servidor.id, alvo);
  if (!achado) return;

  await ctx.pensando(true);
  const servico = obterServico();
  await servico.apagarMensagemDoPainel(achado.painel.canalId, achado.id);
  servico.paineis.editar(servidor.id, (e) => {
    delete e.paineis[achado.id];
  });
  await ctx.responder({
    conteudo:
      `Painel \`${achado.id}\` apagado. **Os cargos que ele já deu continuam com quem os tem** — ` +
      "apagar o painel não tira cargo de ninguém.",
    efemera: true,
  });
}

// ── o comando ───────────────────────────────────────────────────────────────

const painel: Comando = {
  nome: "painel",
  descricao: "Painéis de cargos por reação (só para quem gerencia cargos)",
  apelidos: ["paineis", "cargos"],
  opcoes: [
    {
      nome: "acao",
      descricao: "o que fazer com o painel",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      escolhas: [
        { nome: "criar", valor: "criar" },
        { nome: "adicionar", valor: "adicionar" },
        { nome: "remover", valor: "remover" },
        { nome: "modo", valor: "modo" },
        { nome: "listar", valor: "listar" },
        { nome: "apagar", valor: "apagar" },
      ],
    },
    {
      nome: "alvo",
      descricao: "criar: o canal (#geral). demais: o id do painel (veja em listar)",
      tipo: TIPO_TEXTO,
    },
    {
      nome: "argumentos",
      descricao: "criar: título | descrição · adicionar: <emoji> <cargo> [rótulo] · modo: o modo",
      tipo: TIPO_TEXTO,
      restoDaLinha: true,
    },
  ],

  async executar(ctx: Contexto) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await quemGerenciaCargos(ctx, servidor))) return;

    const acao = (ctx.texto("acao") ?? "").trim().toLowerCase();
    const alvo = (ctx.texto("alvo") ?? "").trim();
    const argumentos = ctx.texto("argumentos") ?? "";

    switch (acao) {
      case "criar":
        return criar(ctx, servidor, alvo, argumentos);
      case "adicionar":
        return adicionar(ctx, servidor, alvo, argumentos);
      case "remover":
        return remover(ctx, servidor, alvo, argumentos);
      case "modo":
        return trocarModo(ctx, servidor, alvo, argumentos);
      case "listar":
        return listar(ctx, servidor);
      case "apagar":
        return apagar(ctx, servidor, alvo);
      default:
        return ctx.responder({ conteudo: `Ação desconhecida. ${AJUDA}`, efemera: true });
    }
  },
};

export const COMANDOS: Comando[] = [painel];
