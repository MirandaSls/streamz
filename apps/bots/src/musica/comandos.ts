import type { APIEmbed, Client, Guild } from "discord.js";
import type { Player, Track } from "lavalink-client";
import {
  TIPO_INTEIRO,
  TIPO_TEXTO,
  type Comando,
  type Contexto,
} from "../runtime/tipos";
import {
  barraDeProgresso,
  ehLinkDoSpotify,
  escaparMarkdown,
  formatarDuracao,
  formatarDuracaoOuAoVivo,
  linhaDaFaixa,
  nomeDoModoDeRepeticao,
  truncar,
} from "./formatar";
import { SEM_LAVALINK, SEM_PONTE_DE_VOZ, dadosDaFaixa, obterServico } from "./servico";

/** Volt Lime (`design.md`): a cor de destaque do Streamz. */
const COR = 0x9be31f;

/** Quantas faixas o `/fila` lista antes de resumir o resto. */
const FAIXAS_LISTADAS = 10;

// ── Ajudantes ───────────────────────────────────────────────────────────────

/** Comando de música exige servidor: em DM não há canal de voz para entrar. */
async function servidorDe(ctx: Contexto): Promise<Guild | null> {
  if (!ctx.guildId) {
    await ctx.responder({ conteudo: "Só funciona dentro de um servidor.", efemera: true });
    return null;
  }
  const cliente = ctx.bot.cliente as Client<true>;
  const servidor = cliente.guilds.cache.get(ctx.guildId);
  if (!servidor) {
    await ctx.responder({ conteudo: "Não achei este servidor no meu cache.", efemera: true });
    return null;
  }
  return servidor;
}

/**
 * O canal de voz de **quem pediu**.
 *
 * `members.fetch` como plano B porque o cache do membro pode não estar quente
 * (o bot acabou de subir, ou o intent de membros não está ligado); o estado de
 * voz em si vem do `voice_states` do `GUILD_CREATE` e do `VOICE_STATE_UPDATE`.
 */
async function canalDeVozDeQuemPediu(ctx: Contexto, servidor: Guild): Promise<string | null> {
  const membro =
    servidor.members.cache.get(ctx.usuarioId) ??
    (await servidor.members.fetch(ctx.usuarioId).catch(() => null));
  return membro?.voice?.channelId ?? null;
}

/** O jogador daquele servidor, ou uma resposta dizendo que não há nada tocando. */
async function jogadorAtivo(ctx: Contexto): Promise<Player | null> {
  if (!ctx.guildId) {
    await ctx.responder({ conteudo: "Só funciona dentro de um servidor.", efemera: true });
    return null;
  }
  const jogador = obterServico().jogador(ctx.guildId);
  if (!jogador || !jogador.queue.current) {
    await ctx.responder({ conteudo: "Não tem nada tocando agora.", efemera: true });
    return null;
  }
  return jogador;
}

/**
 * Só quem está **no mesmo canal** manda no player.
 *
 * Sem isto, qualquer pessoa do servidor pausa a música de uma call em que nem
 * está — é a regra que todo bot de música tem e a primeira reclamação de quem
 * não a tem.
 */
async function podeMandar(ctx: Contexto, jogador: Player, servidor: Guild): Promise<boolean> {
  const meuCanal = await canalDeVozDeQuemPediu(ctx, servidor);
  if (meuCanal && meuCanal === jogador.voiceChannelId) return true;
  await ctx.responder({
    conteudo: "Entra no canal de voz em que eu estou tocando para mandar nos controles.",
    efemera: true,
  });
  return false;
}

function embedDaFaixa(titulo: string, faixa: Track, rodape?: string): APIEmbed {
  const info = faixa.info;
  return {
    color: COR,
    title: truncar(titulo, 250),
    description: `**${escaparMarkdown(truncar(info.title, 100))}**\n${escaparMarkdown(
      truncar(info.author, 60),
    )}`,
    ...(info.uri ? { url: info.uri } : {}),
    ...(info.artworkUrl ? { thumbnail: { url: info.artworkUrl } } : {}),
    fields: [
      {
        name: "Duração",
        value: formatarDuracaoOuAoVivo(info.duration, info.isStream),
        inline: true,
      },
    ],
    ...(rodape ? { footer: { text: truncar(rodape, 200) } } : {}),
  };
}

