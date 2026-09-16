"use client";

import { useEffect, useState } from "react";
import {
  AUDIT_ACTION_LABELS,
  Permission,
  computePermissions,
  displayNameOf,
  hasPermission,
  isTimedOut,
  nomeParaMim,
  rolesOf,
  type AuditLogEntry,
  type UserProfile,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { PilulasDeCargo } from "@/components/ui/perfil/PilulasDeCargo";
import { Button } from "@/components/ui/primitivos";
import TagDeBot from "@/components/ui/TagDeBot";
import { horaCompleta } from "@/lib/format";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useCan, usePermissions } from "@/stores/permissions";
import { useUI } from "@/stores/ui";

/**
 * As permissões-chave do "Abrir na visualização de moderador" do Discord
 * (ESPEC2 §J), na ordem em que o cartão as lista. Rótulo próprio desta tela —
 * `PERMISSION_INFO` (`permissoes.ts`) é o texto da tela de EDITAR cargo
 * ("Expulsar membros", "Moderar membros"…), mais longo do que o Discord usa
 * aqui ("Expulsar", "Castigar").
 */
const PERMISSOES_CHAVE: { permission: number; label: string }[] = [
  { permission: Permission.ADMINISTRATOR, label: "Administrador" },
  { permission: Permission.MANAGE_GUILD, label: "Gerenciar servidor" },
  { permission: Permission.MANAGE_ROLES, label: "Gerenciar cargos" },
  { permission: Permission.MANAGE_CHANNELS, label: "Gerenciar canais" },
  { permission: Permission.KICK_MEMBERS, label: "Expulsar" },
  { permission: Permission.BAN_MEMBERS, label: "Banir" },
  { permission: Permission.MODERATE_MEMBERS, label: "Castigar" },
  { permission: Permission.MANAGE_MESSAGES, label: "Gerenciar mensagens" },
  { permission: Permission.MENTION_EVERYONE, label: "Mencionar @everyone" },
];

/**
 * Só as permissões-chave que o bitfield tem ligada, na ordem de
 * `PERMISSOES_CHAVE` — é a seção "Permissões" do cartão (ESPEC2 §J: "lista das
 * permissões-chave que o membro TEM", não as nove com um X do lado).
 */
export function permissoesChaveDoMembro(bits: number): { permission: number; label: string }[] {
  return PERMISSOES_CHAVE.filter((p) => hasPermission(bits, p.permission));
}

/** Padrão do "Membro desde"/"Conta criada em": "25 de agosto de 2026". */
const DATA_SELO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * "Atividade de moderação": últimas entradas do registro de auditoria que
 * têm este membro como ALVO.
 *
 * `GET /guilds/:guildId/audit-log` só filtra por `action` e pelo **ator**
 * (`AuditFilters.actorId` em `modules/audit/audit.service.ts`) — não há
 * filtro por alvo na API. Por isso a tela pede a página mais recente (sem
 * filtro) e filtra aqui pelo alvo, como pedido no cartão do agente ("se não
 * houver filtro, filtre no cliente as últimas N"). `entries` já vem
 * mais-recente-primeiro, então o corte é as primeiras `limite`.
 */
export function atividadeDeModeracaoDoMembro(
  entries: AuditLogEntry[],
  userId: string,
  limite = 5,
): AuditLogEntry[] {
  return entries
    .filter((e) => e.targetType === "USER" && e.targetId === userId)
    .slice(0, limite);
}

function InfoDoCartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{titulo}</div>
      <div className="truncate text-sm text-text-default">{valor}</div>
    </div>
  );
}

function TituloDeSecao({ children }: { children: string }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </h3>
  );
}

/**
 * "Abrir na visualização de moderador" (ESPEC2 §J1 "Eu mesmo" e §J2 "Outra
 * pessoa"): o painel de moderação do Discord — cabeçalho, datas, cargos,
 * permissões-chave que o membro TEM no servidor e as últimas entradas do
 * registro de auditoria que o têm como alvo, com os botões de castigo/
 * expulsão/banimento do rodapé reaproveitando os modais que o `MemberList` já
 * abre (`ui.openModal({ kind: "timeout"/"kick"/"ban" })`) — eles empilham por
 * cima deste e, ao confirmar, só desempilham a si mesmos.
 *
 * Sem rota nova: o membro vem de `useGuilds` (mesma lista que a coluna de
 * membros já carregou para o servidor ativo) e a data de criação da conta de
 * `api.profile` (mesma chamada do "Ver perfil"). "Entrou por" (convite usado)
 * não existe no contrato — a seção é omitida (ver relatório do agente).
 */
