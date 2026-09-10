/**
 * A cola entre os comandos e a API: achar gente, publicar o registro e
 * traduzir erro de rede em frase.
 *
 * Nada aqui é puro (por isso mora fora de `hierarquia.ts` e `formatar.ts`), e
 * nada aqui decide política: quem decide quem pode o quê é `avaliar()`.
 *
 * ## O que a casca de compatibilidade ainda não tem — e o que o bot faz nisso
 *
 * A `discord-compat` de hoje é **leitura** para servidor e membros: existem
 * `GET /guilds/:id`, `/guilds/:id/roles`, `/guilds/:id/members/:uid`,
 * `GET|POST|DELETE /channels/:id/messages…`. **Não existem** as rotas de
 * escrita que o Discord tem para moderação:
 *
 * | o que o bot chama | rota | existe? |
 * |---|---|---|
 * | `member.ban()` | `PUT /guilds/:id/bans/:uid` | não |
 * | `guild.bans.remove()` | `DELETE /guilds/:id/bans/:uid` | não |
 * | `member.kick()` | `DELETE /guilds/:id/members/:uid` | não |
 * | `member.disableCommunicationUntil()` | `PATCH /guilds/:id/members/:uid` | não |
 * | `channel.bulkDelete()` | `POST /channels/:id/messages/bulk-delete` | não |
 *
 * O Streamz **tem** o comportamento — `apps/api/src/modules/moderation/` expõe
 * `POST /api/guilds/:g/members/:u/ban`, `…/kick`, `…/timeout` e
 * `DELETE /api/channels/:c/messages` —, mas essas rotas são do REST interno,
 * atrás do `JwtGuard`: o credencial delas é o token de uma **pessoa**, e um bot
 * tem token de bot (`BotTokenGuard`, prefixo `Bot `). Um bot que carregasse o
 * JWT de um humano agiria com a identidade daquele humano — que é o oposto do
 * que um registro de moderação serve para provar.
 *
 * Então este bot faz o que o bot de música faz com a ponte de voz: **chama o
 * caminho de bot de verdade** e, quando a rota não existe, responde uma frase
 * que diz o que falta e o que dá para fazer enquanto isso. O que ele nunca faz
 * é pendurar, agir em silêncio ou cuspir uma pilha de erro no canal.
 *
 * Quando as rotas entrarem na casca (é trabalho de `apps/api`, não deste bot),
 * **nada aqui muda**: as chamadas já são as do discord.js.
 */

import { DiscordAPIError, HTTPError, type Guild, type GuildMember } from "discord.js";
import type { Contexto, ContextoDoBot } from "../runtime/tipos";
import {
  analisarAlvo,
  chaveDeNome,
  embedDoRegistro,
  linhaDoRegistro,
  textoDoRegistro,
  type AcaoDeModeracao,
} from "./formatar";
import { canalDeRegistro } from "./estado";
import type { Retrato } from "./hierarquia";

// ── achar o servidor e a gente ──────────────────────────────────────────────

/** Comando de moderação exige servidor: em DM não há quem moderar. */
export async function servidorDe(ctx: Contexto): Promise<Guild | null> {
  if (!ctx.guildId) {
    await ctx.responder({ conteudo: "Só funciona dentro de um servidor.", efemera: true });
    return null;
  }
  const servidor = ctx.bot.cliente.guilds.cache.get(ctx.guildId);
  if (!servidor) {
    await ctx.responder({
      conteudo: "Não achei este servidor no meu cache. Tenta de novo em alguns segundos.",
      efemera: true,
    });
    return null;
  }
  return servidor;
}

/** O membro, do cache ou da API (`GET /guilds/:id/members/:uid`). */
export async function membroPorId(servidor: Guild, id: string): Promise<GuildMember | null> {
  return servidor.members.cache.get(id) ?? (await servidor.members.fetch(id).catch(() => null));
}

export type Resolucao =
  | { achou: true; membro: GuildMember }
  | { achou: false; frase: string };

