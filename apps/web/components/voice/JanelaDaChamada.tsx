"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import { isGroupChannel } from "@streamz/shared";
import ChatView from "@/components/chat/ChatView";
import {
  ExternalLink,
  Maximize,
  MessageSquare,
  Minimize,
  UserPlus,
  Volume2,
} from "@/components/ui/icones";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import FileiraDeControles from "@/components/voice/FileiraDeControles";
import PainelDeChatDaCall from "@/components/voice/PainelDeChatDaCall";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { alternarTelaCheiaDe } from "@/components/voice/fullscreen";
import { DocumentoDoPortal, ehElementoHtml } from "@/lib/outra-janela";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import {
  CHAVE_DA_JANELA_DA_CHAMADA,
  useJanelasDeVoz,
  type JanelaDeVoz,
} from "@/stores/janelas-de-voz";
import { ui, useUI } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * A chamada inteira numa janela à parte (o "abrir em janela à parte" do
 * `IconesDoCanto`). Desenhada por `createPortal` a partir de `JanelasDeVoz`:
 * mesma árvore React, mesma sala do LiveKit — a janela é só outra tela.
 *
 * O desenho é o da janela de chamada do Discord: fundo preto, nome no alto, a
 * grade no meio e a fileira de controles embaixo, **sempre visível**. Aqui não
 * entra o `useOcultarInativo` do palco: a janela existe para a chamada, e
 * esconder o desligar dela por inatividade é o defeito que o `CallStage` já
 * documentou (sem vídeo, sobrava a tela sem jeito de encerrar).
 *
 * Coisas que ficam de fora de propósito:
 * - **Fixar por cima das outras:** no app o popup nasce pelo `on_new_window` do
 *   Tauri (que só responde "permitir"), sem um handle de janela para o
 *   `setAlwaysOnTop`. Um botão que não fixa nada seria pior que nenhum.
 * - **Atalhos de voz:** o `VoiceHotkeys` da janela principal continua sendo o
 *   único; duplicá-lo aqui faria um atalho valer duas vezes.
 */
export default function JanelaDaChamada({
  janela,
  channelId,
}: {
  janela: JanelaDeVoz;
  channelId: string;
}) {
  const { win } = janela;
  const guildId = useVoice((s) => s.guildId);
  const nomeDoCanal = useVoice((s) => s.channelName);
  const call = useVoice((s) => s.call);
  const endCall = useVoice((s) => s.endCall);
  const disconnect = useVoice((s) => s.disconnect);
  const conversa = useDMs((s) =>
    guildId ? null : (s.channels.find((d) => d.id === channelId) ?? null),
  );
  // a conversa do canal de voz é o `ChatView`, que sempre mostra o canal
  // **ativo** da janela principal — só serve aqui enquanto o ativo é este
  const chatDoCanalAtivo = useChannels((s) => !!guildId && s.activeChannelId === channelId);

  // Local, e não o `chatDaCallPorCanal` do store: abrir a conversa nesta
  // janela pequena não pode abrir (nem fechar) a coluna da janela principal.
  const [chatAberto, setChatAberto] = useState(false);
  const largura = useLarguraDaJanela(win);
  const { telaCheia, suportada: temTelaCheia, alternar } = useTelaCheiaDaJanela(win);

  const titulo = (conversa ? dmTitle(conversa) : nomeDoCanal) || "Chamada";
  const grupo = conversa ? isGroupChannel(conversa) : false;
  const chamando = !guildId && call.phase === "outgoing" && call.channelId === channelId;

  // o título vem de quem abriu a janela; renomear o canal ou o grupo com ela
  // aberta tem de chegar à barra de título também
  useEffect(() => {
    win.document.title = titulo;
  }, [win, titulo]);

  // Todo modal (`ui.openModal`) é desenhado na janela **principal** — o
  // `ModalHost` mora lá. Pedido daqui (convidar, adicionar pessoas, ajustes de
  // voz da fileira, o convite da grade vazia), ele abriria atrás desta janela
  // sem ninguém ver. Um ouvinte só cobre todos os caminhos, inclusive os que
  // os componentes reaproveitados abrem por conta própria.
  useEffect(
    () =>
      useUI.subscribe((s, antes) => {
        if (s.modals.length > antes.modals.length && win.document.hasFocus()) {
          focarJanelaPrincipal(win);
        }
      }),
    [win],
  );

  // A coluna de 450 do palco não cabe numa janela de 880: 42% da largura, com
  // piso para o composer não espremer e o teto da medida do Discord.
  const larguraDoChat = Math.round(Math.min(450, Math.max(280, largura * 0.42)));

  const adicionar = guildId
    ? { rotulo: "Convidar para voz", abrir: () => ui.openModal({ kind: "invite", guildId }) }
    : grupo
      ? {
          rotulo: "Adicionar pessoas",
          abrir: () => ui.openModal({ kind: "addGroupMembers", channelId }),
        }
      : null;

  return (
    <DocumentoDoPortal.Provider value={win.document}>
      <div
        // Abaixo disto a fileira de controles já não cabe nem sem as pontas; o
        // `window.open` não tem tamanho mínimo, então a janela recorta em vez
        // de desmontar o leiaute.
        className="fixed inset-0 flex min-h-[320px] min-w-[480px] bg-black"
        // Menu de contexto do app (`ui.openContextMenu`) é desenhado na janela
        // principal, nas coordenadas desta: abriria num lugar sem sentido,
        // atrás desta janela. Bloqueado aqui na captura; campo de texto mantém
        // o menu nativo (colar, corretor).
        onContextMenuCapture={bloquearMenuDoApp}
      >
        <div className="flex min-w-0 flex-1 select-none flex-col">
          <header className="flex h-[49px] shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-text-strong">
              <Volume2 size={24} className="shrink-0 text-text-muted" aria-hidden="true" />
              <span className="truncate">{titulo}</span>
            </span>
            <BotaoDeIcone
              rotulo={chatAberto ? "Ocultar chat" : "Abrir chat"}
              icone={<MessageSquare size={20} />}
              ativo={chatAberto}
              comFundo
              onClick={() => setChatAberto((v) => !v)}
            />
          </header>

          {/* a fileira flutua sobre a grade, como no palco; `pb-24` reserva o
              lugar dela (ver `VoicePanel`) */}
          <div className="relative min-h-0 flex-1">
            <div className="h-full px-2 pt-2 pb-24">
              <VoiceGrid
                channelId={channelId}
                nomeDoCanal={titulo}
                guildId={guildId}
                // só grupo aceita mais gente pelo "+" da grade — mesma regra
                // do `CallStage`
                onAdicionar={grupo ? adicionar?.abrir : undefined}
              />
            </div>

            <FileiraDeControles
              esquerda={
                adicionar ? (
                  <BotaoDeIcone
                    rotulo={adicionar.rotulo}
                    icone={<UserPlus size={22} />}
                    comFundo
                    onClick={adicionar.abrir}
                  />
                ) : undefined
              }
              centro={
                guildId ? (
                  <VoiceControls onLeave={() => void disconnect()} />
                ) : (
                  <VoiceControls
                    leaveLabel={chamando ? "Cancelar chamada" : "Desligar"}
                    onLeave={() => void endCall()}
                  />
                )
              }
              direita={
                <div className="flex items-center gap-4">
                  <BotaoDeIcone
                    rotulo="Voltar para o Streamz"
                    icone={<ExternalLink size={20} className="rotate-180" />}
                    tamanho="md"
                    comFundo
                    onClick={() => {
                      focarJanelaPrincipal(win);
                      useJanelasDeVoz.getState().fechar(CHAVE_DA_JANELA_DA_CHAMADA);
                    }}
                  />
                  {temTelaCheia && (
                    <BotaoDeIcone
                      rotulo={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
                      icone={telaCheia ? <Minimize size={20} /> : <Maximize size={20} />}
                      tamanho="md"
                      ativo={telaCheia}
                      comFundo
                      onClick={alternar}
                    />
                  )}
                </div>
              }
            />
          </div>
        </div>

        {chatAberto && (
          <PainelDeChatDaCall
            titulo={titulo}
            largura={larguraDoChat}
            onFechar={() => setChatAberto(false)}
          >
            {chatDoCanalAtivo ? (
              <ChatView incorporado />
            ) : (
              <ConversaNaJanelaPrincipal onIr={() => focarJanelaPrincipal(win)} />
            )}
          </PainelDeChatDaCall>
        )}
      </div>
    </DocumentoDoPortal.Provider>
  );
}

/**
 * O lugar da conversa quando ela não pode ser desenhada aqui: `ChatView` e
 * `DMView` leem o canal **ativo** da janela principal, e a conversa de uma DM
 * (ou de um canal de voz que a pessoa deixou para trás ao navegar) não é ele.
 * Melhor dizer onde está do que mostrar a conversa de outro canal.
 */
function ConversaNaJanelaPrincipal({ onIr }: { onIr: () => void }) {
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-text-muted">A conversa desta chamada está na janela principal.</p>
        <Button variante="secundario" tamanho="sm" onClick={onIr}>
          Ir para a janela principal
        </Button>
      </div>
    </div>
  );
}

