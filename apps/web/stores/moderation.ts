import { create } from "zustand";
import { isTimedOut, type GuildMembership, type ReportView } from "@newdisc/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Estado de moderação do lado do cliente: o modo "selecionar mensagens" da
 * timeline, o que vale para mim no servidor aberto (castigo, regras,
 * boas-vindas) e a fila de denúncias.
 *
 * A seleção mora aqui, e não na store de mensagens, porque é estado de
 * *interface de moderação*: sai da tela quando o moderador desiste, e nenhuma
 * mensagem precisa saber que existe.
 */

interface ModerationState {
  /** modo de seleção múltipla ligado no canal `selectionChannelId`. */
  selecting: boolean;
  selectionChannelId: string | null;
  selected: string[];

  /** o que vale para mim no servidor aberto (castigo, regras, boas-vindas). */
  membership: GuildMembership | null;

  reports: ReportView[];
  reportsLoading: boolean;

  startSelection: (channelId: string, firstId?: string) => void;
  toggleSelected: (messageId: string) => void;
  cancelSelection: () => void;
  deleteSelected: () => Promise<void>;
  deleteAfter: (channelId: string, messageId: string) => Promise<void>;

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
  selecting: false,
  selectionChannelId: null,
  selected: [],
  membership: null,
  reports: [],
  reportsLoading: false,

  startSelection: (channelId, firstId) =>
    set({ selecting: true, selectionChannelId: channelId, selected: firstId ? [firstId] : [] }),

  toggleSelected: (messageId) =>
    set((s) => ({
      selected: s.selected.includes(messageId)
        ? s.selected.filter((id) => id !== messageId)
        : [...s.selected, messageId],
    })),

  cancelSelection: () => set({ selecting: false, selectionChannelId: null, selected: [] }),

  deleteSelected: async () => {
    const { selectionChannelId, selected } = get();
    if (!selectionChannelId || selected.length === 0) return;
    const ok = await ui.confirm({
      title: `Apagar ${selected.length} ${selected.length === 1 ? "mensagem" : "mensagens"}?`,
      message: "Elas somem para todo mundo no canal. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      const { deleted } = await api.bulkDeleteMessages(selectionChannelId, selected);
      // a remoção da tela vem pelo evento `messages.bulkDeleted` (useRealtime)
      ui.toast(`${deleted.length} ${deleted.length === 1 ? "mensagem apagada" : "mensagens apagadas"}.`);
      get().cancelSelection();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível apagar"), "error");
    }
  },

  deleteAfter: async (channelId, messageId) => {
    const ok = await ui.confirm({
      title: "Apagar as mensagens depois desta?",
      message: "Apaga até 100 mensagens posteriores neste canal. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      const { deleted } = await api.deleteMessagesAfter(channelId, messageId);
      ui.toast(`${deleted.length} ${deleted.length === 1 ? "mensagem apagada" : "mensagens apagadas"}.`);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível apagar"), "error");
    }
  },

  loadMembership: async (guildId) => {
    try {
      set({ membership: await api.membership(guildId) });
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

  clear: () =>
    set({
      selecting: false,
      selectionChannelId: null,
      selected: [],
      membership: null,
      reports: [],
    }),
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
