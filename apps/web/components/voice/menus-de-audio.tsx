"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as KeyboardEventDoReact,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronRight, Headphones, Mic, Monitor, Settings } from "@/components/ui/icones";
import { SUBMENU_DELAY } from "@/components/ui/ContextMenu";
import { Popout } from "@/components/ui/primitivos/Popout";
import { MedidorSegmentado, SliderDeVolume } from "@/components/voice/pecas-de-voz";
import { useNivelDoMicrofone } from "@/components/voice/useNivelDoMicrofone";
import { useSistemaDeAudio, type SistemaDeAudio } from "@/lib/microfone";
import { ui } from "@/stores/ui";
import { useVoice, type NivelDeRuido } from "@/stores/voice";
import {
  escolhaDeSaida,
  explicarMidia,
  nomeEscolhido,
  opcoesDe,
  useVoiceDevices,
} from "@/stores/voiceDevices";

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
 * Sem cabeçalho no submenu: ele é uma lista de escolhas com um rádio à direita
 * (círculo cheio no accent com ponto `accent-ink` na escolhida, borda de 2px na
 * outra), porque o título já está no item que ficou aceso ao lado.
 *
 * **Medidas.** Vêm dos prints reais do Discord (menu do microfone com o submenu
 * de dispositivos, o de "Perfil de entrada" e o do fone). Caixa do menu-pai e do
 * submenu de dispositivos têm a MESMA largura, ~1,63x o texto "Dispositivo de
 * entrada" (221 de caixa para 135 de texto na captura) — com o nosso texto de
 * 14px semibold (~154px) dá ~250px. O submenu de "Perfil de entrada" é mais
 * estreito (186/221 do pai, ~210px): só texto e rádio. Linha com título e
 * subtítulo tem 52px (20px + 16px de texto, `py-2`); respiro da caixa de 6px.
 * O espelhamento na borda da janela é o do `Popout` (ver `Submenu`), e os 4px
 * de sobreposição do submenu sobre o item vêm do `ContextMenu`.
 *
 * Ordem e blocos do menu-pai: "Dispositivo de entrada" e "Perfil de entrada",
 * divisória, "Volume de entrada" com o slider (sem o número) e o "Nível de
 * entrada", divisória, "Configurações de voz".
 *
 * ## "Perfil de entrada": o mapeamento
 *
 * O Discord tem três perfis (Isolamento de Voz, Estúdio, Personalizado). Aqui
 * eles são uma leitura de `audio.processamento` (`eco`, `ruido`, `ganho`):
 * - **Isolamento de Voz** = `ruido: "avancada"` (RNNoise, a supressão forte);
 *   eco e ganho ficam como estavam.
 * - **Estúdio** = tudo desligado (`ruido: "off"`, sem eco, sem ganho): a
 *   captura crua.
 * - **Personalizado** = qualquer outra combinação (ex.: supressão do navegador
 *   `"padrao"`, ou `"off"` com eco/ganho ligados). Escolhê-lo estando nele não
 *   muda nada; vindo de outro perfil, restaura a última combinação
 *   personalizada vista nesta sessão, ou `"padrao"` se não houve nenhuma.
 */

/**
 * Largura da caixa. Fica aqui porque é a mesma do submenu, e o `UserFooter`
 * passa esta constante ao `PopoverFlutuante` em vez de repetir o número.
 */
export const LARGURA_DO_MENU_DE_AUDIO = 250;

/** Submenu de "Perfil de entrada": só texto e rádio, bem mais estreito. */
const LARGURA_DO_SUBMENU_DE_PERFIL = 210;

/**
 * `p-1.5` da caixa: o submenu sobe esse tanto para o primeiro item dele ficar
 * na linha do item que o abriu.
 */
const RESPIRO = 6;
/**
 * O submenu monta 4px em cima da borda do item, como no `ContextMenu`. Não é
 * medida do Discord: o CSS dele (`.submenuPaddingContainer_c1e9c4{padding:0
 * 8px}`) sugere o contrário, uma folga, mas o menu com submenu aberto não tem
 * print 1:1 e a troca de desenho fica para a onda que refizer este menu.
 */
const SOBREPOSICAO = 4;

