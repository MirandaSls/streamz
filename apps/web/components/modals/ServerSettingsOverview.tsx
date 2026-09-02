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
 * Aba "Visão geral": nome, ícone, canal de mensagens do sistema e descrição,
 * com o cartão de prévia do servidor à direita — a ordem e as medidas do
 * "Perfil do servidor" do Discord.
 *
 * O ícone depende do storage (R2). Sem credencial a API responde 503 com texto
 * claro, que aparece como aviso — o resto da tela continua funcionando.
 *
 * Salvar é da barra de alterações não salvas do shell. O ícone é a exceção:
 * upload não tem "desfazer" local, então ele vale no instante em que o arquivo
 * é escolhido, como no Discord. Remover também vale na hora, mas passa por uma
 * confirmação: não há como voltar atrás depois que o arquivo sai do storage.
 */
export default function ServerSettingsOverview({ guildId }: { guildId: string }) {
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const handleGuildUpdated = useGuilds((s) => s.handleGuildUpdated);
  const channels = useChannels((s) => s.channels);
  const members = useGuilds((s) => s.members);
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

  async function removeIcon() {
    const ok = await ui.confirm({
      title: "Remover o ícone do servidor?",
      message: "O servidor volta a aparecer pela sigla do nome. Não dá para desfazer.",
      confirmLabel: "Remover o ícone",
      danger: true,
    });
    if (!ok) return;
    setUploading(true);
    try {
      handleGuildUpdated(await api.removeGuildIcon(guildId));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover o ícone"), "error");
    } finally {
      setUploading(false);
    }
  }

  const nomeNaPrevia = name.trim() || guild.name;

  return (
    <div className="flex items-start gap-6">
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

        {/* Medidas do Discord (visão geral do servidor): divisória 40 abaixo do
            campo, título 41 abaixo dela, dica 6 abaixo do título, botões 9
            abaixo da dica, e outra divisória 40 depois. */}
        <div aria-hidden="true" className="mt-10 h-px bg-border" />

        <h2 className="mt-10 text-base font-semibold text-txt-primary">Ícone</h2>
        <p className="mt-1.5 text-sm text-txt-muted">
          Recomendamos uma imagem de, pelo menos, 512x512.
        </p>
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
        <div className="mt-2 flex items-center gap-3">
          {/* 32 de altura, raio 8, 12 de respiro lateral: o botão de ação das
              configurações do Discord. */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
          >
            {uploading ? "Enviando…" : "Altere o ícone do servidor"}
          </button>
          {/* Só aparece quando há o que remover, como no Discord. Compartilha o
              `uploading` com a troca: as duas mexem no mesmo arquivo. */}
          {guild.iconUrl && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void removeIcon()}
              className="h-8 shrink-0 rounded-lg bg-border-strong px-3 text-sm font-medium text-red transition hover:bg-border-strong-hover disabled:opacity-50"
            >
              Remover o ícone
            </button>
          )}
        </div>

        <div aria-hidden="true" className="mt-10 h-px bg-border" />

        {onboarding && (
          <div className="mt-10">
            <Select
              semDivisoria
              label="Canal de mensagens do sistema"
              value={systemChannelId}
              options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
              onChange={setSystemChannelId}
              emptyLabel="Nenhum"
              hint="É onde entra o “fulano entrou no servidor” a cada pessoa nova."
            />
            <div aria-hidden="true" className="mt-10 h-px bg-border" />
          </div>
        )}

        <label htmlFor="guildDescription" className={`${ESTILO_ROTULO} mt-10`}>
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

      {/*
        O cartão de prévia do Discord: 296 de largura, borda de 1px, ícone de
        68 com raio 16 e um anel de 4 na cor do cartão, nome em negrito e a
        contagem de membros. Sem a faixa, a tag e o "desde": são produto, e o
        `Guild` não tem data de criação. O nome acompanha o campo enquanto se
        digita, como lá.
      */}
      <div className="w-[296px] shrink-0 rounded-lg border border-border bg-input p-4">
        <div className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-2xl bg-panel text-xl font-semibold text-txt-normal ring-4 ring-input">
          {guild.iconUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            acronym(nomeNaPrevia)
          )}
        </div>
        <p className="mt-3 truncate text-base font-bold text-txt-primary">{nomeNaPrevia}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-txt-muted">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-txt-muted" />
          {members.length} {members.length === 1 ? "membro" : "membros"}
        </p>
      </div>
    </div>
  );
}
