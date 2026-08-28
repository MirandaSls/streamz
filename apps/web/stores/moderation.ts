import { create } from "zustand";
import { isTimedOut, type GuildMembership, type ReportView } from "@streamz/shared";
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
