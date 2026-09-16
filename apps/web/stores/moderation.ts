import { create } from "zustand";
import {
  isTimedOut,
  type GuildMembership,
  type MinhaAssociacaoEditarInput,
  type ReportView,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Estado de moderação do lado do cliente: o que vale para mim no servidor
 * aberto (castigo, regras, boas-vindas) e a fila de denúncias.
 */

interface ModerationState {
  /** o que vale para mim no servidor aberto (castigo, regras, boas-vindas). */
  membership: GuildMembership | null;

  reports: ReportView[];
  reportsLoading: boolean;

  loadMembership: (guildId: string) => Promise<void>;
  acceptRules: () => Promise<void>;
  dismissWelcome: () => Promise<void>;
  /** `member.updated` mudou o meu castigo. */
  applyTimeout: (guildId: string, userId: string, timeoutUntil: string | null) => void;
  /** `member.updated` mudou o meu apelido neste servidor (por outra aba/dispositivo). */
  applyNickname: (guildId: string, nickname: string | null) => void;

  /**
   * ── menus de contexto ── associação de **qualquer** servidor, não só o
   * aberto: os modais "Config. de privacidade" e "Editar perfil por
   * servidor" abrem a partir do menu do ícone na barra, que existe para
   * qualquer item dela — inclusive um servidor que não é o `membership`
   * ativo. Não mexe no estado; quem chama guarda a resposta localmente.
   */
  membershipDe: (guildId: string) => Promise<GuildMembership>;
  /**
   * `PATCH /guilds/:guildId/membership`. Atualiza `membership` também quando
   * `guildId` é o servidor aberto — é o mesmo objeto que a API devolve, então
   * o composer e o resto da tela veem o apelido/privacidade novos sem F5.
   * Não faz otimismo aqui (outros consumidores do `membership` ativo não
   * podem ver um valor que a API ainda pode recusar); quem chama decide a UI
   * otimista do próprio campo e reverte no catch.
   */
  editarAssociacao: (guildId: string, patch: MinhaAssociacaoEditarInput) => Promise<GuildMembership>;

  loadReports: (guildId: string, resolved?: boolean) => Promise<void>;
  resolveReport: (guildId: string, reportId: string, resolved: boolean) => Promise<void>;
  handleReportCreated: (report: ReportView) => void;
  clear: () => void;
}

export const useModeration = create<ModerationState>((set, get) => ({
  membership: null,
  reports: [],
  reportsLoading: false,

  loadMembership: async (guildId) => {
    try {
      const membership = await api.membership(guildId);
      set({ membership });
      // a tela de boas-vindas é o próprio efeito de entrar no servidor: ela
      // aparece uma vez, aqui, e `markWelcomeSeen` garante que não volte
      if (membership.showWelcome) ui.openModal({ kind: "welcome", guildId });
    } catch {
      // servidor sem onboarding configurado não impede o uso do app
      set({ membership: null });
    }
  },

  acceptRules: async () => {
    const membership = get().membership;
    if (!membership) return;
    try {
      const { acceptedRulesAt } = await api.acceptRules(membership.guildId);
      set({ membership: { ...membership, acceptedRulesAt, mustAcceptRules: false } });
      ui.toast("Regras aceitas. Boa conversa!");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível aceitar as regras"), "error");
    }
  },

  dismissWelcome: async () => {
    const membership = get().membership;
    if (!membership) return;
    set({ membership: { ...membership, showWelcome: false } });
    await api.markWelcomeSeen(membership.guildId).catch(() => undefined);
  },

  applyTimeout: (guildId, userId, timeoutUntil) => {
    const membership = get().membership;
    if (!membership || membership.guildId !== guildId) return;
    set({ membership: { ...membership, timeoutUntil } });
    if (isTimedOut(timeoutUntil)) ui.toast("Você foi colocado de castigo neste servidor.", "error");
    else if (membership.timeoutUntil) ui.toast("Seu castigo foi removido.");
  },

  applyNickname: (guildId, nickname) => {
    const membership = get().membership;
    if (!membership || membership.guildId !== guildId) return;
    set({ membership: { ...membership, nickname } });
  },

  membershipDe: (guildId) => api.membership(guildId),

  editarAssociacao: async (guildId, patch) => {
    const atualizado = await api.editarMinhaAssociacao(guildId, patch);
    set((s) => (s.membership?.guildId === guildId ? { membership: atualizado } : s));
    return atualizado;
  },

  loadReports: async (guildId, resolved = false) => {
    set({ reportsLoading: true });
    try {
      set({ reports: await api.listReports(guildId, resolved), reportsLoading: false });
    } catch (e) {
      set({ reports: [], reportsLoading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar as denúncias"), "error");
    }
  },

  resolveReport: async (guildId, reportId, resolved) => {
    try {
      await api.resolveReport(guildId, reportId, resolved);
      set((s) => ({ reports: s.reports.filter((r) => r.id !== reportId) }));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível atualizar a denúncia"), "error");
    }
  },

  handleReportCreated: (report) =>
    set((s) => (s.reports.some((r) => r.id === report.id) ? s : { reports: [report, ...s.reports] })),

  clear: () => set({ membership: null, reports: [] }),
}));

/** Estou de castigo no servidor aberto? Decide o aviso no lugar do composer. */
export function useMyTimeout(): string | null {
  return useModeration((s) =>
    s.membership && isTimedOut(s.membership.timeoutUntil) ? s.membership.timeoutUntil : null,
  );
}

/** Preciso aceitar as regras antes de escrever? */
export function useMustAcceptRules(): boolean {
  return useModeration((s) => !!s.membership?.mustAcceptRules);
}
