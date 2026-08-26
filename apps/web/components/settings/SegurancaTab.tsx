"use client";

import { EmBreve, Section } from "@/components/settings/controls";
import { useT } from "@/lib/i18n";

/**
 * "Privacidade e segurança".
 *
 * >>> ARQUIVO DO AGENTE I (conta e segurança) <<<
 * Reservado para quem pode me mandar mensagem direta, filtro de conteúdo,
 * bloqueios e exclusão de conta. O shell já expõe a aba e a rota
 * (`?settings=privacidade`); trocar este arquivo é toda a integração.
 */
export default function SegurancaTab() {
  const t = useT();
  return (
    <Section title={t("aba.privacidade")}>
      <EmBreve>
        As opções de privacidade (quem pode me chamar, bloqueios, apagar a conta) chegam com o
        agente I.
      </EmBreve>
    </Section>
  );
}