type Processamento = { eco: boolean; ruido: NivelDeRuido; ganho: boolean };
export type PerfilDeEntrada = "isolamento" | "estudio" | "personalizado";

export const NOME_DO_PERFIL: Record<PerfilDeEntrada, string> = {
  isolamento: "Isolamento de Voz",
  estudio: "Estúdio",
  personalizado: "Personalizado",
};

/** Lê o perfil que o processamento atual representa (mapeamento no cabeçalho). */
export function perfilDeEntrada(p: Processamento): PerfilDeEntrada {
  if (p.ruido === "avancada") return "isolamento";
  if (p.ruido === "off" && !p.eco && !p.ganho) return "estudio";
  return "personalizado";
}

/**
 * Última combinação personalizada vista, para "Personalizado" ter para onde
 * voltar. Vive no módulo (o menu é desmontado a cada fechamento) e some com a
 * sessão: guardar em disco seria persistir um palpite.
 */
let ultimoPersonalizado: Processamento | null = null;

/** O processamento que escolher `perfil` produz a partir de `atual`. */
export function processamentoDoPerfil(perfil: PerfilDeEntrada, atual: Processamento): Processamento {
  if (perfil === "isolamento") return { ...atual, ruido: "avancada" };
  if (perfil === "estudio") return { eco: false, ruido: "off", ganho: false };
  if (perfilDeEntrada(atual) === "personalizado") return atual;
  return ultimoPersonalizado ?? { ...atual, ruido: "padrao" };
}

/** O valor da linha "Dispositivo": o aparelho em uso; no padrão, o aparelho por trás dele. */
function valorDoAparelho(
  lista: MediaDeviceInfo[],
  id: string | null,
  prefixo: string,
  nomePadrao: string,
  aparelhoDoPadrao: string | null,
): string {
  if (id === null) return aparelhoDoPadrao ?? nomePadrao;
  const nome = nomeEscolhido(lista, id, prefixo);
  return nome === "Padrão do sistema" ? (aparelhoDoPadrao ?? nomePadrao) : nome;
}

/* ------------------------------------------------------------------ */
/* Submenu                                                             */
/* ------------------------------------------------------------------ */

/**
 * Qual submenu está aberto. Em que item ele está pendurado não mora mais aqui:
 * cada `LinhaComSubmenu` passa o próprio botão ao `Popout` como âncora.
 */
interface Submenus {
  aberto: string | null;
  /** agenda abrir (chave) ou fechar (null) depois da pausa. */
  agendar: (chave: string | null) => void;
  /** abre na hora — clique e seta → não esperam pausa nenhuma. */
  abrir: (chave: string) => void;
  /** cancela o fechamento agendado (o ponteiro entrou no submenu). */
  segurar: () => void;
  fechar: () => void;
}

function useSubmenus(): Submenus {
  const [aberto, setAberto] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const agendar = useCallback((chave: string | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAberto(chave), SUBMENU_DELAY);
  }, []);

  const abrir = useCallback((chave: string) => {
    window.clearTimeout(timer.current);
    setAberto(chave);
  }, []);

  const segurar = useCallback(() => window.clearTimeout(timer.current), []);

  const fechar = useCallback(() => {
    window.clearTimeout(timer.current);
    setAberto(null);
  }, []);

  return { aberto, agendar, abrir, segurar, fechar };
}

/**
 * Os itens do submenu que as setas percorrem. Por papel, e não `button`: é o
 * que diz "item de menu", e a alça da folha do celular não é um.
 */
const ITEM_DO_SUBMENU = '[role^="menuitem"]';

