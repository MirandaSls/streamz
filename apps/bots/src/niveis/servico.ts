/**
 * O serviço do **Streamz Níveis**: o que roda entre as mensagens e o disco.
 *
 * Tudo que dá para separar em função pura já está separado (`curva.ts`,
 * `ganho.ts`, `ranking.ts`, `formatar.ts`); o que sobra aqui é o que precisa do
 * gateway: ouvir `messageCreate`, anunciar a subida no canal certo e tentar
 * entregar o cargo do nível.
 *
 * O padrão de instância única é o do bot de música (`musica/servico.ts`): o
 * `aoIniciar` cria e registra, os comandos chamam `obterServico()`. Sem isso,
 * cada arquivo de comando precisaria receber o serviço por parâmetro através do
 * `Contexto` — que é do runtime e é intocável.
 */

import { Events, PermissionsBitField } from "discord.js";
import type { Client, Guild, GuildMember, Message, Role } from "discord.js";
import { PREFIXO } from "../runtime/comandos";
import type { ContextoDoBot } from "../runtime/tipos";
import { CARENCIA_PADRAO_MS, aplicarMensagem, cargosConquistados, motivoParaIgnorar } from "./ganho";
import { LojaDeNiveis } from "./estado";
import { mencaoDoUsuario, textoDaSubida, truncar, type Alvo } from "./formatar";
import { usuarioVazio, type EstadoDoServidor } from "./dados";

/**
 * **A dependência declarada deste bot**, no mesmo lugar em que o bot de música
 * declara a ponte de voz.
 *
 * Atribuir cargo a um membro é `PUT /guilds/{gid}/members/{uid}/roles/{rid}` no
 * Discord, e essa rota é **F5** na casca de compatibilidade: hoje o
 * `guilds.controller.ts` da compat só tem `GET`s (servidor, canais, cargos,
 * membro). Ou seja: o bot sabe qual cargo entregar, sabe a quem, e a API ainda
 * não tem por onde. Enquanto não tiver, ele:
 *
 * - **anuncia a subida normalmente** (isso não depende de nada que falte);
 * - registra `aviso` no log com o cargo, a pessoa e a rota que falta;
 * - diz a frase abaixo **uma vez por servidor por processo**, junto do anúncio,
 *   para quem configurou saber por que o cargo não veio — e não repete, porque
 *   um recado igual em toda subida de nível vira ruído em dois dias.
 *
 * A alternativa seria falhar calado, e "configurei o cargo e ele não vem" sem
 * nenhuma pista é o pior tipo de defeito: parece que o bot está quebrado.
 */
export const SEM_ROTA_DE_CARGOS =
  "⚠️ Não consegui entregar o cargo do nível: a API desta instância ainda não " +
  "tem a rota de cargos para bots (`PUT /guilds/:id/members/:usuario/roles/:cargo`, " +
  "prevista para a F5 da compatibilidade). O XP e os anúncios funcionam; a " +
  "configuração de cargos fica guardada e passa a valer sozinha quando a rota existir.";

/**
 * A carência entre ganhos, em milissegundos.
 *
 * O padrão é um minuto e é o que roda em produção — `NIVEIS_CARENCIA_MS` existe
 * porque a **prova** (`apps/api/test/discord-compat/prova-botniv.sh`) precisa
 * mostrar dois ganhos seguidos, e esperar um minuto real por ganho tornaria a
 * bancada inútil. É o mesmo espírito de `THROTTLE_DISABLED` na API: a regra
 * continua sendo a regra, o relógio é que encolhe para caber num teste.
 *
 * Zero desliga a carência — e aí flood pontua. Só faz sentido num teste.
 */
export function carenciaConfigurada(): number {
  const bruto = process.env.NIVEIS_CARENCIA_MS?.trim();
  if (!bruto) return CARENCIA_PADRAO_MS;
  const numero = Number(bruto);
  return Number.isFinite(numero) && numero >= 0 ? numero : CARENCIA_PADRAO_MS;
}

export class ServicoDeNiveis {
  readonly loja: LojaDeNiveis;
  private readonly ctx: ContextoDoBot;
  /** Servidores a quem já contamos que a rota de cargos não existe. */
  private readonly jaAvisados = new Set<string>();
  private readonly carenciaMs = carenciaConfigurada();
  private ouvinte: ((mensagem: Message) => void) | null = null;

  constructor(ctx: ContextoDoBot, loja?: LojaDeNiveis) {
    this.ctx = ctx;
    this.loja = loja ?? new LojaDeNiveis({ log: ctx.log });
  }

  get cliente(): Client {
    return this.ctx.cliente;
  }

