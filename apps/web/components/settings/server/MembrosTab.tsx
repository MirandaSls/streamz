"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  MoreHorizontal,
  Search,
  ShieldAlert,
  X,
} from "@/components/ui/icones";
import {
  Permission,
  colorRoleOf,
  displayNameOf,
  rolesOf,
  type GuildMemberView,
} from "@streamz/shared";
import { Select } from "@/components/ui/controls";
import { ESTILO_CAMPO } from "@/components/settings/campos";
import {
  BOTAO_PERIGO,
  BOTAO_SECUNDARIO,
  TABELA_CABECALHO,
  TituloDaPagina,
} from "@/components/settings/server/pagina";
import {
  ORDENS,
  POR_PAGINA,
  filtrarMembros,
  haQuantoTempo,
  numerosDePagina,
  ordenarMembros,
  paginar,
  type OrdemDeMembros,
} from "@/components/settings/server/membros-tabela";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useGuilds, useIsOwner } from "@/stores/guilds";
import { useCan, usePermissions } from "@/stores/permissions";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * Aba "Membros": a tabela do print `docs/Reference/Captura de tela 2026-09-04
 * 100649.png` — caixa de seleção, nome com @usuário embaixo, "Membro desde",
 * cargos, sinais e o "…" da linha; busca, "Ordenar" e "Remover" no topo;
 * "Mostrando N membros de M" com a paginação embaixo.
 *
 * Medidas (janela 1522×957 do print, `getpixel`): cabeçalho de 57 com divisória
 * de 1px `#2E2E33`, linhas de 55, o mesmo 1px entre elas.
 *
 * Colunas do print que **não** existem aqui: "Ingressou no Discord" (o
 * `PublicUser` não carrega a data da conta) e "Forma de adesão" (não guardamos
 * por qual convite cada pessoa entrou). Inventar as duas seria mostrar dado
 * falso numa tela de moderação.
 *
 * A ordenação, o filtro e a paginação são funções puras em `membros-tabela.ts`,
 * com teste — é a parte que erra em silêncio num servidor grande.
 */
