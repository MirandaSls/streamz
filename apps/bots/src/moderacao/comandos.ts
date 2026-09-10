import type { Guild, GuildMember, Message, TextBasedChannel } from "discord.js";
import { TIPO_INTEIRO, TIPO_TEXTO, type Comando, type Contexto } from "../runtime/tipos";
import { analisarDuracao, escreverDuracao, explicarDuracao } from "./duracao";
import {
  COR,
  MOTIVO_PADRAO,
  analisarAlvo,
  embedDosAvisos,
  escaparMarkdown,
  textoDosAvisos,
  limparMotivo,
  plural,
  truncar,
  type AcaoDeModeracao,
} from "./formatar";
import {
  avisosDe,
  canalDeRegistro,
  definirCanalDeRegistro,
  guardarAviso,
  limparAvisos,
} from "./estado";
import { avaliar, avaliarSemAlvo, type Retrato } from "./hierarquia";
import {
  explicarErro,
  membroPorId,
  publicar,
  resolverAlvo,
  retratoDe,
  retratoDoBot,
  servidorDe,
} from "./servico";

/**
 * Os comandos do **Streamz Moderação**.
 *
 * Todo comando que age sobre alguém segue o mesmo roteiro, na mesma ordem, e
 * essa repetição é de propósito — é a forma de nenhum deles esquecer um passo:
 *
 * ```
 * servidorDe → preparar (permissão do chamador + retratos) → resolverAlvo
 *            → avaliar (as seis linhas da hierarquia)
 *            → a chamada à API, num try/catch que vira frase
 *            → publicar (registro + log)
 *            → responder
 * ```
 *
 * As recusas são **sempre efêmeras**: uma pessoa que tentou banir alguém sem
 * poder não precisa que o canal inteiro veja. As ações concluídas são públicas,
 * porque moderação escondida é o que gera a próxima discussão.
 */

// ── Permissões, no bitfield do Discord (é o que o discord.js entrega) ────────

const BANIR = 1n << 2n; // BAN_MEMBERS
const EXPULSAR = 1n << 1n; // KICK_MEMBERS
const GERENCIAR_MENSAGENS = 1n << 13n; // MANAGE_MESSAGES
const MODERAR = 1n << 40n; // MODERATE_MEMBERS
const GERENCIAR_SERVIDOR = 1n << 5n; // MANAGE_GUILD

/** Quantas mensagens o `/limpar` aceita de uma vez. O teto do Discord. */
const MAXIMO_LIMPAR = 100;

// ── O roteiro comum ─────────────────────────────────────────────────────────

interface Palco {
  servidor: Guild;
  ator: Retrato;
  atorMembro: GuildMember;
  eu: Retrato;
}

/**
 * Servidor + quem chamou + o próprio bot, os três já em retrato.
 *
 * Responde e devolve `null` quando falta qualquer um dos três — sem nunca ficar
 * calado, que é a regra deste bot.
 */
async function montarPalco(ctx: Contexto): Promise<Palco | null> {
  const servidor = await servidorDe(ctx);
  if (!servidor) return null;

  const atorMembro = await membroPorId(servidor, ctx.usuarioId);
  if (!atorMembro) {
    await ctx.responder({
      conteudo: "Não consegui ler o seu cargo neste servidor. Tenta de novo.",
      efemera: true,
    });
    return null;
  }

  const eu = await retratoDoBot(servidor, ctx.bot);
  if (!eu) {
    await ctx.responder({
      conteudo: "Não consegui me achar como membro deste servidor.",
      efemera: true,
    });
    return null;
  }

  return { servidor, ator: retratoDe(servidor, atorMembro), atorMembro, eu };
}

/**
 * O alvo, já passado pelas seis linhas da hierarquia.
 *
 * Devolve `null` **depois de já ter respondido** a recusa efêmera: quem chama
 * só precisa de `if (!alvo) return;`.
 */