export default function VisaoDeModeradorModal({
  guildId,
  userId,
}: {
  guildId: string;
  userId: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const meId = useAuth((s) => s.user?.id);
  const apelidosDeAmigo = useFriends((s) => s.apelidos);
  const membro = useGuilds((s) => s.members.find((m) => m.user.id === userId) ?? null);
  const roles = usePermissions((s) => s.roles);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const timeout = useGuilds((s) => s.timeout);

  const podeCastigar = useCan(Permission.MODERATE_MEMBERS);
  const podeExpulsar = useCan(Permission.KICK_MEMBERS);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  // registro de auditoria: mesma permissão que a aba de configurações exige
  // (`ModerationController.auditLog` → `assertCanModerate(..., MANAGE_GUILD)`)
  const podeVerAuditoria = useCan(Permission.MANAGE_GUILD);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [auditoria, setAuditoria] = useState<AuditLogEntry[] | null>(null);
  const [erroAuditoria, setErroAuditoria] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .profile(userId, guildId)
      .then((p) => vivo && setProfile(p))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [userId, guildId]);

  useEffect(() => {
    if (!podeVerAuditoria) return;
    let vivo = true;
    api
      .auditLog(guildId)
      .then((page) => vivo && setAuditoria(page.entries))
      .catch(() => vivo && setErroAuditoria(true));
    return () => {
      vivo = false;
    };
  }, [guildId, podeVerAuditoria]);

  if (!membro) {
    return (
      <Dialog title="Visualização de moderador" onClose={closeModal}>
        <p className="py-3 text-sm text-text-muted">Este membro não está mais no servidor.</p>
      </Dialog>
    );
  }

  const nome = nomeParaMim(membro.user, {
    apelidoDeAmigo: apelidosDeAmigo?.[membro.user.id],
    apelidoNoServidor: membro.nickname,
  });
  const cargos = rolesOf(membro.roleIds, roles);
  const bits = computePermissions(
    { isOwner: membro.role === "OWNER", roleIds: membro.roleIds },
    roles,
    [],
  );
  const permissoes = permissoesChaveDoMembro(bits);
  const atividade = auditoria ? atividadeDeModeracaoDoMembro(auditoria, userId) : null;

  // mesma regra do menu de contexto do MemberList: não age em si mesmo nem no dono
  const podeAgirSobre = membro.user.id !== meId && membro.role !== "OWNER";
  const mostraCastigar = podeAgirSobre && podeCastigar;
  const mostraExpulsar = podeAgirSobre && podeExpulsar;
  const mostraBanir = podeAgirSobre && podeBanir;
  const temAcoes = mostraCastigar || mostraExpulsar || mostraBanir;

  return (
    <Dialog
      title="Visualização de moderador"
      onClose={closeModal}
      footer={
        temAcoes ? (
          <div className="flex w-full flex-wrap gap-2">
            {mostraCastigar && (
              <Button
                variante="critico-secundario"
                tamanho="sm"
                className="flex-1"
                onClick={() => timeout(membro.user.id)}
              >
                {isTimedOut(membro.timeoutUntil) ? "Remover castigo" : "Castigar"}
              </Button>
            )}
            {mostraExpulsar && (
              <Button
                variante="critico-secundario"
                tamanho="sm"
                className="flex-1"
                onClick={() => kick(membro.user.id)}
              >
                Expulsar
              </Button>
            )}
            {mostraBanir && (
              <Button
                variante="critico-secundario"
                tamanho="sm"
                className="flex-1"
                onClick={() => ban(membro.user.id)}
              >
                Banir
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar user={membro.user} size="xl" surface="border-background-base-lowest" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-lg font-semibold text-text-strong">{nome}</span>
              {membro.user.bot && <TagDeBot />}
            </div>
            <span className="truncate text-sm text-text-muted">@{membro.user.username}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <InfoDoCartao titulo="Membro desde" valor={DATA_SELO.format(new Date(membro.joinedAt))} />
          {profile && (
            <InfoDoCartao
              titulo="Conta criada em"
              valor={DATA_SELO.format(new Date(profile.createdAt))}
            />
          )}
          {/* "Entrou por" (convite usado para entrar) não existe no contrato
              hoje — `GuildMemberView` só guarda `joinedAt`, sem o código do
              convite. Seção omitida (relatado ao final da entrega). */}
        </div>

        <div>
          <TituloDeSecao>Cargos</TituloDeSecao>
          {cargos.length > 0 ? (
            <PilulasDeCargo
              cargos={cargos}
              podeRemover={false}
              podeAdicionar={false}
              aoRemover={() => {}}
              aoAdicionar={() => {}}
            />
          ) : (
            <p className="text-sm text-text-muted">Sem cargos.</p>
          )}
        </div>

        <div>
          <TituloDeSecao>Permissões</TituloDeSecao>
          {permissoes.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {permissoes.map((p) => (
                <li
                  key={p.permission}
                  className="rounded-lg border border-border-subtle px-2 py-1 text-xs font-medium text-text-default"
                >
                  {p.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Nenhuma permissão de moderação neste servidor.</p>
          )}
        </div>

        {podeVerAuditoria && (
          <div>
            <TituloDeSecao>Atividade de moderação</TituloDeSecao>
            {erroAuditoria ? (
              <p className="text-sm text-text-muted">Não foi possível carregar o registro.</p>
            ) : atividade === null ? (
              <p className="text-sm text-text-muted">Carregando…</p>
            ) : atividade.length === 0 ? (
              <p className="text-sm text-text-muted">Nada registrado sobre este membro.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {atividade.map((e) => (
                  <li key={e.id} className="text-sm text-text-default">
                    <span className="font-medium text-text-strong">
                      {e.actor ? displayNameOf(e.actor) : "Conta removida"}
                    </span>{" "}
                    <span className="text-text-muted">{AUDIT_ACTION_LABELS[e.action].toLowerCase()}</span>{" "}
                    <span className="text-xs text-text-muted">· {horaCompleta(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
