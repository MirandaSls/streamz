"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Settings } from "@/components/ui/icones";
import { colocar, SUBMENU_DELAY } from "@/components/ui/ContextMenu";
import { SliderDeVolume } from "@/components/voice/pecas-de-voz";
import { ui } from "@/stores/ui";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import { explicarMidia, nomeEscolhido, opcoesDe, useVoiceDevices } from "@/stores/voiceDevices";

/**
 * O que a setinha do microfone e a do fone abrem, no painel do usuário.
 *
 * **Não é uma lista de aparelhos.** Era, e estava errado: no print a seta abre
 * um menu curto — o aparelho atual (que leva à lista), o ajuste que se mexe com
 * mais frequência, e a porta para as configurações de voz. A lista crua obriga
 * a ler dez nomes de driver para descobrir qual está valendo agora, que é
 * justamente a pergunta que se faz ao clicar ali.
 *
 * ## O submenu abre AO LADO, e abre no hover
 *
 * A lista já entrou **no lugar** do menu, com um cabeçalho de "‹ voltar" (print
 * `2026-09-03 191339`). Duas queixas mataram esse desenho: o menu-pai sumia
 * (não dava para ver o que se estava trocando) e trocar de microfone exigia
 * três cliques. Agora é o que o Discord faz e o que o nosso próprio
 * `ContextMenu` já fazia no menu de silenciar: o submenu nasce colado à direita
 * do item, o menu-pai continua na tela com o item aceso, e passar o mouse por
 * cima basta — a mesma pausa de `SUBMENU_DELAY` do `ContextMenu`, para
 * atravessar o menu a caminho de outro item não disparar nada. Clique e seta →
 * continuam abrindo, seta ← e Esc fecham.
 *
 * Sem cabeçalho no submenu: ele é uma lista de escolhas com a marca (✓) na que
 * vale, porque o título já está no item que ficou aceso ao lado.
 *
 * **Medidas.** Não há print do Discord com este menu aberto em
 * `docs/Reference` (procurados os de 2026-09-02 15:xx–18:xx e os de 09-03), e
 * por isso as medidas são as do próprio app: caixa de 288 (medida nos prints
 * `191405`, `191402`, `191339` e `191344`: x 206..493 e 261..548, 288 de
 * largura em todos), linha de 35px (bg do selecionado em `191339`, y 235..269),
 * respiro de 6 (`p-1.5`) — e do `ContextMenu`, os 4px de sobreposição do
 * submenu sobre o item e o espelhamento na borda da janela.
 */

/**
 * Largura da caixa. Fica aqui porque é a mesma do submenu, e o `UserFooter`
 * passa esta constante ao `PopoverFlutuante` em vez de repetir o número.
 */
export const LARGURA_DO_MENU_DE_AUDIO = 288;

/** `p-1.5` da caixa: o primeiro item do submenu alinha com o item do pai. */
const RESPIRO = 6;
/** o submenu monta em cima da borda do item, como no `ContextMenu`. */
const SOBREPOSICAO = 4;

const RUIDO: Record<NivelDeRuido, string> = {
  off: "Desligada",
  padrao: "Padrão",
  avancada: "Avançada",
};

/* ------------------------------------------------------------------ */
/* Submenu                                                             */
/* ------------------------------------------------------------------ */

/** Qual submenu está aberto e em que item ele está pendurado. */
interface Submenus {
  aberto: string | null;
  ancora: DOMRect | null;
  /** agenda abrir (chave) ou fechar (null) depois da pausa. */
  agendar: (chave: string | null, el: HTMLElement | null) => void;
  /** abre na hora — clique e seta → não esperam pausa nenhuma. */
  abrir: (chave: string, el: HTMLElement) => void;
  /** cancela o fechamento agendado (o ponteiro entrou no submenu). */
  segurar: () => void;
  fechar: () => void;
}

function useSubmenus(): Submenus {
  const [aberto, setAberto] = useState<string | null>(null);
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const agendar = useCallback((chave: string | null, el: HTMLElement | null) => {
    window.clearTimeout(timer.current);
    // o retângulo é lido AGORA: dentro do timeout o React já pode ter trocado
    // o elemento por outro, e a caixa nasceria no lugar errado
    const r = el?.getBoundingClientRect() ?? null;
    timer.current = window.setTimeout(() => {
      if (chave === null || !r) {
        setAberto(null);
        return;
      }
      setAncora(r);
      setAberto(chave);
    }, SUBMENU_DELAY);
  }, []);

  const abrir = useCallback((chave: string, el: HTMLElement) => {
    window.clearTimeout(timer.current);
    setAncora(el.getBoundingClientRect());
    setAberto(chave);
  }, []);

  const segurar = useCallback(() => window.clearTimeout(timer.current), []);

  const fechar = useCallback(() => {
    window.clearTimeout(timer.current);
    setAberto(null);
  }, []);

  return { aberto, ancora, agendar, abrir, segurar, fechar };
}

