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
import { ESTILO_ROTULO } from "@/components/settings/campos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import SeletorDeCor from "@/components/settings/SeletorDeCor";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import Tooltip from "@/components/ui/Tooltip";
import { BotaoDeIcone, Button, Campo, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { usePermissions } from "@/stores/permissions";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, type MenuItem } from "@/stores/ui";
import { COR_DE_CARGO_SEM_COR } from "@/lib/cor-de-cargo";

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
          className="mb-8 flex h-[74px] w-full items-center gap-4 rounded border border-border-subtle bg-chat-background-default pl-4 pr-6 text-left transition hover:bg-interactive-background-hover"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background-base-lower text-text-default"
          >
            <Users size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-text-strong">
              Permissões padrão
            </span>
            <span className="mt-1 block truncate text-xs text-text-muted">
              @everyone • vale para todos os membros do servidor
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
        </button>
      )}

      <div className="flex items-center gap-4">
        <TextInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cargos"
          aria-label="Buscar cargos"
          tamanho="sm"
          prefixo={<Search size={14} aria-hidden="true" className="text-text-muted" />}
          classeDaCaixa="min-w-0 flex-1"
        />
        {/* 32 de altura, raio 8, sem ícone: o "Criar cargo" do print. */}
        <Button
          variante="primario"
          tamanho="sm"
          disabled={busy}
          onClick={() => void criar()}
          className="shrink-0 celular:h-[44px]"
        >
          Criar cargo
        </Button>
      </div>
      <p className="mt-2 text-sm text-text-default">
        Os membros usam a cor do cargo mais alto que eles possuem nesta lista. Arraste os
        cargos para reordenar.
      </p>

      <div className="mt-8 flex items-center gap-2 border-b border-border-subtle pb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
        <span className="w-6 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">Cargos — {editaveis.length}</span>
        <span className="w-[92px] shrink-0 text-right">Membros</span>
        <span className="w-20 shrink-0" aria-hidden="true" />
      </div>

      <div role="list">
        {lista.length === 0 && (
          <p className="py-3 text-sm text-text-muted">
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
            className={`group flex h-[61px] items-center gap-2 border-b border-border-subtle transition ${
              arrastando === r.id ? "opacity-40" : "hover:bg-interactive-background-hover"
            }`}
          >
            <span className="w-6 shrink-0 text-channels-default">
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
                style={{ backgroundColor: r.color ?? COR_DE_CARGO_SEM_COR }}
                className="h-3 w-3 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-text-strong">{r.name}</span>
            </button>
            <span className="flex w-[92px] shrink-0 items-center justify-end gap-1.5 text-sm text-text-default">
              {quantosTem(r)}
              <User size={16} aria-hidden="true" className="text-text-muted" />
            </span>
            {/* O lápis do print, sempre visível: no Discord ele é a ação
                principal da linha e não espera o hover — o "…" ao lado é que
                guarda o resto. */}
            <BotaoDeIcone
              rotulo={`Editar o cargo ${r.name}`}
              icone={<Pencil size={16} />}
              tamanho="lg"
              comFundo
              onClick={() => setSelecionado(r.id)}
              className="shrink-0 celular:h-[44px] celular:w-[44px]"
            />
            {/* sempre visível, como no print: o lápis e o "…" são o par de
                ações da linha, e um que some no hover parecia bug ao lado do
                outro que não some */}
            <BotaoDeIcone
              rotulo={`Ações do cargo ${r.name}`}
              icone={<MoreHorizontal size={16} />}
              tamanho="lg"
              comFundo
              onClick={(e) => abrirMenu(e, r)}
              className="shrink-0 celular:h-[44px] celular:w-[44px]"
            />
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
        className="mb-3 flex items-center gap-1.5 text-sm text-text-muted transition hover:text-text-strong celular:min-h-[44px]"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar aos cargos
      </button>

      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-text-strong">
        <span
          aria-hidden="true"
          style={{ backgroundColor: color || COR_DE_CARGO_SEM_COR }}
          className="h-3 w-3 shrink-0 rounded-full"
        />
        <span className="min-w-0 truncate">{name}</span>
      </h2>

      <div role="tablist" aria-label="Seções do cargo" className="mb-5 flex gap-1 border-b border-border-subtle">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition celular:min-h-[44px] ${
              aba === a.id
                ? "border-brand-500 text-text-strong"
                : "border-transparent text-text-muted hover:text-text-default"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {role.isDefault && (
        <p className="mb-4 rounded bg-input-background-default/50 px-3 py-2 text-sm text-text-muted">
          O @everyone vale para todo membro do servidor. Ele não tem nome, cor nem posição —
          só o conjunto de permissões que todo mundo recebe por padrão.
        </p>
      )}

      {aba === "exibir" && (
        <>
          <Campo rotulo="Nome do cargo" htmlFor="roleName">
            <TextInput
              id="roleName"
              value={name}
              maxLength={MAX_ROLE_NAME}
              onChange={(e) => setName(e.target.value)}
            />
          </Campo>

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
          <div className="rounded bg-input-background-default/50">
            {doCargo.length === 0 ? (
              <p className="px-3 py-2 text-sm text-text-muted">Ninguém tem este cargo ainda.</p>
            ) : (
              doCargo.map((m) => (
                <div
                  key={m.user.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-interactive-background-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-text-default">
                    {displayNameOf(m.user)}
                  </span>
                  <BotaoDeIcone
                    rotulo={`Remover ${role.name} de ${displayNameOf(m.user)}`}
                    icone={<Trash2 size={16} />}
                    tamanho="sm"
                    perigo
                    onClick={() => void toggleRole(m.user.id, role.id, false)}
                    className="celular:h-[44px] celular:w-[44px]"
                  />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
