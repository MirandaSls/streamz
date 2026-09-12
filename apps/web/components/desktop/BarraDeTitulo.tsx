"use client";

import { useEffect, useState, type ReactNode } from "react";
import InboxPopover from "@/components/chat/InboxPopover";
import { Amigos, ArrowLeft, ArrowRight, Download, HelpCircle } from "@/components/ui/icones";
import Marca from "@/components/ui/Marca";
import { BotaoDeIcone, Divider, Tooltip } from "@/components/ui/primitivos";
import { bloquearMenuNativo, isTauri } from "@/lib/desktop";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { observar, useHistorico } from "@/stores/historico";
import { useUI } from "@/stores/ui";
import { useAtualizacao, type Atualizacao } from "./useAtualizacao";

/**
 * A barra de título do app de desktop — a do Discord, redesenhada com os
 * primitivos (cartão 1a-barra-de-titulo, onda 1) sobre a medida que já
 * existia neste arquivo.
 *
 * A janela abre sem a decoração nativa (`decorations: false` no
 * `tauri.conf.json`), e esta barra assume o que ela fazia: arrastar, duplo
 * clique para maximizar, e os três controles. Por cima disso vai o que o
 * Discord põe na barra: as setas do histórico à esquerda, o nome da tela no
 * centro, e caixa de entrada, ajuda e a atualização à direita.
 *
 * Só existe dentro do Tauri. No navegador o componente devolve `null` e nada
 * muda — nem a altura do shell, que aqui é descontada pela variável
 * `--barra-de-titulo` que o `<html>` recebe (ver `globals.css`).
 *
 * Medidas (print 1:1 `docs/Reference/Captura de tela 2026-09-02 142329.png`,
 * 1919×1079 — este print É o Discord real, não o nosso app; conferido de
 * novo pixel a pixel nesta rodada):
 *
 * - **Altura 32px**: `--custom-app-top-bar-height` (VARIAVEIS.md, "layout do
 *   app") **e** `coluna x=700 y0-40` → `0–31 #121214`, borda em `32 #222225`.
 * - **Fundo `--background-base-lowest`**: mesma linha do VARIAVEIS.md
 *   (`.titleBar__0bd4a`/`.bg__960e4`) + pixel `#121214` = o valor exato do
 *   token em `tokens.css`.
 * - **Raio dos itens 6px**: `--custom-app-top-bar-item-radius` (VARIAVEIS.md)
 *   — é literalmente o raio `sm` do `BotaoDeIcone` (`rounded-md`), o que deu
 *   a pista de usar o primitivo aqui em vez da caixa desenhada à mão.
 * - **Setas**: glifo de ~14×10 a partir de x=21, passo de 24px (`linha y=16
 *   x0=0 x1=200`) — bate com `BotaoDeIcone tamanho="sm"` (caixa 24px) com
 *   `pl-4` (16px) antes da primeira. Cor de repouso: neste print as duas
 *   setas estão **desabilitadas** (tela sem histórico) e amostram `#404044`;
 *   isso é `--text-subtle`/`--icon-subtle` (`#abacb2`) a **30% sobre o fundo**
 *   — a conta bate (`18+(171-18)*0.3≈64`) e não os 50% que o `desabilitado`
 *   do primitivo aplica, por isso o cinza aqui é `className="opacity-30"`
 *   próprio, não a prop `desabilitado`. `--interactive-text-default` (família
 *   `fundo="hover"` do primitivo) é numericamente igual a `--icon-subtle`
 *   (`#abacb2`) e o hover dela (`#fbfbfb`) bate com `--text-strong` — por
 *   isso a família escolhida foi `hover`, não `nenhum` (que resolveria
 *   `--icon-muted`, mais escuro do que a seta medida). A caixa de fundo no
 *   hover em si **não tem print que confirme** (a tela não tem um hover
 *   registrado) — ver `nao_verificado`.
 * - **Título**: ícone 16px + `gap-2` (8px), `text-text-sm` (14px, a classe do
 *   `design.md`, não o `text-sm` cru do Tailwind) `font-semibold`
 *   `text-text-strong`, centrado na **largura da janela inteira**
 *   (`inset-x-0`), não no espaço que sobra: o centro do bloco ícone+texto no
 *   print cai em x≈960, e `1919/2≈959,5` — confirma que é `absolute
 *   inset-x-0`, não `flex-1` no meio dos dois lados.
 * - **Ícones da direita**: `gap-3` (12px) entre caixas de 24px dá passo de
 *   36px, centro a centro — confere com a distância entre os glifos da caixa
 *   de entrada e da ajuda no print. "Ajuda" agora é `BotaoDeIcone` (era
 *   `HeaderIcon`, que este arquivo não precisa mais desenhar sozinho); a cor
 *   de repouso medida no "?" do print é `#96979e` = `--icon-muted`, o que a
 *   família `fundo="nenhum"` já resolve.
 * - **Separador**: 1×20 (`coluna x=1807 y0-32` → miolo `#222225` de y=6 a
 *   y=25), 7px depois dele até o primeiro controle — virou `Divider
 *   orientacao="vertical" className="h-5"` (a própria receita do primitivo
 *   para a toolbar do Discord), sem mudar pixel.
 * - **Controles**: 32px de largura, 4px entre eles, o último encostado na
 *   borda da janela — `separador (x=1808) + 7 = 1815` de início do primeiro;
 *   `1815+32+4+32+4=1887` de início do terceiro, centro em `1887+16=1903`,
 *   e o glifo do "fechar" mede exatamente aí no print. Continuam **fora**
 *   do `BotaoDeIcone` de propósito: o primitivo sempre
 *   aplica um raio (não existe "sem raio", e o de Windows é quadrado) e não
 *   tem uma família de "fundo sólido só no hover" (o fechar precisa de
 *   `bg-status-danger` cheio, não do cinza translúcido de
 *   `--interactive-background-hover`) — ver `faltando`.
 *
 * Os controles e as setas **não recebem foco pelo mouse** (`tabIndex={-1}` e
 * `preventDefault` no mousedown): clicar em "maximizar" deixava o anel verde
 * de foco aceso no botão, e o Discord não mostra nada — nem tooltip — nesses
 * botões (por isso as setas usam `semDica` no `BotaoDeIcone`, e o próprio
 * `aria-disabled`/`onMouseDown` continuam passando pelas props que sobram do
 * primitivo). Caixa de entrada e ajuda continuam focáveis pelo teclado.
 */
