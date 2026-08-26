/**
 * Abas das configurações do servidor.
 *
 * O tipo mora num módulo só de tipos para que `stores/ui.ts` possa apontar a
 * aba inicial (`{ kind: "serverSettings", tab }`) sem importar componente
 * nenhum — store não deve arrastar React consigo. A *lista* das abas (com
 * rótulo, permissão e o que cada uma desenha) vive no `ServerSettingsModal`,
 * que é quem sabe esconder as que o usuário não pode abrir.
 */
export type ServerSettingsTab =
  | "overview"
  | "roles"
  | "members"
  | "invites"
  | "bans"
  | "onboarding"
  | "audit"
  | "reports";
