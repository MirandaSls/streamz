"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  User,
  Users,
} from "@/components/ui/icones";
import {
  MAX_ROLE_NAME,
  PERMISSION_INFO,
  PERMISSION_ORDER,
  Permission,
  ROLE_COLORS,
  displayNameOf,
  hasPermission,
  isRoleColor,
  type PermissionName,
  type Role,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { Section, Toggle } from "@/components/ui/controls";
import { ESTILO_CAMPO, ESTILO_ROTULO } from "@/components/settings/campos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import SeletorDeCor from "@/components/settings/SeletorDeCor";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { usePermissions } from "@/stores/permissions";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, type MenuItem } from "@/stores/ui";

const GRUPOS: { id: "geral" | "membros" | "mensagens" | "voz"; label: string }[] = [
  { id: "geral", label: "Permissões gerais do servidor" },
  { id: "membros", label: "Permissões de membro" },
  { id: "mensagens", label: "Permissões de texto" },
  { id: "voz", label: "Permissões de voz" },
];

/**
 * Aba "Cargos" — duas telas, não duas colunas.
 *
 * A **lista** ocupa a largura toda (nome, quantos membros, "…"); clicar num
 * cargo abre o **editor** como sub-página, com abas horizontais. O @everyone
 * não está na lista: é o cartão "Permissões padrão" acima da busca, como no
 * Discord — ele não tem nome, cor nem posição, e misturá-lo aos outros fazia
 * parecer que dava para arrastá-lo. Lado a lado,
 * a lista de 200px espremia o editor num terço da janela e as permissões
 * ficavam com uma coluna de texto ilegível — que é exatamente o motivo de o
 * Discord ter separado as duas telas.
 *
 * A ordem da lista é a hierarquia, e ela é reordenada arrastando pela alça: os
 * chevrons antigos só apareciam no hover, então a única affordance de "isto se
 * reordena" era invisível até o mouse passar por cima.
 */
export default function CargosTab({ guildId }: { guildId: string }) {
  const roles = usePermissions((s) => s.roles);
  const members = useGuilds((s) => s.members);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);

  // do mais alto para o mais baixo, com o @everyone sempre no fim
  const ordenados = [...roles].sort((a, b) => b.position - a.position);
  const emEdicao = ordenados.find((r) => r.id === selecionado) ?? null;
  const padrao = ordenados.find((r) => r.isDefault) ?? null;
  const editaveis = ordenados.filter((r) => !r.isDefault);

  const q = busca.trim().toLowerCase();
  const lista = editaveis.filter((r) => !q || r.name.toLowerCase().includes(q));

  function quantosTem(r: Role): number {
    return r.isDefault ? members.length : members.filter((m) => m.roleIds.includes(r.id)).length;
  }

  async function criar() {
    setBusy(true);
    try {
      const novo = await api.createRole(guildId, {
        name: "Novo cargo",
        color: ROLE_COLORS[0],
        permissions: 0,
      });
      usePermissions.getState().handleRoleSaved(novo);
      setSelecionado(novo.id);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o cargo"), "error");
    } finally {
      setBusy(false);
    }
  }

  /** Solta o cargo arrastado imediatamente antes de `destino` na exibição. */
  async function soltarEm(destino: Role) {
    const origemId = arrastando;
    setArrastando(null);
    if (!origemId || origemId === destino.id || destino.isDefault) return;

    // trabalha na ordem de exibição (do mais alto para o mais baixo)
    const editaveis = ordenados.filter((r) => !r.isDefault);
    const de = editaveis.findIndex((r) => r.id === origemId);
    const para = editaveis.findIndex((r) => r.id === destino.id);
    if (de < 0 || para < 0) return;
    const nova = [...editaveis];
    const [movido] = nova.splice(de, 1);
    nova.splice(para, 0, movido);

    try {
      // a API recebe a hierarquia do mais baixo para o mais alto
      const atualizados = await api.reorderRoles(
        guildId,
        [...nova].reverse().map((r) => r.id),
      );
      for (const x of atualizados) usePermissions.getState().handleRoleSaved(x);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível reordenar"), "error");
    }
  }

  async function apagar(role: Role) {
    const ok = await ui.confirm({
      title: `Apagar o cargo ${role.name}?`,
      message: "Quem tem este cargo perde as permissões dele. Não dá para desfazer.",
      confirmLabel: "Apagar cargo",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteRole(guildId, role.id);
      usePermissions.getState().handleRoleDeleted(guildId, role.id);
      setSelecionado((atual) => (atual === role.id ? null : atual));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível apagar o cargo"), "error");
    }
  }

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>, role: Role) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = [
      { label: "Editar cargo", onSelect: () => setSelecionado(role.id) },
      ...(role.isDefault
        ? []
        : [
            { separator: true } as MenuItem,
            {
              label: "Excluir cargo",
              danger: true,
              onSelect: () => void apagar(role),
            } as MenuItem,
          ]),
    ];
    ui.openContextMenu(rect.right - MENU_WIDTH, rect.bottom + 4, items, MENU_WIDTH);
  }

  if (emEdicao) {
    return (
      <RoleEditor
        key={emEdicao.id}
        guildId={guildId}
        role={emEdicao}
        aoVoltar={() => setSelecionado(null)}
      />
    );
  }

  return (
    <div>
      <TituloDaPagina
        titulo="Cargos"
        subtitulo="Use cargos para agrupar os membros do servidor e dar permissões."
      />

      {/* O cartão "Permissões padrão" do Discord, medido no print: 74 de
          altura, borda de 1px, raio 4, ícone em círculo de 32, 16 de respiro
          entre as partes e 32 até a busca. */}
      {padrao && (
        <button
          type="button"
          onClick={() => setSelecionado(padrao.id)}
          className="mb-8 flex h-[74px] w-full items-center gap-4 rounded border border-border bg-input pl-4 pr-6 text-left transition hover:bg-hov"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-chat text-txt-normal"
          >
            <Users size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-txt-primary">
              Permissões padrão
            </span>
            <span className="mt-1 block truncate text-xs text-txt-muted">
              @everyone • vale para todos os membros do servidor
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-txt-muted" />
        </button>
      )}

      <div className="flex items-center gap-4">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cargos"
            aria-label="Buscar cargos"
            className={`${ESTILO_CAMPO} pl-8`}
          />
        </div>
        {/* 32 de altura, raio 8, sem ícone: o "Criar cargo" do print. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void criar()}
          className="h-8 celular:h-[44px] shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
        >
          Criar cargo
        </button>
      </div>
      <p className="mt-2 text-sm text-txt-normal">
        Os membros usam a cor do cargo mais alto que eles possuem nesta lista. Arraste os
        cargos para reordenar.
      </p>

      <div className="mt-8 flex items-center gap-2 border-b border-border pb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        <span className="w-6 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">Cargos — {editaveis.length}</span>
        <span className="w-[92px] shrink-0 text-right">Membros</span>
        <span className="w-20 shrink-0" aria-hidden="true" />
      </div>

      <div role="list">
        {lista.length === 0 && (
          <p className="py-3 text-sm text-txt-muted">
            {editaveis.length === 0 ? "Ainda não há cargos além do @everyone." : "Nenhum cargo com esse nome."}
          </p>
        )}
        {lista.map((r) => (
          <div
            key={r.id}
            role="listitem"
            draggable
            onDragStart={() => setArrastando(r.id)}
            onDragOver={(e) => {
              if (arrastando) e.preventDefault();
            }}
            onDrop={() => void soltarEm(r)}
            onDragEnd={() => setArrastando(null)}
            className={`group flex h-[61px] items-center gap-2 border-b border-border transition ${
              arrastando === r.id ? "opacity-40" : "hover:bg-hov"
            }`}
          >
            <span className="w-6 shrink-0 text-txt-faint">
              <Tooltip label="Arraste para reordenar">
                <GripVertical
                  size={16}
                  aria-hidden="true"
                  className="cursor-grab active:cursor-grabbing"
                />
              </Tooltip>
            </span>
            <button
              type="button"
              onClick={() => setSelecionado(r.id)}
              // a linha do cargo mede 61: no celular o botão do nome ocupa a
              // altura toda dela em vez dos 19 do texto
              className="flex min-w-0 flex-1 items-center gap-2 text-left celular:h-full"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: r.color ?? "#8a8a8e" }}
                className="h-3 w-3 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-txt-primary">{r.name}</span>
            </button>
            <span className="flex w-[92px] shrink-0 items-center justify-end gap-1.5 text-sm text-txt-normal">
              {quantosTem(r)}
              <User size={16} aria-hidden="true" className="text-txt-muted" />
            </span>
            {/* O lápis do print, sempre visível: no Discord ele é a ação
                principal da linha e não espera o hover — o "…" ao lado é que
                guarda o resto. */}
            <button
              type="button"
              onClick={() => setSelecionado(r.id)}
              aria-label={`Editar o cargo ${r.name}`}
              className="grid h-10 celular:h-[44px] w-10 celular:w-[44px] shrink-0 place-items-center rounded-lg text-txt-muted transition hover:bg-border-strong hover:text-txt-primary"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => abrirMenu(e, r)}
              aria-label={`Ações do cargo ${r.name}`}
              // sempre visível, como no print: o lápis e o "…" são o par de
              // ações da linha, e um que some no hover parecia bug ao lado do
              // outro que não some
              className="grid h-10 celular:h-[44px] w-10 celular:w-[44px] shrink-0 place-items-center rounded-lg text-txt-muted transition hover:bg-border-strong hover:text-txt-primary"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type AbaDoEditor = "exibir" | "permissoes" | "membros";

