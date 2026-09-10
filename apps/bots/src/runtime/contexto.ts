import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { analisarArgumentos } from "./argumentos";
import type { Comando, Contexto, ContextoDoBot, RespostaDeComando } from "./tipos";

/**
 * Os dois adaptadores que fazem `/tocar` e `!tocar` chegarem ao **mesmo**
 * `executar(ctx)`.
 *
 * Toda a diferença entre as duas entradas está contida aqui:
 *
 * | | comando de barra | prefixo `!` |
 * |---|---|---|
 * | "pensando…" | `deferReply()` (tipo 5) | `sendTyping()` |
 * | responder | `editReply` se adiou, senão `reply` | `message.reply` |
 * | efêmera | `flags: 64` de verdade | resposta normal (não existe efêmera em canal) |
 * | opções | `interaction.options.get*` | posicional, `argumentos.ts` |
 */

function normalizar(resposta: RespostaDeComando | string): RespostaDeComando {
  return typeof resposta === "string" ? { conteudo: resposta } : resposta;
}

// ── Comando de barra ────────────────────────────────────────────────────────

export function contextoDaInteracao(
  bot: ContextoDoBot,
  interacao: ChatInputCommandInteraction,
): Contexto {
  let adiada = false;
  let respondida = false;

  return {
    bot,
    guildId: interacao.guildId,
    canalId: interacao.channelId,
    usuarioId: interacao.user.id,
    usuario: interacao.user.displayName ?? interacao.user.username,
    ehSlash: true,

    texto: (nome) => interacao.options.getString(nome),
    // `getInteger` recusa `4.5`; a música usa inteiros (volume, posição na
    // fila), mas um comando futuro pode declarar `TIPO_NUMERO` — daí o segundo
    // caminho, que não custa nada.
    numero: (nome) => interacao.options.getInteger(nome) ?? interacao.options.getNumber(nome),

    async pensando(efemera) {
      if (adiada || respondida) return;
      await interacao.deferReply(efemera ? { flags: MessageFlags.Ephemeral } : {});
      adiada = true;
    },

    async responder(bruta) {
      const resposta = normalizar(bruta);
      const corpo = {
        ...(resposta.conteudo !== undefined ? { content: resposta.conteudo } : {}),
        ...(resposta.embeds ? { embeds: resposta.embeds } : {}),
      };

      if (adiada) {
        // Depois do defer a efêmera **já está decidida** (ela veio no tipo 5);
        // mandar `flags` de novo no `editReply` não muda nada e algumas versões
        // reclamam. Por isso o `pensando(true)` existe.
        await interacao.editReply(corpo);
      } else if (respondida) {
        await interacao.followUp({
          ...corpo,
          ...(resposta.efemera ? { flags: MessageFlags.Ephemeral } : {}),
        });
      } else {
        await interacao.reply({
          ...corpo,
          ...(resposta.efemera ? { flags: MessageFlags.Ephemeral } : {}),
        });
      }
      respondida = true;
    },
  };
}

// ── Prefixo `!` ─────────────────────────────────────────────────────────────

export function contextoDaMensagem(
  bot: ContextoDoBot,
  comando: Comando,
  mensagem: Message,
  resto: string,
): Contexto {
  const valores = analisarArgumentos(comando, resto);

  return {
    bot,
    guildId: mensagem.guildId,
    canalId: mensagem.channelId,
    usuarioId: mensagem.author.id,
    usuario: mensagem.author.displayName ?? mensagem.author.username,
    ehSlash: false,

    texto: (nome) => valores.get(nome) ?? null,
    numero: (nome) => {
      const bruto = valores.get(nome);
      if (bruto === undefined) return null;
      const n = Number(bruto);
      return Number.isFinite(n) ? n : null;
    },

    async pensando() {
      // `sendTyping` é o análogo honesto do "pensando…": some sozinho em 10 s e
      // não deixa mensagem para editar. Falhar aqui não pode derrubar o
      // comando — é enfeite.
      try {
        if (mensagem.channel.isSendable()) await mensagem.channel.sendTyping();
      } catch {
        /* enfeite */
      }
    },

    async responder(bruta) {
      const resposta = normalizar(bruta);
      await mensagem.reply({
        ...(resposta.conteudo !== undefined ? { content: resposta.conteudo } : {}),
        ...(resposta.embeds ? { embeds: resposta.embeds } : {}),
      });
    },
  };
}