function bloquearMenuDoApp(e: MouseEvent) {
  e.stopPropagation();
  const alvo = e.target;
  const editavel =
    ehElementoHtml(alvo) &&
    (alvo.isContentEditable || alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA");
  if (!editavel) e.preventDefault();
}

/**
 * Traz a janela principal para a frente. `opener` primeiro porque é ela quem
 * abriu esta; o `window` deste módulo é a mesma janela (o código roda no realm
 * da principal) e cobre o popup do app, onde o `opener` pode vir nulo.
 */
function focarJanelaPrincipal(win: Window) {
  const principal = (win.opener as Window | null) ?? window;
  try {
    principal.focus();
  } catch {
    // focar sem gesto pode ser recusado; a principal segue onde estava
  }
}

/** A largura interna desta janela, ao vivo. */
function useLarguraDaJanela(win: Window): number {
  const assinar = useCallback(
    (avisar: () => void) => {
      win.addEventListener("resize", avisar);
      return () => win.removeEventListener("resize", avisar);
    },
    [win],
  );
  return useSyncExternalStore(
    assinar,
    () => win.innerWidth,
    () => 0,
  );
}

/**
 * Tela cheia **desta** janela, não a do palco: `useTelaCheia` liga no estado
 * global `telaCheia` e no `document` da principal, e pôr esta janela em tela
 * cheia não pode esconder a moldura da outra. A entrada e a saída reaproveitam
 * `alternarTelaCheiaDe`, que já sabe usar a API do documento dono do elemento
 * (e não a emulação do Tauri, que mexeria na janela principal).
 */
function useTelaCheiaDaJanela(win: Window) {
  const doc = win.document;
  const assinar = useCallback(
    (avisar: () => void) => {
      doc.addEventListener("fullscreenchange", avisar);
      return () => doc.removeEventListener("fullscreenchange", avisar);
    },
    [doc],
  );
  const telaCheia = useSyncExternalStore(
    assinar,
    () => !!doc.fullscreenElement,
    () => false,
  );
  const alternar = useCallback(() => void alternarTelaCheiaDe(doc.documentElement), [doc]);
  return { telaCheia, suportada: !!doc.fullscreenEnabled, alternar };
}