/**
 * Acha o alvo a partir do que o moderador digitou.
 *
 * O cache de membros **está quente**: o `GUILD_CREATE` da nossa casca manda
 * `members` com todos (`dados.service.ts`: "Todos os membros. Nosso servidor é
 * pequeno"). É por isso que procurar por nome funciona aqui, e é bom que
 * funcione: no Streamz a menção viaja como texto, então `@fulano` chega ao bot
 * como as sete letras, e não como `<@123>`.
 *
 * Nome ambíguo **não escolhe um**: dois `joao` no servidor e o bot silenciando o
 * errado é o pior desfecho possível de um comando de moderação.
 */
export async function resolverAlvo(
  servidor: Guild,
  bruto: string | null | undefined,
): Promise<Resolucao> {
  const alvo = analisarAlvo(bruto);

  if (alvo.tipo === "vazio") {
    return { achou: false, frase: "Diz em quem: uma menção, o nome de usuário ou o ID." };
  }

  if (alvo.tipo === "id") {
    const membro = await membroPorId(servidor, alvo.id);
    if (membro) return { achou: true, membro };
    return {
      achou: false,
      frase: `Não achei ninguém com o ID \`${alvo.id}\` neste servidor.`,
    };
  }

  const procurado = chaveDeNome(alvo.nome);
  const candidatos = servidor.members.cache.filter(
    (m) =>
      chaveDeNome(m.user.username) === procurado ||
      chaveDeNome(m.displayName ?? "") === procurado ||
      chaveDeNome(m.nickname ?? "") === procurado,
  );

  if (candidatos.size === 1) return { achou: true, membro: candidatos.first()! };

  if (candidatos.size > 1) {
    const lista = candidatos
      .map((m) => `\`${m.id}\` ${m.user.username}`)
      .slice(0, 5)
      .join("\n");
    return {
      achou: false,
      frase: `Tem mais de um **${alvo.nome}** aqui. Passa o ID:\n${lista}`,
    };
  }

  return {
    achou: false,
    frase:
      `Não achei **${alvo.nome}** neste servidor. ` +
      "Confere o nome de usuário (não o apelido) ou passa o ID.",
  };
}

// ── retratos para a hierarquia ──────────────────────────────────────────────

/**
 * O retrato que `avaliar()` consome.
 *
 * `permissions` do discord.js já soma os cargos e resolve o dono; a posição
 * mais alta sai de `roles.highest`, que é o `@everyone` (posição 0) quando a
 * pessoa não tem cargo nenhum.
 *
 * **O que ele não enxerga:** override de permissão por canal. A nossa casca
 * manda `permission_overwrites: []` em todo canal (`traducao/canal.ts`), então
 * a conta é a do servidor. Na prática isso é conservador para as permissões que
 * este bot exige — banir e expulsar são de servidor no Streamz também —, mas
 * significa que um `MANAGE_MESSAGES` negado só naquele canal ainda deixa o
 * `/limpar` passar. Está anotado no README do bot como dívida da casca.
 */
export function retratoDe(servidor: Guild, membro: GuildMember): Retrato {
  return {
    id: membro.id,
    nome: membro.displayName ?? membro.user.username,
    ehDono: servidor.ownerId === membro.id,
    posicaoMaisAlta: membro.roles.highest?.position ?? 0,
    permissoes: membro.permissions.bitfield,
  };
}

/** O retrato do próprio bot naquele servidor. */
export async function retratoDoBot(servidor: Guild, ctx: ContextoDoBot): Promise<Retrato | null> {
  const eu = servidor.members.me ?? (await membroPorId(servidor, ctx.cliente.user?.id ?? ""));
  return eu ? retratoDe(servidor, eu) : null;
}

// ── o registro de moderação ─────────────────────────────────────────────────

