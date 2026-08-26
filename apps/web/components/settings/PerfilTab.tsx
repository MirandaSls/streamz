"use client";

import { EmBreve, Section } from "@/components/settings/controls";
import { useT } from "@/lib/i18n";

/**
 * "Perfil".
 *
 * >>> ARQUIVO DO AGENTE D (perfil e social) <<<
 * O shell de configurações já reserva a aba e a rota (`?settings=perfil`); o
 * conteúdo — banner, "sobre mim", cor de destaque, apelido por servidor — é
 * dele. Este stub existe para o menu não ter buraco enquanto isso; substituir
 * o arquivo inteiro é toda a integração necessária.
 */
export default function PerfilTab() {
  const t = useT();
  return (
    <Section title={t("aba.perfil")}>
      <EmBreve>
        A tela de perfil (banner, sobre mim, cor de destaque) chega com o agente D. O nome de
        exibição e o avatar continuam em “{t("aba.conta")}”.
      </EmBreve>
    </Section>
  );
}