async function alvoAutorizado(
  ctx: Contexto,
  palco: Palco,
  exigida: bigint,
  acao: string,
): Promise<GuildMember | null> {
  const resolucao = await resolverAlvo(palco.servidor, ctx.texto("usuario"));
  if (!resolucao.achou) {
    await ctx.responder({ conteudo: resolucao.frase, efemera: true });
    return null;
  }

  const veredito = avaliar({
    ator: palco.ator,
    alvo: retratoDe(palco.servidor, resolucao.membro),
    bot: palco.eu,
    exigida,
    acao,
  });
  if (!veredito.pode) {
    ctx.bot.log.info("ação de moderação recusada", {
      servidor: ctx.guildId,
      acao,
      motivo: veredito.motivo,
      moderador: ctx.usuarioId,
      alvo: resolucao.membro.id,
    });
    await ctx.responder({ conteudo: veredito.frase, efemera: true });
    return null;
  }

  return resolucao.membro;
}

/** Monta a `AcaoDeModeracao` com os dois nomes já resolvidos. */
function acaoDe(
  tipo: string,
  palco: Palco,
  alvo: { id: string; nome: string },
  motivo: string,
  detalhe?: string,
): AcaoDeModeracao {
  return {
    tipo,
    moderador: { id: palco.ator.id, nome: palco.ator.nome },
    alvo,
    motivo,
    ...(detalhe ? { detalhe } : {}),
    quando: Date.now(),
  };
}

/** Nome legível de um membro, já escapado para entrar numa frase. */
function nomeDe(membro: GuildMember): string {
  return escaparMarkdown(truncar(membro.displayName ?? membro.user.username, 60));
}

// ── /banir ──────────────────────────────────────────────────────────────────

