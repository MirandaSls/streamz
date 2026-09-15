"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Window as JanelaNativa } from "@tauri-apps/api/window";
import HeaderIcon from "@/components/chat/HeaderIcon";
import InboxPopover from "@/components/chat/InboxPopover";
import { Amigos, ArrowLeft, ArrowRight, Download, HelpCircle } from "@/components/ui/icones";
import Marca from "@/components/ui/Marca";
import Tooltip from "@/components/ui/Tooltip";
import { bloquearMenuNativo, ehMacNoTauri, isTauri } from "@/lib/desktop";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { observar, useHistorico } from "@/stores/historico";
import { useUI } from "@/stores/ui";
import { useAtualizacao, type Atualizacao } from "./useAtualizacao";

/**
 * A barra de título do app de desktop — a do Discord, medida no print.
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
 * Medidas do print (`docs/Reference/Captura de tela 2026-09-02 142329.png`):
 * 32px de altura; setas de 14×10 a partir de x=21, com 24px de passo; título
 * de 14px semibold com ícone de 16px e 8px de folga, centrado na largura da
 * janela; ícones da direita com 36px de passo; separador de 1×20 a 7px do
 * primeiro controle; controles de 32px com 4px entre eles (glifo de 10×10),
 * o último encostado na borda.
 *
 * Os controles e as setas **não recebem foco pelo mouse** (`tabIndex={-1}` e
 * `preventDefault` no mousedown): clicar em "maximizar" deixava o anel verde
 * de foco aceso no botão, e o Discord não mostra nada — nem tooltip — nesses
 * botões. Caixa de entrada e ajuda continuam focáveis pelo teclado.
 *
 * **No macOS a moldura é nativa e os controles não são nossos.** Lá a janela
 * tem `decorations: true` + `titleBarStyle: "Overlay"` (`tauri.macos.conf.json`):
 * o conteúdo vai até o topo e o sistema desenha só os semáforos por cima, com
 * sombra, cantos e o gesto de tela cheia do verde. Esta barra continua
 * existindo — arrasto, setas, título, caixa de entrada —, mas não desenha
 * minimizar/maximizar/fechar e reserva à esquerda o espaço dos semáforos
 * ({@link ESPACO_DOS_SEMAFOROS}). O duplo clique na área de arrasto vem do
 * `drag.js` do Tauri 2.11, que no Mac age no *mouseup* e cancela se o ponteiro
 * andou, como a barra nativa. **Limitação conhecida:** ele sempre chama
 * `internal_toggle_maximize` (o zoom da janela) e não lê a preferência do
 * sistema (`AppleActionOnDoubleClick`) — quem escolheu "minimizar" ao dar duplo
 * clique na barra ganha zoom mesmo assim.
 *
 * O zoom do app (`body { zoom: var(--zoom) }`, `globals.css`) escala esta barra
 * junto com o resto, mas os semáforos são do AppKit e ficam parados em pontos.
 * Por isso, no Mac, a altura e a reserva são divididas pelo zoom (ver
 * {@link useZoomDoApp}): continuam medindo 32 e 78 pontos de verdade, e os
 * semáforos seguem centrados e com a folga certa. O conteúdo da barra (setas,
 * ícones, texto) continua escalando — só a moldura fica presa aos semáforos —,
 * então perto do zoom máximo os ícones encostam nas bordas da barra.
 */
export const ALTURA = 32;

/**
 * Onde os semáforos ficam: `trafficLightPosition` do `tauri.macos.conf.json`.
 * **Mudou lá, mude aqui** — a reserva abaixo é calculada destes números.
 *
 * O `y` do Tauri não é o topo do botão: o wry estica o contêiner da barra
 * nativa para `altura do botão + y` e deixa o botão onde estava dentro dele.
 * Medido no AppKit (macOS 13, o algoritmo do `inset_traffic_lights` do wry
 * 0.55.1 aplicado a uma `NSWindow` com a mesma máscara): o quadro do botão tem
 * 14×16, o círculo 12×12 no meio dele, e o topo do quadro cai em `y − 6`. Com
 * `y = 14` o círculo vai de 10 a 22 — centrado nos 32px desta barra. O `x = 9`
 * repete a regra da barra padrão do Mac (28px, círculo a 8px do topo e da
 * borda): 10px de margem em cima, 10px à esquerda (o quadro tem 1px de folga).
 */
export const POSICAO_DOS_SEMAFOROS = { x: 9, y: 14 } as const;

/**
 * Largura reservada à esquerda para os semáforos: 78px.
 *
 * Os três quadros andam de 20 em 20px, então o círculo do verde termina em
 * `x + 40 + 13` = 62. Daí para a direita a barra segue como se ali fosse a
 * borda da janela: os mesmos 16px do `pl-4` do Windows antes da primeira seta
 * — o espaço entre o verde e a seta fica igual ao entre a borda e a seta no
 * Windows, e as setas não parecem um quarto semáforo.
 */
export const ESPACO_DOS_SEMAFOROS = POSICAO_DOS_SEMAFOROS.x + 40 + 13 + 16;

