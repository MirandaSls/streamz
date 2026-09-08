import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  LinhaDeCanal,
  LinhaDeCargo,
  LinhaDeCategoria,
  LinhaDeMembro,
  LinhaDeMensagem,
  LinhaDeServidor,
  LinhaDeUsuario,
} from "./tipos";

/**
 * Leitura do banco **com o snowflake junto** — a fonte de tudo que a casca
 * traduz.
 *
 * Por que não usar `GuildsService`/`MessagesService` para ler: eles devolvem os
 * DTOs de `@streamz/shared`, que carregam `id` cuid e **não** têm snowflake.
 * Reconstruir o número depois custaria uma consulta por id (uma mensagem tem
 * seis). Aqui o `select` já traz a coluna, e a tradução vira aritmética.
 *
 * Isto é **só leitura**. Escrita, permissão e regra de negócio continuam nos
 * services de sempre: `MessagesService.create`, `GuildsService.
 * assertCanViewChannel`, `assertCanPostChannel`. A casca não reimplementa nada
 * (§3, "a compatibilidade é uma casca").
 *
 * ── Lote A (REST compat) implementa este arquivo. ──
 * Os lotes B (`identify.ts`) e D (`dispatch.ts`) apenas o consomem; as
 * assinaturas abaixo são contrato e não mudam.
 */
@Injectable()
export class DadosDeCompatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Os servidores em que o usuário-bot é membro.
   *
   * É a lista do `READY.guilds` (com `unavailable: true`) e a raiz do
   * `GUILD_CREATE`. Em F1 não há instalação por UI (isso é a F4): "o bot está
   * no servidor" quer dizer, literalmente, que existe uma linha de
   * `GuildMember` para o `botUserId`.
   */
  async servidoresDoBot(_botUserId: string): Promise<{ id: string; snowflake: bigint }[]> {
    throw new Error("F1 lote A: DadosDeCompatService.servidoresDoBot não implementado");
  }

  /**
   * Tudo de um servidor, para o `GUILD_CREATE` e o `GET /guilds/:id`.
   *
   * Gordo de propósito: é daqui que o cache do bot nasce, e campo faltando
   * trava o `ready` sem erro nenhum (§7 e risco (a) do §12).
   */
  async servidorCompleto(_guildId: string): Promise<LinhaDeServidor | null> {
    throw new Error("F1 lote A: DadosDeCompatService.servidorCompleto não implementado");
  }

  async usuarioPorCuid(_id: string): Promise<LinhaDeUsuario | null> {
    throw new Error("F1 lote A: DadosDeCompatService.usuarioPorCuid não implementado");
  }

  async canalPorCuid(_id: string): Promise<LinhaDeCanal | null> {
    throw new Error("F1 lote A: DadosDeCompatService.canalPorCuid não implementado");
  }

  async categoriaPorCuid(_id: string): Promise<LinhaDeCategoria | null> {
    throw new Error("F1 lote A: DadosDeCompatService.categoriaPorCuid não implementado");
  }

  /** Canais e categorias de um servidor (as categorias saem como tipo 4). */
  async estruturaDoServidor(
    _guildId: string,
  ): Promise<{ canais: LinhaDeCanal[]; categorias: LinhaDeCategoria[] }> {
    throw new Error("F1 lote A: DadosDeCompatService.estruturaDoServidor não implementado");
  }

  async cargosDoServidor(_guildId: string): Promise<LinhaDeCargo[]> {
    throw new Error("F1 lote A: DadosDeCompatService.cargosDoServidor não implementado");
  }

  async membroDoServidor(_guildId: string, _userId: string): Promise<LinhaDeMembro | null> {
    throw new Error("F1 lote A: DadosDeCompatService.membroDoServidor não implementado");
  }

  /** Todos os membros. Nosso servidor é pequeno; o `GUILD_CREATE` manda todos. */
  async membrosDoServidor(_guildId: string): Promise<LinhaDeMembro[]> {
    throw new Error("F1 lote A: DadosDeCompatService.membrosDoServidor não implementado");
  }

  /** `paraBot` decide o `me` das reações; `null` = ninguém. */
  async mensagemPorCuid(_id: string, _paraBotUserId: string | null): Promise<LinhaDeMensagem | null> {
    throw new Error("F1 lote A: DadosDeCompatService.mensagemPorCuid não implementado");
  }

  /**
   * Histórico com o cursor do Discord.
   *
   * `before`/`after`/`around` são **snowflakes**, e a ordenação é por snowflake
   * (não por `createdAt`): é o que dá cursor estável quando duas mensagens caem
   * no mesmo milissegundo. `limit` é 1..100, padrão 50.
   */
  async mensagensDoCanal(
    _channelId: string,
    _opcoes: {
      limit: number;
      before?: bigint;
      after?: bigint;
      around?: bigint;
      paraBotUserId: string | null;
    },
  ): Promise<LinhaDeMensagem[]> {
    throw new Error("F1 lote A: DadosDeCompatService.mensagensDoCanal não implementado");
  }
}
