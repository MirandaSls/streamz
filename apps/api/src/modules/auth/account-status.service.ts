import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/** O que o guard precisa saber sobre a conta por trás de um token válido. */
export interface EstadoDaConta {
  existe: boolean;
  desativada: boolean;
  excluida: boolean;
}

const CONTA_INEXISTENTE: EstadoDaConta = { existe: false, desativada: false, excluida: true };

/** Quanto tempo o estado fica em cache. Ver o comentário da classe. */
const TTL_MS = 60_000;

/**
 * Cache curto do estado da conta, para o `JwtGuard`.
 *
 * O access token vale 15 minutos, então desativar ou excluir uma conta só teria
 * efeito 15 minutos depois — tempo demais para uma ação que o usuário toma
 * justamente por segurança. Consultar o banco em *toda* requisição autenticada
 * resolveria, mas coloca um SELECT no caminho de cada chamada da UI, que faz
 * dezenas por minuto.
 *
 * O meio-termo é este cache de 60 s por id: no pior caso a conta desativada
 * ainda passa por um minuto, e o custo é ~1 consulta por usuário por minuto.
 * Quem desativa/exclui/reativa chama `invalidar()` e o efeito é imediato.
 *
 * O cache é **por processo** (como o rate limit do WS). Com várias instâncias,
 * cada uma tem o seu — o teto de atraso continua sendo os mesmos 60 s.
 */
@Injectable()
export class AccountStatusService {
  private readonly cache = new Map<string, { estado: EstadoDaConta; expiraEm: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async estado(userId: string, agora = Date.now()): Promise<EstadoDaConta> {
    const emCache = this.cache.get(userId);
    if (emCache && emCache.expiraEm > agora) return emCache.estado;

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { disabledAt: true, deletedAt: true },
    });
    const estado: EstadoDaConta = row
      ? { existe: true, desativada: !!row.disabledAt, excluida: !!row.deletedAt }
      : CONTA_INEXISTENTE;

    this.cache.set(userId, { estado, expiraEm: agora + TTL_MS });
    // o Map cresceria sem limite num processo longo; a faxina é barata e rara
    if (this.cache.size > 5000) this.limpar(agora);
    return estado;
  }

  /** Descarta o que está em cache para o usuário (desativou, excluiu, reativou). */
  invalidar(userId: string): void {
    this.cache.delete(userId);
  }

  /** Remove as entradas vencidas. */
  private limpar(agora: number): void {
    for (const [id, entrada] of this.cache) {
      if (entrada.expiraEm <= agora) this.cache.delete(id);
    }
  }
}