export default function BarraDeTitulo() {
  // `isTauri()` só é verdadeiro no cliente: decidir no render inicial faria o
  // HTML estático divergir do hidratado
  const [desktop, setDesktop] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setDesktop(isTauri());
    setMac(ehMacNoTauri());
  }, []);
  // fora do Mac a barra escala com o app, como sempre escalou: não há nada
  // nativo com que ela precise se alinhar
  const zoom = useZoomDoApp(desktop && mac);
  const altura = ALTURA / zoom;

  useEffect(() => {
    if (!desktop) return;
    const raiz = document.documentElement;
    // o `padding-top` do `body` também passa pelo zoom: a variável tem de ser a
    // mesma altura em px CSS que o `<header>`, senão sobra (ou falta) uma faixa
    raiz.style.setProperty("--barra-de-titulo", `${altura}px`);
    return () => {
      raiz.style.removeProperty("--barra-de-titulo");
    };
  }, [desktop, altura]);

  if (!desktop) return null;
  return <Barra mac={mac} zoom={zoom} />;
}

function Barra({ mac, zoom }: { mac: boolean; zoom: number }) {
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
  const reserva = useReservaDosSemaforos(mac);
  const altura = ALTURA / zoom;

  return (
    <>
      <header
        data-tauri-drag-region
        aria-label="Barra de título"
        style={{ height: altura }}
        className="fixed inset-x-0 top-0 z-40 flex select-none items-center bg-panel text-txt-secondary"
      >
        {/* ← → : o histórico interno do app, esmaecidas quando não há para onde ir */}
        {/* no Mac o `paddingLeft` troca o `pl-4`: o padding é do próprio div, que
            é região de arrasto, então arrastar e dar duplo clique ao lado dos
            semáforos funciona como na barra nativa */}
        <div
          data-tauri-drag-region
          className="flex items-center pl-4"
          style={reserva ? { paddingLeft: reserva / zoom } : undefined}
        >
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
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 px-64 text-sm font-semibold text-txt-primary"
          style={{ height: altura }}
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center">{titulo.icone}</span>
          <span className="truncate">{titulo.nome}</span>
        </div>

        <div data-tauri-drag-region className="ml-auto flex h-full items-center">
          <div data-tauri-drag-region className="flex items-center gap-3 pr-4">
            {/* o anel do badge é o fundo da barra (`bg-panel`), não uma cor nova */}
            <InboxPopover tamanhoDoIcone={19} anelDaSuperficie="ring-panel" />
            {/* sem central de ajuda no MVP: o mesmo botão da página Amigos */}
            <HeaderIcon label="Ajuda" disabled>
              <HelpCircle size={18} />
            </HeaderIcon>
            {atualizacao.estado === "disponivel" && (
              <BotaoDeAtualizacao atualizacao={atualizacao} />
            )}
          </div>

          {/* no Mac quem minimiza, maximiza e fecha são os semáforos; sem os
              controles, o separador não separa nada e sai junto (o último ícone
              fica a 16px da borda pelo `pr-4` do grupo) */}
          {!mac && (
            <>
              {/* 1×20 no print, (34,34,37) sobre (18,18,20): +16 de contraste. O
                  `border` sobre `rail` dá +31 — mais visível que o original */}
              <span aria-hidden="true" className="h-5 w-px bg-border" />

              <ControlesDaJanela maximizada={maximizada} />
            </>
          )}
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
  // no print a seta apagada é a acesa a ~30% sobre o fundo da barra
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={!ativa}
      onClick={ativa ? onClick : undefined}
      onMouseDown={(e) => e.preventDefault()}
      tabIndex={-1}
      className={`grid h-6 w-6 place-items-center outline-none transition ${
        ativa ? "text-txt-secondary hover:text-txt-primary" : "cursor-default opacity-30"
      }`}
    >
      {children}
    </button>
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
        fechar ? "hover:bg-red hover:text-white" : "hover:bg-hov hover:text-txt-primary"
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
    <Tooltip label={rotulo} side="bottom">
      <button
        type="button"
        aria-label={rotulo}
        onClick={() => void atualizacao.abrir()}
        className="relative grid h-6 w-6 place-items-center text-green transition hover:opacity-80"
      >
        <Download size={15} />
      </button>
    </Tooltip>
  );
}

// ── estado ─────────────────────────────────────────────────────────────────

/** `true` enquanto a janela está maximizada (o ícone vira "restaurar"). */
export function useMaximizada(): boolean {
  return useLeituraDaJanela(true, lerMaximizada);
}

const lerMaximizada = (janela: JanelaNativa) => janela.isMaximized();
const lerTelaCheia = (janela: JanelaNativa) => janela.isFullscreen();