const banir: Comando = {
  nome: "banir",
  descricao: "Bane alguém do servidor, com motivo e opção de apagar as mensagens recentes",
  opcoes: [
    { nome: "usuario", descricao: "quem banir (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true },
    { nome: "motivo", descricao: "por quê (vai para o registro)", tipo: TIPO_TEXTO, restoDaLinha: true },
    {
      nome: "apagar-mensagens-de",
      descricao: "apagar as mensagens dos últimos N dias",
      tipo: TIPO_INTEIRO,
      escolhas: [
        { nome: "não apagar", valor: 0 },
        { nome: "último dia", valor: 1 },
        { nome: "últimos 7 dias", valor: 7 },
      ],
    },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;
    const alvo = await alvoAutorizado(ctx, palco, BANIR, "banir");
    if (!alvo) return;

    const motivo = limparMotivo(ctx.texto("motivo"));
    // Só 0, 1 e 7: são as escolhas do Discord, e um número livre aqui viraria
    // um `deleteMessageSeconds` que a API recusa com um 400 sem explicação.
    const dias = [0, 1, 7].includes(ctx.numero("apagar-mensagens-de") ?? 0)
      ? (ctx.numero("apagar-mensagens-de") ?? 0)
      : 0;

    const nome = nomeDe(alvo);
    await ctx.pensando();
    try {
      await palco.servidor.bans.create(alvo.id, {
        reason: `${palco.ator.nome}: ${motivo}`,
        deleteMessageSeconds: dias * 24 * 60 * 60,
      });
    } catch (erro) {
      ctx.bot.log.erro("banir falhou", { alvo: alvo.id, erro });
      await ctx.responder({ conteudo: explicarErro(erro, `banir ${nome}`), efemera: true });
      return;
    }

    const detalhe = dias > 0 ? `mensagens dos últimos ${plural(dias, "dia", "dias")} apagadas` : undefined;
    await publicar(ctx, acaoDe("banir", palco, { id: alvo.id, nome: alvo.user.username }, motivo, detalhe));
    await ctx.responder(`**${nome}** foi banido. Motivo: ${escaparMarkdown(motivo)}`);
  },
};

// ── /desbanir ───────────────────────────────────────────────────────────────

const desbanir: Comando = {
  nome: "desbanir",
  descricao: "Tira o banimento de alguém (use o ID: quem está banido não aparece na lista)",
  opcoes: [
    { nome: "usuario", descricao: "o ID de quem desbanir", tipo: TIPO_TEXTO, obrigatoria: true, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;

    const veredito = avaliarSemAlvo(palco.ator, BANIR, "desbanir");
    if (!veredito.pode) {
      await ctx.responder({ conteudo: veredito.frase, efemera: true });
      return;
    }

    // Sem hierarquia aqui: quem está banido não é membro, não tem cargo, e
    // desbanir não faz mal a ninguém. O que se exige é a mesma permissão de
    // banir — senão qualquer um desfaria o trabalho de quem baniu.
    const alvo = analisarAlvo(ctx.texto("usuario"));
    let id: string | null = alvo.tipo === "id" ? alvo.id : null;
    if (alvo.tipo === "nome") {
      const membro = palco.servidor.members.cache.find(
        (m) => m.user.username.toLowerCase() === alvo.nome.toLowerCase(),
      );
      id = membro?.id ?? null;
    }
    if (!id) {
      await ctx.responder({
        conteudo:
          "Passa o **ID** de quem desbanir. Quem está banido não é membro do servidor, " +
          "então não dá para achar pelo nome.",
        efemera: true,
      });
      return;
    }

    await ctx.pensando();
    try {
      await palco.servidor.bans.remove(id, `${palco.ator.nome}: desbanimento`);
    } catch (erro) {
      ctx.bot.log.erro("desbanir falhou", { alvo: id, erro });
      await ctx.responder({ conteudo: explicarErro(erro, `desbanir \`${id}\``), efemera: true });
      return;
    }

    await publicar(ctx, acaoDe("desbanir", palco, { id, nome: id }, MOTIVO_PADRAO));
    await ctx.responder(`\`${id}\` foi desbanido.`);
  },
};

// ── /expulsar ───────────────────────────────────────────────────────────────

const expulsar: Comando = {
  nome: "expulsar",
  descricao: "Expulsa alguém do servidor (pode entrar de novo com um convite)",
  opcoes: [
    { nome: "usuario", descricao: "quem expulsar (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true },
    { nome: "motivo", descricao: "por quê (vai para o registro)", tipo: TIPO_TEXTO, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;
    const alvo = await alvoAutorizado(ctx, palco, EXPULSAR, "expulsar");
    if (!alvo) return;

    const motivo = limparMotivo(ctx.texto("motivo"));
    const nome = nomeDe(alvo);
    await ctx.pensando();
    try {
      await alvo.kick(`${palco.ator.nome}: ${motivo}`);
    } catch (erro) {
      ctx.bot.log.erro("expulsar falhou", { alvo: alvo.id, erro });
      await ctx.responder({ conteudo: explicarErro(erro, `expulsar ${nome}`), efemera: true });
      return;
    }

    await publicar(ctx, acaoDe("expulsar", palco, { id: alvo.id, nome: alvo.user.username }, motivo));
    await ctx.responder(`**${nome}** foi expulso. Motivo: ${escaparMarkdown(motivo)}`);
  },
};

// ── /silenciar ──────────────────────────────────────────────────────────────

const silenciar: Comando = {
  nome: "silenciar",
  descricao: "Silencia alguém por um tempo: 60s, 10m, 1h, 1d, 7d (máximo 28 dias)",
  apelidos: ["castigo"],
  opcoes: [
    { nome: "usuario", descricao: "quem silenciar (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true },
    { nome: "duracao", descricao: "por quanto tempo: 60s, 10m, 1h, 1d, 7d", tipo: TIPO_TEXTO, obrigatoria: true },
    { nome: "motivo", descricao: "por quê (vai para o registro)", tipo: TIPO_TEXTO, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;

    // A duração é conferida **antes** da hierarquia de propósito: é o erro de
    // digitação mais comum, e não custa nada dizer isso sem consultar a API.
    const duracao = analisarDuracao(ctx.texto("duracao"));
    if (!duracao.ok) {
      await ctx.responder({ conteudo: explicarDuracao(duracao.motivo), efemera: true });
      return;
    }

    const alvo = await alvoAutorizado(ctx, palco, MODERAR, "silenciar");
    if (!alvo) return;

    const motivo = limparMotivo(ctx.texto("motivo"));
    const nome = nomeDe(alvo);
    const tempo = escreverDuracao(duracao.ms);

    await ctx.pensando();
    try {
      await alvo.timeout(duracao.ms, `${palco.ator.nome}: ${motivo}`);
    } catch (erro) {
      ctx.bot.log.erro("silenciar falhou", { alvo: alvo.id, erro });
      await ctx.responder({ conteudo: explicarErro(erro, `silenciar ${nome}`), efemera: true });
      return;
    }

    await publicar(
      ctx,
      acaoDe("silenciar", palco, { id: alvo.id, nome: alvo.user.username }, motivo, `por ${tempo}`),
    );
    await ctx.responder(`**${nome}** está silenciado por ${tempo}. Motivo: ${escaparMarkdown(motivo)}`);
  },
};

// ── /dessilenciar ───────────────────────────────────────────────────────────

const dessilenciar: Comando = {
  nome: "dessilenciar",
  descricao: "Tira o silenciamento de alguém antes da hora",
  opcoes: [
    { nome: "usuario", descricao: "quem soltar (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;
    const alvo = await alvoAutorizado(ctx, palco, MODERAR, "dessilenciar");
    if (!alvo) return;

    const nome = nomeDe(alvo);
    if (!alvo.isCommunicationDisabled()) {
      await ctx.responder({ conteudo: `**${nome}** não está silenciado.`, efemera: true });
      return;
    }

    await ctx.pensando();
    try {
      await alvo.timeout(null, `${palco.ator.nome}: fim do silenciamento`);
    } catch (erro) {
      ctx.bot.log.erro("dessilenciar falhou", { alvo: alvo.id, erro });
      await ctx.responder({ conteudo: explicarErro(erro, `soltar ${nome}`), efemera: true });
      return;
    }

    await publicar(
      ctx,
      acaoDe("dessilenciar", palco, { id: alvo.id, nome: alvo.user.username }, MOTIVO_PADRAO),
    );
    await ctx.responder(`**${nome}** não está mais silenciado.`);
  },
};

// ── /limpar ─────────────────────────────────────────────────────────────────

/**
 * Apaga N mensagens recentes do canal, uma a uma.
 *
 * **Uma a uma e não em bloco** porque a casca de compatibilidade não tem o
 * `POST /channels/:id/messages/bulk-delete` do Discord. Isso tem um lado bom
 * que vale registrar: o `bulk-delete` do Discord recusa mensagem com mais de
 * 14 dias, e o `DELETE` unitário não — então aqui `/limpar` alcança mensagem
 * velha, que é justamente o caso em que o moderador mais precisa dele.
 *
 * O preço é uma chamada por mensagem. Por isso o teto de 100 (o mesmo do
 * Discord), o `pensando()` antes e o `Promise.allSettled` em lotes pequenos: um
 * laço estritamente serial de 100 mensagens leva mais que os 15 minutos de vida
 * da interação em rede ruim.
 */
const limpar: Comando = {
  nome: "limpar",
  descricao: "Apaga as mensagens recentes deste canal (1 a 100), opcionalmente só de uma pessoa",
  apelidos: ["purgar"],
  opcoes: [
    { nome: "quantidade", descricao: "quantas mensagens apagar (1 a 100)", tipo: TIPO_INTEIRO, obrigatoria: true },
    { nome: "de", descricao: "apagar só as mensagens desta pessoa", tipo: TIPO_TEXTO, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;

    const veredito = avaliarSemAlvo(palco.ator, GERENCIAR_MENSAGENS, "limpar");
    if (!veredito.pode) {
      await ctx.responder({ conteudo: veredito.frase, efemera: true });
      return;
    }

    const pedido = ctx.numero("quantidade");
    if (pedido === null || !Number.isInteger(pedido) || pedido < 1 || pedido > MAXIMO_LIMPAR) {
      await ctx.responder({
        conteudo: `Diz quantas mensagens apagar, de 1 a ${MAXIMO_LIMPAR}.`,
        efemera: true,
      });
      return;
    }

    let so: GuildMember | null = null;
    const filtro = ctx.texto("de");
    if (filtro && filtro.trim() !== "") {
      const resolucao = await resolverAlvo(palco.servidor, filtro);
      if (!resolucao.achou) {
        await ctx.responder({ conteudo: resolucao.frase, efemera: true });
        return;
      }
      so = resolucao.membro;
    }

    // `fetch` como plano B: o cache do cliente é montado no `GUILD_CREATE`, e um
    // canal criado depois disso só entra nele quando o `CHANNEL_CREATE` chega —
    // que é rápido, mas não é garantido ter chegado.
    const canal = (ctx.bot.cliente.channels.cache.get(ctx.canalId) ??
      (await ctx.bot.cliente.channels.fetch(ctx.canalId).catch(() => null))) as
      | TextBasedChannel
      | null;
    if (!canal || !("messages" in canal)) {
      await ctx.responder({ conteudo: "Não consigo ler as mensagens deste canal.", efemera: true });
      return;
    }

    // Efêmera: a confirmação de uma limpeza não pode ser a primeira mensagem
    // nova do canal que acabou de ser limpo.
    await ctx.pensando(true);

    let alvos: Message[];
    try {
      const recentes = await canal.messages.fetch({ limit: MAXIMO_LIMPAR });
      alvos = [...recentes.values()]
        .filter((m) => (so ? m.author.id === so.id : true))
        .slice(0, pedido);
    } catch (erro) {
      ctx.bot.log.erro("limpar: leitura falhou", { canal: ctx.canalId, erro });
      await ctx.responder({ conteudo: explicarErro(erro, "ler as mensagens do canal"), efemera: true });
      return;
    }

    if (alvos.length === 0) {
      await ctx.responder({ conteudo: "Não achei mensagem nenhuma para apagar aqui.", efemera: true });
      return;
    }

    let apagadas = 0;
    let recusadas = 0;
    const LOTE = 5;
    for (let i = 0; i < alvos.length; i += LOTE) {
      const resultados = await Promise.allSettled(
        alvos.slice(i, i + LOTE).map((m) => m.delete()),
      );
      for (const r of resultados) {
        if (r.status === "fulfilled") apagadas++;
        else recusadas++;
      }
    }

    const de = so ? ` de **${nomeDe(so)}**` : "";
    const sobra = recusadas > 0 ? ` (${recusadas} eu não consegui apagar)` : "";
    await publicar(
      ctx,
      acaoDe(
        "limpar",
        palco,
        { id: so?.id ?? ctx.canalId, nome: so?.user.username ?? `#${ctx.canalId}` },
        MOTIVO_PADRAO,
        `${plural(apagadas, "mensagem apagada", "mensagens apagadas")}${so ? ` de ${so.user.username}` : ""}`,
      ),
    );
    await ctx.responder({
      conteudo: `Apaguei ${plural(apagadas, "mensagem", "mensagens")}${de}${sobra}.`,
      efemera: true,
    });
  },
};

// ── /aviso, /avisos, /limpar-avisos ─────────────────────────────────────────

const aviso: Comando = {
  nome: "aviso",
  descricao: "Registra um aviso para alguém (fica guardado e aparece em /avisos)",
  apelidos: ["advertir"],
  opcoes: [
    { nome: "usuario", descricao: "quem avisar (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true },
    { nome: "motivo", descricao: "por quê", tipo: TIPO_TEXTO, obrigatoria: true, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;
    const alvo = await alvoAutorizado(ctx, palco, MODERAR, "avisar");
    if (!alvo) return;

    const motivo = (ctx.texto("motivo") ?? "").trim();
    if (motivo === "") {
      await ctx.responder({ conteudo: "Um aviso sem motivo não serve para nada. Diz por quê.", efemera: true });
      return;
    }

    // A escrita no disco pode falhar (volume não montado, disco cheio). Sem este
    // `catch` o moderador leria "deu erro aqui do meu lado" — verdadeiro e
    // inútil. Ver `estado.ts` para onde o arquivo mora.
    let guardado;
    let quantos: number;
    try {
      guardado = await guardarAviso(palco.servidor.id, alvo.id, {
        moderadorId: palco.ator.id,
        moderadorNome: palco.ator.nome,
        motivo: limparMotivo(motivo),
        quando: Date.now(),
      });
      quantos = (await avisosDe(palco.servidor.id, alvo.id)).length;
    } catch (erro) {
      ctx.bot.log.erro("não deu para guardar o aviso", { servidor: ctx.guildId, erro });
      await ctx.responder({
        conteudo: "Não consegui guardar o aviso — o meu arquivo de estado não aceitou a escrita. Avisa quem cuida do servidor.",
        efemera: true,
      });
      return;
    }

    const nome = nomeDe(alvo);
    await publicar(
      ctx,
      acaoDe("aviso", palco, { id: alvo.id, nome: alvo.user.username }, guardado.motivo, `aviso #${guardado.id}`),
    );
    await ctx.responder(
      `**${nome}** recebeu o aviso \`#${guardado.id}\` — agora tem ${plural(quantos, "aviso", "avisos")}. ` +
        `Motivo: ${escaparMarkdown(guardado.motivo)}`,
    );
  },
};

const avisos: Comando = {
  nome: "avisos",
  descricao: "Lista os avisos que alguém já recebeu neste servidor",
  opcoes: [
    { nome: "usuario", descricao: "de quem (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;

    // Ver a ficha de alguém é moderação, mesmo sem mexer em ninguém: a lista
    // diz quem denunciou quem. Exige a mesma permissão de dar aviso — mas
    // **não** a hierarquia: consultar não é agir.
    const veredito = avaliarSemAlvo(palco.ator, MODERAR, "ver avisos");
    if (!veredito.pode) {
      await ctx.responder({ conteudo: veredito.frase, efemera: true });
      return;
    }

    const resolucao = await resolverAlvo(palco.servidor, ctx.texto("usuario"));
    if (!resolucao.achou) {
      await ctx.responder({ conteudo: resolucao.frase, efemera: true });
      return;
    }

    const lista = await avisosDe(palco.servidor.id, resolucao.membro.id);
    const quem = {
      id: resolucao.membro.id,
      nome: resolucao.membro.displayName ?? resolucao.membro.user.username,
    };
    // Texto **e** embed: a API descarta os embeds hoje (F5), e uma resposta que
    // vivesse só no embed seria uma resposta vazia. Ver `formatar.ts`.
    await ctx.responder({
      conteudo: textoDosAvisos(quem, lista),
      embeds: [embedDosAvisos(quem, lista)],
      efemera: true,
    });
  },
};

const limparAvisosComando: Comando = {
  nome: "limpar-avisos",
  descricao: "Apaga todos os avisos de alguém neste servidor",
  opcoes: [
    { nome: "usuario", descricao: "de quem (menção, nome de usuário ou ID)", tipo: TIPO_TEXTO, obrigatoria: true, restoDaLinha: true },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;
    const alvo = await alvoAutorizado(ctx, palco, MODERAR, "limpar os avisos de");
    if (!alvo) return;

    let quantos: number;
    try {
      quantos = await limparAvisos(palco.servidor.id, alvo.id);
    } catch (erro) {
      ctx.bot.log.erro("não deu para limpar os avisos", { servidor: ctx.guildId, erro });
      await ctx.responder({
        conteudo: "Não consegui apagar os avisos — o meu arquivo de estado não aceitou a escrita.",
        efemera: true,
      });
      return;
    }
    const nome = nomeDe(alvo);
    if (quantos === 0) {
      await ctx.responder({ conteudo: `**${nome}** não tinha aviso nenhum.`, efemera: true });
      return;
    }

    await publicar(
      ctx,
      acaoDe(
        "limpar-avisos",
        palco,
        { id: alvo.id, nome: alvo.user.username },
        MOTIVO_PADRAO,
        `${plural(quantos, "aviso apagado", "avisos apagados")}`,
      ),
    );
    await ctx.responder(`Apaguei ${plural(quantos, "aviso", "avisos")} de **${nome}**.`);
  },
};

// ── /registro-de-moderacao ──────────────────────────────────────────────────

const registroDeModeracao: Comando = {
  nome: "registro-de-moderacao",
  descricao: "Define o canal onde eu publico cada ação de moderação (quem, em quem, por quê, quando)",
  opcoes: [
    {
      nome: "canal",
      descricao: "o canal (#nome ou ID); `nenhum` para desligar",
      tipo: TIPO_TEXTO,
      restoDaLinha: true,
    },
  ],
  async executar(ctx) {
    const palco = await montarPalco(ctx);
    if (!palco) return;

    const veredito = avaliarSemAlvo(palco.ator, GERENCIAR_SERVIDOR, "configurar o registro");
    if (!veredito.pode) {
      await ctx.responder({ conteudo: veredito.frase, efemera: true });
      return;
    }

    const bruto = (ctx.texto("canal") ?? "").trim();

    // Sem argumento: diz o que está valendo. É a pergunta mais frequente e
    // custa uma leitura de arquivo.
    if (bruto === "") {
      const atual = await canalDeRegistro(palco.servidor.id);
      await ctx.responder({
        conteudo: atual
          ? `O registro está indo para <#${atual}>. Para trocar: \`/registro-de-moderacao <canal>\`.`
          : "Não há canal de registro configurado. Use `/registro-de-moderacao <canal>`.",
        efemera: true,
      });
      return;
    }

    if (/^(nenhum|nada|desligar|off)$/i.test(bruto)) {
      await definirCanalDeRegistro(palco.servidor.id, null);
      await ctx.responder({ conteudo: "Registro de moderação desligado.", efemera: true });
      return;
    }

    const id = idDeCanal(bruto, palco.servidor);
    if (!id) {
      await ctx.responder({
        conteudo: `Não achei o canal **${escaparMarkdown(truncar(bruto, 60))}** aqui. Passa \`#nome\` ou o ID.`,
        efemera: true,
      });
      return;
    }

    const canal = palco.servidor.channels.cache.get(id);
    if (!canal?.isTextBased()) {
      await ctx.responder({ conteudo: "Esse canal não é de texto — não dá para escrever nele.", efemera: true });
      return;
    }

    try {
      await definirCanalDeRegistro(palco.servidor.id, id);
    } catch (erro) {
      ctx.bot.log.erro("não deu para guardar o canal de registro", { servidor: ctx.guildId, erro });
      await ctx.responder({
        conteudo: "Não consegui guardar essa configuração — o meu arquivo de estado não aceitou a escrita.",
        efemera: true,
      });
      return;
    }
    const aviso =
      `**Registro de moderação configurado** em **#${escaparMarkdown(canal.name ?? id)}**.\n` +
      "A partir de agora eu publico lá cada ação: quem fez, em quem, o motivo e quando.\n" +
      "Para desligar: `/registro-de-moderacao nenhum`.";
    await ctx.responder({
      conteudo: aviso,
      embeds: [{ color: COR, title: "Registro de moderação configurado", description: aviso }],
    });
    await publicar(
      ctx,
      acaoDe("registro-de-moderacao", palco, { id, nome: canal.name ?? id }, MOTIVO_PADRAO),
    );
  },
};

/** `#geral`, `<#123>` ou `123` → o id do canal, se ele existir no servidor. */
function idDeCanal(bruto: string, servidor: Guild): string | null {
  const mencao = /^<#(\d{1,32})>$/.exec(bruto);
  if (mencao) return servidor.channels.cache.has(mencao[1]!) ? mencao[1]! : null;
  if (/^\d{15,32}$/.test(bruto)) return servidor.channels.cache.has(bruto) ? bruto : null;

  const nome = bruto.replace(/^#+/, "").trim().toLowerCase();
  const achado = servidor.channels.cache.find((c) => (c.name ?? "").toLowerCase() === nome);
  return achado?.id ?? null;
}

export const COMANDOS: Comando[] = [
  banir,
  desbanir,
  expulsar,
  silenciar,
  dessilenciar,
  limpar,
  aviso,
  avisos,
  limparAvisosComando,
  registroDeModeracao,
];
