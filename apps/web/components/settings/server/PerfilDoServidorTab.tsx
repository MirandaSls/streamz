"use client";

import { useRef, useState } from "react";
import {
  GUILD_BANNER_COLORS,
  MAX_GUILD_DESCRIPTION,
  guildBannerBackground,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { Button, TextArea, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { resolveStatus, usePresence } from "@/stores/presence";
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
 * a mesma largura da nossa bancada de captura — medido com `medir.py`):
 *
 * | item | medida |
 * |---|---|
 * | coluna do formulário | 560 (x 732→1291) |
 * | campo "Nome" | 560×40 (borda em y=228 e y=267) |
 * | botões do ícone | 32 de altura; "Altere…" 198, "Remover…" 117, 8 entre eles. "Altere…" é preenchido (`#5865f2` medido → `primario`); "Remover…" é fundo quase invisível + texto `#f87e7a` (linha y=415: bg `#2e2e33`, exatamente `control-critical-secondary-background-default` 12% sobre a página) → `critico-secundario`, não `critico` (que pintaria fundo `#d22d39` sólido) |
 * | amostra da faixa | 106×64, 5 por linha, 8 de espaço, duas linhas (linha y=571: 732–837, 846–950, 959–1064, 1073–1177, 1186–1291) |
 * | anel da amostra escolhida | 2px do acento, 3px afastado |
 * | cartão de prévia | 300×238 (borda em x=1332/1631 e y=92/329), faixa de 120 no topo (91→210) |
 * | corpo do cartão | `#2c2d32` = `--background-surface-highest`, com borda 1px `#393a3f` ≈ `--border-normal` (`#9696a033`) sobre o fundo da página — mesmo par que `BalaoDeStatus.tsx` usa para a bolha de status |
 * | anel do ícone sobre a faixa | `#2c2d32`, igual ao corpo do cartão, não ao `background-base-lowest` da página (coluna x=1480 do print: o furo ao redor da foto é `#2c2d32`) |
 *
 * O outro print da mesma tela, `Captura de tela 2026-09-01 113634.png`
 * (1284×714, janela mais estreita), mostra a mesma "Faixa" com só 3 colunas —
 * é o grid reagindo à largura menor da janela naquele dia, não uma medida
 * diferente: as duas telas têm janela em zoom 100% (regra 1 da ADR-0009), e a
 * nossa bancada de captura usa 1920×1080, a largura do outro print. Por isso
 * o grid de 5 colunas abaixo já está certo — a divergência "3 colunas de
 * 133×64" do `divergencias.py` é a mesma peça medida na janela estreita.
 *
 * A **faixa** é dado do servidor, não token de tema: o par de cores de cada
 * amostra está em `GUILD_BANNER_COLORS`, e o que fica gravado em
 * `Guild.bannerColor` é o topo do degradê.
 *
 * A contagem "N online" ao lado de "M membros" na prévia usa o mesmo status
 * ao vivo do `MemberList.tsx` (`resolveStatus` sobre `usePresence`), não o
 * `user.status` estático da lista — é dado que o produto já tem, só não
 * aparecia aqui.
 *
 * O que o print tem e nós não criamos, porque não existe no produto:
 * "Características" (cinco caixas de emoji), a tag do servidor e o distintivo
 * (parceiro/comunidade) ao lado do nome na prévia — não é "N online"/"M
 * membros", é um selo de programa que o Streamz não tem.
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
  // status ao vivo, a mesma fonte do MemberList — não o `user.status` estático
  // da lista, que fica velho enquanto a aba de configurações está aberta.
  const statuses = usePresence((s) => s.statuses);
  const online = members.filter((m) => resolveStatus(statuses, m.user) !== "OFFLINE").length;
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
          <TextInput
            id="guildName"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
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
            <Button
              variante="primario"
              tamanho="sm"
              carregando={uploading}
              onClick={() => fileRef.current?.click()}
              className="celular:h-[44px]"
            >
              Altere o ícone do servidor
            </Button>
            {/* Só aparece quando há o que remover, como no Discord. Compartilha
                o `uploading` com a troca: as duas mexem no mesmo arquivo. */}
            {guild.iconUrl && (
              <Button
                variante="critico-secundario"
                tamanho="sm"
                disabled={uploading}
                onClick={() => void removeIcon()}
                className="celular:h-[44px]"
              >
                Remover o ícone
              </Button>
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
                      // o vão do anel é o fundo da PÁGINA de configurações
                      // (`#202024` medido em volta da grade), que é
                      // `--background-base-low` — não o `-lower` (`#1a1a1e`),
                      // um tom mais escuro que nunca aparece aqui.
                      ? "ring-2 ring-brand-500 ring-offset-[3px] ring-offset-background-base-low"
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
          <TextArea
            id="guildDescription"
            value={description}
            maxLength={MAX_GUILD_DESCRIPTION}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Do que é este servidor?"
          />
          <p className="mt-1 text-xs text-text-muted">
            {description.length}/{MAX_GUILD_DESCRIPTION} caracteres.
          </p>
        </div>

        {/*
          O cartão de prévia do print: 300×238 com borda de 1px sobre o fundo
          da página (`border-border-normal`, ver cabeçalho), corpo
          `background-surface-highest`, faixa de 120 no topo, ícone de 68 com
          raio 16 e um anel de 4 na cor do CORPO do cartão (não da página)
          atravessando a faixa, nome em negrito, "N online"/"M membros" e o
          "Desde …". O nome e a faixa acompanham o formulário enquanto se
          edita, como lá.

          Escondido em janela estreita (`xl:`): abaixo disso o formulário de 560
          e o cartão de 300 não cabem lado a lado, e o print não mostra essa
          largura — empilhar seria invenção.
        */}
        <div className="hidden w-[300px] shrink-0 overflow-hidden rounded-lg border border-border-normal bg-background-surface-highest xl:block">
          <div
            aria-hidden="true"
            className="h-[120px] w-full bg-input-background-default"
            style={faixa ? { background: faixa } : undefined}
          />
          <div className="px-4 pb-4">
            <div className="-mt-8 grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-2xl bg-input-background-default text-xl font-semibold text-text-default ring-4 ring-background-surface-highest">
              {guild.iconUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                acronym(nomeNaPrevia)
              )}
            </div>
            <p className="mt-3 truncate text-base font-bold text-text-strong">{nomeNaPrevia}</p>
            {/* gap-3 entre os dois grupos: não medido no print (a régua não
                tirava a distância exata entre "N online" e "M membros"),
                usa a escala de espaço existente mais próxima. */}
            <p className="mt-1 flex items-center gap-3 text-sm text-text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-icon-status-online" />
                {online} online
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-text-muted" />
                {members.length} {members.length === 1 ? "membro" : "membros"}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-text-muted">{desde(guild.createdAt)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
