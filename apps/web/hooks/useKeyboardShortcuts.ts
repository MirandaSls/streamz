"use client";

import { useEffect } from "react";
import { isUnread } from "@streamz/shared";
import { atalhosEfetivos, useAtalhos } from "@/stores/atalhos";
import { ACOES_DE_VOZ, actionForEvent, type ShortcutAction } from "@/lib/shortcuts";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useSettings, ZOOM } from "@/stores/settings";
import { useUI } from "@/stores/ui";
import { abrirCaixaDeEntrada } from "@/lib/caixa-de-entrada";
import { pedirPainelDoComposer } from "@/lib/eventos-do-composer";

/**
 * Atalhos globais do app (a lista está em `lib/shortcuts`, e a aba "Teclado"
 * mostra a mesma).
 *
 * Um único listener no `window`, em captura: assim o atalho chega antes de
 * qualquer handler de componente e não depende de onde está o foco. As duas
 * exceções são deliberadas — dentro de um campo de texto só passam
 * combinações com Ctrl/Alt/Meta (senão digitar viraria navegação), e com um
 * modal aberto só o zoom vale (Esc é do próprio modal, que sabe o que fechar).
 *
 * Mudo e surdo estão no registro, mas não são executados daqui: o dono é o
 * `VoiceHotkeys` (ver `ACOES_DE_VOZ`). Dois donos davam toggle duplo.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // as combinações regravadas na aba "Teclado" entram aqui; sem isso a
      // regravação apareceria na tela sem valer no app
      const action = actionForEvent(event, atalhosEfetivos(useAtalhos.getState().regravados));
      if (!action || ACOES_DE_VOZ.has(action)) return;

      const comModificador = event.ctrlKey || event.altKey || event.metaKey;
      if (!comModificador && estaDigitando(event.target)) return;

      const zoom = action === "zoomMais" || action === "zoomMenos" || action === "zoomPadrao";
      if (!zoom && temCamadaAberta()) return;

      event.preventDefault();
      executar(action);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

/** O foco está num campo de texto (input, textarea ou contenteditable)? */
function estaDigitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable === true;
}

/** Há modal, menu de contexto ou popover na tela? */
function temCamadaAberta(): boolean {
  const ui = useUI.getState();
  return Boolean(ui.modals.length > 0 || ui.contextMenu || ui.popover);
}

function executar(action: ShortcutAction): void {
  const ui = useUI.getState();

  switch (action) {
    case "quickSwitcher":
      ui.openModal({ kind: "quickSwitcher" });
      return;
    case "caixaDeEntrada":
      abrirCaixaDeEntrada();
      return;
    case "configuracoes":
      ui.openModal({ kind: "settings" });
      return;
    case "mostrarAtalhos":
      // Ctrl+/ no Discord abre a grade de atalhos por cima da conversa, não a
      // aba "Teclado" das configurações (quadros do GIF oficial citado em
      // `lib/shortcuts.ts`); a aba continua sendo onde se regrava
      ui.openModal({ kind: "atalhosDoTeclado" });
      return;

    // O `preventDefault` dos atalhos abaixo é o de `onKeyDown`, antes de
    // `executar`: Ctrl+F, Ctrl+P e Ctrl+S são do navegador (buscar, imprimir,
    // salvar) e só chegam aqui já cancelados.
    case "busca":
      // o campo mora no `HeaderBar`, que observa o contador e se foca
      ui.pedirFocoNaBusca();
      return;
    case "fixadas":
      alternarFixadas();
      return;
    case "alternarMembros":
      alternarMembros();
      return;
    case "emoji":
    case "gif":
    case "figurinha":
    case "anexar":
      // quem abre o painel é o composer montado; o atalho só avisa
      pedirPainelDoComposer(action);
      return;

    case "zoomMais":
      useSettings.getState().stepZoom(ZOOM.step);
      return;
    case "zoomMenos":
      useSettings.getState().stepZoom(-ZOOM.step);
      return;
    case "zoomPadrao":
      useSettings.getState().set({ zoom: ZOOM.default });
      return;

    case "canalAnterior":
      navegarConversa(-1, false);
      return;
    case "canalProximo":
      navegarConversa(1, false);
      return;
    case "naoLidoAnterior":
      navegarConversa(-1, true);
      return;
    case "naoLidoProximo":
      navegarConversa(1, true);
      return;

    case "servidorAnterior":
      navegarServidor(-1);
      return;
    case "servidorProximo":
      navegarServidor(1);
      return;

    case "marcarLido":
      marcarAtualComoLido();
      return;
    case "marcarServidorLido":
      marcarServidorComoLido();
      return;
  }
}