  iniciar(): void {
    this.loja.iniciar();
    // Um segundo ouvinte de `messageCreate`, ao lado do que o runtime registra
    // para o prefixo `!`. São independentes de propósito: o do runtime roteia
    // comandos, este conta XP, e nenhum dos dois precisa saber do outro.
    this.ouvinte = (mensagem: Message) => {
      void this.aoFalar(mensagem).catch((erro) =>
        this.ctx.log.erro("falha ao contar XP de uma mensagem", { erro }),
      );
    };
    this.cliente.on(Events.MessageCreate, this.ouvinte);
    this.ctx.log.info("contagem de XP ligada", { carenciaMs: this.carenciaMs });
  }

  async desligar(): Promise<void> {
    if (this.ouvinte) {
      this.cliente.off(Events.MessageCreate, this.ouvinte);
      this.ouvinte = null;
    }
    await this.loja.desligar();
  }

  estado(guildId: string): EstadoDoServidor {
    return this.loja.estado(guildId);
  }

  /** O caminho quente: uma mensagem qualquer de um canal qualquer. */
  private async aoFalar(mensagem: Message): Promise<void> {
    if (!mensagem.guildId) return; // DM não tem ranking

    const estado = this.estado(mensagem.guildId);
    const motivo = motivoParaIgnorar({
      autorEhBot: mensagem.author.bot,
      conteudo: mensagem.content ?? "",
      canalId: mensagem.channelId,
      prefixo: PREFIXO,
      canaisIgnorados: estado.config.canaisIgnorados,
    });
    if (motivo) return;

    const anterior = estado.usuarios[mensagem.author.id] ?? usuarioVazio();
    const resultado = aplicarMensagem(
      anterior,
      estado.config,
      Date.now(),
      Math.random,
      this.carenciaMs,
    );
    estado.usuarios[mensagem.author.id] = resultado.usuario;
    this.loja.marcarSujo(mensagem.guildId);

    if (!resultado.subiu) return;

    this.ctx.log.info("subiu de nível", {
      servidor: mensagem.guildId,
      usuario: mensagem.author.id,
      nivel: resultado.nivelDepois,
    });

    const cargos = cargosConquistados(
      estado.config.cargosPorNivel,
      resultado.nivelAntes,
      resultado.nivelDepois,
    );
    const faltouRota = await this.entregarCargos(mensagem.guildId, mensagem.author.id, cargos);
    await this.anunciar(mensagem, resultado.nivelDepois, faltouRota);
  }

  /**
   * Manda o anúncio para onde a configuração mandar.
   *
   * `mesmo` (padrão), um canal fixo, ou lugar nenhum. Falhar aqui **não** pode
   * derrubar a contagem: o XP já foi creditado, e um canal apagado ou sem
   * permissão de escrita não é motivo para perder a mensagem seguinte.
   */
  private async anunciar(mensagem: Message, nivel: number, avisoDeCargo: boolean): Promise<void> {
    const estado = this.estado(mensagem.guildId!);
    const { anuncio, canalDeAnuncio } = estado.config;
    if (anuncio === "desligado") return;

    const destinoId = anuncio === "canal" ? canalDeAnuncio : mensagem.channelId;
    if (!destinoId) return;

    const corpo =
      textoDaSubida(mencaoDoUsuario(mensagem.author.username), nivel) +
      (avisoDeCargo ? `\n${SEM_ROTA_DE_CARGOS}` : "");

    try {
      if (destinoId === mensagem.channelId && mensagem.channel.isSendable()) {
        await mensagem.channel.send(corpo);
        return;
      }
      const canal =
        this.cliente.channels.cache.get(destinoId) ??
        (await this.cliente.channels.fetch(destinoId).catch(() => null));
      if (canal?.isTextBased() && canal.isSendable()) await canal.send(corpo);
    } catch (erro) {
      this.ctx.log.aviso("não consegui anunciar a subida de nível", {
        servidor: mensagem.guildId,
        canal: destinoId,
        erro,
      });
    }
  }