export default function MembrosTab({ guildId: _guildId }: { guildId: string }) {
  const me = useAuth((s) => s.user);
  const members = useGuilds((s) => s.members);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const transfer = useGuilds((s) => s.transfer);
  const roles = usePermissions((s) => s.roles);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  const podeExpulsar = useCan(Permission.KICK_MEMBERS);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  const isOwner = useIsOwner(me?.id);

  const [busca, setBusca] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [ordem, setOrdem] = useState<OrdemDeMembros>("recentes");
  const [porPagina, setPorPagina] = useState<number>(POR_PAGINA[0]);
  const [pagina, setPagina] = useState(1);
  const [marcados, setMarcados] = useState<string[]>([]);

  const lista = useMemo(
    () => ordenarMembros(filtrarMembros(members, { busca, cargoId }), ordem),
    [members, busca, cargoId, ordem],
  );
  const pag = paginar(lista, pagina, porPagina);

  /** Quem pode ser alvo de ação em massa: nem eu, nem o dono. */
  const alvoValido = (m: GuildMemberView) => m.user.id !== me?.id && m.role !== "OWNER";
  const selecionaveis = pag.itens.filter(alvoValido);
  const marcadosVisiveis = selecionaveis.filter((m) => marcados.includes(m.user.id));
  const todosMarcados = selecionaveis.length > 0 && marcadosVisiveis.length === selecionaveis.length;

  function alternar(id: string) {
    setMarcados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  function alternarTodos() {
    const ids = selecionaveis.map((m) => m.user.id);
    setMarcados((atual) =>
      todosMarcados ? atual.filter((x) => !ids.includes(x)) : [...new Set([...atual, ...ids])],
    );
  }

  async function removerMarcados() {
    const alvos = members.filter((m) => marcados.includes(m.user.id) && alvoValido(m));
    if (alvos.length === 0) return;
    const ok = await ui.confirm({
      title: alvos.length === 1 ? "Expulsar 1 membro?" : `Expulsar ${alvos.length} membros?`,
      message:
        "Quem for expulso pode voltar com um novo convite. Para impedir a volta, use banir.",
      confirmLabel: "Expulsar",
      danger: true,
    });
    if (!ok) return;
    for (const m of alvos) kick(m.user.id);
    setMarcados([]);
  }

  function abrirOrdenacao(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(
      rect.right - MENU_WIDTH,
      rect.bottom + 4,
      ORDENS.map((o) => ({
        label: o.label,
        checked: o.id === ordem,
        control: "radio" as const,
        onSelect: () => {
          setOrdem(o.id);
          setPagina(1);
        },
      })),
      MENU_WIDTH,
    );
  }

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>, m: GuildMemberView) {
    const podeMexer = alvoValido(m);
    const faltando = roles
      .filter((r) => !r.isDefault && !m.roleIds.includes(r.id))
      .sort((a, b) => b.position - a.position);

    const items: MenuItem[] = [];
    if (podeCargos) {
      items.push({
        label: "Adicionar cargo",
        submenu:
          faltando.length === 0
            ? [{ label: "Nenhum cargo disponível", onSelect: () => undefined, disabled: true }]
            : faltando.map((r) => ({
                label: r.name,
                dot: r.color ?? undefined,
                onSelect: () => void toggleRole(m.user.id, r.id, true),
              })),
      });
    }
    if (isOwner && podeMexer) {
      items.push({ label: "Transferir posse", onSelect: () => void transfer(m.user.id) });
    }
    if (items.length > 0 && (podeExpulsar || podeBanir) && podeMexer) {
      items.push({ separator: true });
    }
    if (podeExpulsar && podeMexer) {
      items.push({ label: "Expulsar", danger: true, onSelect: () => kick(m.user.id) });
    }
    if (podeBanir && podeMexer) {
      items.push({ label: "Banir", danger: true, onSelect: () => ban(m.user.id) });
    }
    if (items.length === 0) {
      items.push({ label: "Nada a fazer aqui", onSelect: () => undefined, disabled: true });
    }

    const rect = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(rect.right - MENU_WIDTH, rect.bottom + 4, items, MENU_WIDTH);
  }

  return (
    <>
      <TituloDaPagina titulo="Membros" />

      {/* Linha de comando da tabela: busca à esquerda, "Ordenar" e "Remover" à
          direita — a ordem do print, com o vermelho só no destrutivo.

          `flex-wrap` por causa do celular: busca + filtro de cargo + "Ordenar"
          + "Remover" somam ~560, e numa tela de 390 o "Remover" ficava cortado
          pela borda. Na coluna de 660 do desktop tudo cabe numa linha e o
          `wrap` não muda nada. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* a busca ocupa a linha inteira quando a fileira quebra */}
        {/* `flex-none w-full` e não só `basis-full`: com o `flex-1` ao lado, o
            `basis` perdia e a busca ficava com 110px mostrando "P…". */}
        <div className="relative min-w-0 flex-1 max-md:basis-full celular:w-full celular:flex-none">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
          />
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            placeholder="Pesquisar pelo nome de usuário"
            aria-label="Pesquisar membros"
            className={`${ESTILO_CAMPO} pl-8`}
          />
        </div>
        <div className="w-[180px] shrink-0 celular:w-full">
          <Select
            semDivisoria
            value={cargoId}
            options={roles
              .filter((r) => !r.isDefault)
              .sort((a, b) => b.position - a.position)
              .map((r) => ({ value: r.id, label: r.name }))}
            onChange={(v) => {
              setCargoId(v);
              setPagina(1);
            }}
            emptyLabel="Todos os cargos"
          />
        </div>
        <button
          type="button"
          onClick={abrirOrdenacao}
          aria-haspopup="menu"
          className={`flex h-10 celular:h-[44px] items-center gap-2 ${BOTAO_SECUNDARIO}`}
        >
          {/* seta dupla vertical: o vocabulário só tem a horizontal, girada */}
          <ArrowLeftRight size={16} aria-hidden="true" className="rotate-90" />
          Ordenar
        </button>
        {podeExpulsar && (
          <button
            type="button"
            disabled={marcados.length === 0}
            onClick={() => void removerMarcados()}
            className={`h-10 celular:h-[44px] ${BOTAO_PERIGO}`}
          >
            Remover
          </button>
        )}
      </div>

      {/* A tabela rola por dentro no celular: `table-fixed` sem piso de
          largura espremeria seis colunas em 358px. O piso é 720 e não 520
          porque a coluna de cargos leva 38%: abaixo disso o nome sobrava com
          46px. Na coluna de 660 do desktop a tabela já era mais larga que a
          área útil e rolava do mesmo jeito. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-[132px]" />
            <col className="w-[38%]" />
            <col className="w-[64px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className={`h-[57px] ${TABELA_CABECALHO}`}>
              <th scope="col">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  disabled={selecionaveis.length === 0}
                  onChange={alternarTodos}
                  aria-label="Selecionar todos os membros desta página"
                  className="accent-accent celular:h-[22px] celular:w-[22px]"
                />
              </th>
              <th scope="col" className="font-bold">
                Nome
              </th>
              <th scope="col" className="font-bold">
                Membro desde
              </th>
              <th scope="col" className="font-bold">
                Cargos
              </th>
              <th scope="col" className="font-bold">
                Sinais
              </th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pag.itens.length === 0 && (
              <tr className="h-[55px]">
                <td colSpan={6} className="text-sm text-txt-muted">
                  {members.length === 0 ? "Ninguém aqui ainda." : "Ninguém com esses filtros."}
                </td>
              </tr>
            )}
            {pag.itens.map((m) => {
              const cor = colorRoleOf(m.roleIds, roles)?.color ?? null;
              const chips = rolesOf(m.roleIds, roles);
              const castigado = !!m.timeoutUntil && new Date(m.timeoutUntil).getTime() > Date.now();
              return (
                <tr key={m.user.id} className="group h-[55px] border-b border-border align-middle">
                  <td>
                    <input
                      type="checkbox"
                      checked={marcados.includes(m.user.id)}
                      disabled={!alvoValido(m)}
                      onChange={() => alternar(m.user.id)}
                      aria-label={`Selecionar ${displayNameOf(m.user)}`}
                      className="accent-accent disabled:opacity-40 celular:h-[22px] celular:w-[22px]"
                    />
                  </td>
                  <td className="pr-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar user={m.user} size="sm" surface="border-chat" />
                      <div className="min-w-0">
                        <div
                          style={cor ? { color: cor } : undefined}
                          className="truncate text-sm font-medium text-txt-primary"
                        >
                          {displayNameOf(m.user)}
                        </div>
                        <div className="truncate text-xs text-txt-muted">@{m.user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="pr-2 text-sm text-txt-normal">{haQuantoTempo(m.joinedAt)}</td>
                  <td className="pr-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {chips.length === 0 && <span className="text-xs text-txt-muted">—</span>}
                      {chips.map((r) => (
                        <span
                          key={r.id}
                          className="flex items-center gap-1 rounded-[4px] bg-panel py-0.5 pl-1.5 pr-1 text-xs text-txt-normal"
                        >
                          <span
                            aria-hidden="true"
                            style={{ backgroundColor: r.color ?? "#8a8a8e" }}
                            className="h-2.5 w-2.5 rounded-full"
                          />
                          {r.name}
                          {podeCargos && (
                            <button
                              type="button"
                              onClick={() => void toggleRole(m.user.id, r.id, false)}
                              aria-label={`Remover ${r.name} de ${displayNameOf(m.user)}`}
                              // no print a pilha de cargos é só cor + nome; o "×"
                              // aparece com o mouse na linha (e com o foco, para
                              // quem navega pelo teclado)
                              className="text-txt-muted opacity-0 transition hover:text-txt-primary focus-visible:opacity-100 group-hover:opacity-100 celular:opacity-100"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {m.role === "OWNER" && (
                        <Tooltip label="Dono do servidor">
                          <Crown size={14} className="text-yellow" aria-label="Dono" />
                        </Tooltip>
                      )}
                      {castigado && (
                        <Tooltip label="De castigo">
                          <ShieldAlert size={14} className="text-red" aria-label="De castigo" />
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={(e) => abrirMenu(e, m)}
                      aria-label={`Ações para ${displayNameOf(m.user)}`}
                      // sempre visível: é a coluna de ações da tabela do print,
                      // não uma ação escondida de hover
                      className="grid h-8 celular:h-[44px] w-8 celular:w-[44px] place-items-center rounded text-txt-muted transition hover:bg-border-strong hover:text-txt-primary"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé do print: "Mostrando [12] membros de 61" à esquerda e a
          paginação à direita, com a página atual em pílula de acento. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-txt-muted">
          Mostrando
          <select
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value));
              setPagina(1);
            }}
            aria-label="Membros por página"
            className="h-9 rounded-lg border border-border bg-input px-2 text-sm text-txt-normal outline-none focus:border-accent celular:h-[44px] celular:text-[max(16px,1em)]"
          >
            {POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          membros de {lista.length}
        </p>

        {pag.paginas > 1 && (
          <nav aria-label="Páginas de membros" className="flex items-center gap-1">
            <button
              type="button"
              disabled={pag.pagina === 1}
              onClick={() => setPagina(pag.pagina - 1)}
              className="flex h-8 celular:h-[44px] items-center gap-1 rounded-lg px-2 text-sm text-txt-muted transition hover:text-txt-primary disabled:opacity-40"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Voltar
            </button>
            {numerosDePagina(pag.pagina, pag.paginas).map((n, i) =>
              n === null ? (
                <span key={`e${i}`} aria-hidden="true" className="px-1 text-txt-muted">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  aria-current={n === pag.pagina ? "page" : undefined}
                  onClick={() => setPagina(n)}
                  className={`grid h-8 celular:h-[44px] w-8 celular:w-[44px] place-items-center rounded-full text-sm transition ${
                    n === pag.pagina
                      ? "bg-accent font-medium text-accent-ink"
                      : "text-txt-normal hover:bg-hov"
                  }`}
                >
                  {n}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={pag.pagina === pag.paginas}
              onClick={() => setPagina(pag.pagina + 1)}
              className="flex h-8 celular:h-[44px] items-center gap-1 rounded-lg px-2 text-sm text-txt-muted transition hover:text-txt-primary disabled:opacity-40"
            >
              Próximo
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </>
  );
}