// ── /tocar ──────────────────────────────────────────────────────────────────

const tocar: Comando = {
  nome: "tocar",
  descricao: "Toca uma música (busca ou link). Se já estiver tocando, entra na fila",
  apelidos: ["play", "p"],
  opcoes: [
    {
      nome: "busca",
      descricao: "termo de busca ou link",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      restoDaLinha: true,
    },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;

    const consulta = ctx.texto("busca")?.trim();
    if (!consulta) {
      await ctx.responder({ conteudo: "Diz o que eu procuro: `/tocar <busca ou link>`.", efemera: true });
      return;
    }

    const canal = await canalDeVozDeQuemPediu(ctx, servidor);
    if (!canal) {
      await ctx.responder({ conteudo: "Entra num canal de voz primeiro.", efemera: true });
      return;
    }

    const servico = obterServico();
    if (!servico.lavalinkNoAr) {
      await ctx.responder({ conteudo: SEM_LAVALINK, efemera: true });
      return;
    }

    // Buscar e conectar levam mais que os ~2 s do relógio da interação.
    await ctx.pensando();

    const jogador =
      servico.jogador(ctx.guildId!) ??
      servico.manager.createPlayer({
        guildId: ctx.guildId!,
        voiceChannelId: canal,
        textChannelId: ctx.canalId,
        selfDeaf: true,
        volume: Number(process.env.MUSICA_VOLUME_PADRAO ?? 60),
      });

    if (!jogador.connected) {
      await jogador.connect();
      // **A dependência declarada**: sem a ponte de voz no ar a API nem chega a
      // mandar o `VOICE_SERVER_UPDATE` (ela recusa assinar o token e registra no
      // log). Sem esta espera, o bot ficaria pendurado até o relógio do Lavalink.
      const temPonte = await servico.esperarPonte(ctx.guildId!);
      if (!temPonte) {
        ctx.bot.log.aviso("sem VOICE_SERVER_UPDATE: a ponte de voz não está no ar", {
          servidor: ctx.guildId,
        });
        await jogador.destroy("sem ponte de voz").catch(() => undefined);
        await ctx.responder({ conteudo: SEM_PONTE_DE_VOZ });
        return;
      }
    }

    const resultado = await servico.buscar(jogador, consulta, ctx.usuarioId);
    if (!resultado.tracks?.length) {
      await ctx.responder(`Não achei nada para **${escaparMarkdown(truncar(consulta, 80))}**.`);
      return;
    }

    const avisoDoSpotify = ehLinkDoSpotify(consulta)
      ? "Link do Spotify vira **busca**: o Spotify não entrega áudio a terceiros, " +
        "então eu toco a gravação equivalente que eu achar."
      : undefined;

    // Playlist inteira ou uma faixa só.
    if (resultado.loadType === "playlist") {
      jogador.queue.add(resultado.tracks);
      const total = resultado.tracks.length;
      if (!jogador.playing) await jogador.play();
      await ctx.responder({
        embeds: [
          {
            color: COR,
            title: "Playlist na fila",
            description: `**${escaparMarkdown(
              truncar(resultado.playlist?.name ?? "Playlist", 100),
            )}** — ${total} faixa${total === 1 ? "" : "s"}`,
            ...(avisoDoSpotify ? { footer: { text: avisoDoSpotify } } : {}),
          },
        ],
      });
      return;
    }

    const faixa = resultado.tracks[0]!;
    const jaTocando = Boolean(jogador.queue.current);
    jogador.queue.add(faixa);
    if (!jogador.playing) await jogador.play();

    const posicao = jogador.queue.tracks.length;
    await ctx.responder({
      embeds: [
        embedDaFaixa(
          jaTocando ? `Na fila, posição ${posicao}` : "Tocando agora",
          faixa,
          avisoDoSpotify,
        ),
      ],
    });
  },
};

// ── /fila ───────────────────────────────────────────────────────────────────