/**
 * Quanto a barra reserva à esquerda para os semáforos, em **pontos da tela**:
 * {@link ESPACO_DOS_SEMAFOROS} no Mac, 0 fora dele **e em tela cheia**. Em tela
 * cheia o macOS esconde os semáforos (eles descem junto com a barra de menus
 * quando o ponteiro encosta no topo, por cima do conteúdo), e a reserva viraria
 * um buraco de 78px antes das setas. Quem usa divide pelo zoom do app.
 *
 * O `onResized` é o sinal principal: o tao marca o estado de tela cheia no
 * `windowWillEnterFullScreen` e emite um `Resized` no fim da transição
 * (`windowDid{Enter,Exit}FullScreen`), então a leitura feita ali já enxerga o
 * valor final. `isFullscreen` está no `core:window:default`.
 */
export function useReservaDosSemaforos(mac: boolean): number {
  const telaCheia = useLeituraDaJanela(mac, lerTelaCheia);
  return mac && !telaCheia ? ESPACO_DOS_SEMAFOROS : 0;
}

/** Quanto esperar depois do último `Resized` para reler o estado (ms). */
const RELEITURA_DEPOIS_DO_RESIZE = 300;

/**
 * Um booleano da janela nativa (maximizada, tela cheia), relido a cada
 * `onResized`. `false` enquanto `ativo` é falso ou a leitura não é permitida.
 *
 * **Só a leitura mais recente vale.** Arrastar a borda ou a animação de tela
 * cheia disparam uma rajada de `Resized`, cada um com a sua ida e volta pelo
 * IPC, e nada garante que as respostas voltem na ordem: um `true` atrasado de
 * antes de sair da tela cheia chegava depois do `false` e prendia o estado. O
 * contador de geração descarta toda resposta que não seja a do último pedido.
 *
 * Duas releituras a mais cobrem o que não gera `Resized`: uma logo depois do
 * último evento da rajada (se a última resposta falhou, ninguém corrigiria) e
 * outra a cada troca de foco — o `windowDidFailToEnterFullScreen` do tao desfaz
 * o estado de tela cheia sem emitir `Resized`, e uma tentativa de tela cheia
 * que falha costuma vir com a janela perdendo ou ganhando foco. Não é garantia:
 * sem evento nenhum, o valor errado fica até o próximo `Resized`.
 */
function useLeituraDaJanela(
  ativo: boolean,
  ler: (janela: JanelaNativa) => Promise<boolean>,
): boolean {
  const [valor, setValor] = useState(false);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let geracao = 0;
    let releitura: number | undefined;
    const paradas: (() => void)[] = [];
    // o desligar pode chegar no meio dos `await`: quem se inscreve depois dele
    // se desinscreve na hora
    const guardar = (parar: () => void) => {
      if (vivo) paradas.push(parar);
      else parar();
    };
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const janela = getCurrentWindow();
        const reler = async () => {
          const esta = ++geracao;
          try {
            const lido = await ler(janela);
            if (vivo && esta === geracao) setValor(lido);
          } catch {
            // sem permissão de leitura o valor fica como estava; nada quebra
          }
        };
        await reler();
        guardar(
          await janela.onResized(() => {
            void reler();
            window.clearTimeout(releitura);
            releitura = window.setTimeout(() => void reler(), RELEITURA_DEPOIS_DO_RESIZE);
          }),
        );
        guardar(await janela.onFocusChanged(() => void reler()));
      } catch {
        // sem os eventos fica a primeira leitura (ou `false`): no Windows o
        // ícone fica em "maximizar"; no Mac a reserva fica sempre ligada — em
        // tela cheia sobra um espaço, mas nada fica embaixo dos semáforos
      }
    })();
    return () => {
      vivo = false;
      window.clearTimeout(releitura);
      for (const parar of paradas.splice(0)) parar();
    };
  }, [ativo, ler]);
  return ativo && valor;
}

/**
 * O zoom do app (`--zoom`, que `stores/settings` escreve no `<html>`), ou `1`
 * quando `ativo` é falso.
 *
 * Lido da variável, e não do `useSettings`, por dois motivos: é exatamente o
 * número que o CSS está usando (já limitado a `ZOOM.min`–`ZOOM.max`), e a
 * barra mínima das telas sem sessão não arrasta a store inteira para dentro só
 * para saber um fator. O `MutationObserver` no `style` do `<html>` acompanha
 * Ctrl+= / Ctrl+- e o controle das configurações; ele também dispara quando
 * esta própria barra escreve `--barra-de-titulo`, e aí o valor lido é o mesmo e
 * o React não renderiza de novo.
 */
export function useZoomDoApp(ativo: boolean): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!ativo || typeof MutationObserver === "undefined") return;
    const raiz = document.documentElement;
    const ler = () => {
      const lido = Number.parseFloat(raiz.style.getPropertyValue("--zoom"));
      setZoom(Number.isFinite(lido) && lido > 0 ? lido : 1);
    };
    ler();
    const observador = new MutationObserver(ler);
    observador.observe(raiz, { attributes: true, attributeFilter: ["style"] });
    return () => observador.disconnect();
  }, [ativo]);
  return ativo ? zoom : 1;
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
        <span className="grid h-4 w-4 place-items-center rounded-full bg-hov text-[8px] font-bold leading-none text-txt-secondary">
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