export const ALTURA = 32;

export default function BarraDeTitulo() {
  // `isTauri()` só é verdadeiro no cliente: decidir no render inicial faria o
  // HTML estático divergir do hidratado
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(isTauri());
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const raiz = document.documentElement;
    raiz.style.setProperty("--barra-de-titulo", `${ALTURA}px`);
    return () => {
      raiz.style.removeProperty("--barra-de-titulo");
    };
  }, [desktop]);

  if (!desktop) return null;
  return <Barra />;
}

function Barra() {
  const podeVoltar = useHistorico((s) => s.podeVoltar);
  const podeAvancar = useHistorico((s) => s.podeAvancar);
  const voltar = useHistorico((s) => s.voltar);
  const avancar = useHistorico((s) => s.avancar);
  useEffect(() => observar(), []);
  // o menu nativo do WebView2 (Voltar/Recarregar/Inspecionar) não existe no Discord
  useEffect(() => bloquearMenuNativo(), []);

  const titulo = useTitulo();
  const atualizacao = useAtualizacao();
  const maximizada = useMaximizada();


  return (
    <>
      <header
        data-tauri-drag-region
        aria-label="Barra de título"
        style={{ height: ALTURA }}
        className="fixed inset-x-0 top-0 z-40 flex select-none items-center bg-background-base-lowest text-text-subtle"
      >
        {/* ← → : o histórico interno do app, esmaecidas quando não há para onde ir */}
        <div data-tauri-drag-region className="flex items-center pl-4">
          <Seta label="Voltar" ativa={podeVoltar} onClick={() => void voltar()}>
            <ArrowLeft size={16} />
          </Seta>
          <Seta label="Avançar" ativa={podeAvancar} onClick={() => void avancar()}>
            <ArrowRight size={16} />
          </Seta>
        </div>

        {/* o título é centrado na janela, não no espaço que sobra; e não recebe
            clique, para o arrasto passar por ele */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 px-64 text-text-sm font-semibold text-text-strong"
          style={{ height: ALTURA }}
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center">{titulo.icone}</span>
          <span className="truncate">{titulo.nome}</span>
        </div>

        <div data-tauri-drag-region className="ml-auto flex h-full items-center">
          <div data-tauri-drag-region className="flex items-center gap-3 pr-4">
            {/* o anel do badge é o fundo da barra (`bg-background-base-lowest`), não uma cor nova */}
            <InboxPopover tamanhoDoIcone={19} anelDaSuperficie="ring-background-base-lowest" />
            {/* sem central de ajuda no MVP: `fundo="nenhum"` porque o "?" do
                print amostra `--icon-muted`, sem caixa em nenhum estado */}
            <BotaoDeIcone
              rotulo="Ajuda"
              icone={<HelpCircle size={18} />}
              tamanho="sm"
              fundo="nenhum"
              ladoDaDica="bottom"
              desabilitado
              motivoDesabilitado="Ajuda (em breve)"
            />
            {atualizacao.estado === "disponivel" && (
              <BotaoDeAtualizacao atualizacao={atualizacao} />
            )}
          </div>

          {/* receita do próprio Divider para a toolbar do Discord: 1×20 */}
          <Divider orientacao="vertical" className="h-5" />

          <ControlesDaJanela maximizada={maximizada} />
        </div>
      </header>
    </>
  );
}

// ── pedaços ────────────────────────────────────────────────────────────────

/** Minimizar, maximizar/restaurar ou fechar a janela do Tauri. */
export async function janela(acao: "minimizar" | "alternar" | "fechar") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const atual = getCurrentWindow();
    if (acao === "minimizar") await atual.minimize();
    else if (acao === "alternar") await atual.toggleMaximize();
    else await atual.close();
  } catch {
    // sem a permissão certa a chamada rejeita; a barra não pode derrubar o app
  }
}