/**
 * A caixa do submenu: o `Popout` único com `ehSubmenu`.
 *
 * O que vem do `Popout` e antes era feito à mão aqui: portal (dentro da
 * caixa-mãe o submenu seria cortado pelo `overflow`), posição com a colisão
 * contra a janela, entrada animada, pilha de camadas e o atributo
 * `data-submenu-de-popout` — é ele, junto com a pilha, que impede o menu-pai de
 * ler um clique aqui dentro como "clique fora" e se fechar antes do clique
 * chegar ao item. `ehSubmenu` também desliga o clique fora do próprio submenu:
 * ele é desmontado junto com o pai, e passar para outro item já o troca.
 *
 * Mudanças de comportamento que vêm junto, todas do `Popout`:
 * - **Esc** fecha só o submenu (é o topo da pilha). Antes o Esc da janela
 *   chegava primeiro ao menu-pai, que fechava tudo.
 * - **Colisão:** sem espaço à direita, espelha para a esquerda do item (a mesma
 *   regra do `colocar` de antes); sem espaço embaixo, o alinhamento espelha e é
 *   o **último** item do submenu que fica na linha do item, em vez de a caixa
 *   inteira subir para cima dele.
 * - **Foco:** Tab fica preso no submenu, e o foco volta a quem o tinha.
 * - **Celular:** vira folha inferior por cima da folha do menu-pai, com véu,
 *   alça e "voltar" do Android. Antes a caixa de 288 caía por cima do menu-pai,
 *   espremida na lateral da tela.
 * - **Superfície:** `--background-surface-high`, a do `Popout` (e a do
 *   menu-pai, que também é um). Antes era `--background-surface-higher`.
 *
 * Posição: lado direito, `distancia` negativa para montar `SOBREPOSICAO` em cima
 * do item, e `deslocamento` de `-RESPIRO` para o primeiro item alinhar com o
 * item do pai — o mesmo ponto que o `colocar` calculava.
 */
function Submenu({
  aberto,
  ancora,
  rotulo,
  autoFoco,
  pedidoDeFoco,
  onFechar,
  onSegurar,
  largura,
  children,
}: {
  aberto: boolean;
  /** o item do menu-pai que abriu o submenu. */
  ancora: RefObject<HTMLElement | null>;
  rotulo: string;
  /** aberto pelo teclado: o foco entra, senão a seta → não levaria a lugar nenhum. */
  autoFoco: boolean;
  /**
   * Muda a cada seta → num submenu que o hover já abriu. O `focarAoAbrir` do
   * `Popout` só age na abertura; sem isto a seta não entraria na caixa.
   */
  pedidoDeFoco: number;
  onFechar: () => void;
  onSegurar: () => void;
  largura: number;
  children: ReactNode;
}) {
  // o `Popout` não expõe a caixa por ref: o miolo é o ponto de onde achar os itens
  const miolo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    miolo.current?.querySelector<HTMLElement>(ITEM_DO_SUBMENU)?.focus();
  }, [pedidoDeFoco]);

  // Esc não passa por aqui: quem trata é o `Popout`, que chama `onFechar`
  function aoTeclar(e: KeyboardEventDoReact<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const alvos = Array.from(miolo.current?.querySelectorAll<HTMLElement>(ITEM_DO_SUBMENU) ?? []);
    if (alvos.length === 0) return;
    const i = alvos.indexOf(document.activeElement as HTMLElement);
    const passo = e.key === "ArrowDown" ? 1 : -1;
    alvos[(i + passo + alvos.length) % alvos.length]?.focus();
  }

  return (
    <Popout
      aberto={aberto}
      aoFechar={onFechar}
      ancora={ancora}
      ehSubmenu
      papel="menu"
      rotulo={rotulo}
      lado="right"
      alinhamento="start"
      distancia={-SOBREPOSICAO}
      deslocamento={-RESPIRO}
      largura={largura}
      // aberto pelo hover o foco fica no item do pai, como antes; o `Popout`
      // leva o foco ao primeiro item só quando veio do teclado
      focarAoAbrir={autoFoco}
      aoTeclar={aoTeclar}
      aoEntrarComPonteiro={onSegurar}
      className="p-1.5"
    >
      <div ref={miolo}>{children}</div>
    </Popout>
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
  larguraDoSubmenu = LARGURA_DO_MENU_DE_AUDIO,
  children,
}: {
  chave: string;
  titulo: string;
  valor: string;
  ctrl: Submenus;
  larguraDoSubmenu?: number;
  children: ReactNode;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const porTeclado = useRef(false);
  const [pedidoDeFoco, setPedidoDeFoco] = useState(0);
  const aberto = ctrl.aberto === chave;

  return (
    <>
      <button
        ref={botao}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onPointerEnter={() => {
          porTeclado.current = false;
          ctrl.agendar(chave);
        }}
        // clique **abre**, nunca fecha: com o hover abrindo, um clique que
        // alternasse fecharia a caixa embaixo do ponteiro que a chamou
        onClick={() => {
          porTeclado.current = false;
          ctrl.abrir(chave);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight") return;
          e.preventDefault();
          porTeclado.current = true;
          // já aberto pelo hover: o `Popout` só foca ao abrir, e a seta → aqui
          // tem de levar o foco para dentro mesmo assim
          if (aberto) setPedidoDeFoco((n) => n + 1);
          else ctrl.abrir(chave);
        }}
        className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left transition ${
          aberto ? "bg-interactive-background-hover" : "hover:bg-interactive-background-hover"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text-strong">{titulo}</span>
          <span className="block truncate text-xs text-text-muted">{valor}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
      </button>
      {/*
        Âncora por ref, e não o retângulo lido no hover: o `Popout` relê a
        posição do botão em scroll e resize, e o botão é sempre o desta linha —
        o risco antigo de o React trocar o elemento durante a pausa sumiu.
      */}
      <Submenu
        aberto={aberto}
        ancora={botao}
        rotulo={titulo}
        autoFoco={porTeclado.current}
        pedidoDeFoco={pedidoDeFoco}
        largura={larguraDoSubmenu}
        onSegurar={ctrl.segurar}
        onFechar={() => {
          ctrl.fechar();
          botao.current?.focus();
        }}
      >
        {children}
      </Submenu>
    </>
  );
}

/** Uma escolha só de texto do submenu (perfis de entrada): rádio à direita, sem ícone. */
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
      className="flex w-full items-center gap-3 rounded-[3px] px-2 py-2 text-left text-sm transition hover:bg-interactive-background-hover"
    >
      <span className="min-w-0 flex-1 truncate font-medium text-text-strong">{rotulo}</span>
      <Radio marcado={marcada} />
    </button>
  );
}

