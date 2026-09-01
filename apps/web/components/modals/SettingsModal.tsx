"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isTauri } from "@/lib/desktop";
import {
  SETTINGS_TABS,
  abaOuPadrao,
  ehAbaDeAdmin,
  type SettingsGroup,
} from "@/components/settings/tabs";
import { ProvedorDeAbas } from "@/components/settings/navegacao";
import Avatar from "@/components/ui/Avatar";
import { useControleDeAlteracoes } from "@/components/ui/alteracoes";
import TelaCheia, { ItemNeutro } from "@/components/ui/TelaCheia";
import { escreverAbaNaUrl, limparAbaDaUrl } from "@/hooks/useSettingsRoute";
import { useAdmin } from "@/stores/admin";
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

const GRUPOS: {
  id: SettingsGroup;
  label: "config.grupoUsuario" | "config.grupoApp" | "config.grupoAdmin";
}[] = [
  { id: "usuario", label: "config.grupoUsuario" },
  { id: "app", label: "config.grupoApp" },
  // ── j-painel-admin ── some para quem não é admin da instância
  { id: "admin", label: "config.grupoAdmin" },
];

export default function SettingsModal({ tab }: { tab?: string }) {
  const t = useT();
  const router = useRouter();
  const closeModal = useUI((s) => s.closeModal);
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const alteracoes = useControleDeAlteracoes();
  // `null` enquanto a resposta não chega: o grupo não aparece nem é negado
  const admin = useAdmin((s) => s.admin);
  const carregarAdmin = useAdmin((s) => s.carregar);

  const [abaId, setAbaId] = useState(() => abaOuPadrao(tab, true).id);
  const [busca, setBusca] = useState("");
  const aba = abaOuPadrao(abaId, admin === true);
  const Conteudo = aba.Component;

  // uma pergunta por sessão (o store guarda a resposta), feita ao abrir a tela:
  // quem nunca abre as configurações não gasta a requisição
  useEffect(() => {
    void carregarAdmin();
  }, [carregarAdmin]);

  // a URL acompanha a aba enquanto a tela está aberta, e é limpa ao fechar.
  // `aba.id`, não `abaId`: um link para aba de admin recebido por quem não é
  // admin cai na aba padrão, e a URL tem de contar a mesma história que a tela
  useEffect(() => {
    escreverAbaNaUrl(aba.id);
    return () => limparAbaDaUrl();
  }, [aba.id]);

  const q = busca.trim().toLowerCase();
  const grupos = useMemo(
    () =>
      GRUPOS.map((grupo) => ({
        id: grupo.id,
        label: t(grupo.label),
        itens: SETTINGS_TABS.filter(
          (item) =>
            item.group === grupo.id &&
            (admin === true || !ehAbaDeAdmin(item)) &&
            (!q || t(item.label).toLowerCase().includes(q)),
        ).map((item) => ({
          id: item.id,
          label: t(item.label),
          icon: item.icon,
          secoes: item.secoes?.map((sec) => ({ id: sec.id, label: t(sec.label) })),
        })),
      })),
    [admin, q, t],
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
      cabecalhoRico={
        user ? (
          // O cartão de perfil no topo do menu, como no print: é o que responde
          // "de quem são estas configurações" antes de qualquer aba — e a conta
          // aberta não é óbvia para quem tem mais de uma.
          <button
            type="button"
            onClick={() => setAbaId("perfil")}
            className="mb-4 flex w-full items-center gap-2 rounded-[4px] p-1 text-left transition hover:bg-hov"
          >
            <Avatar user={user} size="lg" surface="border-panel" />
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold text-txt-primary">
                {user.displayName || user.username}
              </span>
              <span className="block truncate text-xs text-txt-muted">{t("config.editarPerfil")}</span>
            </span>
          </button>
        ) : undefined
      }
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
      <ProvedorDeAbas irParaAba={setAbaId}>
        <Conteudo />
      </ProvedorDeAbas>
    </TelaCheia>
  );
}
