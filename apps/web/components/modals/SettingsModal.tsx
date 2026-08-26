"use client";

import SettingsShell from "@/components/settings/SettingsShell";

/**
 * Configurações do usuário.
 *
 * Continua sendo montado pelo `ModalHost` (`ui.openModal({ kind: "settings" })`
 * segue valendo de qualquer lugar), mas o que ele desenha agora é a tela cheia
 * de `components/settings/SettingsShell` — a caixa de 480px com "Minha conta"
 * virou uma aba entre dez. O arquivo fica como ponte para nenhum call site
 * precisar saber disso.
 */
export default function SettingsModal({ tab }: { tab?: string }) {
  return <SettingsShell tab={tab} />;
}
