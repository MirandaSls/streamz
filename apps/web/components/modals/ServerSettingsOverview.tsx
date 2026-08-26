"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { MAX_GUILD_DESCRIPTION } from "@newdisc/shared";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/** Sigla do servidor, o mesmo fallback do rail quando não há ícone. */
function acronym(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Aba "Visão geral": ícone, nome e descrição do servidor.
 *
 * O ícone depende do storage (R2). Sem credencial a API responde 503 com texto
 * claro, que aparece como aviso — o resto da tela continua funcionando.
 */
export default function ServerSettingsOverview({ guildId }: { guildId: string }) {
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const handleGuildUpdated = useGuilds((s) => s.handleGuildUpdated);
  const [name, setName] = useState(guild?.name ?? "");
  const [description, setDescription] = useState(guild?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!guild) return null;
  const dirty = name.trim() !== guild.name || description.trim() !== (guild.description ?? "");

  async function save() {
    if (!dirty || saving || !name.trim()) return;
    setSaving(true);
    try {
      handleGuildUpdated(
        await api.updateGuild(guildId, {
          name: name.trim(),
          description: description.trim() || null,
        }),
      );
      ui.toast("Servidor salvo.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadIcon(file: File) {
    setUploading(true);
    try {
      handleGuildUpdated(await api.updateGuildIcon(guildId, file));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível trocar o ícone"), "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex items-start gap-6">
        <div className="relative">
          <div className="grid h-[100px] w-[100px] place-items-center overflow-hidden rounded-full bg-panel text-xl font-semibold text-txt-normal">
            {guild.iconUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              acronym(guild.name)
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadIcon(f);
              e.target.value = "";
            }}
          />
          <Tooltip label="Trocar ícone">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              aria-label="Trocar ícone do servidor"
              className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-rail text-txt-primary shadow-high transition hover:bg-hov disabled:opacity-50"
            >
              <Camera size={18} />
            </button>
          </Tooltip>
        </div>

        <div className="min-w-0 flex-1">
          <label
            htmlFor="guildName"
            className="mb-2 block text-xs font-bold uppercase text-txt-secondary"
          >
            Nome do servidor
          </label>
          <input
            id="guildName"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
          />
          {uploading && <p className="mt-2 text-xs text-txt-muted">Enviando ícone…</p>}
        </div>
      </div>

      <div aria-hidden="true" className="my-6 h-px bg-[#3f4147]" />

      <label
        htmlFor="guildDescription"
        className="mb-2 block text-xs font-bold uppercase text-txt-secondary"
      >
        Descrição
      </label>
      <textarea
        id="guildDescription"
        value={description}
        maxLength={MAX_GUILD_DESCRIPTION}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Do que é este servidor?"
        className="w-full resize-none rounded-[3px] bg-rail p-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
      />
      <p className="mt-1 text-xs text-txt-muted">
        {description.length}/{MAX_GUILD_DESCRIPTION} caracteres.
      </p>

      <button
        type="button"
        disabled={!dirty || saving || !name.trim()}
        onClick={() => void save()}
        className="mt-6 h-[38px] rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}
