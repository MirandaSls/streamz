"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_SOUNDBOARD_POR_GUILD,
  Permission,
  hasPermission,
  type SoundboardSound,
} from "@streamz/shared";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Search,
  Star,
  Volume2,
  VolumeX,
} from "@/components/ui/icones";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import { TextInput, Tooltip } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";
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
 * **Leiaute medido no print `docs/Reference/Captura de tela 2026-09-08
 * 103452.png`, que é 1:1 com a tela** — os ícones da barra de tarefas do
 * Windows medem 24px nele e o passo entre eles é 44px, que é exatamente o do
 * Windows 11 a 100%. (A primeira versão deste painel dividiu tudo por 1,22
 * achando que o print estava ampliado, porque a coluna de canais aparece com
 * 294px e o padrão do Discord é 240 — mas a coluna do Discord é arrastável, e
 * essa era a largura escolhida pelo usuário. O painel saiu 20% menor que o
 * dele.) Todo número abaixo é `getpixel`, com a origem no canto do popover
 * (x=243, y=245):
 *
 * | item | medida no print |
 * |---|---|
 * | caixa | 532×522, raio 8, borda de 1px |
 * | cabeçalho | 64 de altura; campo de 40, raio 8, a 12 da borda |
 * | campo de busca | 471 de largura, lupa de 16 a 12 da borda esquerda |
 * | zona do alto-falante | 48 à direita do campo |
 * | coluna lateral | 48 de largura, item de 32×32, passo de 40 |
 * | avatar de servidor | 32 (ocupa o item inteiro) |
 * | cabeçalho de seção | linha de 32, ícone 16, chevron 16 |
 * | card | 148×40, raio 8, emoji e nome **centralizados** |
 * | vão entre cards | 8 na horizontal e na vertical |
 *
 * Tipografia, pela altura da tinta (`getpixel`, que é o que o olho lê — a
 * largura não serve para comparar fontes diferentes):
 *
 * | texto | tinta no print | o que usamos |
 * |---|---|---|
 * | busca | 15 (`E` + descida do `p`) | 16px |
 * | cabeçalho de seção | 10 (`F` maiúsculo), largura 69 | 13px semibold, `text-text-subtle` — 10 de tinta e 75 de largura (a Noto Sans é ~10% mais larga que a gg sans; a fonte não muda, §6.6) |
 * | nome do som | 11 (`golf clap`, subida + descida) | 13px semibold, `text-text-strong` (brilho 251 no print) |
 * | "Adicionar som" | 10, brilho 153 | 13px, `text-text-muted` |
 * | emoji do card | 18 a 21 de largura conforme o desenho | 18px |
 *
 * Duas coisas que **não** são como parecem à primeira vista, e por isso ficam
 * escritas aqui: o card "+ Adicionar som" tem **borda tracejada** e fundo
 * transparente (não é um card sólido como os de som), e o item ativo da coluna
 * lateral **tem sim** um fundo quadrado de 32×32 no `#202024` — está medido
 * (`linha y=336: x 252..283 em (32,32,36) sobre a coluna em (26,26,30)`) e
 * visível no recorte ampliado.
 *
 * As cores do print (#202024 corpo, #1a1a1e coluna, #292a2d card) caem em cima
 * de tokens que já existem no Discord — `background-base-low`,
 * `background-base-lower` e `interactive-background-selected` —, então nenhum
 * token novo foi criado (§6.6). (Antes da migração da onda 0 este parágrafo
 * citava os apelidos `footer`/`chat`/`sel`; eles saíram do código, e a
 * referência aqui ficaria enganosa se não acompanhasse.)
 *
 * O que o Discord tem aqui e nós não: Nitro. Não há som bloqueado, cadeado, nem
 * a faixa "Faça um pouco de barulho com Nitro". E não há a seção "Sons do
 * Discord": o Streamz não traz som de fábrica. Também não existe uma permissão
 * "Usar soundboard" por canal — o guia do Discord cita uma (`Use Soundboard`,
 * ver `docs/referencias-discord/.../08.png`), mas `@streamz/shared` não tem
 * esse bit (só `MANAGE_EMOJIS`, que já cobre quem pode *adicionar* som): não
 * inventamos o bit aqui (§6.6).
 *
 * **Estados cobertos nesta peça** (o pedido do cartão 4e):
 * - **carregando**: `useSoundboard().carregado` começa `false` — a store só
 *   marca `true` depois do primeiro `GET /me/soundboard` (`stores/soundboard.ts`).
 *   Enquanto isso o corpo do painel mostra um esqueleto (`PainelCarregando`),
 *   em vez de desenhar "Favoritos"/"Frequentes" vazios como se já soubéssemos
 *   que não há nada — o que aconteceria se a gente só olhasse `guilds.length`.
 * - **vazio**: sem resultado de busca, mensagem central (já existia). Sem
 *   busca e com `carregado`, as seções Favoritos/Frequentes aparecem mesmo
 *   vazias — é assim no Discord (ver `secoesDoPainel`), não uma lacuna.
 * - **erro**: tocar um som (`tocar`) e criar um som (`AdicionarSomModal`) já
 *   mostravam toast de erro. O que **não** dá para cobrir aqui: `load()` em
 *   `stores/soundboard.ts:69` despeja a falha num `.catch(() => [])` — quem
 *   abre o painel sem internet vê "vazio", não "erro ao carregar". Corrigir
 *   isso pede expor um campo de erro na store, fora da lista deste cartão
 *   (ver "faltando" no retorno do cartão).
 * - **sem permissão**: quem não tem `MANAGE_EMOJIS` no servidor não vê o card
 *   "+ Adicionar som" (já existia). Quem tem, mas o servidor já está no teto
 *   de `MAX_SOUNDBOARD_POR_GUILD`, agora vê o card **desabilitado** com
 *   tooltip, em vez de descobrir o limite só depois de abrir o modal.
 * - **hover/foco**: cards e coluna já tinham hover. Foco por teclado no
 *   `<input type=range>` do volume **não** tinha anel — `app/globals.css`
 *   exclui `type="range"` das duas regras globais de foco (é pensado para
 *   quem substitui o nativo por um polegar próprio, como `Checkbox`/`Radio`;
 *   aqui o nativo é o próprio controle visível), então ficava só o anel do
 *   navegador, "quase invisível no escuro" — a razão que o próprio CSS dá para
 *   as regras existirem. Ganhou `focus-visible:outline-border-focus`, como
 *   `ScreenSharePicker`/`Tabs` já fazem para o mesmo caso.
 * - **desabilitado**: card "+ Adicionar som" no teto do servidor (acima).
 */

/** Caixa inteira, borda incluída. */
const LARGURA_PAINEL = 532;
const ALTURA_PAINEL = 522;
/** Coluna de atalhos à esquerda. */
const LARGURA_COLUNA = 48;

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
  const carregado = useSoundboard((s) => s.carregado);
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

  const meuId = useAuth((s) => s.user?.id ?? null);
  const listaDeGuilds = useGuilds((s) => s.guilds);
  const membros = useGuilds((s) => s.members);
  const permGuildId = usePermissions((s) => s.guildId);
  const cargos = usePermissions((s) => s.roles);

  /**
   * No celular o `PopoverFlutuante` já entrega a folha inferior (véu, largura
   * cheia, 85dvh, área segura). O que muda aqui dentro é a **caixa**: os 532×522
   * fixos, medidos no print do desktop, viram largura da tela e 60% da altura,
   * e a moldura arredondada some — quem arredonda é a folha.
   */
  const ehMobile = useEhMobile();

  const [busca, setBusca] = useState("");
  // só o que o usuário abriu ou fechou na mão; o resto segue o padrão de
  // `nasceFechada` (ver ali por que Favoritos é o único que nasce fechado)
  const [alternadas, setAlternadas] = useState<Record<string, boolean>>({});
  const [ativa, setAtiva] = useState("");
  const [volumeAberto, setVolumeAberto] = useState(false);

  const rolagem = useRef<HTMLDivElement>(null);
  const alvos = useRef(new Map<string, HTMLElement>());
  const botaoDoVolume = useRef<HTMLButtonElement>(null);

  /**
   * Em que servidores eu posso pôr som — é o que desenha o "+ Adicionar som".
   *
   * A permissão é a mesma das expressões (`MANAGE_EMOJIS`, ver ADR-0002), e o
   * cliente só sabe respondê-la para o servidor cujos **cargos estão
   * carregados** (a store guarda um por vez). Dono, por outro lado, o cliente
   * sabe para todos — e é o caso que mais aparece: na primeira versão deste
   * painel o botão dependia só dos cargos carregados, então numa chamada de
   * conversa direta (nenhum servidor aberto, nenhum cargo carregado) ele
   * simplesmente **nunca aparecia**. Era essa a queixa.
   */
  const possoGerenciar = useMemo(() => {
    if (!meuId) return [];
    return listaDeGuilds
      .filter((g) => {
        if (g.ownerId === meuId) return true;
        if (permGuildId !== g.id) return false;
        const roleIds = membros.find((m) => m.user.id === meuId)?.roleIds ?? [];
        const bits = cargos
          .filter((r) => r.isDefault || roleIds.includes(r.id))
          .reduce((acc, r) => acc | r.permissions, 0);
        return hasPermission(bits, Permission.MANAGE_EMOJIS);
      })
      .map((g) => g.id);
  }, [meuId, listaDeGuilds, membros, permGuildId, cargos]);

  const secoes = useMemo(
    () =>
      secoesDoPainel({
        guilds,
        favoritos,
        usos,
        busca,
        guildIdAtivo,
        limiteFrequentes: LIMITE_FREQUENTES,
        guildsQuePossoGerenciar: possoGerenciar,
      }),
    [guilds, favoritos, usos, busca, guildIdAtivo, possoGerenciar],
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
    setAlternadas((a) => ({ ...a, [id]: false }));
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
    if (possoGerenciar.includes(sound.guildId)) {
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
  const buscando = busca.trim().length > 0;

  return (
    <PopoverFlutuante
      ancora={ancora}
      aberto={aberto}
      onFechar={onFechar}
      rotulo="Efeitos sonoros"
      largura={LARGURA_PAINEL}
      semRespiro
    >
      <div
        style={ehMobile ? undefined : { height: ALTURA_PAINEL }}
        className={`flex flex-col overflow-hidden bg-background-base-low ${
          ehMobile ? "h-[60dvh]" : "rounded-lg border border-border-subtle"
        }`}
      >
        {/* cabeçalho de 64: campo de 40 a 12 da borda esquerda, e a zona de 48
            do alto-falante colada na direita (sem respiro ali) — é o que dá os
            471 de campo medidos no print */}
        <div className="flex h-[64px] shrink-0 items-center py-[12px] pl-[12px]">
          <div className="min-w-0 flex-1">
            <TextInput
              // no celular o foco automático sobe o teclado por cima da folha
              // antes de a pessoa ver um som sequer
              autoFocus={!ehMobile}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Encontre o som perfeito"
              aria-label="Encontre o som perfeito"
              prefixo={<Search size={16} aria-hidden="true" className="text-text-muted" />}
              classeDaCaixa="w-full border-border-subtle bg-background-base-lower"
            />
          </div>
          <div className="grid w-[48px] shrink-0 place-items-center">
            <Tooltip rotulo="Volume dos efeitos sonoros">
              <button
                ref={botaoDoVolume}
                type="button"
                onClick={() => setVolumeAberto((v) => !v)}
                aria-expanded={volumeAberto}
                aria-label="Volume dos efeitos sonoros"
                className={`flex h-[32px] items-center gap-[2px] rounded-[4px] px-[4px] transition hover:bg-interactive-background-hover ${
                  mudo ? "text-status-danger" : "text-text-subtle hover:text-text-strong"
                }`}
              >
                {mudo ? <VolumeX size={20} /> : <Volume2 size={20} />}
                <ChevronDown size={10} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* coluna de 48, item de 32 com passo de 40 (8 de vão) */}
          <nav
            aria-label="Seções de sons"
            style={{ width: LARGURA_COLUNA }}
            className="flex shrink-0 flex-col items-center gap-[8px] overflow-y-auto bg-background-base-lower py-[8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {carregado &&
              secoes.map((secao) => (
                <Tooltip key={secao.id} rotulo={secao.titulo}>
                  <button
                    type="button"
                    aria-label={secao.titulo}
                    aria-current={(ativa || secoes[0]?.id) === secao.id || undefined}
                    onClick={() => irPara(secao.id)}
                    className={`grid h-[32px] w-[32px] shrink-0 place-items-center overflow-hidden rounded-[8px] transition ${
                      (ativa || secoes[0]?.id) === secao.id
                        ? "bg-background-base-low text-text-strong"
                        : "text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong"
                    }`}
                  >
                    <IconeDaSecao secao={secao} tamanho="coluna" />
                  </button>
                </Tooltip>
              ))}
          </nav>

          <div
            ref={rolagem}
            onScroll={aoRolar}
            // `relative` faz o `offsetTop` das seções ser medido a partir daqui:
            // sem isso o "pular para a seção" erra o alvo (ver `EmojiPicker`)
            className="relative min-h-0 flex-1 overflow-y-auto pb-[8px] pl-[8px] pr-[14px]"
          >
            {!carregado ? (
              <PainelCarregando />
            ) : buscando && secoes[0]?.sons.length === 0 ? (
              <p className="px-1 py-10 text-center text-sm text-text-muted">
                Nenhum som com esse nome.
              </p>
            ) : (
              secoes.map((secao) => (
                <SecaoDeSons
                  key={secao.id}
                  secao={secao}
                  fechada={alternadas[secao.id] ?? nasceFechada(secao)}
                  onRegistrar={registrarSecao}
                  onAlternar={() =>
                    setAlternadas((a) => ({
                      ...a,
                      [secao.id]: !(a[secao.id] ?? nasceFechada(secao)),
                    }))
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
 * Estado de carregamento — antes do primeiro `GET /me/soundboard` responder.
 *
 * Duas fileiras fantasmas de card (mesmos 148×40, raio 8) sob uma barra de
 * título (96×14): a forma da seção que vai aparecer, sem prometer nomes. Um
 * spinner central diria a mesma coisa com menos informação sobre o que está
 * por vir. `animate-pulse` é utilitário do Tailwind, não anima
 * `globals.css` — não há keyframe de esqueleto na lista de animações desta
 * base (`anim-overlay`/`anim-modal`/`anim-menu`/`anim-folha`/`anim-empilhar`)
 * e criar um está fora da lista de arquivos deste cartão.
 */
function PainelCarregando() {
  return (
    <div aria-hidden="true" className="animate-pulse px-[8px] pt-[2px]">
      {[0, 1].map((i) => (
        <div key={i} className="mb-[16px] last:mb-0">
          <div className="mb-[8px] h-[14px] w-[96px] rounded bg-background-mod-muted" />
          <div className="grid grid-cols-3 gap-[8px]">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="h-[40px] rounded-lg bg-background-mod-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Uma seção nasce fechada?
 *
 * Só Favoritos, e só enquanto está vazia — é o estado do print, onde ela é a
 * única com o chevron `>` enquanto as outras estão com `v`. Faz sentido: uma
 * seção vazia aberta é um cabeçalho seguido de nada, e o `>` pelo menos diz
 * que tem uma gaveta ali. Assim que o primeiro favorito entra, ela abre.
 */
function nasceFechada(secao: SecaoDoPainel): boolean {
  return secao.tipo === "favoritos" && secao.sons.length === 0;
}

/**
 * O ícone da seção — o mesmo desenho na coluna da esquerda e no cabeçalho.
 *
 * Muda só o tamanho: 20 na coluna (e o avatar de servidor ocupa os 32 inteiros
 * do item, como no print), 16 no cabeçalho.
 */
function IconeDaSecao({
  secao,
  tamanho,
}: {
  secao: SecaoDoPainel;
  tamanho: "coluna" | "cabecalho";
}) {
  const naColuna = tamanho === "coluna";
  const px = naColuna ? 22 : 16;
  if (secao.tipo === "guild") {
    const lado = naColuna ? "h-[32px] w-[32px]" : "h-[16px] w-[16px]";
    if (secao.guildIconUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={secao.guildIconUrl} alt="" className={`${lado} rounded-full object-cover`} />
      );
    }
    return (
      <span
        className={`${lado} grid place-items-center rounded-full bg-input-background-default ${
          naColuna ? "text-[10px]" : "text-[7px]"
        } font-semibold text-text-default`}
      >
        {sigla(secao.titulo)}
      </span>
    );
  }
  if (secao.tipo === "frequentes") return <Clock size={px} />;
  return <Star size={px} />;
}

/** Iniciais das palavras do nome, no máximo duas — igual ao rail de servidores. */
function sigla(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function SecaoDeSons({
  secao,
  fechada,
  onRegistrar,
  onAlternar,
  onTocar,
  onMenu,
  onAdicionar,
}: {
  secao: SecaoDoPainel;
  fechada: boolean;
  onRegistrar: (id: string, el: HTMLElement | null) => void;
  onAlternar: () => void;
  onTocar: (s: SoundboardSound) => void;
  onMenu: (e: React.MouseEvent, s: SoundboardSound) => void;
  onAdicionar: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const ehMobile = useEhMobile();
  useEffect(() => {
    onRegistrar(secao.id, ref.current);
    return () => onRegistrar(secao.id, null);
  }, [onRegistrar, secao.id]);

  return (
    <section ref={ref} className="mb-[8px] last:mb-0">
      {/* linha de 32, sem respiro lateral: o ícone nasce na mesma coluna do
          primeiro card (medido: os dois começam em x=300) */}
      <h3 className="h-[32px]">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={!fechada}
          className="flex h-[32px] w-full items-center gap-[6px] text-[13px] font-semibold text-text-subtle transition hover:text-text-strong"
        >
          <span className="grid h-[16px] w-[16px] shrink-0 place-items-center">
            <IconeDaSecao secao={secao} tamanho="cabecalho" />
          </span>
          <span className="truncate">{secao.titulo}</span>
          {fechada ? (
            <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" className="shrink-0" />
          )}
        </button>
      </h3>

      {/* três colunas em 532 dão os 148 do print; nos ~330 que sobram numa folha
          de 390 elas virariam 101 e o nome do som só apareceria cortado — no
          celular são duas */}
      {!fechada && (secao.sons.length > 0 || secao.podeAdicionar) && (
        <div className={`grid gap-[8px] ${ehMobile ? "grid-cols-2" : "grid-cols-3"}`}>
          {secao.sons.map((sound) => (
            <CardDeSom
              key={`${secao.id}:${sound.id}`}
              sound={sound}
              onTocar={() => onTocar(sound)}
              onMenu={(e) => onMenu(e, sound)}
            />
          ))}
          {secao.podeAdicionar &&
            (secao.sons.length >= MAX_SOUNDBOARD_POR_GUILD ? (
              // desabilitado: o servidor já está no teto — dizer isso aqui
              // poupa abrir o modal só para descobrir lá (ele mostra o mesmo
              // teto, ver `AdicionarSomModal`, mas só depois de escolher um
              // arquivo). `aria-disabled`, não o `disabled` nativo: no
              // Chromium um botão `disabled` não dispara evento de ponteiro
              // nenhum, e a dica do `Tooltip` sumiria com o mouse em cima —
              // o mesmo motivo documentado em `BotaoDeIcone` (item 8).
              <Tooltip rotulo={`Este servidor já tem ${MAX_SOUNDBOARD_POR_GUILD} sons`}>
                <button
                  type="button"
                  aria-disabled="true"
                  className="flex h-[40px] cursor-not-allowed items-center justify-center gap-[6px] rounded-[8px] border border-dashed border-border-subtle px-[8px] text-[13px] text-text-muted opacity-50"
                >
                  <Plus size={16} aria-hidden="true" />
                  Adicionar som
                </button>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={onAdicionar}
                className="flex h-[40px] items-center justify-center gap-[6px] rounded-[8px] border border-dashed border-border-normal px-[8px] text-[13px] text-text-muted transition hover:border-border-strong hover:text-text-default"
              >
                <Plus size={16} aria-hidden="true" />
                Adicionar som
              </button>
            ))}
        </div>
      )}
    </section>
  );
}

/**
 * Um card: 148×40, emoji e nome **centralizados** (é assim no print — a
 * primeira versão alinhava à esquerda).
 *
 * O menu de contexto é o caminho de favoritar e de remover — e não um ícone no
 * hover — porque num card deste tamanho um botão extra come o nome, que é a
 * única coisa que distingue um som do outro.
 */
function CardDeSom({
  sound,
  onTocar,
  onMenu,
}: {
  sound: SoundboardSound;
  onTocar: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <Tooltip rotulo={sound.name}>
      <button
        type="button"
        onClick={onTocar}
        onContextMenu={onMenu}
        className="flex h-[40px] min-w-0 items-center justify-center gap-[8px] rounded-[8px] bg-interactive-background-selected px-[8px] transition hover:bg-border-normal"
      >
        <span aria-hidden="true" className="shrink-0 text-[18px] leading-none">
          {sound.emoji || "🔊"}
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-text-strong">{sound.name}</span>
      </button>
    </Tooltip>
  );
}

/**
 * O mini-popover do deslizador, aberto pelo alto-falante ao lado da busca.
 * No print ele mede 199×76: título em semibold de 14 e um trilho de 4px com a
 * bolinha branca de 16 — sem trecho preenchido, o trilho é cinza inteiro
 * (`getpixel`: trilho #474851, bolinha #ffffff). O nosso tem os mesmos 199.
 *
 * A bolinha era `bg-paper` — o branco de MARCA (`#FDFDFB`, símbolo/wordmark),
 * nunca superfície nem texto de UI (`tailwind.config.ts`, comentário do
 * token). Virou `bg-white` (o `--white` `#ffffff` do próprio Discord, medido
 * no print), o mesmo token que `components/ui/controls.tsx` já usa no
 * polegar do range da barra de fala. E ganhou o anel de foco por teclado:
 * `type="range"` está fora das duas regras globais de `:focus-visible` do
 * `app/globals.css` (pensadas para quem substitui o nativo por um polegar
 * próprio; aqui o nativo é o controle visível), então sem isto o Tab parava
 * no trilho sem indicação nenhuma. `outline-border-focus`, como
 * `ScreenSharePicker`/`Tabs`/`Checkbox` já fazem.
 */
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
      largura={199}
    >
      {/* o `data-submenu-de-popover` é o que impede o painel de fechar junto
          quando o clique cai aqui dentro (ver `PopoverFlutuante`) */}
      <div data-submenu-de-popover className="py-[4px]">
        <p className="whitespace-nowrap text-[14px] font-semibold text-text-strong">
          Volume dos efeitos sonoros
        </p>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          aria-label="Volume dos efeitos sonoros"
          aria-valuetext={`${Math.round(volume * 100)}%`}
          onChange={(e) => definirVolume(Number(e.target.value) / 100)}
          className="mt-[12px] h-[4px] w-full cursor-pointer appearance-none rounded-full bg-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus [&::-moz-range-thumb]:h-[16px] [&::-moz-range-thumb]:w-[16px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:w-[16px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
      </div>
    </PopoverFlutuante>
  );
}
