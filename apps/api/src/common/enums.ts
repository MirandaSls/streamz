import type {
  ChannelType as PrismaChannelType,
  FriendshipStatus as PrismaFriendshipStatus,
  MemberRole as PrismaMemberRole,
  MessageType as PrismaMessageType,
  UserStatus as PrismaUserStatus,
} from "@prisma/client";
import type {
  ChannelType,
  FriendshipStatus,
  MemberRole,
  MessageType,
  UserStatus,
} from "@newdisc/shared";

/**
 * Ponte única entre os enums do Postgres (gerados pelo Prisma) e as union types
 * de `@newdisc/shared`, que formam o contrato api ↔ web.
 *
 * Os dois lados são o *mesmo* conjunto de literais de string, então nenhum
 * service precisa de `as` ao devolver um DTO: basta tipar o campo com a union
 * de `shared`. O que este arquivo faz é travar essa equivalência em tempo de
 * compilação — se alguém adicionar um valor ao `schema.prisma` (ou ao `shared`)
 * e esquecer do outro lado, o typecheck quebra aqui, num lugar só, e não em
 * runtime numa conversão silenciosa espalhada pelo código.
 */
type Equivalentes<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Trava<_T extends true> = never;

type _TravaUserStatus = Trava<Equivalentes<PrismaUserStatus, UserStatus>>;
type _TravaChannelType = Trava<Equivalentes<PrismaChannelType, ChannelType>>;
type _TravaMemberRole = Trava<Equivalentes<PrismaMemberRole, MemberRole>>;
// ── d-social ──
type _TravaMessageType = Trava<Equivalentes<PrismaMessageType, MessageType>>;
type _TravaFriendshipStatus = Trava<Equivalentes<PrismaFriendshipStatus, FriendshipStatus>>;
