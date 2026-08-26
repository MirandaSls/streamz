"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
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
} from "@newdisc/shared";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { usePermissions } from "@/stores/permissions";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

const GRUPOS: { id: "geral" | "membros" | "mensagens" | "voz"; label: string }[] = [
  { id: "geral", label: "Permissões gerais do servidor" },
  { id: "membros", label: "Permissões de membro" },
  { id: "mensagens", label: "Permissões de texto" },
  { id: "voz", label: "Permissões de voz" },
];

/** Interruptor do Discord: pílula que desliza, com o rótulo à esquerda. */
function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[#3f4147] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-base text-txt-normal">{label}</div>
        <p className="mt-0.5 text-xs text-txt-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-green" : "bg-[#80848e]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Aba "Cargos": a lista à esquerda (cor, nome e quantos membros) e o editor à
 * direita — nome, cor, exibir separadamente, mencionável, permissões e os
 * membros que têm o cargo.
 *
 * A ordem da lista é a hierarquia: o botão de subir/descer reordena, e é o que
 * decide quem pode mexer em quem. O `@everyone` fica no fim e só aceita edição
 * de permissões — nome, cor e posição dele não existem como conceito.
 */
export default function ServerSettingsRoles({ guildId }: { guildId: string }) {
  const roles = usePermissions((s) => s.roles);
  const members = useGuilds((s) => s.members);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // do mais alto para o mais baixo, com o @everyone sempre no fim
  const ordenados = [...roles].sort((a, b) => b.position - a.position);
  const role = ordenados.find((r) => r.id === selecionado) ?? ordenados[0] ?? null;

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

  async function mover(r: Role, delta: number) {
    // a API recebe a hierarquia do mais baixo para o mais alto
    const editaveis = [...roles].filter((x) => !x.isDefault).sort((a, b) => a.position - b.position);
    const i = editaveis.findIndex((x) => x.id === r.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= editaveis.length) return;
    const nova = [...editaveis];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    try {
      const atualizados = await api.reorderRoles(guildId, nova.map((x) => x.id));
      for (const x of atualizados) usePermissions.getState().handleRoleSaved(x);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível reordenar"), "error");
    }
  }

  return (
    <div className="flex gap-6">
      <div className="w-[200px] shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => void criar()}
          className="mb-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[3px] bg-accent text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" />
          Criar cargo
        </button>
        <div role="list" className="rounded bg-rail/50">
          {ordenados.map((r) => {
            const quantos = r.isDefault
              ? members.length
              : members.filter((m) => m.roleIds.includes(r.id)).length;
            return (
              <div key={r.id} role="listitem" className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setSelecionado(r.id)}
                  aria-current={r.id === role?.id ? "true" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm transition ${
                    r.id === role?.id ? "bg-sel text-txt-primary" : "text-txt-normal hover:bg-hov"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: r.color ?? "#949ba4" }}
                    className="h-3 w-3 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-txt-muted">{quantos}</span>
                </button>
                {!r.isDefault && (
                  <span className="hidden shrink-0 flex-col group-hover:flex">
                    <button
                      type="button"
                      onClick={() => void mover(r, 1)}
                      aria-label={`Subir ${r.name}`}
                      className="px-1 text-txt-muted hover:text-txt-primary"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void mover(r, -1)}
                      aria-label={`Descer ${r.name}`}
                      className="px-1 text-txt-muted hover:text-txt-primary"
                    >
                      <ChevronDown size={12} />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {role ? (
          <RoleEditor key={role.id} guildId={guildId} role={role} onDeleted={() => setSelecionado(null)} />
        ) : (
          <p className="text-sm text-txt-muted">Nenhum cargo ainda.</p>
        )}
      </div>
    </div>
  );
}

/** Editor de um cargo: identidade, permissões e quem o tem. */
function RoleEditor({
  guildId,
  role,
  onDeleted,
}: {
  guildId: string;
  role: Role;
  onDeleted: () => void;
}) {
  const members = useGuilds((s) => s.members);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? "");
  const [hoist, setHoist] = useState(role.hoist);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [permissions, setPermissions] = useState(role.permissions);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== role.name ||
    (color || null) !== role.color ||
    hoist !== role.hoist ||
    mentionable !== role.mentionable ||
    permissions !== role.permissions;
  const doCargo = members.filter((m) => m.roleIds.includes(role.id));

  async function salvar() {
    if (!dirty || saving) return;
    if (color && !isRoleColor(color)) {
      ui.toast("Cor inválida — use #rrggbb.", "error");
      return;
    }
    setSaving(true);
    try {
      const atualizado = await api.updateRole(guildId, role.id, {
        ...(role.isDefault ? {} : { name: name.trim(), color: color || null, hoist, mentionable }),
        permissions,
      });
      usePermissions.getState().handleRoleSaved(atualizado);
      ui.toast("Cargo salvo.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar o cargo"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function apagar() {
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
      onDeleted();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível apagar o cargo"), "error");
    }
  }

  function alternar(nome: PermissionName, ligado: boolean) {
    const bit = Permission[nome];
    setPermissions((p) => (ligado ? p | bit : p & ~bit));
  }

  return (
    <div>
      {!role.isDefault && (
        <>
          <label
            htmlFor="roleName"
            className="mb-2 block text-xs font-bold uppercase text-txt-secondary"
          >
            Nome do cargo
          </label>
          <input
            id="roleName"
            value={name}
            maxLength={MAX_ROLE_NAME}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none"
          />

          <div className="mb-2 mt-5 text-xs font-bold uppercase text-txt-secondary">
            Cor do cargo
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColor("")}
              aria-label="Sem cor"
              aria-pressed={color === ""}
              className={`grid h-8 w-8 place-items-center rounded-[4px] bg-[#4e5058] text-xs text-white ${
                color === "" ? "ring-2 ring-white" : ""
              }`}
            >
              —
            </button>
            {ROLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                style={{ backgroundColor: c }}
                className={`h-8 w-8 rounded-[4px] ${color === c ? "ring-2 ring-white" : ""}`}
              />
            ))}
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#rrggbb"
              aria-label="Cor personalizada em hexadecimal"
              className="h-8 w-[104px] rounded-[3px] bg-rail px-2 font-mono text-sm text-txt-normal outline-none placeholder:text-txt-muted"
            />
          </div>

          <div className="mt-5">
            <Toggle
              checked={hoist}
              onChange={setHoist}
              label="Exibir membros separadamente"
              description="Quem tem este cargo ganha uma seção própria na lista de membros."
            />
            <Toggle
              checked={mentionable}
              onChange={setMentionable}
              label="Permitir mencionar este cargo"
              description="Qualquer pessoa pode notificar todo mundo que tem este cargo."
            />
          </div>
        </>
      )}

      {role.isDefault && (
        <p className="mb-4 rounded bg-rail/50 px-3 py-2 text-sm text-txt-muted">
          O @everyone vale para todo membro do servidor. Ele não tem nome, cor nem posição —
          só o conjunto de permissões que todo mundo recebe por padrão.
        </p>
      )}

      {GRUPOS.map((g) => {
        const nomes = PERMISSION_ORDER.filter((n) => PERMISSION_INFO[n].group === g.id);
        if (nomes.length === 0) return null;
        return (
          <section key={g.id} className="mt-6">
            <h3 className="mb-1 text-xs font-bold uppercase text-txt-secondary">{g.label}</h3>
            {nomes.map((n) => (
              <Toggle
                key={n}
                checked={hasPermission(permissions, Permission[n])}
                onChange={(v) => alternar(n, v)}
                label={PERMISSION_INFO[n].label}
                description={PERMISSION_INFO[n].description}
              />
            ))}
          </section>
        );
      })}

      {!role.isDefault && (
        <section className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase text-txt-secondary">
            Membros com este cargo — {doCargo.length}
          </h3>
          <div className="rounded bg-rail/50">
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
                      className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red"
                    >
                      <Trash2 size={16} />
                    </button>
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void salvar()}
          className="h-[38px] rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
        {!role.isDefault && (
          <button
            type="button"
            onClick={() => void apagar()}
            className="h-[38px] rounded-[3px] px-4 text-sm font-medium text-red transition hover:bg-red hover:text-white"
          >
            Apagar cargo
          </button>
        )}
      </div>
    </div>
  );
}
