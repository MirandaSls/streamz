"use client";

import { useRef, useState } from "react";
import {
  GUILD_BANNER_COLORS,
  MAX_GUILD_DESCRIPTION,
  guildBannerBackground,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { ESTILO_AREA, ESTILO_CAMPO } from "@/components/settings/campos";
import { BOTAO_ACENTO, BOTAO_PERIGO, TituloDaPagina } from "@/components/settings/server/pagina";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/** Rótulo de bloco desta página: 16px semibold, como "Ícone" e "Faixa". */
const ROTULO_DE_BLOCO = "mb-2 block text-base font-semibold text-text-strong";

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

/** "Desde jun. de 2025" — o rodapé do cartão de prévia. */
function desde(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Desde ${d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`;
}

/**
 * "Perfil do servidor": nome, ícone, faixa de cor e descrição, com o cartão de
 * prévia à direita.
 *
 * É a antiga "Visão geral" reorganizada na ordem do print
 * `docs/Reference/Captura de tela 2026-09-04 100541.png` (janela 1919×1079,
 * medido com `getpixel`):
 *
 * | item | medida |
 * |---|---|
 * | coluna do formulário | 560 (x 732→1291) |
 * | campo "Nome" | 560×47 |
 * | botões do ícone | 32 de altura; "Altere…" 198, "Remover…" 117, 8 entre eles |
 * | amostra da faixa | 105×64, 5 por linha, 8 de espaço, duas linhas |
 * | anel da amostra escolhida | 2px do acento, 3px afastado |
 * | cartão de prévia | 300×238, faixa de 118 no topo |
 *
 * A **faixa** é dado do servidor, não token de tema: o par de cores de cada
 * amostra está em `GUILD_BANNER_COLORS`, e o que fica gravado em
 * `Guild.bannerColor` é o topo do degradê.
 *
 * O que o print tem e nós não criamos, porque não existe no produto:
 * "Características" (cinco caixas de emoji), a tag do servidor e o distintivo
 * de comunidade ao lado do nome na prévia.
 *
 * Salvar é da barra de alterações não salvas do shell. O ícone é a exceção:
 * upload não tem "desfazer" local, então ele vale no instante em que o arquivo
 * é escolhido, como no Discord. Remover também vale na hora, mas passa por uma
 * confirmação: não há como voltar atrás depois que o arquivo sai do storage.
 */
export default function PerfilDoServidorTab({ guildId }: { guildId: string }) {
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const handleGuildUpdated = useGuilds((s) => s.handleGuildUpdated);
  const members = useGuilds((s) => s.members);
  const [name, setName] = useState(guild?.name ?? "");
  const [description, setDescription] = useState(guild?.description ?? "");
  const [bannerColor, setBannerColor] = useState(guild?.bannerColor ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    !!guild &&
    (name.trim() !== guild.name ||
      description.trim() !== (guild.description ?? "") ||
      bannerColor !== (guild.bannerColor ?? ""));

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
            // string vazia é como o contrato diz "sem faixa"
            bannerColor,
          }),
        );
        ui.toast("Servidor salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
      }
    },
    redefinir: () => {
      setName(guild?.name ?? "");
      setDescription(guild?.description ?? "");
      setBannerColor(guild?.bannerColor ?? "");
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
  const faixa = guildBannerBackground(bannerColor || null);

  return (
    <>
      <TituloDaPagina
        titulo="Perfil do servidor"
        subtitulo="Personalize como seu servidor aparece nos links de convite e no cartão que os membros veem."
      />

      <div className="flex items-start gap-10">
        <div className="min-w-0 max-w-[560px] flex-1">
          {/* "Nome" e "Descrição" são rótulos de 16 semibold no print (cap de
              11px em "Nome", 16 com descida em "Descrição"), a mesma pauta de
              "Ícone" e "Faixa" — e não o rótulo em caixa-alta de 12 que as
              configurações do usuário usam. */}
          <label htmlFor="guildName" className={ROTULO_DE_BLOCO}>
            Nome
          </label>
          <input
            id="guildName"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            className={ESTILO_CAMPO}
          />

          {/* Medidas do print: divisória 40 abaixo do campo, título 41 abaixo
              dela, dica 6 abaixo do título, botões 9 abaixo da dica. */}
          <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

          <h2 className="mt-10 text-base font-semibold text-text-strong">Ícone</h2>
          <p className="mt-1.5 text-sm text-text-muted">
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
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className={`h-8 celular:h-[44px] ${BOTAO_ACENTO}`}
            >
              {uploading ? "Enviando…" : "Altere o ícone do servidor"}
            </button>
            {/* Só aparece quando há o que remover, como no Discord. Compartilha
                o `uploading` com a troca: as duas mexem no mesmo arquivo. */}
            {guild.iconUrl && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => void removeIcon()}
                className={`h-8 celular:h-[44px] ${BOTAO_PERIGO}`}
              >
                Remover o ícone
              </button>
            )}
          </div>

          <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

          <h2 className="mt-10 text-base font-semibold text-text-strong">Faixa</h2>
          {/* 5 colunas de 105×64 com 8 de espaço: `grid-cols-5` sobre a coluna
              de 560 dá exatamente isso (5×105 + 4×8 = 557). */}
          <div
            role="radiogroup"
            aria-label="Cor da faixa do servidor"
            className="mt-2 grid grid-cols-5 gap-2"
          >
            {GUILD_BANNER_COLORS.map((cor) => {
              const ativo = bannerColor.toLowerCase() === cor.de;
              return (
                <button
                  key={cor.de}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  aria-label={`Faixa ${cor.de}`}
                  onClick={() => setBannerColor(ativo ? "" : cor.de)}
                  style={{ background: `linear-gradient(to bottom, ${cor.de}, ${cor.ate})` }}
                  className={`h-16 rounded-lg transition ${
                    ativo
                      ? "ring-2 ring-brand-500 ring-offset-[3px] ring-offset-background-base-lower"
                      : "hover:opacity-90"
                  }`}
                />
              );
            })}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Clique de novo na amostra escolhida para ficar sem faixa.
          </p>

          <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

          <label htmlFor="guildDescription" className={`${ROTULO_DE_BLOCO} mt-10`}>
            Descrição
          </label>
          <p className="mb-2 mt-1.5 text-sm text-text-muted">
            Como seu servidor começou? Por que as pessoas devem participar?
          </p>
          <textarea
            id="guildDescription"
            value={description}
            maxLength={MAX_GUILD_DESCRIPTION}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Do que é este servidor?"
            className={ESTILO_AREA}
          />
          <p className="mt-1 text-xs text-text-muted">
            {description.length}/{MAX_GUILD_DESCRIPTION} caracteres.
          </p>
        </div>

        {/*
          O cartão de prévia do print: 300 de largura, faixa de 118 no topo,
          ícone de 68 com raio 16 e um anel de 4 na cor do cartão atravessando a
          faixa, nome em negrito, a contagem de membros e o "Desde …". O nome e
          a faixa acompanham o formulário enquanto se edita, como lá.

          Escondido em janela estreita (`xl:`): abaixo disso o formulário de 560
          e o cartão de 300 não cabem lado a lado, e o print não mostra essa
          largura — empilhar seria invenção.
        */}
        <div className="hidden w-[300px] shrink-0 overflow-hidden rounded-lg bg-background-base-lowest xl:block">
          <div
            aria-hidden="true"
            className="h-[118px] w-full bg-input-background-default"
            style={faixa ? { background: faixa } : undefined}
          />
          <div className="px-4 pb-4">
            <div className="-mt-8 grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-2xl bg-input-background-default text-xl font-semibold text-text-default ring-4 ring-background-base-lowest">
              {guild.iconUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                acronym(nomeNaPrevia)
              )}
            </div>
            <p className="mt-3 truncate text-base font-bold text-text-strong">{nomeNaPrevia}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-text-muted" />
              {members.length} {members.length === 1 ? "membro" : "membros"}
            </p>
            <p className="mt-0.5 text-sm text-text-muted">{desde(guild.createdAt)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