/**
 * A caixa do submenu, em portal e presa à janela.
 *
 * Em portal pelo mesmo motivo do `PopoverFlutuante`: dentro da caixa-mãe ela
 * seria cortada pelo `overflow` e, durante os 0,12s do `anim-menu` (que anima
 * `transform`), um filho `fixed` ficaria preso ao pai transformado e apareceria
 * fora de lugar. O `data-submenu-de-popover` é o que impede o popover-mãe de
 * ler um clique aqui dentro como "clique fora" e se fechar antes do clique
 * chegar ao item.
 */
function Submenu({
  ancora,
  rotulo,
  autoFoco,
  onFechar,
  onSegurar,
  children,
}: {
  ancora: DOMRect;
  rotulo: string;
  /** aberto pelo teclado: o foco entra, senão a seta → não levaria a lugar nenhum. */
  autoFoco: boolean;
  onFechar: () => void;
  onSegurar: () => void;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; origem: string } | null>(null);

  useEffect(() => {
    if (!autoFoco) return;
    caixa.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [autoFoco]);

  useLayoutEffect(() => {
    const h = caixa.current?.offsetHeight ?? 0;
    setPos(
      colocar(
        ancora.right - SOBREPOSICAO,
        ancora.top - RESPIRO,
        LARGURA_DO_MENU_DE_AUDIO,
        h,
        ancora.left + SOBREPOSICAO,
      ),
    );
  }, [ancora]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={caixa}
      data-submenu-de-popover=""
      role="menu"
      aria-label={rotulo}
      onPointerEnter={onSegurar}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onFechar();
          return;
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const alvos = Array.from(
          caixa.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        if (alvos.length === 0) return;
        const i = alvos.indexOf(document.activeElement as HTMLButtonElement);
        const passo = e.key === "ArrowDown" ? 1 : -1;
        alvos[(i + passo + alvos.length) % alvos.length]?.focus();
      }}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        width: LARGURA_DO_MENU_DE_AUDIO,
        transformOrigin: pos?.origem ?? "left top",
        visibility: pos ? "visible" : "hidden",
      }}
      className="anim-menu fixed z-[95] rounded-lg bg-overlay p-1.5 shadow-high"
    >
      {children}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Peças do menu                                                       */
/* ------------------------------------------------------------------ */

