import type {
  AuditAction as PrismaAuditAction,
  AuditTargetType as PrismaAuditTargetType,
  ChannelType as PrismaChannelType,
  FriendshipStatus as PrismaFriendshipStatus,
  MemberRole as PrismaMemberRole,
  MessageType as PrismaMessageType,
  NotificationLevel as PrismaNotificationLevel,
  ReportReason as PrismaReportReason,
  UserStatus as PrismaUserStatus,
} from "@prisma/client";
import type {
  AuditAction,
  AuditTargetType,
  ChannelType,
  FriendshipStatus,
  MemberRole,
  MessageType,
  NotificationLevel,
  ReportReason,
  UserStatus,
} from "@streamz/shared";

/**
 * Ponte única entre os enums do Postgres (gerados pelo Prisma) e as union types
 * de `@streamz/shared`, que formam o contrato api ↔ web.
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
type _TravaMessageType = Trava<Equivalentes<PrismaMessageType, MessageType>>;
type _TravaNotificationLevel = Trava<Equivalentes<PrismaNotificationLevel, NotificationLevel>>;
type _TravaFriendshipStatus = Trava<Equivalentes<PrismaFriendshipStatus, FriendshipStatus>>;
type _TravaAuditAction = Trava<Equivalentes<PrismaAuditAction, AuditAction>>;
type _TravaAuditTargetType = Trava<Equivalentes<PrismaAuditTargetType, AuditTargetType>>;
type _TravaReportReason = Trava<Equivalentes<PrismaReportReason, ReportReason>>;
