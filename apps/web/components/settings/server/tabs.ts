/**
 * Abas das configurações do servidor.
 *
 * O tipo mora num módulo só de tipos para que `stores/ui.ts` possa apontar a
 * aba inicial (`{ kind: "serverSettings", tab }`) sem importar componente
 * nenhum — store não deve arrastar React consigo. A *lista* das abas (com
 * rótulo, permissão e o que cada uma desenha) vive no `ServerSettingsModal`,
 * que é quem sabe esconder as que o usuário não pode abrir.
 *
 * Os ids seguem a ordem do menu do Discord (print `docs/Reference/Captura de
 * tela 2026-09-04 100541.png`). Os que ele tem e nós não criamos — tag,
 * vantagens de impulso, figurinhas, integrações, diretório de apps, segurança,
 * comunidade, onboarding, análises e modelo do servidor — não entram: não
 * existe recurso por trás deles. "Painel de efeitos sonoros" **entra**: desde
 * o soundboard, existe recurso por trás dele.
 */
export type ServerSettingsTab =
  | "overview"
  | "engajamento"
  | "emoji"
  | "soundboard"
  | "members"
  | "roles"
  | "invites"
  | "acesso"
  | "audit"
  | "bans"
  | "reports";