  /**
   * Tenta entregar os cargos. Devolve `true` quando a rota da API não existe e
   * o servidor ainda **não** foi avisado disso (ver `SEM_ROTA_DE_CARGOS`).
   */
  async entregarCargos(guildId: string, usuarioId: string, cargos: string[]): Promise<boolean> {
    if (cargos.length === 0) return false;

    const servidor = this.cliente.guilds.cache.get(guildId);
    const membro = servidor ? await acharMembro(servidor, usuarioId) : null;
    if (!membro) {
      this.ctx.log.aviso("não achei o membro para entregar o cargo do nível", {
        servidor: guildId,
        usuario: usuarioId,
      });
      return false;
    }

    let faltouRota = false;
    for (const cargoId of cargos) {
      if (membro.roles.cache.has(cargoId)) continue;
      try {
        await membro.roles.add(cargoId, "cargo por nível (Streamz Níveis)");
        this.ctx.log.info("cargo por nível entregue", { servidor: guildId, usuario: usuarioId, cargo: cargoId });
      } catch (erro) {
        faltouRota = true;
        this.ctx.log.aviso("a API não tem a rota de cargos para bots (F5); cargo não entregue", {
          servidor: guildId,
          usuario: usuarioId,
          cargo: cargoId,
          rota: "PUT /guilds/:id/members/:usuario/roles/:cargo",
          erro,
        });
      }
    }

    if (!faltouRota) return false;
    if (this.jaAvisados.has(guildId)) return false;
    this.jaAvisados.add(guildId);
    return true;
  }
}

// ── Resolver quem/qual, contra o cache do servidor ──────────────────────────

/**
 * O membro, pelo cache e depois pelo REST.
 *
 * O `GUILD_CREATE` da nossa casca manda **todos** os membros, então o cache
 * quase sempre basta; o `fetch` por id cobre quem entrou depois (a casca tem
 * `GET /guilds/:id/members/:uid`). O que **não** existe é `members.fetch()` sem
 * id — o `op 8 REQUEST_GUILD_MEMBERS` é aceito e ignorado pelo gateway, e uma
 * chamada dessas ficaria pendurada até o relógio da lib estourar.
 */
export async function acharMembro(servidor: Guild, usuarioId: string): Promise<GuildMember | null> {
  return (
    servidor.members.cache.get(usuarioId) ??
    (await servidor.members.fetch(usuarioId).catch(() => null))
  );
}

/** Resolve o que o usuário digitou (id ou nome) num membro do servidor. */
export async function resolverMembro(servidor: Guild, alvo: Alvo): Promise<GuildMember | null> {
  if (alvo.tipo === "id") return acharMembro(servidor, alvo.valor);
  const procurado = alvo.valor.toLowerCase();
  return (
    servidor.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === procurado ||
        (m.displayName ?? "").toLowerCase() === procurado,
    ) ?? null
  );
}

/** Resolve o que o usuário digitou (id ou nome) num cargo do servidor. */
export function resolverCargo(servidor: Guild, alvo: Alvo): Role | null {
  if (alvo.tipo === "id") return servidor.roles.cache.get(alvo.valor) ?? null;
  const procurado = alvo.valor.toLowerCase();
  return servidor.roles.cache.find((c) => c.name.toLowerCase() === procurado) ?? null;
}

/** Resolve num canal de texto do servidor; devolve o id ou `null`. */
export function resolverCanal(servidor: Guild, alvo: Alvo): string | null {
  if (alvo.tipo === "id") return servidor.channels.cache.get(alvo.valor)?.id ?? null;
  const procurado = alvo.valor.toLowerCase();
  return servidor.channels.cache.find((c) => c.name.toLowerCase() === procurado)?.id ?? null;
}

/**
 * Quem pode mexer no XP dos outros: **gerenciar servidor**.
 *
 * O cálculo é do discord.js, sobre os cargos que o `GUILD_CREATE` mandou (a
 * casca traduz o bitfield do Streamz para o do Discord, e manda o `@everyone`
 * com `id == guild.id`, que é o que faz o cálculo da lib funcionar). O dono
 * passa sempre — é regra da lib e do bom senso.
 *
 * Não se usa `permissionsIn(canal)`: a casca ainda não manda
 * `permission_overwrites` por canal, então a permissão **de canal** seria um
 * palpite. Permissão de servidor é a que esta pergunta precisa.
 */
export async function podeGerenciarServidor(servidor: Guild, usuarioId: string): Promise<boolean> {
  if (servidor.ownerId === usuarioId) return true;
  const membro = await acharMembro(servidor, usuarioId);
  if (!membro) return false;
  return membro.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

/** O nome de exibição de alguém, já cortado para caber numa linha de ranking. */
export function nomeDoMembro(servidor: Guild, usuarioId: string): string | null {
  const membro = servidor.members.cache.get(usuarioId);
  if (!membro) return null;
  return truncar(membro.displayName ?? membro.user.username, 32);
}

// ── Instância única ─────────────────────────────────────────────────────────

let servico: ServicoDeNiveis | null = null;

export function definirServico(novo: ServicoDeNiveis | null): void {
  servico = novo;
}

export function obterServico(): ServicoDeNiveis {
  if (!servico) throw new Error("o serviço de níveis ainda não subiu");
  return servico;
}