/**
 * O rádio do Discord, à direita: não marcado é um círculo com borda de 2px
 * cinza; marcado é o círculo cheio no accent com um ponto no centro. O ponto é
 * `accent-ink`, nunca branco: branco sobre o limão não tem contraste (design.md).
 */
function Radio({ marcado }: { marcado: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
        marcado ? "bg-brand-500" : "border-2 border-channels-default"
      }`}
    >
      {marcado && <span className="h-2 w-2 rounded-full bg-control-primary-text-default" />}
    </span>
  );
}

/**
 * Separa "Nome (Detalhe)" em título e subtítulo. O navegador entrega um label
 * só; quando ele vem no formato do Windows ("Alto-falantes (Realtek Audio)") o
 * detalhe é o aparelho físico e vai para a linha de baixo, como no Discord.
 * Sem parênteses finais, só título.
 */
export function dividirNome(nome: string): { titulo: string; subtitulo: string | null } {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(nome);
  if (!m || !m[1]) return { titulo: nome, subtitulo: null };
  return { titulo: m[1], subtitulo: m[2] ?? null };
}

/** Monitor para saída de vídeo (HDMI, DisplayPort, TV); senão o ícone do tipo. */
const SAIDA_DE_VIDEO = /hdmi|display ?port|monitor|\btv\b|nvidia|amd high|intel\(r\) display/i;
type IconeDeAparelho = typeof Mic;
function iconeDoAparelho(nome: string, tipo: "entrada" | "saida"): IconeDeAparelho {
  if (tipo === "saida" && SAIDA_DE_VIDEO.test(nome)) return Monitor;
  return tipo === "entrada" ? Mic : Headphones;
}

/**
 * Uma escolha de aparelho: ícone, título e subtítulo (sempre os dois, como no
 * Discord) e o rádio à direita. Sem `subtitulo` explícito, o detalhe entre
 * parênteses do label vira subtítulo e, na falta dele, o tipo da porta.
 */
function EscolhaDeAparelho({
  nome,
  subtitulo,
  tipo,
  marcada,
  onSelect,
  icone,
}: {
  nome: string;
  subtitulo?: string;
  tipo: "entrada" | "saida";
  marcada: boolean;
  onSelect: () => void;
  icone?: IconeDeAparelho;
}) {
  const dividido = dividirNome(nome);
  const titulo = subtitulo === undefined ? dividido.titulo : nome;
  const sub =
    subtitulo ?? dividido.subtitulo ?? (tipo === "entrada" ? "Microfone" : "Alto-falantes");
  const Icone = icone ?? iconeDoAparelho(nome, tipo);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={marcada}
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[3px] px-2 py-2 text-left transition hover:bg-interactive-background-hover"
    >
      <Icone size={20} className="shrink-0 text-text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-strong">{titulo}</span>
        <span className="block truncate text-xs text-text-muted">{sub}</span>
      </span>
      <Radio marcado={marcada} />
    </button>
  );
}

/** Recado de rodapé do submenu (sem permissão, sem `setSinkId`…). */
function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="px-2 pb-1 pt-2 text-xs text-text-muted">{texto}</p>;
}

/**
 * A divisória entre blocos do menu. No print real (`201137`) o menu tem três
 * blocos — itens com submenu, volume, atalho de configurações —, cada um
 * separado por uma dessas; antes só existia a de baixo.
 */
function Divisoria() {
  return <div aria-hidden="true" className="my-1 h-px bg-border-subtle" />;
}

function AtalhoDeConfiguracoes({ ctrl }: { ctrl: Submenus }) {
  return (
    <>
      <Divisoria />
      <button
        type="button"
        role="menuitem"
        // passar por aqui fecha o submenu que estiver aberto: é o mesmo gesto
        // de "sair do item" que o `ContextMenu` já trata
        onPointerEnter={() => ctrl.agendar(null)}
        onClick={() => ui.openModal({ kind: "settings", tab: "voz" })}
        className="flex w-full items-center gap-2 rounded-[3px] px-2 py-2 text-left text-sm text-text-default transition hover:bg-interactive-background-hover hover:text-text-strong"
      >
        <Settings size={16} className="shrink-0" aria-hidden="true" />
        Configurações de voz
      </button>
    </>
  );
}

/**
 * "Padrão do Windows" no Windows (inclui o Tauri, que usa o WebView2), "Padrão
 * do sistema" nos demais — o Chromium não diz o nome do sistema, o UA sim.
 */
function nomeDoPadrao(sistema: SistemaDeAudio | null): string {
  return sistema === "windows" ? "Padrão do Windows" : "Padrão do sistema";
}

/**
 * O aparelho por trás do "Padrão": o que o navegador resolveu (`entradaPadrao`)
 * e, sem essa informação, o primeiro da lista — melhor que uma linha sem
 * subtítulo, e o Discord sempre mostra um nome ali.
 */
function aparelhoPadrao(
  lista: MediaDeviceInfo[],
  idResolvido: string | null,
): string | null {
  const achado = idResolvido ? lista.find((d) => d.deviceId === idResolvido) : undefined;
  return (achado ?? lista[0])?.label || null;
}

/** A lista "Padrão + aparelhos", que é igual nos dois menus. */
function ListaDeAparelhos({
  tipo,
  opcoes,
  atual,
  nomePadrao,
  aparelhoDoPadrao,
  onEscolher,
  aviso,
}: {
  tipo: "entrada" | "saida";
  opcoes: { id: string; nome: string }[];
  atual: string | null;
  nomePadrao: string;
  aparelhoDoPadrao: string | null;
  onEscolher: (id: string | null) => void;
  aviso: string | null;
}) {
  return (
    <>
      <EscolhaDeAparelho
        nome={nomePadrao}
        subtitulo={aparelhoDoPadrao ?? (tipo === "entrada" ? "Microfone" : "Alto-falantes")}
        tipo={tipo}
        // o "Padrão" é o aparelho que o sistema escolhe: monitor na saída, como no Discord
        icone={tipo === "saida" ? Monitor : Mic}
        marcada={atual === null}
        onSelect={() => onEscolher(null)}
      />
      {opcoes.map((o) => (
        <EscolhaDeAparelho
          key={o.id}
          nome={o.nome}
          tipo={tipo}
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
  // o menu só existe aberto: montado = medindo, desmontado = captura devolvida
  const nivel = useNivelDoMicrofone(true);
  const sistema = useSistemaDeAudio();
  const nomePadrao = nomeDoPadrao(sistema);
  const aparelhoDoPadrao = aparelhoPadrao(devices.inputs, devices.entradaPadrao);
  const perfil = perfilDeEntrada(processamento);
  if (perfil === "personalizado") ultimoPersonalizado = processamento;

  return (
    <>
      <LinhaComSubmenu
        chave="aparelho"
        titulo="Dispositivo de entrada"
        valor={valorDoAparelho(devices.inputs, devices.inputId, "Microfone", nomePadrao, aparelhoDoPadrao)}
        ctrl={ctrl}
      >
        <ListaDeAparelhos
          tipo="entrada"
          opcoes={opcoesDe(devices.inputs, "Microfone")}
          atual={devices.inputId}
          nomePadrao={nomePadrao}
          aparelhoDoPadrao={aparelhoDoPadrao}
          onEscolher={devices.setInput}
          aviso={aviso}
        />
      </LinhaComSubmenu>

      <LinhaComSubmenu
        chave="ruido"
        titulo="Perfil de entrada"
        valor={NOME_DO_PERFIL[perfil]}
        ctrl={ctrl}
        larguraDoSubmenu={LARGURA_DO_SUBMENU_DE_PERFIL}
      >
        {(Object.keys(NOME_DO_PERFIL) as PerfilDeEntrada[]).map((p) => (
          <Escolha
            key={p}
            rotulo={NOME_DO_PERFIL[p]}
            marcada={perfil === p}
            onSelect={() =>
              setAudioPref({ processamento: processamentoDoPerfil(p, processamento) })
            }
          />
        ))}
      </LinhaComSubmenu>

      <Divisoria />
      <div className="px-2 py-2" onPointerEnter={() => ctrl.agendar(null)}>
        <SliderDeVolume
          label="Volume de entrada"
          valor={entrada}
          onChange={(v) => setAudioPref({ entrada: v })}
          mostrarValor={false}
        />
      </div>
      <div className="space-y-2 px-2 pb-3" onPointerEnter={() => ctrl.agendar(null)}>
        <p className="text-sm font-semibold text-text-strong">Nível de entrada</p>
        <MedidorSegmentado nivel={nivel} segmentos={30} preencher />
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
  const sistema = useSistemaDeAudio();
  // sem `setSinkId` a lista existiria só para desobedecer; o recado (com o
  // caminho do sistema onde a saída se troca de verdade) e o corte da lista
  // saem os dois de `escolhaDeSaida`, a mesma regra da aba "Voz e vídeo" e do
  // painel de dentro da chamada — antes só este menu a respeitava
  const escolha = escolhaDeSaida(devices, sistema, "Saída");
  const aviso = escolha.motivoFixo ?? explicarMidia(devices.motivo);
  const nomePadrao = nomeDoPadrao(sistema);
  // a saída não tem resolução do apelido "default": cai no primeiro da lista
  const aparelhoDoPadrao = aparelhoPadrao(devices.outputs, null);

  return (
    <>
      <LinhaComSubmenu
        chave="aparelho"
        titulo="Dispositivo de saída"
        valor={valorDoAparelho(devices.outputs, escolha.escolhido, "Saída", nomePadrao, aparelhoDoPadrao)}
        ctrl={ctrl}
      >
        <ListaDeAparelhos
          tipo="saida"
          opcoes={escolha.opcoes}
          atual={escolha.escolhido}
          nomePadrao={nomePadrao}
          aparelhoDoPadrao={aparelhoDoPadrao}
          onEscolher={devices.setOutput}
          aviso={aviso}
        />
      </LinhaComSubmenu>

      <Divisoria />
      <div className="px-2 py-2" onPointerEnter={() => ctrl.agendar(null)}>
        <SliderDeVolume
          label="Volume de saída"
          valor={saida}
          onChange={(v) => setAudioPref({ saida: v })}
          mostrarValor={false}
        />
      </div>

      <AtalhoDeConfiguracoes ctrl={ctrl} />
    </>
  );
}