const fila: Comando = {
  nome: "fila",
  descricao: "Mostra o que está tocando e o que vem depois",
  apelidos: ["queue", "q"],
  async executar(ctx) {
    if (!ctx.guildId) {
      await ctx.responder({ conteudo: "Só funciona dentro de um servidor.", efemera: true });
      return;
    }
    const jogador = obterServico().jogador(ctx.guildId);
    const atual = jogador?.queue.current;
    if (!jogador || !atual) {
      await ctx.responder({ conteudo: "A fila está vazia.", efemera: true });
      return;
    }

    const proximas = jogador.queue.tracks as Track[];
    const listadas = proximas.slice(0, FAIXAS_LISTADAS);
    const linhas = listadas.map((t, i) => `\`${i + 1}.\` ${linhaDaFaixa(dadosDaFaixa(t))}`);
    const sobra = proximas.length - listadas.length;
    if (sobra > 0) linhas.push(`… e mais ${sobra} faixa${sobra === 1 ? "" : "s"}.`);

    const duracaoTotal = jogador.queue.utils.totalDuration();

    await ctx.responder({
      embeds: [
        {
          color: COR,
          title: "Fila",
          description: [
            `**Tocando:** ${linhaDaFaixa(dadosDaFaixa(atual))}`,
            "",
            ...(linhas.length > 0 ? linhas : ["_Nada depois desta._"]),
          ].join("\n"),
          footer: {
            text:
              `${proximas.length} na fila · ${formatarDuracao(duracaoTotal)} no total · ` +
              `repetição: ${nomeDoModoDeRepeticao(jogador.repeatMode)}`,
          },
        },
      ],
    });
  },
};

// ── /agora ──────────────────────────────────────────────────────────────────

const agora: Comando = {
  nome: "agora",
  descricao: "O que está tocando, com barra de progresso",
  apelidos: ["np", "tocando"],
  async executar(ctx) {
    const jogador = await jogadorAtivo(ctx);
    if (!jogador) return;
    const atual = jogador.queue.current!;
    const aoVivo = atual.info.isStream;
    const posicao = jogador.position;

    const barra = aoVivo
      ? "🔴 ao vivo"
      : `${formatarDuracao(posicao)} ${barraDeProgresso(posicao, atual.info.duration)} ` +
        formatarDuracao(atual.info.duration);

    await ctx.responder({
      embeds: [
        {
          ...embedDaFaixa(jogador.paused ? "Pausado" : "Tocando agora", atual),
          fields: [
            { name: "Progresso", value: barra, inline: false },
            { name: "Volume", value: `${jogador.volume}%`, inline: true },
            {
              name: "Repetição",
              value: nomeDoModoDeRepeticao(jogador.repeatMode),
              inline: true,
            },
          ],
        },
      ],
    });
  },
};

// ── Controles ───────────────────────────────────────────────────────────────

const pular: Comando = {
  nome: "pular",
  descricao: "Pula para a próxima da fila",
  apelidos: ["skip", "s"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;

    const saindo = jogador.queue.current!;
    if (jogador.queue.tracks.length === 0) {
      // `skip` sem próxima lança na lib (`throwError` padrão). Parar é o que o
      // usuário espera, e sem exceção no log.
      await jogador.stopPlaying(true, false);
      await ctx.responder(`Pulei **${escaparMarkdown(truncar(saindo.info.title, 80))}**. A fila acabou.`);
      return;
    }
    await jogador.skip(undefined, false);
    await ctx.responder(`Pulei **${escaparMarkdown(truncar(saindo.info.title, 80))}**.`);
  },
};

const pausar: Comando = {
  nome: "pausar",
  descricao: "Pausa o que está tocando",
  apelidos: ["pause"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;
    if (jogador.paused) {
      await ctx.responder({ conteudo: "Já está pausado.", efemera: true });
      return;
    }
    await jogador.pause();
    await ctx.responder("Pausado. `/continuar` para voltar.");
  },
};

const continuar: Comando = {
  nome: "continuar",
  descricao: "Continua de onde parou",
  apelidos: ["resume", "despausar"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;
    if (!jogador.paused) {
      await ctx.responder({ conteudo: "Não está pausado.", efemera: true });
      return;
    }
    await jogador.resume();
    await ctx.responder("Voltando.");
  },
};

