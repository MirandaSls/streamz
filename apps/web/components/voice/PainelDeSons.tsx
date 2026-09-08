"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Permission, hasPermission, type SoundboardSound } from "@streamz/shared";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Soundboard,
  Star,
  Volume2,
  VolumeX,
} from "@/components/ui/icones";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import Tooltip from "@/components/ui/Tooltip";
import { Slider } from "@/components/ui/controls";
import {
  BotaoLateral,
  BuscaPicker,
  ColunaLateral,
  DivisoriaLateral,
  IconeServidor,
  LARGURA_PICKER,
} from "@/components/media/PickerChrome";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { usePermissions } from "@/stores/permissions";
import { useGuilds } from "@/stores/guilds";
import { LIMITE_FREQUENTES, useSoundboard } from "@/stores/soundboard";
import { secoesDoPainel, type SecaoDoPainel } from "@/stores/soundboard-secoes";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Painel de efeitos sonoros — a caixa que o botão da barra da chamada abre.
 *
 * Leiaute medido nos prints `docs/Reference/Captura de tela 2026-09-08 103446`
 * e `103452`. **A escala do print não é 1:1**: a coluna de canais do Discord,
 * que mede 240px, aparece nele com 294 (razão ~1,22), então cada medida abaixo
 * é o valor do print dividido por essa razão.
 *
 * | item | no print | na nossa escala | o que usamos |
 * |---|---|---|---|
 * | caixa | 532×520 | ~436×426 | 424×420 (`LARGURA_PICKER`/`ALTURA_PICKER`) |
 * | coluna lateral | 48 | ~39 | 44 (`ColunaLateral`, a mesma do emoji) |
 * | cabeçalho da busca | 65 (campo de 37) | ~53 (campo 30) | `BuscaPicker` (p-2 + campo de 32) |
 * | card | 148×40 | ~121×33 | 3 colunas iguais, altura 34 |
 * | vão entre cards | 8 | ~6,5 | 6 |
 *
 * A caixa cair praticamente em cima do seletor de emoji (424×420) não é
 * coincidência: no Discord os dois são o mesmo componente de painel. Por isso
 * este arquivo **reaproveita o `PickerChrome`** — busca, coluna lateral e ícone
 * de servidor — em vez de redesenhar as mesmas peças com outros números.
 *
 * O que o Discord tem aqui e nós não: Nitro. Não há som bloqueado, cadeado,
 * nem a faixa "Faça um pouco de barulho com Nitro" — todos os sons do painel
 * são livres (§6.6 do PROCESSO-DE-DESENVOLVIMENTO: "Nitro: não criar").
 */

/** Altura da caixa; o par de `LARGURA_PICKER`, medido junto com ela. */
const ALTURA_PAINEL = 420;