/** Os três controles da janela, à direita da barra (Windows). */
export function ControlesDaJanela({ maximizada }: { maximizada: boolean }) {
  return (
    <div data-tauri-drag-region className="ml-[7px] flex h-full items-center gap-1">
      <Controle label="Minimizar" onClick={() => void janela("minimizar")}>
        <path d="M0 5.5H10" />
      </Controle>
      <Controle
        label={maximizada ? "Restaurar" : "Maximizar"}
        onClick={() => void janela("alternar")}
      >
        {maximizada ? (
          <>
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
            <rect x="0.5" y="2.5" width="7" height="7" />
          </>
        ) : (
          <rect x="0.5" y="0.5" width="9" height="9" />
        )}
      </Controle>
      <Controle label="Fechar" fechar onClick={() => void janela("fechar")}>
        <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" />
      </Controle>
    </div>
  );
}

function Seta({
  label,
  ativa,
  onClick,
  children,
}: {
  label: string;
  ativa: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  // `fundo="hover"` resolve `--interactive-text-default` (= `--icon-subtle`,
  // a cor medida da seta acesa) e `--interactive-text-hover` (= `--text-strong`,
  // a cor medida no hover); "sm" dá a caixa de 24px e o raio de 6px do
  // `--custom-app-top-bar-item-radius`. `pointer-events-none` some com o
  // hover inteiro no estado apagado — sem isso a classe `opacity-30` sozinha
  // deixaria o botão claro de novo ao passar o mouse (ver cabeçalho do
  // arquivo: no print a seta apagada é a acesa a ~30% sobre o fundo da barra,
  // e não os 50% do `desabilitado` do primitivo).
  return (
    <BotaoDeIcone
      rotulo={label}
      icone={children}
      tamanho="sm"
      fundo="hover"
      semDica
      aria-disabled={!ativa}
      onClick={ativa ? onClick : undefined}
      onMouseDown={(e) => e.preventDefault()}
      tabIndex={-1}
      className={ativa ? undefined : "pointer-events-none opacity-30"}
    />
  );
}

/** Um dos três controles da janela: 32px de largura pela altura da barra. */
export function Controle({
  label,
  fechar = false,
  onClick,
  children,
}: {
  label: string;
  /** o fechar fica vermelho no hover, como em toda janela do Windows. */
  fechar?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      tabIndex={-1}
      className={`grid h-full w-8 place-items-center outline-none transition ${
        fechar
          ? "hover:bg-status-danger hover:text-control-critical-primary-text-default"
          : "hover:bg-interactive-background-hover hover:text-text-strong"
      }`}
    >
      <svg
        width={10}
        height={10}
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * A setinha verde: só aparece quando há versão nova, e o clique **troca o app
 * pela janelinha** — a principal se esconde e a `JanelaSplash` baixa e instala
 * no lugar dela, do mesmo jeito que na abertura. Antes disso, o clique abria
 * uma tela cheia dentro do app; o app inteiro ficava atrás de uma tela que não
 * dava para usar, e o Discord não faz isso.
 *
 * Não há progresso aqui: quem mostra o download é a janelinha, e enquanto ela
 * está no ar esta barra nem está na tela.
 */
function BotaoDeAtualizacao({ atualizacao }: { atualizacao: Atualizacao }) {
  const rotulo = `Atualização disponível: v${atualizacao.versao ?? "?"}`;
  return (
    <Tooltip rotulo={rotulo} lado="bottom">
      <button
        type="button"
        aria-label={rotulo}
        onClick={() => void atualizacao.abrir()}
        className="relative grid h-6 w-6 place-items-center text-status-positive transition hover:opacity-80"
      >
        <Download size={15} />
      </button>
    </Tooltip>
  );
}

// ── estado ─────────────────────────────────────────────────────────────────

/** `true` enquanto a janela está maximizada (o ícone vira "restaurar"). */
export function useMaximizada(): boolean {
  const [maximizada, setMaximizada] = useState(false);
  useEffect(() => {
    let vivo = true;
    let parar: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const janela = getCurrentWindow();
        const ler = async () => {
          const valor = await janela.isMaximized();
          if (vivo) setMaximizada(valor);
        };
        await ler();
        const cancelar = await janela.onResized(() => void ler());
        if (vivo) parar = cancelar;
        else cancelar();
      } catch {
        // sem permissão de leitura o ícone fica em "maximizar"; nada quebra
      }
    })();
    return () => {
      vivo = false;
      parar?.();
    };
  }, []);
  return maximizada;
}

/** Sigla de servidor sem ícone — a mesma regra do rail. */
function sigla(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Ícone + nome da tela aberta, como o Discord escreve no centro da barra. */
function useTitulo(): { icone: ReactNode; nome: string } {
  const view = useUI((s) => s.view);
  const amigosAberto = useFriends((s) => s.open);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === s.activeGuildId) ?? null);

  if (view === "guild" && guild) {
    return {
      nome: guild.name,
      icone: guild.iconUrl ? (
        // o ícone é servido pelo proxy público da API; a sigla é o fallback
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={guild.iconUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
      ) : (
        <span className="grid h-4 w-4 place-items-center rounded-full bg-interactive-background-hover text-[8px] font-bold leading-none text-text-subtle">
          {sigla(guild.name)}
        </span>
      ),
    };
  }
  if (view === "dm" && amigosAberto) {
    return { nome: "Amigos", icone: <Amigos size={16} /> };
  }
  // o Discord escreve "Mensagens diretas" com o logo dele; aqui vai a nossa marca
  return { nome: "Mensagens diretas", icone: <Marca size={15} /> };
}
