"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isTauri } from "@/lib/desktop";
import { SETTINGS_TABS, abaOuPadrao, type SettingsGroup } from "@/components/settings/tabs";
import { useControleDeAlteracoes } from "@/components/ui/alteracoes";
import TelaCheia, { ItemNeutro } from "@/components/ui/TelaCheia";
import { escreverAbaNaUrl, limparAbaDaUrl } from "@/hooks/useSettingsRoute";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

/**
 * Configurações do usuário — a `TelaCheia` de `components/ui`, a mesma moldura
 * das configurações de servidor, canal e grupo. É a única das quatro que tem
 * campo de busca no menu, porque é a única com dez abas.
 *
 * A aba viaja na URL (`?settings=aparencia`) para que um link leve direto a
 * ela; o histórico é substituído, não empilhado, senão cada clique no menu
 * viraria um passo do botão "voltar".
 */

const VERSAO = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "0.0.1";

const GRUPOS: { id: SettingsGroup; label: "config.grupoUsuario" | "config.grupoApp" }[] = [
  { id: "usuario", label: "config.grupoUsuario" },
  { id: "app", label: "config.grupoApp" },
];

export default function SettingsModal({ tab }: { tab?: string }) {
  const t = useT();
  const router = useRouter();
  const closeModal = useUI((s) => s.closeModal);
  const logout = useAuth((s) => s.logout);
  const alteracoes = useControleDeAlteracoes();

  const [abaId, setAbaId] = useState(() => abaOuPadrao(tab).id);
  const [busca, setBusca] = useState("");
  const aba = abaOuPadrao(abaId);
  const Conteudo = aba.Component;

  // a URL acompanha a aba enquanto a tela está aberta, e é limpa ao fechar
  useEffect(() => {
    escreverAbaNaUrl(abaId);
    return () => limparAbaDaUrl();
  }, [abaId]);

  const q = busca.trim().toLowerCase();
  const grupos = useMemo(
    () =>
      GRUPOS.map((grupo) => ({
        id: grupo.id,
        label: t(grupo.label),
        itens: SETTINGS_TABS.filter(
          (item) => item.group === grupo.id && (!q || t(item.label).toLowerCase().includes(q)),
        ).map((item) => ({ id: item.id, label: t(item.label), icon: item.icon })),
      })),
    [q, t],
  );

  function sair() {
    if (!alteracoes.pedirParaSair()) return;
    closeModal();
    logout();
    router.replace("/login");
  }

  return (
    <TelaCheia
      titulo={t("config.titulo")}
      busca={{
        valor: busca,
        onChange: setBusca,
        rotulo: "Buscar nas configurações",
      }}
      grupos={grupos}
      abaId={aba.id}
      onAba={setAbaId}
      menuVazio={<p className="px-2.5 text-sm text-txt-muted">Nada com esse nome.</p>}
      tituloAba={t(aba.label)}
      rotuloFechar={t("config.fechar")}
      controle={alteracoes}
      onClose={closeModal}
      rodapeMenu={
        <>
          <ItemNeutro onClick={sair} icon={<LogOut size={16} />}>
            {t("config.sair")}
          </ItemNeutro>

          {/* no Discord web não existe linha de versão — ela só faz sentido no
              instalador, onde o usuário não atualiza recarregando a página */}
          {isTauri() && (
            <p className="px-2.5 py-3 text-[11px] text-txt-faint">
              {t("config.versao")} {VERSAO}
            </p>
          )}
        </>
      }
    >
      <Conteudo />
    </TelaCheia>
  );
}
