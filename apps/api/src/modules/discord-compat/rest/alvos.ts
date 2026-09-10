import type { DadosDeCompatService } from "../dados.service";
import {
  cargoDesconhecido,
  cargoInvalido,
  membroDesconhecido,
  servidorDesconhecido,
} from "../erros";
import type { IdsService } from "../ids.service";
import type { BotAutenticado, LinhaDeCargo, LinhaDeMembro } from "../tipos";

/**
 * ── F5 membros ── Resolver o `:guildId`/`:userId`/`:roleId` de uma rota, com o
 * erro do Discord certo quando não resolve.
 *
 * Existe como funções soltas, e não como um provider a mais, porque as quatro
 * são a mesma tradução que o `GuildsCompatController` já fazia em privado e que
 * agora tem quatro clientes (membros, banimentos, cargos e o próprio). Um
 * `@Injectable` novo teria de ser declarado no `@Module`, que é do coordenador.
 *
 * A regra que se repete em todas: **o código de erro é o do recurso que faltou**
 * (10004 servidor, 10007 membro, 10011 cargo), nunca o 404 mudo do Nest — a lib
 * do bot classifica pelo número (§5, "Erros"), e o `FiltroDeErrosDoDiscord`
 * traduz um `NotFoundException` genérico para `10003 Unknown Channel`, que aqui
 * seria mentira.
 */

/**
 * O cuid do servidor, **se** o bot participa dele. Se não, `10004`.
 *
 * Um 403 aqui contaria ao bot que o servidor existe; o Discord não confirma a
 * existência de servidor de que o bot não participa, e é o mesmo motivo de o
 * snowflake desconhecido cair no mesmo erro.
 */
export async function servidorDoBot(
  ids: IdsService,
  dados: DadosDeCompatService,
  bot: BotAutenticado,
  snowflake: string,
): Promise<string> {
  const guildId = await ids.cuidDeServidor(snowflake);
  if (!guildId) throw servidorDesconhecido();
  const membro = await dados.membroDoServidor(guildId, bot.botUserId);
  if (!membro) throw servidorDesconhecido();
  return guildId;
}

/**
 * O `:userId` de uma rota de membro → o cuid, com a linha de membro junto.
 *
 * Usuário que não existe e usuário que existe mas não é membro caem no mesmo
 * `10007 Unknown Member`: é o que o Discord devolve, e distinguir os dois
 * contaria a um bot de um servidor quais contas existem no resto do Streamz.
 */
export async function membroAlvo(
  ids: IdsService,
  dados: DadosDeCompatService,
  guildId: string,
  snowflake: string,
): Promise<{ userId: string; membro: LinhaDeMembro }> {
  const userId = await ids.cuidDeUsuario(snowflake);
  const membro = userId ? await dados.membroDoServidor(guildId, userId) : null;
  if (!userId || !membro) throw membroDesconhecido();
  return { userId, membro };
}

/**
 * O `:roleId` de uma rota → a linha do cargo, **deste** servidor.
 *
 * Lê a lista inteira de cargos do servidor (uma consulta; um servidor tem
 * dezenas, não milhares) em vez de `IdsService.cuidDeCargo`, porque além de
 * traduzir é preciso saber duas coisas que só a linha responde: o cargo é
 * mesmo deste servidor (senão um bot mexeria em cargo de outro) e ele é o
 * `@everyone`.
 *
 * `paraAtribuir` recusa com **50028** o que não se veste à mão: o `@everyone`
 * (implícito no Discord, e cujo id lá é o do próprio servidor).
 *
 * O outro caso do 50028 no Discord é o cargo **`managed`** (o de uma
 * integração). Ele **não** é conferido aqui, e de propósito: o `Role` do
 * Streamz não tem a coluna, `traducao/cargo.ts` responde `managed: false` para
 * todo cargo, e uma checagem contra um campo que é constante seria código morto
 * fingindo ser regra. Quando o cargo de integração existir, a recusa entra
 * nesta função — está declarada como pendência no §5 do documento.
 */
export async function cargoAlvo(
  dados: DadosDeCompatService,
  guildId: string,
  snowflake: string,
  opcoes: { paraAtribuir?: boolean } = {},
): Promise<LinhaDeCargo> {
  const cargos = await dados.cargosDoServidor(guildId);
  // o `@everyone` do Discord tem `id == guild.id` (ver `traducao/cargo.ts`), e é
  // com esse número que um bot o nomeia — o snowflake da nossa linha nunca sai
  const everyone = cargos.find((c) => c.isDefault);
  const oEveryonePeloIdDoServidor =
    everyone !== undefined && snowflake === String(everyone.guildSnowflake);

  const cargo = oEveryonePeloIdDoServidor
    ? everyone
    : cargos.find((c) => String(c.snowflake) === snowflake);
  if (!cargo) throw cargoDesconhecido();
  if (opcoes.paraAtribuir && cargo.isDefault) throw cargoInvalido();
  return cargo;
}
