/**
 * O miolo do **Streamz Boas-vindas**: o que acontece quando alguém entra.
 *
 * O bot inteiro é um `guildMemberAdd` e um `guildMemberRemove`. Tudo que dá
 * para testar sem servidor de pé está em `mensagem.ts`, `configuracao.ts` e
 * `alvos.ts`; aqui fica o que só existe com um gateway do outro lado.
 *
 * ## O dispatch
 *
 * `GUILD_MEMBER_ADD` é filtrado pelo intent `GUILD_MEMBERS` (§7 do
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`): sem ele na lista do IDENTIFY o
 * evento **não chega** — o `botsNoServidor(…, INTENT.GUILD_MEMBERS)` da API não
 * devolve a sessão, e o bot fica no ar sem nunca receber nada. Por isso o
 * `index.ts` declara o intent, e por isso não é opcional.
 *
 * Um detalhe do mesmo §7 que muda o desenho: quando quem entra é o **próprio
 * bot**, a API manda `GUILD_CREATE`, não `GUILD_MEMBER_ADD`. Então o bot nunca
 * se dá boas-vindas a si mesmo, e não precisa de guarda para isso. A guarda que
 * ele precisa é outra: **outros bots** entrando (`user.bot`), que geram
 * `GUILD_MEMBER_ADD` de verdade e não são gente chegando.
 */

import type { Guild, GuildMember, PartialGuildMember } from "discord.js";
import { Events } from "discord.js";
import type { ContextoDoBot } from "../runtime/tipos";
import { Armazem } from "./armazem";
import { entradaPronta, saidaPronta, type Configuracao } from "./configuracao";
import { montarMensagem, type DadosDoMembro } from "./mensagem";

/**
 * O que a instância responde quando o bot tenta dar um cargo ou mandar uma DM.
 *
 * As duas coisas passam por rotas que a casca de compatibilidade ainda não tem
 * (`PUT /guilds/:id/members/:uid/roles/:rid` e `POST /users/@me/channels` —
 * conferido em `apps/api/src/modules/discord-compat/rest/`; DM com bot é F5 pelo
 * §9 do documento). O bot chama do jeito padrão do discord.js assim mesmo: no
 * dia em que a rota existir, ele passa a funcionar sem uma linha de mudança. O
 * que ele **não** faz é fingir que deu certo — 404 vira esta frase, no log e na
 * resposta de quem configurou.
 */
export const SEM_ROTA_DE_CARGO =
  "esta instância ainda não expõe aos bots a rota de dar cargo " +
  "(`PUT /guilds/:id/members/:uid/roles/:rid`); o cargo automático fica guardado " +
  "e passa a valer quando a rota existir";

export const SEM_ROTA_DE_DM =
  "esta instância ainda não abre conversa direta para bots " +
  "(`POST /users/@me/channels`); a mensagem por DM fica guardada e passa a valer " +
  "quando a rota existir";

/** O resultado de cada perna da entrega. Vira a resposta de `/boas-vindas testar`. */
export type Resultado =
  | { estado: "ok"; detalhe?: string }
  | { estado: "desligado" }
  | { estado: "falhou"; detalhe: string };

export interface Relato {
  canal: Resultado;
  dm: Resultado;
  autorole: Resultado;
}

const DESLIGADO: Resultado = { estado: "desligado" };

/** `404`/`405` = a rota não existe aqui; qualquer outra coisa é erro de verdade. */
function ehRotaAusente(erro: unknown): boolean {
  const status = (erro as { status?: unknown })?.status;
  return status === 404 || status === 405;
}

function comoTexto(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  return String(erro);
}

/**
 * O que as variáveis da mensagem enxergam.
 *
 * `usuario` é `@username` e não `<@id>`: ver o comentário de `DadosDoMembro`
 * em `mensagem.ts` — no Streamz é `@nome` que vira menção e faz o sino tocar.
 */
export function dadosDoMembro(membro: GuildMember | PartialGuildMember): DadosDoMembro {
  return {
    usuario: `@${membro.user.username}`,
    nome: membro.displayName || membro.user.displayName || membro.user.username,
    servidor: membro.guild.name,
    contagem: membro.guild.memberCount,
  };
}

export class ServicoDeBoasVindas {
  readonly armazem: Armazem;

  constructor(
    private readonly ctx: ContextoDoBot,
    armazem?: Armazem,
  ) {
    this.armazem = armazem ?? new Armazem();
  }

  iniciar(): void {
    const cliente = this.ctx.cliente;
    cliente.on(Events.GuildMemberAdd, (membro) => {
      void this.aoEntrar(membro);
    });
    cliente.on(Events.GuildMemberRemove, (membro) => {
      void this.aoSair(membro);
    });
    this.ctx.log.info("ouvindo entradas e saídas de membros");
  }

  // ── entrada ───────────────────────────────────────────────

  private async aoEntrar(membro: GuildMember): Promise<void> {
    // Outro bot entrando não é gente chegando. (O próprio bot não passa por
    // aqui: para ele a API manda `GUILD_CREATE` — ver o cabeçalho.)
    if (membro.user.bot) return;
    try {
      const relato = await this.receber(membro);
      this.ctx.log.info("membro entrou", {
        servidor: membro.guild.id,
        membro: membro.id,
        canal: relato.canal.estado,
        dm: relato.dm.estado,
        autorole: relato.autorole.estado,
      });
    } catch (erro) {
      this.ctx.log.erro("falhou ao receber quem entrou", {
        servidor: membro.guild.id,
        membro: membro.id,
        erro: comoTexto(erro),
      });
    }
  }

