"use client";

import { useEffect, useState } from "react";
import { Search } from "@/components/ui/icones";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import Avatar from "@/components/ui/Avatar";
import { TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

interface Banimento {
  user: PublicUser;
  reason: string | null;
  createdAt: string;
}

/**
 * Aba "Banimentos": a lista de quem está banido.
 *
 * **Redesenho, não só vocabulário** — `.bannedUser__4b8d8` de `css-bruto/
 * sob-demanda/8903596b8824b8c1.css` (tema escuro; as regras `.theme-light`
 * não valem aqui) mede o Discord real como uma **lista de pílulas**, não a
 * tabela de duas colunas que tínhamos: cada linha é seu próprio cartão,
 * `background-color:var(--background-mod-subtle)`, `border-radius:var(
 * --radius-sm)` (8px → `rounded-lg`), `padding:var(--space-8)` (8px → `p-2`),
 * `margin-bottom:var(--space-4)` (4px → `mb-1`), com só **avatar + nome**
 * dentro (`.username__4b8d8{flex:1 1 100px;padding-inline-start:var(
 * --space-8)}` → `flex-1 pl-2`) — o CSS não define nenhuma classe de
 * "motivo" na linha. O motivo do banimento sai da lista e mora só no diálogo
 * de revogar (`bannedUserModal__4b8d8`, que também não tem coluna própria de
 * motivo — o texto entra em `.content`), que é o que `revogar()` já fazia.
 *
 * A moldura ao redor da lista é `.scrollerContainer__4b8d8{background-color:
 * var(--card-background-default);border:1px solid var(--border-subtle);
 * border-radius:var(--radius-md)}` (12px → `rounded-xl`), `padding:var(
 * --space-8)` (8px → `p-2`). A altura fixa dele (`760px`) é do modal do
 * Discord (é ele quem define o tamanho da janela); aqui é a moldura da
 * `ServerSettingsModal` que decide a altura disponível, então a lista
 * continua `flex-1` — ver "faltando".
 *
 * A linha inteira é o alvo de clique e abre a confirmação de revogar — no
 * Discord não há botão de desbanir visível na lista, e é assim que revogar
 * deixa de ser algo que se faz por engano ao passar o mouse.
 *
 * Estados: **vazio** ("Ninguém banido"/"Ninguém com esse nome"); **carregando**
 * (`bans === null`, mensagem "Carregando…" no lugar da lista); **erro** (toda
 * falha de API usa `ui.toast` + `errorMessage`, padrão do resto do app);
 * **sem permissão** (não existe *dentro* desta peça: `ServerSettingsModal.tsx`,
 * fora desta lista de arquivos, só mostra a aba "Banimentos" para quem tem
 * `BAN_MEMBERS` — o mesmo padrão de `CargosTab.tsx`); **hover/foco**:
 * `hover:bg-interactive-background-hover`/`focus-visible:` — o mesmo token
 * que o Discord usa no `:hover` desta linha (`.bannedUser__4b8d8:hover{
 * background-color:var(--interactive-background-hover)}`), medido, não
 * convenção.
 */
export default function BanimentosTab({ guildId }: { guildId: string }) {
  const [bans, setBans] = useState<Banimento[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    api
      .listBans(guildId)
      .then((list) => vivo && setBans(list))
      .catch((e) => {
        if (!vivo) return;
        ui.toast(errorMessage(e, "Não foi possível listar os banimentos"), "error");
        setBans([]);
      });
    return () => {
      vivo = false;
    };
  }, [guildId]);

  async function revogar(b: Banimento) {
    const ok = await ui.confirm({
      title: "Revogar banimento",
      message: `${displayNameOf(b.user)} volta a poder entrar no servidor com um convite.${
        b.reason ? ` Motivo do banimento: ${b.reason}` : ""
      }`,
      confirmLabel: "Revogar banimento",
    });
    if (!ok) return;
    try {
      await api.unbanMember(guildId, b.user.id);
      setBans((list) => list?.filter((x) => x.user.id !== b.user.id) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível desbanir"), "error");
    }
  }

  const q = busca.trim().toLowerCase();
  const lista = (bans ?? []).filter(
    (b) =>
      !q ||
      b.user.username.toLowerCase().includes(q) ||
      displayNameOf(b.user).toLowerCase().includes(q),
  );

  return (
    <div>
      <TituloDaPagina titulo="Banimentos" />

      <div className="mb-4">
        <TextInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar banidos"
          aria-label="Buscar banidos"
          tamanho="sm"
          prefixo={<Search size={14} aria-hidden="true" className="text-text-muted" />}
        />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
        Banimentos — {(bans ?? []).length}
      </p>

      <div className="flex min-h-0 flex-col rounded-xl border border-border-subtle bg-card-background-default p-2">
        {bans === null && <p className="p-2 text-sm text-text-muted">Carregando…</p>}
        {bans !== null && lista.length === 0 && (
          <p className="p-2 text-sm text-text-muted">
            {bans.length === 0 ? "Ninguém banido por aqui." : "Ninguém com esse nome."}
          </p>
        )}
        {lista.map((b) => (
          <div
            key={b.user.id}
            role="button"
            tabIndex={0}
            onClick={() => void revogar(b)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void revogar(b);
              }
            }}
            aria-label={`Revogar o banimento de ${displayNameOf(b.user)}${b.reason ? `. Motivo: ${b.reason}` : ""}`}
            className="mb-1 flex min-w-0 cursor-pointer items-center rounded-lg bg-background-mod-subtle p-2 outline-none transition-colors last:mb-0 hover:bg-interactive-background-hover focus-visible:bg-interactive-background-hover"
          >
            {/* `surface` deveria ser `border-background-mod-subtle` (o fundo
                real da pílula agora), mas esse valor não está no mapa
                `FUNDO_DO_SELO` de `Avatar.tsx` (fora desta lista de
                arquivos) — cairia em disco sem preenchimento. Fica
                `border-background-base-lower`, o mais próximo já mapeado;
                ver "faltando". */}
            <Avatar user={b.user} size="sm" surface="border-background-base-lower" />
            <div className="min-w-0 flex-1 pl-2">
              <div className="truncate text-sm font-medium text-text-strong">{displayNameOf(b.user)}</div>
              <div className="truncate text-xs text-text-muted">{horaCompleta(b.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