const parar: Comando = {
  nome: "parar",
  descricao: "Para tudo, limpa a fila e sai do canal",
  apelidos: ["stop", "sair"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!ctx.guildId) return;
    const jogador = obterServico().jogador(ctx.guildId);
    if (!jogador) {
      await ctx.responder({ conteudo: "Não estou em nenhum canal.", efemera: true });
      return;
    }
    if (!(await podeMandar(ctx, jogador, servidor))) return;
    await jogador.destroy("pediram /parar");
    await ctx.responder("Parei e saí do canal.");
  },
};

const volume: Comando = {
  nome: "volume",
  descricao: "Ajusta o volume, de 0 a 100",
  apelidos: ["vol"],
  opcoes: [{ nome: "nivel", descricao: "de 0 a 100", tipo: TIPO_INTEIRO, obrigatoria: true }],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;

    const pedido = ctx.numero("nivel");
    if (pedido === null || !Number.isFinite(pedido) || pedido < 0 || pedido > 100) {
      await ctx.responder({ conteudo: "O volume vai de 0 a 100.", efemera: true });
      return;
    }
    await jogador.setVolume(Math.round(pedido));
    await ctx.responder(`Volume em **${Math.round(pedido)}%**.`);
  },
};

const embaralhar: Comando = {
  nome: "embaralhar",
  descricao: "Embaralha a fila",
  apelidos: ["shuffle"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;
    if (jogador.queue.tracks.length < 2) {
      await ctx.responder({ conteudo: "Precisa de pelo menos duas na fila.", efemera: true });
      return;
    }
    const total = await jogador.queue.shuffle();
    await ctx.responder(`Embaralhei ${total} faixa${total === 1 ? "" : "s"}.`);
  },
};

const remover: Comando = {
  nome: "remover",
  descricao: "Tira uma faixa da fila pela posição",
  apelidos: ["rm"],
  opcoes: [
    { nome: "posicao", descricao: "a posição na fila (ver /fila)", tipo: TIPO_INTEIRO, obrigatoria: true },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;

    const posicao = ctx.numero("posicao");
    const total = jogador.queue.tracks.length;
    if (posicao === null || !Number.isInteger(posicao) || posicao < 1 || posicao > total) {
      await ctx.responder({
        conteudo:
          total === 0
            ? "A fila está vazia — não tem o que remover."
            : `Escolhe uma posição de 1 a ${total} (veja \`/fila\`).`,
        efemera: true,
      });
      return;
    }
    // A fila do usuário começa em 1; a da lib, em 0.
    const [removida] = (await jogador.queue.splice(posicao - 1, 1)) as Track[];
    await ctx.responder(
      `Removi **${escaparMarkdown(truncar(removida?.info.title ?? "a faixa", 80))}** da fila.`,
    );
  },
};

const repetir: Comando = {
  nome: "repetir",
  descricao: "Repetição: desligada, na faixa ou na fila",
  apelidos: ["loop"],
  opcoes: [
    {
      nome: "modo",
      descricao: "off, faixa ou fila",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      escolhas: [
        { nome: "desligada", valor: "off" },
        { nome: "faixa", valor: "track" },
        { nome: "fila", valor: "queue" },
      ],
    },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;

    // O `/` manda o valor da escolha (`off`/`track`/`queue`); o `!repetir` manda
    // o que a pessoa digitou, em português. Os dois têm de valer.
    const bruto = (ctx.texto("modo") ?? "").trim().toLowerCase();
    const traducao: Record<string, "off" | "track" | "queue"> = {
      off: "off",
      desligada: "off",
      desligado: "off",
      nao: "off",
      track: "track",
      faixa: "track",
      musica: "track",
      queue: "queue",
      fila: "queue",
    };
    const modo = traducao[bruto];
    if (!modo) {
      await ctx.responder({ conteudo: "Escolhe: `off`, `faixa` ou `fila`.", efemera: true });
      return;
    }
    await jogador.setRepeatMode(modo);
    await ctx.responder(`Repetição: **${nomeDoModoDeRepeticao(modo)}**.`);
  },
};

export const COMANDOS: Comando[] = [
  tocar,
  fila,
  agora,
  pular,
  pausar,
  continuar,
  parar,
  volume,
  embaralhar,
  remover,
  repetir,
];