/** Editor de um cargo: identidade, permissões e quem o tem. */
function RoleEditor({
  guildId,
  role,
  aoVoltar,
}: {
  guildId: string;
  role: Role;
  aoVoltar: () => void;
}) {
  const members = useGuilds((s) => s.members);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? "");
  const [hoist, setHoist] = useState(role.hoist);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [permissions, setPermissions] = useState(role.permissions);
  // o @everyone não tem identidade: só permissões
  const [aba, setAba] = useState<AbaDoEditor>(role.isDefault ? "permissoes" : "exibir");

  const dirty =
    name !== role.name ||
    (color || null) !== role.color ||
    hoist !== role.hoist ||
    mentionable !== role.mentionable ||
    permissions !== role.permissions;
  const doCargo = members.filter((m) => m.roleIds.includes(role.id));

  useAlteracoesNaoSalvas({
    dirty,
    salvar: async () => {
      if (color && !isRoleColor(color)) {
        ui.toast("Cor inválida — use #rrggbb.", "error");
        return;
      }
      try {
        const atualizado = await api.updateRole(guildId, role.id, {
          ...(role.isDefault ? {} : { name: name.trim(), color: color || null, hoist, mentionable }),
          permissions,
        });
        usePermissions.getState().handleRoleSaved(atualizado);
        ui.toast("Cargo salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar o cargo"), "error");
      }
    },
    redefinir: () => {
      setName(role.name);
      setColor(role.color ?? "");
      setHoist(role.hoist);
      setMentionable(role.mentionable);
      setPermissions(role.permissions);
    },
  });

  function alternar(nome: PermissionName, ligado: boolean) {
    const bit = Permission[nome];
    setPermissions((p) => (ligado ? p | bit : p & ~bit));
  }

  const abas: { id: AbaDoEditor; label: string }[] = role.isDefault
    ? [{ id: "permissoes", label: "Permissões" }]
    : [
        { id: "exibir", label: "Exibir" },
        { id: "permissoes", label: "Permissões" },
        { id: "membros", label: "Gerenciar membros" },
      ];

  return (
    <div>
      <button
        type="button"
        onClick={aoVoltar}
        className="mb-3 flex items-center gap-1.5 text-sm text-txt-muted transition hover:text-txt-primary celular:min-h-[44px]"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar aos cargos
      </button>

      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-txt-primary">
        <span
          aria-hidden="true"
          style={{ backgroundColor: color || "#8a8a8e" }}
          className="h-3 w-3 shrink-0 rounded-full"
        />
        <span className="min-w-0 truncate">{name}</span>
      </h2>

      <div role="tablist" aria-label="Seções do cargo" className="mb-5 flex gap-1 border-b border-border">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition celular:min-h-[44px] ${
              aba === a.id
                ? "border-accent text-txt-primary"
                : "border-transparent text-txt-muted hover:text-txt-normal"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {role.isDefault && (
        <p className="mb-4 rounded bg-void/50 px-3 py-2 text-sm text-txt-muted">
          O @everyone vale para todo membro do servidor. Ele não tem nome, cor nem posição —
          só o conjunto de permissões que todo mundo recebe por padrão.
        </p>
      )}

      {aba === "exibir" && (
        <>
          <label htmlFor="roleName" className={ESTILO_ROTULO}>
            Nome do cargo
          </label>
          <input
            id="roleName"
            value={name}
            maxLength={MAX_ROLE_NAME}
            onChange={(e) => setName(e.target.value)}
            className={ESTILO_CAMPO}
          />

          <div className={`${ESTILO_ROTULO} mt-5`}>Cor do cargo</div>
          <SeletorDeCor
            abas
            permitirSemCor
            rotulo="Cor do cargo"
            value={color}
            onChange={setColor}
            cores={ROLE_COLORS}
          />

          <div className="mt-5">
            <Toggle
              checked={hoist}
              onChange={setHoist}
              label="Exibir membros separadamente"
              hint="Quem tem este cargo ganha uma seção própria na lista de membros."
            />
            <Toggle
              checked={mentionable}
              onChange={setMentionable}
              label="Permitir mencionar este cargo"
              hint="Qualquer pessoa pode notificar todo mundo que tem este cargo."
            />
          </div>
        </>
      )}

      {aba === "permissoes" &&
        GRUPOS.map((g) => {
          const nomes = PERMISSION_ORDER.filter((n) => PERMISSION_INFO[n].group === g.id);
          if (nomes.length === 0) return null;
          return (
            <Section key={g.id} title={g.label}>
              {nomes.map((n) => (
                <Toggle
                  key={n}
                  checked={hasPermission(permissions, Permission[n])}
                  onChange={(v) => alternar(n, v)}
                  label={PERMISSION_INFO[n].label}
                  hint={PERMISSION_INFO[n].description}
                />
              ))}
            </Section>
          );
        })}

      {aba === "membros" && (
        <>
          <h3 className={ESTILO_ROTULO}>Membros com este cargo — {doCargo.length}</h3>
          <div className="rounded bg-void/50">
            {doCargo.length === 0 ? (
              <p className="px-3 py-2 text-sm text-txt-muted">Ninguém tem este cargo ainda.</p>
            ) : (
              doCargo.map((m) => (
                <div
                  key={m.user.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-hov"
                >
                  <span className="min-w-0 flex-1 truncate text-txt-normal">
                    {displayNameOf(m.user)}
                  </span>
                  <Tooltip label="Remover cargo">
                    <button
                      type="button"
                      onClick={() => void toggleRole(m.user.id, role.id, false)}
                      aria-label={`Remover ${role.name} de ${displayNameOf(m.user)}`}
                      className="grid h-7 celular:h-[44px] w-7 celular:w-[44px] place-items-center rounded text-txt-muted hover:text-red"
                    >
                      <Trash2 size={16} />
                    </button>
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