/**
 * Publica a ação no canal configurado por `/registro-de-moderacao`.
 *
 * **Nunca derruba o comando.** A punição já aconteceu; falhar em anotá-la é
 * ruim, mas desfazer não é opção e responder "deu erro" depois de banir alguém
 * é pior ainda. O que sobra é o log estruturado do container, que sempre sai —
 * por isso `linhaDoRegistro` existe além do embed.
 */
export async function publicar(ctx: Contexto, acao: AcaoDeModeracao): Promise<void> {
  ctx.bot.log.info("ação de moderação", {
    servidor: ctx.guildId,
    acao: acao.tipo,
    moderador: acao.moderador.id,
    alvo: acao.alvo.id,
    linha: linhaDoRegistro(acao),
  });

  if (!ctx.guildId) return;
  const canalId = await canalDeRegistro(ctx.guildId);
  if (!canalId) return;

  try {
    const canal =
      ctx.bot.cliente.channels.cache.get(canalId) ??
      (await ctx.bot.cliente.channels.fetch(canalId));
    if (!canal || !canal.isTextBased() || !canal.isSendable()) {
      ctx.bot.log.aviso("canal de registro não serve para escrever", { canal: canalId });
      return;
    }
    // `content` **e** embed: a nossa API descarta os embeds (F5) e recusa um
    // corpo só com eles (`50035 Cannot send an empty message`). O texto é o que
    // se lê hoje; o embed viaja junto para quando a F5 chegar.
    await canal.send({ content: textoDoRegistro(acao), embeds: [embedDoRegistro(acao)] });
  } catch (erro) {
    ctx.bot.log.aviso("não deu para publicar no registro de moderação", {
      canal: canalId,
      erro,
    });
  }
}

// ── erros da API viram frase ────────────────────────────────────────────────

/** Códigos de erro do Discord que a nossa casca já usa (ver `erros.ts`). */
const FRASE_POR_CODIGO: Record<number, string> = {
  10003: "Esse canal não existe mais.",
  10004: "Não estou nesse servidor.",
  10007: "Essa pessoa não é membro deste servidor.",
  10008: "Essa mensagem já não existe.",
  10013: "Esse usuário não existe.",
  50001: "Não tenho acesso a esse canal.",
  50013: "Me falta permissão para isso. Confere as minhas permissões no servidor.",
  50034: "Só dá para apagar em massa mensagens de menos de 14 dias.",
};

/**
 * Traduz o que a API devolveu para uma frase que o moderador possa **agir** em
 * cima. Nunca devolve pilha de erro: uma stack trace no canal não ajuda quem
 * está moderando e vaza caminho de arquivo do servidor.
 *
 * O caso especial é o `404` **de rota**, distinguido do `404` de recurso pelo
 * `code`: a nossa casca sempre manda um `code` do Discord (`10007` etc.), e um
 * 404 sem `code` conhecido é o Nest dizendo "essa rota não existe aqui" — ou
 * seja, a rota de moderação que a casca ainda não implementou.
 */
export function explicarErro(erro: unknown, oQue: string): string {
  if (erro instanceof DiscordAPIError) {
    const codigo = typeof erro.code === "number" ? erro.code : 0;
    const conhecida = FRASE_POR_CODIGO[codigo];
    if (conhecida) return conhecida;

    if (erro.status === 404 || erro.status === 405 || erro.status === 501) {
      return (
        `Não consegui ${oQue}: essa ação ainda não existe na camada de bots do Streamz ` +
        `(\`${erro.method} ${erro.url.replace(/^https?:\/\/[^/]+/, "")}\` respondeu ${erro.status}). ` +
        "Dá para fazer pela tela de moderação do servidor enquanto isso."
      );
    }
    if (erro.status === 429) {
      return `Estou levando limite de taxa da API. Tenta de novo daqui a pouco.`;
    }
    return `Não consegui ${oQue}: a API respondeu ${erro.status} (código ${codigo}).`;
  }

  if (erro instanceof HTTPError) {
    return `Não consegui ${oQue}: a API respondeu ${erro.status}.`;
  }

  return `Não consegui ${oQue}. Olha o log do bot para o detalhe.`;
}