/** A conversa aberta agora: canal do servidor ou DM, conforme a coluna 2. */
function conversaAtiva(): string | null {
  if (useUI.getState().view === "dm") return useDMs.getState().activeId;
  return useChannels.getState().activeChannelId;
}

/**
 * Ctrl+P: "Toggle pins popout" na grade do Discord — abre o painel de fixadas
 * da conversa aberta, e fecha se ele já está aberto nela. Sem conversa (página
 * Amigos, servidor sem canal) não há painel a abrir.
 */
function alternarFixadas(): void {
  const id = conversaAtiva();
  if (!id) return;
  const ui = useUI.getState();
  if (ui.fixadasAbertasEm === id) ui.closePins();
  else ui.openPins(id);
}

/**
 * Ctrl+U: "Toggle channel member list or voice text chat".
 *
 * No canal de texto do servidor é o mesmo `toggleMembers` do ícone do
 * cabeçalho. No canal de voz a coluna da direita é disputada com a conversa da
 * call, e o atalho usa a variante do ícone de lá (`alternarMembrosNaCall`,
 * `stores/ui.ts`): um `toggleMembers` cru ligaria `membersOpen` por baixo da
 * conversa aberta sem mudar nada na tela. Na DM vai pela mesma variante com o
 * id da conversa — sem conversa de call guardada para a DM ela é exatamente o
 * alternador do cabeçalho da `DMView`, e continua certa se um dia houver.
 */
function alternarMembros(): void {
  const ui = useUI.getState();
  if (ui.view === "dm") {
    const dm = useDMs.getState().activeId;
    // sem id a variante cairia no canal de voz do servidor, que nem está na tela
    if (dm) ui.alternarMembrosNaCall(dm);
    return;
  }
  const voz = useChannels.getState().voiceChannelId;
  if (voz) ui.alternarMembrosNaCall(voz);
  else ui.toggleMembers();
}

/**
 * Anda pela coluna 2 — canais de texto do servidor aberto, ou a lista de
 * conversas quando se está no modo DM. `somenteNaoLidos` pula o que já foi
 * lido; sem nenhum não lido, não sai do lugar.
 */
function navegarConversa(delta: number, somenteNaoLidos: boolean): void {
  if (useUI.getState().view === "dm") {
    const dms = useDMs.getState();
    const lista = somenteNaoLidos ? dms.channels.filter(isUnread) : dms.channels;
    const proximo = vizinho(lista, dms.activeId, delta);
    if (proximo) dms.select(proximo);
    return;
  }

  const channels = useChannels.getState();
  const texto = channels.channels.filter((c) => c.type !== "VOICE");
  const lista = somenteNaoLidos ? texto.filter(isUnread) : texto;
  const proximo = vizinho(lista, channels.activeChannelId, delta);
  if (proximo) channels.select(proximo);
}

function navegarServidor(delta: number): void {
  const guilds = useGuilds.getState();
  const proximo = vizinho(guilds.guilds, guilds.activeGuildId, delta);
  if (proximo) guilds.select(proximo);
}

/**
 * Item `delta` posições à frente do atual, circulando.
 *
 * Quando o atual não está na lista (é o caso do "próximo não lido": o canal
 * aberto acabou de ser lido), entra pela ponta — a primeira para frente, a
 * última para trás.
 */
function vizinho<T extends { id: string }>(lista: T[], atualId: string | null, delta: number): T | null {
  if (lista.length === 0) return null;
  const atual = lista.findIndex((i) => i.id === atualId);
  if (atual < 0) return delta > 0 ? lista[0] : lista[lista.length - 1];
  return lista[(atual + delta + lista.length) % lista.length];
}

function marcarAtualComoLido(): void {
  if (useUI.getState().view === "dm") {
    const dms = useDMs.getState();
    if (dms.activeId) void dms.markRead(dms.activeId);
    return;
  }
  const channels = useChannels.getState();
  if (channels.activeChannelId) void channels.markRead(channels.activeChannelId);
}

function marcarServidorComoLido(): void {
  const channels = useChannels.getState();
  for (const canal of channels.channels) {
    if (canal.type !== "VOICE" && isUnread(canal)) void channels.markRead(canal.id);
  }
}
