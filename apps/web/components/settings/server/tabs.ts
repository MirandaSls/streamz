/**
 * Abas das configurações do servidor.
 *
 * A lista mora num módulo só de tipos para que `stores/ui.ts` possa apontar a
 * aba inicial (`{ kind: "serverSettings", tab }`) sem importar componente
 * nenhum — store não deve arrastar React consigo.
 */
export type ServerSettingsTab = "onboarding" | "audit" | "reports" | "bans";

export const SERVER_SETTINGS_TABS: readonly { id: ServerSettingsTab; label: string }[] = [
  { id: "onboarding", label: "Entrada e regras" },
  { id: "audit", label: "Registro de auditoria" },
  { id: "reports", label: "Denúncias" },
  { id: "bans", label: "Banimentos" },
];
