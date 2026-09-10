import {
  DiscordAPIError,
  Events,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Role,
} from "discord.js";
import type { ContextoDoBot } from "../runtime/tipos";
import { lerEmojiDoEvento } from "./emoji";
import { DepositoDePaineis, type Painel } from "./estado";
import { mensagemDoPainel } from "./formatar";
import { podeMexerNoCargo } from "./hierarquia";
import { decidirAoDesreagir, decidirAoReagir } from "./modos";

/**
 * O serviço do **Streamz Cargos**: o que acontece quando alguém reage.
 *
 * ## Por que `Events.Raw` e não `messageReactionAdd`
 *
 * O `messageReactionAdd` do discord.js só dispara se a mensagem estiver no
 * cache **ou** se o cliente tiver sido construído com
 * `partials: [Message, Channel, Reaction]` — o `ActionsManager` descarta o
 * pacote em silêncio quando não tem nenhum dos dois. Quem constrói o `Client` é
 * o runtime (`runtime/cliente.ts`), que é comum a todos os bots e não se
 * edita por bot nenhum (`CONTRATO.md` §1).
 *
 * O evento cru resolve isso sem tocar em nada: o payload do
 * `MESSAGE_REACTION_ADD` já traz `user_id`, `channel_id`, `message_id`,
 * `guild_id` e `emoji` (§7 do `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`), que é
 * **exatamente** o que este bot precisa — e uma mensagem de painel publicada
 * três meses atrás nunca estaria no cache de qualquer jeito. É o mesmo caminho
 * que o bot de música usa para o `VOICE_SERVER_UPDATE`.
 *
 * ## O que não é feito de propósito
 *
 * Não há fila nem trava por usuário. Duas reações do mesmo membro no mesmo
 * instante podem ler o mesmo conjunto de cargos e escrever as duas: o pior
 * caso é o membro ficar com dois cargos num painel `unico`, que a reação
 * seguinte corrige. Uma trava por (servidor, membro) seria estado a mais para
 * um caso que exige dois cliques no mesmo décimo de segundo.
 */

/**
 * A rota que o discord.js usa para dar e tirar cargo, e o recado de quando ela
 * ainda não existe nesta instância.
 *
 * `membro.roles.add(cargo)` é
 * `PUT /guilds/{guild}/members/{user}/roles/{role}`, e o §12 F5 do documento
 * lista "membros/cargos no REST" como **ainda na fila**: numa instância sem
 * essa rota o Nest devolve o 404 dele mesmo (`code: 0`, "Cannot PUT …") em vez
 * de um erro do Discord. Sem esta tradução, o log diria só "404" — e quem
 * administra iria procurar o cargo apagado, a mensagem apagada, a permissão
 * esquecida: tudo menos a rota que falta na API.
 */
export const ROTA_DE_CARGO_FALTANDO =
  "a API desta instância ainda não tem `PUT/DELETE /api/v10/guilds/:id/members/:uid/roles/:rid` " +
  "(§12 F5 do docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md: membros/cargos no REST ainda estão na " +
  "fila). Enquanto ela não existir, o bot publica painéis e escuta as reações, mas não consegue " +
  "dar nem tirar cargo nenhum.";

/**
 * 404 do Nest (a **rota** não existe) x 404 do Discord (o **recurso** não
 * existe). Puro, e testado — a diferença é a mensagem que quem administra lê.
 *
 * O que separa os dois é o `code`: um erro do Discord traz sempre um código
 * **numérico** (`10004 Unknown Guild`, `10011 Unknown Role`). O 404 de rota
 * inexistente do Nest tem corpo `{"message":"Cannot PUT /…","error":"Not
 * Found","statusCode":404}`, e o `@discordjs/rest`, sem achar `code`, usa o
 * `error` — ou seja, `code` vira a string `"Not Found"`. Foi exatamente o que a
 * bancada mostrou, e por isso a checagem principal é "o código não é número".
 */
export function ehRotaQueNaoExiste(erro: unknown): boolean {
  if (!(erro instanceof DiscordAPIError) || erro.status !== 404) return false;
  const codigo = Number(erro.code);
  if (!Number.isFinite(codigo) || codigo === 0) return true;
  return /Cannot (PUT|DELETE|POST|PATCH)/i.test(erro.message);
}

