"use client";

import { useRef, useState } from "react";
import {
  GUILD_BANNER_COLORS,
  MAX_GUILD_DESCRIPTION,
  MAX_GUILD_GAMES,
  MAX_GUILD_GAME_NAME,
  MAX_GUILD_TRAITS,
  MAX_TRAIT_TEXT,
  ehEmojiDeTrait,
  guildBannerBackground,
  type GuildTrait,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import Emoji from "@/components/ui/Emoji";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { HelpCircle, Smile, X } from "@/components/ui/icones";
import { Button, Switch, TextArea, TextInput } from "@/components/ui/primitivos";
import { sugerirJogos } from "@/components/settings/server/jogos-populares";
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

/** As 5 caixas de característica: as salvas, completadas com caixas vazias. */
function caixasDeTraits(traits: GuildTrait[] | undefined): GuildTrait[] {
  const caixas = (traits ?? []).slice(0, MAX_GUILD_TRAITS).map((t) => ({ ...t }));
  while (caixas.length < MAX_GUILD_TRAITS) caixas.push({ emoji: "", texto: "" });
  return caixas;
}

/** Só as caixas com texto vão para o servidor (o contrato exige texto). */
function traitsParaSalvar(caixas: GuildTrait[]): GuildTrait[] {
  return caixas
    .map((c) => ({ emoji: c.emoji, texto: c.texto.trim() }))
    .filter((c) => c.texto !== "");
}

/** "Desde jun. de 2025" — o rodapé do cartão de prévia. */
function desde(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Desde ${d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`;
}

/**
 * "Perfil do servidor": nome, ícone, faixa, características, descrição, jogos e
 * perfil privado, com o cartão de prévia à direita (medidas do print
 * `docs/Reference/Captura de tela 2026-09-04 100541.png`, janela 1919×1079).
 *
 * - Coluna do formulário de 560; cartão de prévia 300×238 com faixa de 120,
 *   corpo `background-surface-highest` e borda `border-normal`.
 * - Botões do ícone com 32 de altura: "Altere…" é `primario`, "Remover…" é
 *   `critico-secundario` (fundo quase invisível, não o vermelho sólido).
 * - Faixa: 5 amostras de 64 de altura por linha, 8 de espaço. É dado do
 *   servidor, não token de tema: o que fica em `Guild.bannerColor` é o topo do
 *   degradê de `GUILD_BANNER_COLORS`.
 * - "N online" usa o status ao vivo do `MemberList` (`resolveStatus`), não o
 *   `user.status` estático.
 *
 * Salvar é da barra de alterações não salvas do shell. O ícone é a exceção:
 * upload não tem "desfazer" local, então vale na hora, como no Discord.
 * Remover também vale na hora, mas passa por confirmação.
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
  const [traits, setTraits] = useState<GuildTrait[]>(() => caixasDeTraits(guild?.traits));
  const [emojiAberto, setEmojiAberto] = useState<number | null>(null);
  const [games, setGames] = useState<string[]>(guild?.games ?? []);
  const [privateProfile, setPrivateProfile] = useState(guild?.privateProfile ?? false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    !!guild &&
    (name.trim() !== guild.name ||
      description.trim() !== (guild.description ?? "") ||
      bannerColor !== (guild.bannerColor ?? "") ||
      JSON.stringify(traitsParaSalvar(traits)) !== JSON.stringify(guild.traits ?? []) ||
      JSON.stringify(games) !== JSON.stringify(guild.games ?? []) ||
      privateProfile !== (guild.privateProfile ?? false));

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
            traits: traitsParaSalvar(traits),
            games,
            privateProfile,
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
      setTraits(caixasDeTraits(guild?.traits));
      setGames(guild?.games ?? []);
      setPrivateProfile(guild?.privateProfile ?? false);
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
        subtitulo="Personalize como seu servidor aparece em links de convite e, se habilitado, em Descoberta de Servidores e mensagens do canal de anúncios"
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

          <h2 className="mt-10 text-base font-semibold text-text-strong">Características</h2>
          <p className="mt-1.5 text-sm text-text-muted">
            Adicione até {MAX_GUILD_TRAITS} características para mostrar os interesses e a
            personalidade do seu servidor.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {traits.map((t, i) => (
              <div key={i} className="relative min-w-0">
                <TextInput
                  aria-label={`Característica ${i + 1}`}
                  value={t.texto}
                  maxLength={MAX_TRAIT_TEXT}
                  placeholder="Escreva algo"
                  onChange={(e) => {
                    const texto = e.target.value;
                    setTraits((atual) => atual.map((c, j) => (j === i ? { ...c, texto } : c)));
                  }}
                  prefixo={
                    <button
                      type="button"
                      aria-label={`Escolher emoji da característica ${i + 1}`}
                      aria-expanded={emojiAberto === i}
                      onClick={() => setEmojiAberto(emojiAberto === i ? null : i)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-text-muted hover:text-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      {t.emoji ? <Emoji emoji={t.emoji} tamanho={20} /> : <Smile size={20} />}
                    </button>
                  }
                />
                {emojiAberto === i && (
                  <EmojiPicker
                    className="absolute left-0 top-[46px] z-10"
                    guildId={guildId}
                    onClose={() => setEmojiAberto(null)}
                    onPick={(texto) => {
                      if (!ehEmojiDeTrait(texto)) {
                        ui.toast("Use um emoji padrão; os personalizados não cabem aqui.", "error");
                        return;
                      }
                      setTraits((atual) =>
                        atual.map((c, j) => (j === i ? { ...c, emoji: texto } : c)),
                      );
                      setEmojiAberto(null);
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

          <label htmlFor="guildDescription" className={`${ROTULO_DE_BLOCO} mt-10`}>
            Descrição
          </label>
          <TextArea
            id="guildDescription"
            value={description}
            maxLength={MAX_GUILD_DESCRIPTION}
            className="min-h-[90px]"
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Conte ao mundo mais sobre esse servidor."
          />
          <p className="mt-1 text-xs text-text-muted">
            {description.length}/{MAX_GUILD_DESCRIPTION} caracteres.
          </p>

          <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

          <h2 className="mt-10 text-base font-semibold text-text-strong">Jogos Jogados</h2>
          <p className="mt-1.5 text-sm text-text-muted">
            Quais jogos os seus membros do servidor estão jogando?
          </p>
          <SeletorDeJogos jogos={games} aoMudar={setGames} />

          <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

          <div className="mt-10 flex items-start gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id="perfilPrivadoTitulo" className="text-base font-semibold text-text-strong">
                    Perfil privado
                  </h2>
                  <p className="mt-1.5 text-sm text-text-muted">
                    Quando ativado, apenas membros do servidor podem ver o conteúdo do perfil.
                    Não-membros não poderão ver esse conteúdo a menos que tenham um convite.
                  </p>
                </div>
                <Switch
                  marcado={privateProfile}
                  aoMudar={setPrivateProfile}
                  rotulo="Perfil privado"
                />
              </div>
            </div>
            <div className="hidden w-[200px] shrink-0 flex-col items-center rounded-lg border border-border-normal bg-background-surface-highest px-4 py-5 text-center sm:flex">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-input-background-default text-text-muted">
                <HelpCircle size={24} />
              </span>
              <p className="mt-3 text-base font-bold text-text-strong">Servidor privado</p>
              <p className="mt-1 text-sm text-text-muted">
                O servidor limitou quem pode ver este Perfil.
              </p>
            </div>
          </div>
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
            {traitsParaSalvar(traits).length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {traitsParaSalvar(traits).map((t, i) => (
                  <li
                    key={i}
                    className="flex max-w-full items-center gap-1 rounded-full bg-input-background-default px-2 py-0.5 text-xs text-text-default"
                  >
                    {t.emoji && <Emoji emoji={t.emoji} tamanho={14} />}
                    <span className="truncate">{t.texto}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * "Jogos Jogados": combobox com sugestões estáticas e texto livre (o Streamz
 * não tem catálogo de jogos). Os escolhidos viram chips removíveis.
 */
function SeletorDeJogos({
  jogos,
  aoMudar,
}: {
  jogos: string[];
  aoMudar: (jogos: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const cheio = jogos.length >= MAX_GUILD_GAMES;
  const sugestoes = sugerirJogos(busca, jogos);

  function adicionar(nome: string) {
    const limpo = nome.trim().slice(0, MAX_GUILD_GAME_NAME);
    if (!limpo || cheio) return;
    if (jogos.some((j) => j.toLowerCase() === limpo.toLowerCase())) {
      setBusca("");
      return;
    }
    aoMudar([...jogos, limpo]);
    setBusca("");
  }

  return (
    <div className="mt-2">
      <div className="relative">
        <TextInput
          role="combobox"
          aria-label="Procurar um jogo"
          aria-expanded={aberto && !cheio && sugestoes.length > 0}
          aria-controls="jogosSugeridos"
          value={busca}
          disabled={cheio}
          maxLength={MAX_GUILD_GAME_NAME}
          placeholder={cheio ? `Máximo de ${MAX_GUILD_GAMES} jogos` : "Procurar um jogo…"}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setAberto(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar(busca);
            } else if (e.key === "Escape") {
              setAberto(false);
            }
          }}
        />
        {aberto && !cheio && (sugestoes.length > 0 || busca.trim()) && (
          <ul
            id="jogosSugeridos"
            role="listbox"
            className="absolute inset-x-0 top-[44px] z-10 max-h-[240px] overflow-y-auto rounded-lg border border-border-normal bg-background-surface-highest py-1"
          >
            {busca.trim() &&
              !sugestoes.some((j) => j.toLowerCase() === busca.trim().toLowerCase()) && (
                <li role="option" aria-selected="false">
                  {/* onMouseDown: o blur do campo fecharia a lista antes do clique */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      adicionar(busca);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-text-default hover:bg-background-mod-hover"
                  >
                    Adicionar &ldquo;{busca.trim()}&rdquo;
                  </button>
                </li>
              )}
            {sugestoes.map((j) => (
              <li key={j} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    adicionar(j);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-text-default hover:bg-background-mod-hover"
                >
                  {j}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {jogos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {jogos.map((j) => (
            <li
              key={j}
              className="flex items-center gap-1 rounded-full bg-input-background-default py-1 pl-3 pr-1 text-sm text-text-default"
            >
              {j}
              <button
                type="button"
                aria-label={`Remover ${j}`}
                onClick={() => aoMudar(jogos.filter((x) => x !== j))}
                className="grid h-5 w-5 place-items-center rounded-full text-text-muted hover:text-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
