"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_GUILD_DESCRIPTION, type GuildOnboarding } from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { Select } from "@/components/ui/controls";
import { ESTILO_AREA, ESTILO_CAMPO, ESTILO_ROTULO } from "@/components/settings/campos";
import { api } from "@/lib/api";
import { useChannels } from "@/stores/channels";
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
 * Aba "Visão geral": ícone, nome, canal de mensagens do sistema e descrição.
 *
 * O ícone depende do storage (R2). Sem credencial a API responde 503 com texto
 * claro, que aparece como aviso — o resto da tela continua funcionando.
 *
 * Salvar é da barra de alterações não salvas do shell. O ícone é a exceção:
 * upload não tem "desfazer" local, então ele vale no instante em que o arquivo
 * é escolhido, como no Discord.
 */
export default function ServerSettingsOverview({ guildId }: { guildId: string }) {
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const handleGuildUpdated = useGuilds((s) => s.handleGuildUpdated);
  const channels = useChannels((s) => s.channels);
  const [name, setName] = useState(guild?.name ?? "");
  const [description, setDescription] = useState(guild?.description ?? "");
  const [onboarding, setOnboarding] = useState<GuildOnboarding | null>(null);
  const [systemChannelId, setSystemChannelId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const textos = channels.filter((c) => c.type === "TEXT");

  // o canal do sistema vive no mesmo recurso que a tela de entrada; a aba
  // "Visão geral" é onde o Discord o mostra, então ele é lido aqui também
  useEffect(() => {
    let vivo = true;
    void api
      .onboarding(guildId)
      .then((o) => {
        if (!vivo) return;
        setOnboarding(o);
        setSystemChannelId(o.systemChannelId ?? "");
      })
      .catch(() => {
        // sem onboarding carregado o seletor some; nome e ícone seguem valendo
      });
    return () => {
      vivo = false;
    };
  }, [guildId]);

  const dirty =
    !!guild &&
    (name.trim() !== guild.name ||
      description.trim() !== (guild.description ?? "") ||
      (!!onboarding && systemChannelId !== (onboarding.systemChannelId ?? "")));

  useAlteracoesNaoSalvas({
    dirty,
    salvar: async () => {
      if (!name.trim()) {
        ui.toast("O servidor precisa de um nome.", "error");
        return;
      }
      try {
        handleGuildUpdated(
          await api.updateGuild(guildId, {
            name: name.trim(),
            description: description.trim() || null,
          }),
        );
        if (onboarding && systemChannelId !== (onboarding.systemChannelId ?? "")) {
          setOnboarding(
            await api.updateOnboarding(guildId, {
              ...onboarding,
              systemChannelId: systemChannelId || null,
            }),
          );
        }
        ui.toast("Servidor salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
      }
    },
    redefinir: () => {
      setName(guild?.name ?? "");
      setDescription(guild?.description ?? "");
      setSystemChannelId(onboarding?.systemChannelId ?? "");
    },
  });

  if (!guild) return null;

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
        {/* a área tracejada é o alvo de clique inteiro: um botão de câmera de
            36px era a única affordance e ninguém achava */}
        <div className="shrink-0 text-center">
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
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            aria-label="Enviar ícone do servidor"
            className="group relative grid h-[100px] w-[100px] place-items-center overflow-hidden rounded-full border-2 border-dashed border-border-strong bg-panel text-xl font-semibold text-txt-normal transition hover:border-accent disabled:opacity-50"
          >
            {guild.iconUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              acronym(guild.name)
            )}
            <span className="absolute inset-0 grid place-items-center bg-overlay/70 text-xs font-bold uppercase tracking-[0.04em] text-white opacity-0 transition group-hover:opacity-100">
              Enviar
            </span>
          </button>
          {/* o "Remover" do Discord não existe aqui: a API não tem rota para
              apagar o ícone, e um link que só devolve erro é pior que nenhum */}
          <p className="mt-2 w-[100px] text-[11px] leading-tight text-txt-muted">
            Recomendamos 512×512
          </p>
          {uploading && <p className="mt-1 text-xs text-txt-muted">Enviando…</p>}
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="guildName" className={ESTILO_ROTULO}>
            Nome do servidor
          </label>
          <input
            id="guildName"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            className={ESTILO_CAMPO}
          />

          {onboarding && (
            <div className="mt-5">
              <Select
                semDivisoria
                label="Canal de mensagens do sistema"
                value={systemChannelId}
                options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
                onChange={setSystemChannelId}
                emptyLabel="Nenhum"
                hint="É onde entra o “fulano entrou no servidor” a cada pessoa nova."
              />
            </div>
          )}
        </div>
      </div>

      <div aria-hidden="true" className="my-6 h-px bg-border" />

      <label htmlFor="guildDescription" className={ESTILO_ROTULO}>
        Descrição
      </label>
      <textarea
        id="guildDescription"
        value={description}
        maxLength={MAX_GUILD_DESCRIPTION}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Do que é este servidor?"
        className={ESTILO_AREA}
      />
      <p className="mt-1 text-xs text-txt-muted">
        {description.length}/{MAX_GUILD_DESCRIPTION} caracteres.
      </p>
    </div>
  );
}