/** O payload do `MESSAGE_REACTION_ADD`/`_REMOVE`, na parte que usamos. */
interface EventoDeReacao {
  user_id?: string;
  channel_id?: string;
  message_id?: string;
  guild_id?: string;
  emoji?: { id?: string | null; name?: string | null; animated?: boolean };
}

export class ServicoDeCargos {
  readonly paineis: DepositoDePaineis;

  constructor(
    private readonly ctx: ContextoDoBot,
    paineis: DepositoDePaineis = new DepositoDePaineis(),
  ) {
    this.paineis = paineis;
  }

  // ── ciclo de vida ─────────────────────────────────────────

  async iniciar(): Promise<void> {
    this.paineis.preparar();
    const cliente = this.ctx.cliente as Client<true>;

    cliente.on(Events.Raw, (pacote: { t?: string; d?: EventoDeReacao }) => {
      if (pacote?.t === "MESSAGE_REACTION_ADD") void this.aoReagir(pacote.d ?? {}, true);
      else if (pacote?.t === "MESSAGE_REACTION_REMOVE") void this.aoReagir(pacote.d ?? {}, false);
    });

    await this.reconciliar();
  }

  /**
   * Na subida: esquece o painel cujo canal ou mensagem sumiu.
   *
   * Nunca lança. Um servidor de que o bot foi removido, um canal apagado, a API
   * fora do ar por um segundo — nenhum desses é motivo para o container não
   * subir, e "o bot não sobe" é um estrago muito maior que "um painel a menos".
   * O que **não** some é o painel que só não deu para conferir (rede, 500): na
   * dúvida ele fica, e a próxima subida tenta de novo.
   */
  async reconciliar(): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;
    let vivos = 0;
    let esquecidos = 0;

    for (const guildId of this.paineis.servidoresConhecidos()) {
      const estado = this.paineis.ler(guildId);
      const perdidos: string[] = [];

      for (const [mensagemId, painel] of Object.entries(estado.paineis)) {
        const situacao = await this.conferirPainel(cliente, painel.canalId, mensagemId);
        if (situacao === "sumiu") perdidos.push(mensagemId);
        else vivos++;
      }

      if (perdidos.length > 0) {
        this.paineis.editar(guildId, (e) => {
          for (const id of perdidos) delete e.paineis[id];
        });
        esquecidos += perdidos.length;
        this.ctx.log.aviso("painéis esquecidos na reconciliação", {
          servidor: guildId,
          mensagens: perdidos,
        });
      }
    }