  /**
   * A entrega completa de uma entrada: mensagem no canal, DM e cargo.
   *
   * É a **mesma** função que o `/boas-vindas testar` chama — de propósito. Um
   * "testar" que percorra outro caminho testa outro código, e o dia em que os
   * dois divergirem é o dia em que o teste passa e a entrada de verdade não
   * manda nada.
   */
  async receber(membro: GuildMember): Promise<Relato> {
    const config = await this.armazem.ler(membro.guild.id);
    const dados = dadosDoMembro(membro);

    return {
      canal: entradaPronta(config)
        ? await this.publicar(membro.guild, config.entrada.canalId!, config.entrada.mensagem, dados)
        : DESLIGADO,
      dm: config.entrada.dm
        ? await this.mandarDm(membro, montarMensagem(config.entrada.mensagemDm, dados))
        : DESLIGADO,
      autorole: config.autorole.ligado
        ? await this.darCargo(membro, config.autorole.cargoId!)
        : DESLIGADO,
    };
  }

  // ── saída ─────────────────────────────────────────────────

  private async aoSair(membro: GuildMember | PartialGuildMember): Promise<void> {
    if (membro.user.bot) return;
    try {
      const config = await this.armazem.ler(membro.guild.id);
      if (!saidaPronta(config)) return;
      const resultado = await this.publicar(
        membro.guild,
        config.saida.canalId!,
        config.saida.mensagem,
        dadosDoMembro(membro),
      );
      this.ctx.log.info("membro saiu", {
        servidor: membro.guild.id,
        membro: membro.id,
        canal: resultado.estado,
      });
    } catch (erro) {
      this.ctx.log.erro("falhou ao despedir quem saiu", {
        servidor: membro.guild.id,
        membro: membro.id,
        erro: comoTexto(erro),
      });
    }
  }

  // ── as três pernas ────────────────────────────────────────

  private async publicar(
    servidor: Guild,
    canalId: string,
    modelo: string,
    dados: DadosDoMembro,
  ): Promise<Resultado> {
    const canal =
      servidor.channels.cache.get(canalId) ??
      (await servidor.channels.fetch(canalId).catch(() => null));
    if (!canal || !canal.isTextBased() || !canal.isSendable()) {
      // O canal configurado foi apagado (ou virou de voz, ou o bot perdeu a
      // permissão). Não desligamos a configuração sozinhos: quem escolheu o
      // canal escolhe o próximo, e apagar a escolha de alguém por causa de um
      // erro transitório é pior que repetir o aviso no log.
      return { estado: "falhou", detalhe: `o canal ${canalId} não existe ou não aceita mensagem` };
    }
    try {
      await canal.send({ content: montarMensagem(modelo, dados) });
      return { estado: "ok", detalhe: canalId };
    } catch (erro) {
      return { estado: "falhou", detalhe: comoTexto(erro) };
    }
  }

  private async mandarDm(membro: GuildMember, texto: string): Promise<Resultado> {
    try {
      await membro.send({ content: texto });
      return { estado: "ok" };
    } catch (erro) {
      if (ehRotaAusente(erro)) return { estado: "falhou", detalhe: SEM_ROTA_DE_DM };
      // DM fechada é a resposta normal de metade das pessoas; não é defeito.
      return { estado: "falhou", detalhe: comoTexto(erro) };
    }
  }

  private async darCargo(membro: GuildMember, cargoId: string): Promise<Resultado> {
    const cargo =
      membro.guild.roles.cache.get(cargoId) ??
      (await membro.guild.roles.fetch(cargoId).catch(() => null));
    if (!cargo) return { estado: "falhou", detalhe: `o cargo ${cargoId} não existe mais` };
    if (membro.roles.cache.has(cargoId)) return { estado: "ok", detalhe: "já tinha o cargo" };
    try {
      await membro.roles.add(cargoId, "cargo automático do Streamz Boas-vindas");
      return { estado: "ok", detalhe: cargo.name };
    } catch (erro) {
      if (ehRotaAusente(erro)) return { estado: "falhou", detalhe: SEM_ROTA_DE_CARGO };
      return { estado: "falhou", detalhe: comoTexto(erro) };
    }
  }

  // ── acesso à configuração, para os comandos ───────────────

  ler(guildId: string): Promise<Configuracao> {
    return this.armazem.ler(guildId);
  }

  atualizar(
    guildId: string,
    mudanca: (atual: Configuracao) => Configuracao,
  ): Promise<Configuracao> {
    return this.armazem.atualizar(guildId, mudanca);
  }
}

// ── a instância única ───────────────────────────────────────
// Mesmo desenho do bot de música: os comandos são objetos soltos, sem `this`,
// e precisam alcançar o serviço que o `aoIniciar` construiu.

let servico: ServicoDeBoasVindas | null = null;

export function definirServico(novo: ServicoDeBoasVindas | null): void {
  servico = novo;
}

export function obterServico(): ServicoDeBoasVindas {
  if (!servico) throw new Error("o serviço de boas-vindas ainda não subiu");
  return servico;
}
