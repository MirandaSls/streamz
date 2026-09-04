import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Permission, hasPermission } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Conversão do que já existe para o modelo de overrides — c-cargos.
 *
 * O Streamz sempre teve duas representações de "quem entra neste canal", e a
 * ADR-0002 já dizia qual é a fonte da verdade: o `ChannelOverride`. As outras
 * duas são espelho:
 *
 * - `Channel.private` / `Channel.readOnly` — as colunas que a barra lateral lê
 *   para desenhar cadeado e megafone. Equivalem a um `deny` de `VIEW_CHANNEL` /
 *   `SEND_MESSAGES` no @everyone.
 * - `ChannelMember` num canal de servidor — a "allowlist" do canal privado.
 *   Equivale a um `allow` de `VIEW_CHANNEL` para aquele usuário.
 *
 * O código que grava já mantém as três em dia (`applyChannelFlags`,
 * `grantChannelView`). O que falta é o passado: canal marcado privado antes de
 * a ADR-0002 existir, ou linha de allowlist criada por um caminho que não
 * espelhava. Sem a conversão, esse canal continuaria privado na tela e aberto
 * na API — o pior dos dois mundos.
 *
 * É correção de **dado**, não de esquema, e roda no boot como
 * `CategoriasPadraoService`. Idempotente por construção: cada passo só escreve
 * quando o override que ele quer já não diz aquilo, então a segunda execução
 * não encontra nada.
 */

export interface ConversaoDePermissoes {
  /** canais cujo override do @everyone passou a refletir private/readOnly. */
  canaisAjustados: number;
  /** linhas de allowlist que ganharam o override de usuário correspondente. */
  liberacoesAjustadas: number;
}

export async function converterPermissoesDoServidor(
  prisma: PrismaService,
  guildId: string,
): Promise<ConversaoDePermissoes> {
  const everyone = await prisma.role.findFirst({ where: { guildId, isDefault: true } });
  if (!everyone) return { canaisAjustados: 0, liberacoesAjustadas: 0 };

  const canais = await prisma.channel.findMany({
    where: { guildId },
    select: { id: true, private: true, readOnly: true },
  });
  if (canais.length === 0) return { canaisAjustados: 0, liberacoesAjustadas: 0 };
  const ids = canais.map((c) => c.id);

  // ── 1. private/readOnly → deny no @everyone ──
  const doEveryone = await prisma.channelOverride.findMany({
    where: { channelId: { in: ids }, roleId: everyone.id },
  });
  let canaisAjustados = 0;
  for (const canal of canais) {
    const atual = doEveryone.find((o) => o.channelId === canal.id);
    const deny = atual?.deny ?? 0;
    const jaBate =
      hasPermission(deny, Permission.VIEW_CHANNEL) === canal.private &&
      hasPermission(deny, Permission.SEND_MESSAGES) === canal.readOnly;
    if (jaBate) continue;
    // as colunas mandam aqui, e só aqui: elas são o que o usuário marcou na
    // interface antiga, e o override é que está faltando. Nos dois sentidos o
    // resto do `deny` é preservado — ele pode carregar outras regras do canal.
    const novo =
      (deny & ~(Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES)) |
      (canal.private ? Permission.VIEW_CHANNEL : 0) |
      (canal.readOnly ? Permission.SEND_MESSAGES : 0);
    await prisma.channelOverride.upsert({
      where: { channelId_roleId: { channelId: canal.id, roleId: everyone.id } },
      create: { channelId: canal.id, roleId: everyone.id, allow: 0, deny: novo },
      update: { deny: novo },
    });
    canaisAjustados += 1;
  }

  // ── 2. allowlist (ChannelMember) → allow VIEW_CHANNEL do usuário ──
  const liberados = await prisma.channelMember.findMany({
    where: { channelId: { in: ids } },
    select: { channelId: true, userId: true },
  });
  const deUsuario = await prisma.channelOverride.findMany({
    where: { channelId: { in: ids }, userId: { not: null } },
  });
  let liberacoesAjustadas = 0;
  for (const l of liberados) {
    const atual = deUsuario.find((o) => o.channelId === l.channelId && o.userId === l.userId);
    if (atual && hasPermission(atual.allow, Permission.VIEW_CHANNEL)) continue;
    const allow = (atual?.allow ?? 0) | Permission.VIEW_CHANNEL;
    const deny = (atual?.deny ?? 0) & ~Permission.VIEW_CHANNEL;
    await prisma.channelOverride.upsert({
      where: { channelId_userId: { channelId: l.channelId, userId: l.userId } },
      create: { channelId: l.channelId, userId: l.userId, allow, deny },
      update: { allow, deny },
    });
    liberacoesAjustadas += 1;
  }

  return { canaisAjustados, liberacoesAjustadas };
}

/**
 * Passo do boot. Varre todos os servidores; a partir da segunda vez cada um
 * responde "nada a fazer" com duas consultas e nenhuma escrita.
 */
@Injectable()
export class PermissoesLegadoService implements OnModuleInit {
  private readonly logger = new Logger(PermissoesLegadoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.converterServidoresExistentes();
  }

  async converterServidoresExistentes(): Promise<ConversaoDePermissoes> {
    const guilds = await this.prisma.guild.findMany({ select: { id: true } });
    const total: ConversaoDePermissoes = { canaisAjustados: 0, liberacoesAjustadas: 0 };
    for (const g of guilds) {
      try {
        const r = await converterPermissoesDoServidor(this.prisma, g.id);
        total.canaisAjustados += r.canaisAjustados;
        total.liberacoesAjustadas += r.liberacoesAjustadas;
      } catch (e) {
        // um servidor problemático não pode impedir a API inteira de subir
        this.logger.error(`Servidor ${g.id}: ${(e as Error).message}`);
      }
    }
    if (total.canaisAjustados > 0 || total.liberacoesAjustadas > 0) {
      this.logger.log(
        `Overrides convertidos: ${total.canaisAjustados} canal(is) e ` +
          `${total.liberacoesAjustadas} liberação(ões) de membro`,
      );
    }
    return total;
  }
}
