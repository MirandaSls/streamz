import type { Track } from "lavalink-client";
import { TIPO_INTEIRO, type Comando } from "../runtime/tipos";
import { escaparMarkdown, truncar } from "./formatar";
import { SEM_LAVALINK, SEM_PONTE_DE_VOZ, obterServico } from "./servico";
import { canalDeVozDeQuemPediu, jogadorAtivo, podeMandar, servidorDe } from "./comandos";

const titulo = (t: Track) => `**${escaparMarkdown(truncar(t.info.title, 80))}**`;

const entrar: Comando = {
  nome: "entrar",
  descricao: "Entra no seu canal de voz sem tocar nada",
  apelidos: ["j", "join", "connect"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor || !ctx.guildId) return;
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
    const existente = servico.jogador(ctx.guildId);
    if (existente?.connected) {
      // Mover o bot de call por ordem de quem está em outra roubaria a música.
      const mesmo = existente.voiceChannelId === canal;
      await ctx.responder({
        conteudo: mesmo ? "Já estou no seu canal." : "Já estou em outro canal de voz.",
        efemera: true,
      });
      return;
    }
    await ctx.pensando();
    const jogador =
      existente ??
      servico.manager.createPlayer({
        guildId: ctx.guildId,
        voiceChannelId: canal,
        textChannelId: ctx.canalId,
        selfDeaf: true,
        volume: Number(process.env.MUSICA_VOLUME_PADRAO ?? 60),
      });
    await jogador.connect();
    if (!(await servico.esperarPonte(ctx.guildId))) {
      await jogador.destroy("sem ponte de voz").catch(() => undefined);
      await ctx.responder({ conteudo: SEM_PONTE_DE_VOZ });
      return;
    }
    await ctx.responder("Entrei no canal. `/tocar` para pôr música.");
  },
};

const desconectar: Comando = {
  nome: "desconectar",
  descricao: "Destrói o player e sai do canal de voz",
  apelidos: ["dc", "destroy", "leave", "disconnect"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor || !ctx.guildId) return;
    const jogador = obterServico().jogador(ctx.guildId);
    if (!jogador) {
      await ctx.responder({ conteudo: "Não estou em nenhum canal.", efemera: true });
      return;
    }
    if (!(await podeMandar(ctx, jogador, servidor))) return;
    await jogador.destroy("pediram /desconectar");
    await ctx.responder("Desconectei.");
  },
};

const anterior: Comando = {
  nome: "anterior",
  descricao: "Volta para a faixa anterior",
  apelidos: ["prev", "previous"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;
    const voltar = await jogador.queue.shiftPrevious();
    if (!voltar) {
      await ctx.responder({ conteudo: "Não tem faixa anterior no histórico.", efemera: true });
      return;
    }
    // A atual volta ao topo da fila, para o `/pular` seguir de onde estava.
    const atual = jogador.queue.current;
    if (atual) await jogador.queue.splice(0, 0, atual);
    await jogador.play({ clientTrack: voltar });
    await ctx.responder(`Voltei para ${titulo(voltar)}.`);
  },
};

const limparFila: Comando = {
  nome: "limpar-fila",
  descricao: "Esvazia a fila, mantendo a faixa que está tocando",
  apelidos: ["cq", "clearqueue"],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;
    const total = jogador.queue.tracks.length;
    if (total === 0) {
      await ctx.responder({ conteudo: "A fila já está vazia.", efemera: true });
      return;
    }
    await jogador.queue.splice(0, total);
    await ctx.responder(`Limpei ${total} faixa${total === 1 ? "" : "s"} da fila.`);
  },
};

const pularPara: Comando = {
  nome: "pular-para",
  descricao: "Pula para a faixa N da fila, descartando as anteriores",
  apelidos: ["skipto", "jump"],
  opcoes: [
    { nome: "posicao", descricao: "a posição na fila (ver /fila)", tipo: TIPO_INTEIRO, obrigatoria: true },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    const jogador = await jogadorAtivo(ctx);
    if (!jogador || !(await podeMandar(ctx, jogador, servidor))) return;
    const total = jogador.queue.tracks.length;
    const posicao = ctx.numero("posicao");
    if (posicao === null || !Number.isInteger(posicao) || posicao < 1 || posicao > total) {
      await ctx.responder({
        conteudo:
          total === 0
            ? "A fila está vazia — não tem para onde pular."
            : `Escolhe uma posição de 1 a ${total} (veja \`/fila\`).`,
        efemera: true,
      });
      return;
    }
    const destino = jogador.queue.tracks[posicao - 1] as Track;
    // `skip(n)` da lib descarta as n-1 anteriores e toca a n-ésima.
    await jogador.skip(posicao, false);
    await ctx.responder(`Pulei para ${titulo(destino)}.`);
  },
};

export const COMANDOS_EXTRA: Comando[] = [entrar, desconectar, anterior, limparFila, pularPara];
