"use client";

import { useRef } from "react";
import { AlertTriangle, MessageSquare, RotateCw, UserPlus, Volume2 } from "@/components/ui/icones";
import type { Channel, NotificationLevel } from "@streamz/shared";
import Tooltip from "@/components/ui/Tooltip";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import VistaDoCanalDeVoz from "@/components/voice/VistaDoCanalDeVoz";
import { chatDoCanalAberto } from "@/components/voice/vista-do-canal-de-voz";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { AoVivoIndicador } from "@/components/voice/ScreenShareButton";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { useOcultarInativo } from "@/components/voice/useOcultarInativo";
import {
  isChannelMuted,
  levelForChannel,
  useNotifications,
} from "@/stores/notifications";
import { ui, useUI, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Painel de voz/vídeo/tela de um canal de VOZ — a coluna 3 inteira, com o chat
 * de texto do mesmo canal numa coluna **à direita** quando aberto (ver
 * `CallSplit`, que escolhe esse leiaute por ser canal de servidor).
 *
 * Aqui não há conexão nenhuma: quem conecta, guarda estado e fala com o
 * LiveKit é a store `stores/voice.ts`. Este componente só monta a tela em cima
 * do que ela expõe — o que permite ao painel ser fechado (trocar de canal de
 * texto) sem derrubar a call, que é como o Discord se comporta.
 *
 * **Clicar no canal NÃO conecta.** O painel tinha um efeito que chamava
 * `connect` na montagem, e a antessala só aparecia para quem tinha caído. A
 * print `2026-09-04 102429` mostra o Discord fazendo o contrário: o canal de
 * voz "Geral" está selecionado, o palco é o degradê com o nome do canal,
 * "Ninguém está em voz" e um botão "Entrar na chamada de voz" — e a conversa do
 * canal já aberta à direita. Faz sentido além da paridade: entrar abre o
 * microfone para outras pessoas, e um clique de barra lateral não é
 * consentimento para isso. Quem conecta agora é o botão (ver
 * `VistaDoCanalDeVoz`); a retomada depois do F5 e o "movido de canal"
 * continuam vindo da store, sem passar por aqui.
 */
export default function VoicePanel({
  channel,
  onLeave,
}: {
  channel: Pick<Channel, "id" | "guildId" | "name" | "type">;
  onLeave?: () => void;
}) {
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const conectadoEm = useVoice((s) => s.channelId);
  const connect = useVoice((s) => s.connect);
  const disconnect = useVoice((s) => s.disconnect);
  const reconnect = useVoice((s) => s.reconnect);
  const estados = useVoice((s) => s.statesOf(channel.id));
  // o balão é lembrado por canal, e nasce aberto (ver `vista-do-canal-de-voz`)
  const chatAberto = useUI((s) => chatDoCanalAberto(s.chatDaCallPorCanal, channel.id));
  const toggleVoiceChat = useUI((s) => s.toggleVoiceChat);

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();

  const aqui = conectadoEm === channel.id;
  const conectado = aqui && status === "connected";
  const nome = channel.name ?? "voz";
  // O `useOcultarInativo` existe para tirar a moldura da frente do VÍDEO. Na
  // vista do canal não há vídeo nenhum — sumir com o nome do canal depois de 3s
  // parado seria esconder a única coisa que a tela tem a dizer, e a print
  // mostra o cabeçalho lá.
  const molduraVisivel = !aqui || visivel;

  // Desligar ainda **fecha a coluna** (`decidirSaida("usuario").fechaColuna`,
  // em `voice-saida.ts`, e este `onLeave`): quem sai cai no `ChatView` de
  // largura inteira do mesmo canal. No Discord ele voltaria para a vista do
  // canal, com o botão de entrar de novo — agora que existe uma vista para
  // voltar, essa decisão vale ser revisitada. Não foi mexida aqui: ela mora num
  // módulo com teste próprio e vale um PR só dela.
  async function sair() {
    await disconnect();
    onLeave?.();
  }

  return (
    <div
      ref={palco}
      {...doPalco}
      // a tela cheia é a do navegador (ver `fullscreen.ts`), não um `fixed inset-0`
      className="flex h-full flex-col bg-chat"
      data-voice-panel={channel.id}
    >
      <header
        {...daMoldura}
        // Na vista do canal o cabeçalho flutua sobre o degradê: na print não há
        // filete nenhum cruzando o palco, e o brilho sobe por trás do nome.
        className={`flex h-[49px] shrink-0 items-center justify-between gap-2 px-4 transition-opacity duration-200 ${
          aqui ? "border-b border-border shadow-header" : ""
        } ${molduraVisivel ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <span className="flex min-w-0 items-center gap-2 font-semibold text-txt-primary">
          <Volume2 size={24} className="shrink-0 text-txt-muted" aria-hidden="true" />
          <span className="truncate">{nome}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <AoVivoIndicador />
          {/* no canal de voz o palco ocupa tudo: este botão é o ÚNICO caminho
              para o chat de texto do canal */}
          <IconeDeCabecalho
            label={chatAberto ? "Ocultar chat" : "Abrir chat"}
            active={chatAberto}
            onClick={() => toggleVoiceChat(channel.id)}
          >
            <MessageSquare size={20} />
          </IconeDeCabecalho>
          {/* sem sino aqui: no print o cabeçalho do canal de voz tem só o
              balão do chat. Notificação e silêncio continuam no menu de
              contexto do canal, na barra lateral, que é de onde o Discord as
              serve. */}
        </span>
      </header>

      {aqui && status === "error" && erro && (
        // banner de largura total: uma falha de conexão não é nota de rodapé
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 bg-red px-4 py-2 text-sm font-medium text-white"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{erro}</span>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="flex shrink-0 items-center gap-1.5 rounded-[3px] bg-white/15 px-2 py-1 text-xs font-semibold transition hover:bg-white/25"
          >
            <RotateCw size={12} aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )}

      {/* a barra de controles flutua sobre a grade (Discord) — por isso ela fica
          fora do bloco de conteúdo, que ocupa a área toda sem rolar */}
      <div className="relative min-h-0 flex-1">
        {aqui ? (
          <div className={`h-full p-4 ${conectado ? "pb-24" : ""}`}>
            {status === "connecting" ? (
              <div className="grid h-full place-items-center text-txt-muted">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
                  <p>Entrando na sala…</p>
                </div>
              </div>
            ) : (
              <VoiceGrid channelId={channel.id} nomeDoCanal={nome} guildId={channel.guildId} />
            )}
          </div>
        ) : (
          // sem `p-4`: o degradê vai de borda a borda do palco, como na print
          <VistaDoCanalDeVoz
            nome={nome}
            estados={estados}
            onEntrar={() => void connect(channel)}
          />
        )}

        {conectado && (
          <>
            {/* Convidar mora no canto inferior esquerdo do palco, alinhado com a
                barra: é a ação de "esta sala está vazia demais", e no print ela
                nunca entra na fileira dos controles da chamada. */}
            <div
              {...daMoldura}
              className={`absolute bottom-8 left-6 z-10 transition-opacity duration-200 ${
                visivel ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <IconeDeCabecalho
                label="Convidar para voz"
                onClick={() =>
                  channel.guildId && ui.openModal({ kind: "invite", guildId: channel.guildId })
                }
              >
                <UserPlus size={22} />
              </IconeDeCabecalho>
            </div>

            <IconesDoCanto
              telaCheia={telaCheia}
              onTelaCheia={alternar}
              visivel={visivel}
              moldura={daMoldura}
            />
          </>
        )}

        {conectado && (
          <VoiceControls oculto={!visivel} moldura={daMoldura} onLeave={() => void sair()} />
        )}
      </div>
    </div>
  );
}

const NIVEIS: { valor: NotificationLevel; rotulo: string }[] = [
  { valor: "ALL", rotulo: "Todas as mensagens" },
  { valor: "MENTIONS", rotulo: "Apenas @menções" },
  { valor: "NONE", rotulo: "Nada" },
];

function abrirMenuDeNotificacoes(
  e: React.MouseEvent<HTMLButtonElement>,
  channelId: string,
  guildId: string | null,
) {
  const r = e.currentTarget.getBoundingClientRect();
  const atual = levelForChannel(channelId, guildId);
  const silenciado = isChannelMuted(channelId, guildId);
  const store = useNotifications.getState();
  const itens: MenuItem[] = [
    {
      label: silenciado ? "Reativar canal" : "Silenciar canal",
      onSelect: () =>
        void (silenciado ? store.unmuteChannel(channelId) : store.muteChannel(channelId, null)),
    },
    { separator: true },
    ...NIVEIS.map((n) => ({
      label: n.rotulo,
      control: "radio" as const,
      checked: atual === n.valor,
      onSelect: () => void store.setChannelLevel(channelId, n.valor),
    })),
  ];
  ui.openContextMenu(r.left, r.bottom + 4, itens);
}

function IconeDeCabecalho({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** ligado (o chat aberto, por exemplo) fica branco, como na toolbar do canal. */
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active || undefined}
        className={`grid h-8 w-8 place-items-center rounded-[4px] transition hover:bg-hov hover:text-txt-primary ${
          active ? "text-txt-primary" : "text-txt-secondary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