export default function PainelDeSons({
  ancora,
  aberto,
  onFechar,
}: {
  ancora: React.RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
}) {
  const guilds = useSoundboard((s) => s.guilds);
  const favoritos = useSoundboard((s) => s.favoritos);
  const usos = useSoundboard((s) => s.usos);
  const volume = useSoundboard((s) => s.volume);
  const alternarFavorito = useSoundboard((s) => s.alternarFavorito);
  const registrarUso = useSoundboard((s) => s.registrarUso);

  // o servidor da **chamada**, não o que está aberto na tela: o painel é da
  // call, e é o som daquele servidor que a API deixa tocar nela
  const channelId = useVoice((s) => s.channelId);
  const guildDaCall = useVoice((s) => s.guildId);
  const guildAberto = useGuilds((s) => s.activeGuildId);
  // numa chamada de conversa direta não há servidor da call: aí vale o aberto
  const guildIdAtivo = guildDaCall ?? guildAberto;

  const [busca, setBusca] = useState("");
  const [fechadas, setFechadas] = useState<Record<string, true>>({});
  const [ativa, setAtiva] = useState("");
  const [volumeAberto, setVolumeAberto] = useState(false);

  const rolagem = useRef<HTMLDivElement>(null);
  const alvos = useRef(new Map<string, HTMLElement>());
  const botaoDoVolume = useRef<HTMLButtonElement>(null);

  const secoes = useMemo(
    () =>
      secoesDoPainel({
        guilds,
        favoritos,
        usos,
        busca,
        guildIdAtivo,
        limiteFrequentes: LIMITE_FREQUENTES,
      }),
    [guilds, favoritos, usos, busca, guildIdAtivo],
  );

  // a coluna lateral acompanha a rolagem: a seção ativa é a que está no topo
  const aoRolar = useCallback(() => {
    const caixa = rolagem.current;
    if (!caixa) return;
    let atual = "";
    for (const [id, el] of alvos.current) {
      if (el.offsetTop - caixa.scrollTop <= 8) atual = id;
    }
    setAtiva(atual);
  }, []);

  const registrarSecao = useCallback((id: string, el: HTMLElement | null) => {
    if (el) alvos.current.set(id, el);
    else alvos.current.delete(id);
  }, []);

  function irPara(id: string) {
    const el = alvos.current.get(id);
    const caixa = rolagem.current;
    if (!el || !caixa) return;
    // a seção fechada não tem para onde rolar: clicar no atalho a abre
    setFechadas((f) => {
      const { [id]: _fora, ...resto } = f;
      return resto;
    });
    caixa.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    setAtiva(id);
  }

  /**
   * Apertar um card.
   *
   * **Não toca nada aqui.** Quem toca é o evento `soundboard.play` que a API
   * devolve para a sala inteira — inclusive para mim (ver `useRealtime`). Tocar
   * localmente antes seria ouvir o próprio som adiantado em relação a todo
   * mundo, e ouvi-lo mesmo quando a API recusasse.
   */
  async function tocar(sound: SoundboardSound) {
    if (!channelId) {
      ui.toast("Entre numa chamada para tocar um som.", "error");
      return;
    }
    registrarUso(sound.id);
    try {
      await api.tocarSom(channelId, sound.id);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível tocar o som"), "error");
    }
  }

  function menuDoCard(e: React.MouseEvent, sound: SoundboardSound) {
    e.preventDefault();
    const favorito = favoritos.includes(sound.id);
    const itens: MenuItem[] = [
      {
        label: favorito ? "Remover dos favoritos" : "Favoritar",
        onSelect: () => alternarFavorito(sound.id),
      },
    ];
    if (sound.guildId && podeGerenciarSons(sound.guildId)) {
      itens.push({ separator: true });
      itens.push({
        label: "Remover som",
        danger: true,
        onSelect: () => void removerSom(sound),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, itens);
  }

  async function removerSom(sound: SoundboardSound) {
    if (!sound.guildId) return;
    const ok = await ui.confirm({
      title: `Remover "${sound.name}"?`,
      message: "O som sai do painel de todo mundo do servidor.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteSound(sound.guildId, sound.id);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover o som"), "error");
    }
  }

  const mudo = volume <= 0;

  return (
    <PopoverFlutuante
      ancora={ancora}
      aberto={aberto}
      onFechar={onFechar}
      rotulo="Efeitos sonoros"
      largura={LARGURA_PICKER}
      semRespiro
    >
      <div
        style={{ height: ALTURA_PAINEL }}
        className="flex flex-col overflow-hidden rounded-lg bg-panel"
      >
        <div className="flex items-center gap-1 pr-2">
          <div className="min-w-0 flex-1">
            <BuscaPicker
              valor={busca}
              onChange={setBusca}
              autoFocus
              placeholder="Encontre o som perfeito"
              rotulo="Encontre o som perfeito"
            />
          </div>
          <Tooltip label="Volume dos efeitos sonoros">
            <button
              ref={botaoDoVolume}
              type="button"
              onClick={() => setVolumeAberto((v) => !v)}
              aria-expanded={volumeAberto}
              aria-label="Volume dos efeitos sonoros"
              className={`grid h-8 w-8 shrink-0 place-items-center rounded transition hover:bg-hov ${
                mudo ? "text-red" : "text-txt-muted hover:text-txt-normal"
              }`}
            >
              {mudo ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </Tooltip>
        </div>

        <div className="flex min-h-0 flex-1">
          <ColunaLateral rotulo="Seções de sons">
            {secoes.map((secao, i) => (
              <div key={secao.id} className="contents">
                {/* a divisória separa o que é meu (favoritos, frequentes) do
                    que é de alguém (o app e os servidores) */}
                {i > 0 && secao.tipo !== "favoritos" && secao.tipo !== "frequentes" &&
                  (secoes[i - 1].tipo === "favoritos" || secoes[i - 1].tipo === "frequentes") && (
                    <DivisoriaLateral />
                  )}
                <BotaoLateral
                  rotulo={secao.titulo}
                  ativo={(ativa || secoes[0]?.id) === secao.id}
                  onClick={() => irPara(secao.id)}
                >
                  <IconeDaSecao secao={secao} />
                </BotaoLateral>
              </div>
            ))}
          </ColunaLateral>

          <div
            ref={rolagem}
            onScroll={aoRolar}
            // `relative` faz o `offsetTop` das seções ser medido a partir daqui:
            // sem isso o "pular para a seção" erra o alvo (ver `EmojiPicker`)
            className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2"
          >
            {secoes.every((s) => s.sons.length === 0 && !s.atual) ? (
              <p className="px-2 py-10 text-center text-sm text-txt-muted">
                {busca.trim() ? "Nenhum som com esse nome." : "Nenhum som por aqui."}
              </p>
            ) : (
              secoes.map((secao) => (
                <SecaoDeSons
                  key={secao.id}
                  secao={secao}
                  fechada={!!fechadas[secao.id]}
                  favoritos={favoritos}
                  podeAdicionar={!!secao.guildId && podeGerenciarSons(secao.guildId)}
                  onRegistrar={registrarSecao}
                  onAlternar={() =>
                    setFechadas((f) => {
                      if (f[secao.id]) {
                        const { [secao.id]: _fora, ...resto } = f;
                        return resto;
                      }
                      return { ...f, [secao.id]: true as const };
                    })
                  }
                  onTocar={(s) => void tocar(s)}
                  onMenu={menuDoCard}
                  onAdicionar={() =>
                    secao.guildId && ui.openModal({ kind: "adicionarSom", guildId: secao.guildId })
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      <PopoverDeVolume
        ancora={botaoDoVolume}
        aberto={volumeAberto}
        onFechar={() => setVolumeAberto(false)}
      />
    </PopoverFlutuante>
  );
}

/**
 * Posso mexer nos sons deste servidor?
 *
 * A permissão é a mesma das expressões (`MANAGE_EMOJIS`, ver ADR-0002), e o
 * cliente só sabe respondê-la para o servidor cujos **cargos estão carregados**
 * — a store guarda um servidor por vez. Para os outros a resposta é "não" e o
 * botão some: é o lado seguro, e quem tentar assim mesmo leva 403 da API.
 *
 * Não dá para usar o `useCan` daqui: ele responde sempre pelo servidor aberto,
 * e este painel pergunta por **cada** seção da lista.
 */
function podeGerenciarSons(guildId: string): boolean {
  const perms = usePermissions.getState();
  if (perms.guildId !== guildId) return false;
  const meuId = useAuth.getState().user?.id;
  const guilds = useGuilds.getState();
  const guild = guilds.guilds.find((g) => g.id === guildId);
  if (!meuId || !guild) return false;
  if (guild.ownerId === meuId) return true;
  const roleIds = guilds.members.find((m) => m.user.id === meuId)?.roleIds ?? [];
  const bits = perms.roles
    .filter((r) => r.isDefault || roleIds.includes(r.id))
    .reduce((acc, r) => acc | r.permissions, 0);
  return hasPermission(bits, Permission.MANAGE_EMOJIS);
}

/** O ícone que a coluna lateral desenha para cada seção. */
function IconeDaSecao({ secao }: { secao: SecaoDoPainel }) {
  if (secao.tipo === "favoritos") return <Star size={18} />;
  if (secao.tipo === "frequentes") return <Clock size={18} />;
  if (secao.tipo === "guild") {
    return <IconeServidor nome={secao.titulo} iconUrl={secao.guildIconUrl ?? null} />;
  }
  return <Soundboard size={18} />;
}

function SecaoDeSons({
  secao,
  fechada,
  favoritos,
  podeAdicionar,
  onRegistrar,
  onAlternar,
  onTocar,
  onMenu,
  onAdicionar,
}: {
  secao: SecaoDoPainel;
  fechada: boolean;
  favoritos: string[];
  podeAdicionar: boolean;
  onRegistrar: (id: string, el: HTMLElement | null) => void;
  onAlternar: () => void;
  onTocar: (s: SoundboardSound) => void;
  onMenu: (e: React.MouseEvent, s: SoundboardSound) => void;
  onAdicionar: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    onRegistrar(secao.id, ref.current);
    return () => onRegistrar(secao.id, null);
  }, [onRegistrar, secao.id]);

  const vazia = secao.sons.length === 0;
  // a seção do servidor aberto entra mesmo vazia: é onde mora o "+ Adicionar som"
  if (vazia && !podeAdicionar && secao.tipo !== "favoritos") return null;

  return (
    <section ref={ref} className="mb-1">
      <h3 className="sticky top-0 z-10 bg-panel py-1.5">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={!fechada}
          className="flex w-full items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-txt-muted transition hover:text-txt-normal"
        >
          <span className="shrink-0">
            <IconeDaSecao secao={secao} />
          </span>
          <span className="truncate">{secao.titulo}</span>
          {fechada ? (
            <ChevronRight size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </button>
      </h3>

      {!fechada && (
        <div className="grid grid-cols-3 gap-1.5">
          {secao.sons.map((sound) => (
            <CardDeSom
              key={`${secao.id}:${sound.id}`}
              sound={sound}
              favorito={favoritos.includes(sound.id)}
              onTocar={() => onTocar(sound)}
              onMenu={(e) => onMenu(e, sound)}
            />
          ))}
          {podeAdicionar && (
            <button
              type="button"
              onClick={onAdicionar}
              // ocupa as três colunas quando a seção está vazia, como no print:
              // ali ele é a única coisa da faixa e não pode parecer um card solto
              className={`flex h-[34px] items-center justify-center gap-1.5 rounded-lg bg-border-strong/50 px-2 text-xs font-medium text-txt-normal transition hover:bg-border-strong ${
                vazia ? "col-span-3" : ""
              }`}
            >
              <Plus size={14} aria-hidden="true" />
              Adicionar som
            </button>
          )}
          {vazia && !podeAdicionar && secao.tipo === "favoritos" && (
            <p className="col-span-3 px-1 py-2 text-xs text-txt-faint">
              Clique com o botão direito num som para favoritá-lo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Um card: emoji à esquerda, nome à direita, 34px de altura.
 *
 * O menu de contexto é o caminho de favoritar e de remover — e não um ícone no
 * hover — porque num card de 121px de largura um botão extra come o nome, que é
 * a única coisa que distingue um som do outro.
 */
function CardDeSom({
  sound,
  favorito,
  onTocar,
  onMenu,
}: {
  sound: SoundboardSound;
  favorito: boolean;
  onTocar: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onTocar}
      onContextMenu={onMenu}
      title={sound.name}
      className="flex h-[34px] min-w-0 items-center gap-1.5 rounded-lg bg-border-strong/50 px-2 text-left transition hover:bg-border-strong"
    >
      <span aria-hidden="true" className="shrink-0 text-base leading-none">
        {sound.emoji || "🔊"}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-txt-normal">{sound.name}</span>
      {favorito && <Star size={12} className="shrink-0 text-yellow" aria-hidden="true" />}
    </button>
  );
}

/** O mini-popover do deslizador, aberto pelo alto-falante ao lado da busca. */
function PopoverDeVolume({
  ancora,
  aberto,
  onFechar,
}: {
  ancora: React.RefObject<HTMLButtonElement | null>;
  aberto: boolean;
  onFechar: () => void;
}) {
  const volume = useSoundboard((s) => s.volume);
  const definirVolume = useSoundboard((s) => s.definirVolume);
  return (
    <PopoverFlutuante
      ancora={ancora}
      aberto={aberto}
      onFechar={onFechar}
      rotulo="Volume dos efeitos sonoros"
      largura={240}
    >
      {/* o `data-submenu-de-popover` é o que impede o painel de fechar junto
          quando o clique cai aqui dentro (ver `PopoverFlutuante`) */}
      <div data-submenu-de-popover>
        <Slider
          label="Volume dos efeitos sonoros"
          value={Math.round(volume * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => definirVolume(v / 100)}
        />
      </div>
    </PopoverFlutuante>
  );
}

