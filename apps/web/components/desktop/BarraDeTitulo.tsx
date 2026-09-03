"use client";

import { useEffect, useState, type ReactNode } from "react";
import HeaderIcon from "@/components/chat/HeaderIcon";
import InboxPopover from "@/components/chat/InboxPopover";
import { Amigos, ArrowLeft, ArrowRight, Download, HelpCircle } from "@/components/ui/icones";
import Marca from "@/components/ui/Marca";
import Tooltip from "@/components/ui/Tooltip";
import { isTauri } from "@/lib/desktop";
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
 */
const ALTURA = 32;

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

  const titulo = useTitulo();
  const atualizacao = useAtualizacao();
  const maximizada = useMaximizada();

  async function janela(acao: "minimizar" | "alternar" | "fechar") {
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

  return (
    <>
      <header
        data-tauri-drag-region
        aria-label="Barra de título"
        style={{ height: ALTURA }}
        className="fixed inset-x-0 top-0 z-40 flex select-none items-center bg-rail text-txt-secondary"
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
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 px-64 text-sm font-semibold text-txt-primary"
          style={{ height: ALTURA }}
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center">{titulo.icone}</span>
          <span className="truncate">{titulo.nome}</span>
        </div>

        <div data-tauri-drag-region className="ml-auto flex h-full items-center">
          <div data-tauri-drag-region className="flex items-center gap-3 pr-4">
            <InboxPopover tamanhoDoIcone={19} />
            {/* sem central de ajuda no MVP: o mesmo botão da página Amigos */}
            <HeaderIcon label="Ajuda" disabled>
              <HelpCircle size={18} />
            </HeaderIcon>
            {atualizacao.estado === "disponivel" && (
              <BotaoDeAtualizacao atualizacao={atualizacao} />
            )}
          </div>

          {/* 1×20 no print, (34,34,37) sobre (18,18,20): +16 de contraste. O
              `border` sobre `rail` dá +31 — mais visível que o original */}
          <span aria-hidden="true" className="h-5 w-px bg-border" />

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
        </div>
      </header>
    </>
  );
}

// ── pedaços ────────────────────────────────────────────────────────────────

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
function Controle({
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
function useMaximizada(): boolean {
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
        <span className="grid h-4 w-4 place-items-center rounded-full bg-panel text-[8px] font-bold leading-none text-txt-secondary">
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