    this.ctx.log.info("painéis reconciliados", { vivos, esquecidos });
  }

  /** `"vivo"`, `"sumiu"` (canal/mensagem apagados) ou `"indefinido"` (deu erro). */
  private async conferirPainel(
    cliente: Client<true>,
    canalId: string,
    mensagemId: string,
  ): Promise<"vivo" | "sumiu" | "indefinido"> {
    try {
      const canal = await cliente.channels.fetch(canalId);
      if (!canal || !canal.isTextBased()) return "sumiu";
      await canal.messages.fetch(mensagemId);
      return "vivo";
    } catch (erro) {
      // 10003 Unknown Channel, 10008 Unknown Message, 50001 Missing Access: os
      // três querem dizer "não há painel aqui". Qualquer outra coisa é dúvida.
      if (erro instanceof DiscordAPIError && [10003, 10008, 50001].includes(Number(erro.code))) {
        return "sumiu";
      }
      this.ctx.log.aviso("não deu para conferir um painel; fica para a próxima", {
        canal: canalId,
        mensagem: mensagemId,
        erro,
      });
      return "indefinido";
    }
  }

  // ── o caminho quente ──────────────────────────────────────

  private async aoReagir(evento: EventoDeReacao, reagiu: boolean): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;
    const { guild_id: guildId, message_id: mensagemId, user_id: usuarioId } = evento;
    // Reação em DM não tem servidor, e portanto não tem cargo.
    if (!guildId || !mensagemId || !usuarioId) return;
    // O próprio bot reage em toda mensagem de painel (é o que mostra as opções);
    // sem esta linha ele se daria os cargos todos na hora de criar o painel.
    if (usuarioId === cliente.user.id) return;

    const painel = this.paineis.ler(guildId).paineis[mensagemId];
    if (!painel) return;

    const emoji = lerEmojiDoEvento(evento.emoji ?? {});
    if (!emoji || !painel.itens[emoji.chave]) return;

    try {
      const servidor = await cliente.guilds.fetch(guildId);
      const cargosAtuais = await this.cargosDoMembro(servidor, usuarioId);

      if (reagiu) {
        const decisao = decidirAoReagir(painel, emoji.chave, cargosAtuais);
        for (const cargoId of decisao.tirarCargos) {
          await this.tirarCargo(servidor, usuarioId, cargoId);
        }
        if (decisao.darCargo) await this.darCargo(servidor, usuarioId, decisao.darCargo);
        for (const chave of decisao.tirarReacoes) {
          const item = painel.itens[chave];
          if (item) await this.tirarReacaoDe(painel, mensagemId, item.paraReagir, usuarioId);
        }
        if (decisao.recusa) {
          this.ctx.log.info("reação recusada pelo modo do painel", {
            servidor: guildId,
            painel: mensagemId,
            modo: painel.modo,
            motivo: decisao.recusa,
          });
        }
      } else {
        const decisao = decidirAoDesreagir(painel, emoji.chave, cargosAtuais);
        if (decisao.tirarCargo) await this.tirarCargo(servidor, usuarioId, decisao.tirarCargo);
      }
    } catch (erro) {
      // Um erro aqui **não pode** derrubar o bot: é um `on(...)` sem ninguém
      // para pegar a rejeição, e o processo morreria com `unhandledRejection`.
      this.ctx.log.erro("não deu para aplicar a reação", {
        servidor: guildId,
        painel: mensagemId,
        usuario: usuarioId,
        emoji: emoji.chave,
        erro: this.explicarErro(erro),
      });
    }
  }

  /**
   * Os cargos de um membro, lidos do REST e **não** do cache.
   *
   * O cache de membros deste bot é frio de propósito (ele não pede o intent de
   * membros: um painel de cargos não tem o que fazer com `GUILD_MEMBER_ADD`), e
   * decidir o modo `unico` com uma lista de cargos velha daria o cargo novo sem
   * tirar o antigo — o defeito mais visível que este bot pode ter.
   */
  private async cargosDoMembro(servidor: Guild, usuarioId: string): Promise<string[]> {
    const membro = await servidor.members.fetch({ user: usuarioId, force: true });
    return [...membro.roles.cache.keys()].filter((id) => id !== servidor.id);
  }

  async darCargo(servidor: Guild, usuarioId: string, cargoId: string): Promise<void> {
    const membro = await servidor.members.fetch(usuarioId);
    try {
      await membro.roles.add(cargoId);
    } catch (erro) {
      if (ehRotaQueNaoExiste(erro)) throw new Error(ROTA_DE_CARGO_FALTANDO);
      throw erro;
    }
    this.ctx.log.info("cargo dado", { servidor: servidor.id, usuario: usuarioId, cargo: cargoId });
  }

  async tirarCargo(servidor: Guild, usuarioId: string, cargoId: string): Promise<void> {
    const membro = await servidor.members.fetch(usuarioId);
    try {
      await membro.roles.remove(cargoId);
    } catch (erro) {
      if (ehRotaQueNaoExiste(erro)) throw new Error(ROTA_DE_CARGO_FALTANDO);
      throw erro;
    }
    this.ctx.log.info("cargo tirado", { servidor: servidor.id, usuario: usuarioId, cargo: cargoId });
  }

  /**
   * Tira a reação **de outra pessoa** — só o modo `unico` e o `travado` usam.
   *
   * Exige `MANAGE_MESSAGES` (§12 F5). Sem ela a API responde 50013, e o efeito
   * é cosmético: o cargo já foi trocado, o que fica errado é o painel mostrando
   * duas reações. Por isso o erro vira aviso e não derruba a troca.
   */
  private async tirarReacaoDe(
    painel: Painel,
    mensagemId: string,
    paraReagir: string,
    usuarioId: string,
  ): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;
    try {
      const emojiNaRota = encodeURIComponent(paraReagir);
      await cliente.rest.delete(
        `/channels/${painel.canalId}/messages/${mensagemId}/reactions/${emojiNaRota}/${usuarioId}`,
      );
    } catch (erro) {
      this.ctx.log.aviso("não deu para tirar a reação anterior (falta gerenciar mensagens?)", {
        painel: mensagemId,
        usuario: usuarioId,
        erro: this.explicarErro(erro),
      });
    }
  }

  // ── o que os comandos precisam ────────────────────────────

  /** Publica a mensagem do painel e reage nela com o que já existir. */
  async publicarPainel(servidor: Guild, canalId: string, painel: Painel): Promise<string> {
    const canal = await servidor.channels.fetch(canalId);
    if (!canal || !canal.isTextBased() || !canal.isSendable()) {
      throw new Error("canal não serve para publicar um painel");
    }
    const mensagem = await canal.send(mensagemDoPainel(painel));
    return mensagem.id;
  }

  /** Reescreve o embed depois de um `adicionar`/`remover`/`modo`. */
  async atualizarPainel(canalId: string, mensagemId: string, painel: Painel): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;
    const canal = await cliente.channels.fetch(canalId);
    if (!canal?.isTextBased()) return;
    const mensagem = await canal.messages.fetch(mensagemId);
    await mensagem.edit(mensagemDoPainel(painel));
  }

  /** O bot reage na mensagem do painel: é o que oferece a opção a quem lê. */
  async reagirNoPainel(canalId: string, mensagemId: string, paraReagir: string): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;
    const canal = await cliente.channels.fetch(canalId);
    if (!canal?.isTextBased()) return;
    const mensagem = await canal.messages.fetch(mensagemId);
    await mensagem.react(paraReagir);
  }

  async apagarMensagemDoPainel(canalId: string, mensagemId: string): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;
    try {
      const canal = await cliente.channels.fetch(canalId);
      if (!canal?.isTextBased()) return;
      const mensagem = await canal.messages.fetch(mensagemId);
      await mensagem.delete();
    } catch (erro) {
      // A mensagem já não estar lá é o caso mais comum de `/painel apagar`:
      // alguém apagou à mão e agora está limpando o registro.
      this.ctx.log.aviso("a mensagem do painel já não estava lá", {
        mensagem: mensagemId,
        erro: this.explicarErro(erro),
      });
    }
  }

  /** O membro-bot deste servidor, com os cargos frescos. */
  async euMesmo(servidor: Guild): Promise<GuildMember> {
    const cliente = this.ctx.cliente as Client<true>;
    return servidor.members.fetch({ user: cliente.user.id, force: true });
  }

  /** Tenho `MANAGE_ROLES` aqui? */
  async possoGerenciarCargos(servidor: Guild): Promise<boolean> {
    const eu = await this.euMesmo(servidor);
    return eu.permissions.has(PermissionFlagsBits.ManageRoles);
  }

  /** O meu cargo mais alto (o teto da hierarquia), ou `null` se não tenho nenhum. */
  async meuCargoMaisAlto(servidor: Guild): Promise<Role | null> {
    const eu = await this.euMesmo(servidor);
    const cargos = [...eu.roles.cache.values()].filter((c) => c.id !== servidor.id);
    if (cargos.length === 0) return null;
    return cargos.reduce((maior, c) => (c.position > maior.position ? c : maior));
  }

  /** Consigo dar este cargo? (permissão já conferida à parte) */
  async possoDarOCargo(servidor: Guild, cargo: Role): Promise<boolean> {
    const meu = await this.meuCargoMaisAlto(servidor);
    return podeMexerNoCargo({
      posicaoDoAlvo: cargo.position,
      posicaoDoBot: meu?.position ?? null,
      botEhDono: servidor.ownerId === (this.ctx.cliente as Client<true>).user.id,
    });
  }

  private explicarErro(erro: unknown): string {
    if (erro instanceof DiscordAPIError) return `${erro.code} ${erro.message}`;
    return erro instanceof Error ? erro.message : String(erro);
  }
}

// ── o singleton ─────────────────────────────────────────────
// O mesmo desenho do bot de música: os comandos são objetos soltos, criados na
// carga do módulo, e precisam alcançar o serviço que o `aoIniciar` construiu.

let servico: ServicoDeCargos | null = null;

export function definirServico(novo: ServicoDeCargos | null): void {
  servico = novo;
}

export function obterServico(): ServicoDeCargos {
  if (!servico) throw new Error("o serviço de cargos ainda não subiu");
  return servico;
}