/** Linha de menu que abre um submenu: título, o valor atual embaixo e a seta. */
function LinhaComSubmenu({
  chave,
  titulo,
  valor,
  ctrl,
  children,
}: {
  chave: string;
  titulo: string;
  valor: string;
  ctrl: Submenus;
  children: ReactNode;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const porTeclado = useRef(false);
  const aberto = ctrl.aberto === chave;

  return (
    <>
      <button
        ref={botao}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onPointerEnter={(e) => {
          porTeclado.current = false;
          ctrl.agendar(chave, e.currentTarget);
        }}
        // clique **abre**, nunca fecha: com o hover abrindo, um clique que
        // alternasse fecharia a caixa embaixo do ponteiro que a chamou
        onClick={(e) => {
          porTeclado.current = false;
          ctrl.abrir(chave, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight") return;
          e.preventDefault();
          porTeclado.current = true;
          ctrl.abrir(chave, e.currentTarget);
        }}
        className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left transition ${
          aberto ? "bg-hov" : "hover:bg-hov"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-txt-primary">{titulo}</span>
          <span className="block truncate text-xs text-txt-muted">{valor}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-txt-muted" aria-hidden="true" />
      </button>
      {aberto && ctrl.ancora && (
        <Submenu
          ancora={ctrl.ancora}
          rotulo={titulo}
          autoFoco={porTeclado.current}
          onSegurar={ctrl.segurar}
          onFechar={() => {
            ctrl.fechar();
            botao.current?.focus();
          }}
        >
          {children}
        </Submenu>
      )}
    </>
  );
}

/** Uma escolha do submenu, com a marca na que vale. */
function Escolha({
  rotulo,
  marcada,
  onSelect,
}: {
  rotulo: string;
  marcada: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={marcada}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm transition ${
        marcada ? "bg-sel text-txt-primary" : "text-txt-normal hover:bg-hov"
      }`}
    >
      <span aria-hidden="true" className="grid h-4 w-4 shrink-0 place-items-center">
        {marcada && <Check size={16} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
    </button>
  );
}

/** Recado de rodapé do submenu (sem permissão, sem `setSinkId`…). */
function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="px-2 pb-1 pt-2 text-xs text-txt-muted">{texto}</p>;
}

function AtalhoDeConfiguracoes({ ctrl }: { ctrl: Submenus }) {
  return (
    <>
      <div aria-hidden="true" className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        // passar por aqui fecha o submenu que estiver aberto: é o mesmo gesto
        // de "sair do item" que o `ContextMenu` já trata
        onPointerEnter={() => ctrl.agendar(null, null)}
        onClick={() => ui.openModal({ kind: "settings", tab: "voz" })}
        className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-txt-normal transition hover:bg-hov hover:text-txt-primary"
      >
        <Settings size={16} className="shrink-0" aria-hidden="true" />
        Configurações de voz
      </button>
    </>
  );
}

/** A lista "Padrão do sistema + aparelhos", que é igual nos dois menus. */
function ListaDeAparelhos({
  opcoes,
  atual,
  onEscolher,
  aviso,
}: {
  opcoes: { id: string; nome: string }[];
  atual: string | null;
  onEscolher: (id: string | null) => void;
  aviso: string | null;
}) {
  return (
    <>
      <Escolha
        rotulo="Padrão do sistema"
        marcada={atual === null}
        onSelect={() => onEscolher(null)}
      />
      {opcoes.map((o) => (
        <Escolha
          key={o.id}
          rotulo={o.nome}
          marcada={atual === o.id}
          onSelect={() => onEscolher(o.id)}
        />
      ))}
      <Aviso texto={aviso} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Os dois menus                                                       */
/* ------------------------------------------------------------------ */

/**
 * Menu do microfone.
 *
 * O **volume de entrada** entra agora: o ganho existe de verdade (um `GainNode`
 * depois do supressor, em `lib/supressor-ruido.ts`) e mexe no volume da faixa
 * publicada na hora, sem republicar nada. Enquanto ele era só um número
 * guardado, ficava de fora — um controle morto no caminho mais usado é pior que
 * um controle a menos.
 *
 * Ele é o mesmo `SliderDeVolume` do "Volume de saída" do menu do fone, com a
 * mesma escala de 0 a 200%. O print do Discord (`2026-09-03 202542`) mostra o
 * dele com o cursor no fim de uma escala de 0 a 100 — a nossa vai a 200 porque
 * é a escala que o app já usa nos dois lugares onde este mesmo `audio.entrada`
 * aparece (aqui e na aba de voz), e porque microfone baixo demais é o problema
 * comum: cortar o reforço deixaria o slider sem a metade útil.
 */
export function MenuDeEntrada() {
  const devices = useVoiceDevices();
  const ctrl = useSubmenus();
  const processamento = useVoice((s) => s.audio.processamento);
  const entrada = useVoice((s) => s.audio.entrada);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const aviso = explicarMidia(devices.motivo);

  return (
    <>
      <LinhaComSubmenu
        chave="aparelho"
        titulo="Dispositivo de entrada"
        valor={nomeEscolhido(devices.inputs, devices.inputId, "Microfone")}
        ctrl={ctrl}
      >
        <ListaDeAparelhos
          opcoes={opcoesDe(devices.inputs, "Microfone")}
          atual={devices.inputId}
          onEscolher={devices.setInput}
          aviso={aviso}
        />
      </LinhaComSubmenu>

      <LinhaComSubmenu
        chave="ruido"
        titulo="Redução de ruído"
        valor={RUIDO[processamento.ruido]}
        ctrl={ctrl}
      >
        {(["off", "padrao", "avancada"] as NivelDeRuido[]).map((nivel) => (
          <Escolha
            key={nivel}
            rotulo={RUIDO[nivel]}
            marcada={processamento.ruido === nivel}
            onSelect={() => setAudioPref({ processamento: { ...processamento, ruido: nivel } })}
          />
        ))}
      </LinhaComSubmenu>

      <div className="px-2 py-2" onPointerEnter={() => ctrl.agendar(null, null)}>
        <SliderDeVolume
          label="Volume de entrada"
          valor={entrada}
          onChange={(v) => setAudioPref({ entrada: v })}
        />
      </div>

      <AtalhoDeConfiguracoes ctrl={ctrl} />
    </>
  );
}

/** Menu do fone: aparelho de saída e o volume geral, que este sim vale. */
export function MenuDeSaida() {
  const devices = useVoiceDevices();
  const ctrl = useSubmenus();
  const saida = useVoice((s) => s.audio.saida);
  const setAudioPref = useVoice((s) => s.setAudioPref);
  const aviso = devices.saidaSelecionavel
    ? explicarMidia(devices.motivo)
    : // Firefox antigo e Safari não têm `setSinkId`: a lista existiria só para
      // desobedecer. Dizer isso é melhor que uma escolha que não sai do lugar.
      "Este navegador não deixa escolher a saída de áudio: o som vai sempre para o aparelho padrão do sistema.";

  return (
    <>
      <LinhaComSubmenu
        chave="aparelho"
        titulo="Dispositivo de saída"
        valor={nomeEscolhido(devices.outputs, devices.outputId, "Saída")}
        ctrl={ctrl}
      >
        <ListaDeAparelhos
          opcoes={devices.saidaSelecionavel ? opcoesDe(devices.outputs, "Saída") : []}
          atual={devices.outputId}
          onEscolher={devices.setOutput}
          aviso={aviso}
        />
      </LinhaComSubmenu>

      <div className="px-2 py-2" onPointerEnter={() => ctrl.agendar(null, null)}>
        <SliderDeVolume
          label="Volume de saída"
          valor={saida}
          onChange={(v) => setAudioPref({ saida: v })}
        />
      </div>

      <AtalhoDeConfiguracoes ctrl={ctrl} />
    </>
  );
}
