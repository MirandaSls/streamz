"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Pencil } from "@/components/ui/icones";
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
import JanelaDeConfiguracoes, { ItemPerigo } from "@/components/ui/JanelaDeConfiguracoes";
import { escreverAbaNaUrl, limparAbaDaUrl } from "@/hooks/useSettingsRoute";
import { useAdmin } from "@/stores/admin";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

/**
 * Configurações do usuário — a `JanelaDeConfiguracoes` de `components/ui`, a
 * mesma moldura das de servidor, canal e grupo. É a única das quatro que tem
 * campo de busca no menu, porque é a única com dez abas.
 *
 * A aba viaja na URL (`?settings=aparencia`) para que um link leve direto a
 * ela; o histórico é substituído, não empilhado, senão cada clique no menu
 * viraria um passo do botão "voltar".
 */

const VERSAO = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "0.0.1";

/**
 * Os grupos do menu. O primeiro **não tem cabeçalho**: no Discord a lista
 * começa direto em "Conta", logo abaixo da busca, e os cabeçalhos ("Cobrança",
 * "Experiência", "Jogos e apps") só aparecem a partir do segundo grupo (print
 * `docs/Reference/Captura de tela 2026-09-01 114644.png`).
 */
const GRUPOS: {
  id: SettingsGroup;
  label?: "config.grupoApp" | "config.grupoAdmin";
}[] = [
  { id: "usuario" },
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
        label: grupo.label ? t(grupo.label) : undefined,
        itens: SETTINGS_TABS.filter(
          (item) =>
            item.group === grupo.id &&
            (admin === true || !ehAbaDeAdmin(item)) &&
            // a busca acha a aba pelo nome dela **ou** de uma das seções:
            // quem digita "senha" quer "Minha conta", que não tem "senha" no nome
            (!q ||
              t(item.label).toLowerCase().includes(q) ||
              (item.secoes ?? []).some((sec) => t(sec.label).toLowerCase().includes(q))),
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
    <JanelaDeConfiguracoes
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
          //
          // Medidas (print 114404): avatar de 48 em x 288–335 / y 104–151, a 11
          // da borda do item e a 15 do topo do cartão (que começa nos 16 de
          // recuo da coluna); nome em x=347 (12 do avatar), 16px `--text-strong`;
          // "Editar perfil" 14px `--text-muted` com o lápis depois do texto; a
          // busca começa 15 abaixo do avatar (y=167). O hover não aparece no
          // print — é o hover dos itens do menu.
          <button
            type="button"
            onClick={() => setAbaId("perfil")}
            className="flex w-full items-center gap-3 rounded-lg px-[11px] py-[15px] text-left transition-colors hover:bg-background-mod-subtle"
          >
            {/* degrau de 48 do `Avatar` (medida acima, print 114404) */}
            <Avatar user={user} size="lg48" surface="border-background-base-lower" />
            <span className="min-w-0">
              <span className="block truncate text-text-md font-semibold text-text-strong">
                {user.displayName || user.username}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-text-sm text-text-muted">
                <span className="truncate">{t("config.editarPerfil")}</span>
                <Pencil size={12} aria-hidden="true" className="shrink-0" />
              </span>
            </span>
          </button>
        ) : undefined
      }
      grupos={grupos}
      abaId={aba.id}
      onAba={setAbaId}
      // estado vazio da busca: a frase não foi medida (não há print do Discord
      // com a busca sem resultado); o corpo é o do cabeçalho de grupo
      menuVazio={
        <p role="status" className="px-2.5 py-2 text-text-sm text-text-muted">
          Nenhuma configuração com esse nome.
        </p>
      }
      tituloAba={t(aba.label)}
      rotuloFechar={t("config.fechar")}
      controle={alteracoes}
      onClose={closeModal}
      rodapeMenu={
        <>
          {/* Vermelho, como no Discord (`--text-feedback-critical`, `#f87e7a` no
              print 114404): é a única ação do menu que tira o usuário da conta.
              O ícone tem os 20px dos outros itens da coluna. */}
          <ItemPerigo onClick={sair} icon={<LogOut size={20} />}>
            {t("config.sair")}
          </ItemPerigo>

          {/* no Discord web não existe linha de versão — ela só faz sentido no
              instalador, onde o usuário não atualiza recarregando a página */}
          {/* 12px `--text-muted`, rente à borda do item e 36 abaixo de "Sair"
              (print 114404: glifo y 947–954, x=277; "Sair" termina em y=907) */}
          {isTauri() && (
            <p className="mt-9 text-text-xs text-text-muted">
              {t("config.versao")} {VERSAO}
            </p>
          )}
        </>
      }
    >
      <ProvedorDeAbas irParaAba={setAbaId}>
        <Conteudo />
      </ProvedorDeAbas>
    </JanelaDeConfiguracoes>
  );
}
